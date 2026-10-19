import { Router } from 'express';
import { db, User, TeacherProfile, AllowedLocation } from '../db';
import { AuthenticatedRequest, requireRole } from '../auth';
import { AuditService } from '../services/auditService';
import crypto from 'crypto';

export const adminRouter = Router();
adminRouter.use(requireRole(['ADMIN']));

// 1. Admin Dashboard Statistics
adminRouter.get('/dashboard-stats', (req: AuthenticatedRequest, res) => {
  const totalStudents = db.studentProfiles.length;
  const approvedStudents = db.studentProfiles.filter(s => s.isApproved).length;
  const pendingRegistrations = db.registrationRequests.filter(r => r.status === 'PENDING').length;
  const totalTeachers = db.teacherProfiles.length;
  const totalSubjects = db.subjects.length;
  const totalSections = db.sections.length;
  const activeSessions = db.attendanceSessions.filter(s => s.status === 'ACTIVE').length;
  const completedSessions = db.attendanceSessions.filter(s => s.status === 'CLOSED').length;

  const presentCount = db.attendanceRecords.filter(r => r.attendanceStatus === 'PRESENT').length;
  const lateCount = db.attendanceRecords.filter(r => r.attendanceStatus === 'LATE').length;
  const absentCount = db.attendanceRecords.filter(r => r.attendanceStatus === 'ABSENT').length;
  const overrideCount = db.attendanceRecords.filter(r => r.isOverridden || r.verificationMethod === 'MANUAL_OVERRIDE').length;
  const failedAttempts = db.verificationAttempts.length;

  const recentLogs = db.auditLogs.slice(0, 10);

  return res.json({
    metrics: {
      totalStudents,
      approvedStudents,
      pendingRegistrations,
      totalTeachers,
      totalSubjects,
      totalSections,
      activeSessions,
      completedSessions,
      presentCount,
      lateCount,
      absentCount,
      overrideCount,
      failedAttempts,
    },
    recentLogs,
  });
});

// 2. Teacher Management
adminRouter.get('/teachers', (req, res) => {
  const teachersWithUsers = db.teacherProfiles.map(tp => {
    const user = db.users.find(u => u.id === tp.userId);
    const assignments = db.teacherAssignments
      .filter(ta => ta.teacherId === tp.id)
      .map(ta => {
        const sub = db.subjects.find(s => s.id === ta.subjectId);
        const sec = db.sections.find(s => s.id === ta.sectionId);
        return {
          id: ta.id,
          subjectCode: sub?.code,
          subjectTitle: sub?.title,
          sectionName: sec?.name,
        };
      });
    return {
      ...tp,
      username: user?.username,
      email: user?.email,
      isActive: user?.isActive,
      assignments,
    };
  });
  return res.json(teachersWithUsers);
});

adminRouter.post('/teachers', (req: AuthenticatedRequest, res) => {
  const { username, email, password, fullName, facultyId, department, title } = req.body;
  if (!username || !email || !password || !fullName || !facultyId) {
    return res.status(400).json({ error: 'Missing required teacher information.' });
  }

  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Username or email already exists.' });
  }

  const now = new Date().toISOString();
  const newUser: User = {
    id: 'usr_' + crypto.randomUUID().slice(0, 8),
    username,
    email,
    passwordHash: db.hashPassword(password),
    role: 'TEACHER',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const newProfile: TeacherProfile = {
    id: 'tp_' + crypto.randomUUID().slice(0, 8),
    userId: newUser.id,
    facultyId,
    fullName,
    department: department || 'CITC',
    title: title || 'Instructor',
    createdAt: now,
  };

  db.users.push(newUser);
  db.teacherProfiles.push(newProfile);
  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'CREATE_TEACHER',
    targetType: 'TEACHER',
    targetId: newProfile.id,
    details: { fullName, facultyId, email },
    ipAddress: req.ip,
  });

  return res.status(201).json({ teacher: newProfile, user: newUser });
});

adminRouter.put('/teachers/:id', (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { fullName, department, title, email, isActive } = req.body;

  const profile = db.teacherProfiles.find(tp => tp.id === id);
  if (!profile) {
    return res.status(404).json({ error: 'Teacher not found.' });
  }

  const user = db.users.find(u => u.id === profile.userId);
  if (fullName) profile.fullName = fullName;
  if (department) profile.department = department;
  if (title) profile.title = title;
  if (user && email) user.email = email;
  if (user && typeof isActive === 'boolean') user.isActive = isActive;

  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'UPDATE_TEACHER',
    targetType: 'TEACHER',
    targetId: profile.id,
    details: { fullName, department, isActive },
    ipAddress: req.ip,
  });

  return res.json({ message: 'Teacher updated successfully.', profile });
});

// 3. Academic Structure Management
adminRouter.get('/academic-data', (req, res) => {
  return res.json({
    academicYears: db.academicYears,
    semesters: db.semesters,
    programs: db.programs,
    sections: db.sections,
    subjects: db.subjects,
    teacherAssignments: db.teacherAssignments.map(ta => {
      const teacher = db.teacherProfiles.find(t => t.id === ta.teacherId);
      const subject = db.subjects.find(s => s.id === ta.subjectId);
      const section = db.sections.find(s => s.id === ta.sectionId);
      return {
        ...ta,
        teacherName: teacher?.fullName,
        subjectCode: subject?.code,
        subjectTitle: subject?.title,
        sectionName: section?.name,
      };
    }),
    allowedLocations: db.allowedLocations,
  });
});

adminRouter.post('/programs', (req: AuthenticatedRequest, res) => {
  const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const department = typeof req.body.department === 'string' ? req.body.department.trim() : '';
  if (!code || !name || !department) {
    return res.status(400).json({ error: 'Program code, degree name, and department are required.' });
  }
  if (code.length > 30 || name.length > 200 || department.length > 100) {
    return res.status(400).json({ error: 'One or more program fields exceed the allowed length.' });
  }
  if (db.programs.some(program => program.code.toUpperCase() === code)) {
    return res.status(409).json({ error: 'A degree program with this code already exists.' });
  }

  const program = { id: 'prog_' + crypto.randomUUID().slice(0, 8), code, name, department };
  db.programs.push(program);
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'CREATE_DEGREE_PROGRAM',
    targetType: 'PROGRAM',
    targetId: program.id,
    details: program,
    ipAddress: req.ip,
  });
  return res.status(201).json(program);
});

adminRouter.put('/programs/:id', (req: AuthenticatedRequest, res) => {
  const program = db.programs.find(item => item.id === req.params.id);
  if (!program) return res.status(404).json({ error: 'Degree program not found.' });

  const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const department = typeof req.body.department === 'string' ? req.body.department.trim() : '';
  if (!code || !name || !department) {
    return res.status(400).json({ error: 'Program code, degree name, and department are required.' });
  }
  if (code.length > 30 || name.length > 200 || department.length > 100) {
    return res.status(400).json({ error: 'One or more program fields exceed the allowed length.' });
  }
  if (db.programs.some(item => item.id !== program.id && item.code.toUpperCase() === code)) {
    return res.status(409).json({ error: 'A degree program with this code already exists.' });
  }

  Object.assign(program, { code, name, department });
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'UPDATE_DEGREE_PROGRAM',
    targetType: 'PROGRAM',
    targetId: program.id,
    details: { code, name, department },
    ipAddress: req.ip,
  });
  return res.json(program);
});

adminRouter.delete('/programs/:id', (req: AuthenticatedRequest, res) => {
  const program = db.programs.find(item => item.id === req.params.id);
  if (!program) return res.status(404).json({ error: 'Degree program not found.' });
  if (db.sections.some(section => section.programId === program.id)) {
    return res.status(409).json({ error: 'This degree program is used by a section and cannot be deleted.' });
  }

  db.programs = db.programs.filter(item => item.id !== program.id);
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'DELETE_DEGREE_PROGRAM',
    targetType: 'PROGRAM',
    targetId: program.id,
    details: { code: program.code, name: program.name },
    ipAddress: req.ip,
  });
  return res.json({ message: 'Degree program deleted.' });
});

// Assign Teacher to Subject and Section
adminRouter.post('/teacher-assignments', (req: AuthenticatedRequest, res) => {
  const { teacherId, subjectId, sectionId, academicYearId, semesterId } = req.body;
  if (!teacherId || !subjectId || !sectionId) {
    return res.status(400).json({ error: 'Teacher, Subject, and Section are required.' });
  }

  const existing = db.teacherAssignments.find(
    ta => ta.teacherId === teacherId && ta.subjectId === subjectId && ta.sectionId === sectionId
  );
  if (existing) {
    return res.status(400).json({ error: 'This teacher assignment already exists.' });
  }

  const newAssignment = {
    id: 'ta_' + crypto.randomUUID().slice(0, 8),
    teacherId,
    subjectId,
    sectionId,
    academicYearId: academicYearId || db.academicYears[0]?.id || 'ay_01',
    semesterId: semesterId || db.semesters[0]?.id || 'sem_01',
    createdAt: new Date().toISOString(),
  };

  db.teacherAssignments.push(newAssignment);
  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'CREATE_TEACHER_ASSIGNMENT',
    targetType: 'TEACHER_ASSIGNMENT',
    targetId: newAssignment.id,
    details: newAssignment,
    ipAddress: req.ip,
  });

  return res.status(201).json(newAssignment);
});

// Classroom / Allowed Location Management
adminRouter.post('/locations', (req: AuthenticatedRequest, res) => {
  const { name, building, roomNumber, latitude, longitude, radiusMeters, description } = req.body;
  if (!name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Name, latitude, and longitude are required.' });
  }

  const newLoc: AllowedLocation = {
    id: 'loc_' + crypto.randomUUID().slice(0, 8),
    name,
    building: building || 'SSU Main Building',
    roomNumber: roomNumber || '',
    latitude: Number(latitude),
    longitude: Number(longitude),
    radiusMeters: Number(radiusMeters) || 75,
    description: description || '',
    isActive: true,
  };

  db.allowedLocations.push(newLoc);
  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'CREATE_LOCATION',
    targetType: 'ALLOWED_LOCATION',
    targetId: newLoc.id,
    details: newLoc,
    ipAddress: req.ip,
  });

  return res.status(201).json(newLoc);
});

adminRouter.put('/locations/:locationId', (req: AuthenticatedRequest, res) => {
  const location = db.allowedLocations.find(item => item.id === req.params.locationId);
  if (!location) return res.status(404).json({ error: 'Classroom location not found.' });

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const building = typeof req.body.building === 'string' ? req.body.building.trim() : '';
  const roomNumber = typeof req.body.roomNumber === 'string' ? req.body.roomNumber.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  const radiusMeters = Number(req.body.radiusMeters);

  if (!name || req.body.latitude === undefined || req.body.longitude === undefined) {
    return res.status(400).json({ error: 'Name, latitude, and longitude are required.' });
  }
  if (name.length > 200 || building.length > 200 || roomNumber.length > 80 || description.length > 500) {
    return res.status(400).json({ error: 'Location details exceed the allowed length.' });
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Enter valid classroom map coordinates.' });
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters < 1 || radiusMeters > 1000) {
    return res.status(400).json({ error: 'Geofence radius must be between 1 and 1,000 meters.' });
  }

  Object.assign(location, {
    name,
    building: building || 'SSU Main Building',
    roomNumber,
    latitude,
    longitude,
    radiusMeters,
    description,
  });
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'UPDATE_LOCATION',
    targetType: 'ALLOWED_LOCATION',
    targetId: location.id,
    details: location,
    ipAddress: req.ip,
  });
  return res.json(location);
});

// 4. Student Management Directory
adminRouter.get('/students', (req, res) => {
  const fullStudents = db.studentProfiles.map(sp => {
    const user = db.users.find(u => u.id === sp.userId);
    const enrollments = db.sectionEnrollments
      .filter(se => se.studentId === sp.id)
      .map(se => {
        const sec = db.sections.find(s => s.id === se.sectionId);
        const sub = db.subjects.find(s => s.id === se.subjectId);
        return {
          id: se.id,
          sectionName: sec?.name,
          subjectCode: sub?.code,
          status: se.status,
        };
      });

    const qr = db.qrIdentities.find(q => q.studentId === sp.id);
    const face = db.faceEnrollments.find(f => f.studentId === sp.id);

    return {
      ...sp,
      email: user?.email,
      isActive: user?.isActive,
      enrollments,
      hasEnrolledQr: !!qr,
      qrValue: qr?.qrPayload,
      hasEnrolledFace: !!face,
      faceQuality: face?.qualityScore,
    };
  });

  return res.json(fullStudents);
});

// 5. System Settings
adminRouter.get('/settings', (req, res) => {
  return res.json(db.settings);
});

adminRouter.put('/settings', (req: AuthenticatedRequest, res) => {
  if (req.body?.faceMatchThreshold !== undefined &&
      (typeof req.body.faceMatchThreshold !== 'number' ||
       !Number.isFinite(req.body.faceMatchThreshold) ||
       req.body.faceMatchThreshold < 0.9 ||
       req.body.faceMatchThreshold > 1)) {
    return res.status(400).json({ error: 'Face recognition strictness must be between 90% and 100%.' });
  }

  db.settings = { ...db.settings, ...req.body };
  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'UPDATE_SYSTEM_SETTINGS',
    targetType: 'SYSTEM_SETTINGS',
    details: req.body,
    ipAddress: req.ip,
  });

  return res.json({ message: 'Settings updated successfully.', settings: db.settings });
});

adminRouter.put('/settings/logo', (req: AuthenticatedRequest, res) => {
  const logoDataUrl = req.body?.logoDataUrl;
  if (typeof logoDataUrl !== 'string') {
    return res.status(400).json({ error: 'A logo image is required.' });
  }

  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logoDataUrl);
  if (!match) {
    return res.status(400).json({ error: 'Upload a PNG, JPEG, or WebP image.' });
  }
  const imageBytes = Buffer.from(match[2], 'base64');
  if (imageBytes.length === 0 || imageBytes.length > 2 * 1024 * 1024) {
    return res.status(400).json({ error: 'The logo must be smaller than 2 MB.' });
  }

  db.settings.logoDataUrl = logoDataUrl;
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'UPDATE_SYSTEM_LOGO',
    targetType: 'SYSTEM_SETTINGS',
    details: { mimeType: `image/${match[1]}`, sizeBytes: imageBytes.length },
    ipAddress: req.ip,
  });

  return res.json({ message: 'System logo updated successfully.', logoDataUrl });
});

adminRouter.delete('/settings/logo', (req: AuthenticatedRequest, res) => {
  delete db.settings.logoDataUrl;
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'ADMIN',
    action: 'REMOVE_SYSTEM_LOGO',
    targetType: 'SYSTEM_SETTINGS',
    details: {},
    ipAddress: req.ip,
  });
  return res.json({ message: 'System logo removed.' });
});

// 6. Audit Logs
adminRouter.get('/audit-logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const logs = db.auditLogs.slice(0, limit);
  return res.json(logs);
});

// 7. Comprehensive Reports
adminRouter.get('/reports', (req, res) => {
  const { startDate, endDate, subjectId, sectionId, status } = req.query;

  let records = [...db.attendanceRecords];

  if (subjectId) {
    records = records.filter(r => r.subjectId === subjectId);
  }
  if (sectionId) {
    records = records.filter(r => r.sectionId === sectionId);
  }
  if (status) {
    records = records.filter(r => r.attendanceStatus === status);
  }
  if (startDate) {
    records = records.filter(r => r.timestamp >= String(startDate));
  }
  if (endDate) {
    records = records.filter(r => r.timestamp <= String(endDate));
  }

  const enrichedRecords = records.map(r => {
    const student = db.studentProfiles.find(s => s.id === r.studentId);
    const teacher = db.teacherProfiles.find(t => t.id === r.teacherId);
    const subject = db.subjects.find(s => s.id === r.subjectId);
    const section = db.sections.find(s => s.id === r.sectionId);
    const session = db.attendanceSessions.find(s => s.id === r.attendanceSessionId);

    return {
      ...r,
      studentName: student?.fullName || 'Unknown Student',
      schoolId: student?.schoolId || 'N/A',
      courseProgram: student?.courseProgram || 'N/A',
      teacherName: teacher?.fullName || 'N/A',
      subjectCode: subject?.code || 'N/A',
      subjectTitle: subject?.title || 'N/A',
      sectionName: section?.name || 'N/A',
      sessionTitle: session?.title || 'N/A',
    };
  });

  return res.json({
    totalCount: enrichedRecords.length,
    records: enrichedRecords,
  });
});
