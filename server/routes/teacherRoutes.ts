import { Router } from 'express';
import { db, RegistrationLink, AttendanceSession, AttendanceRecord, SectionEnrollment, AllowedLocation } from '../db';
import { AuthenticatedRequest, requireRole } from '../auth';
import { AuditService } from '../services/auditService';
import crypto from 'crypto';
import {
  FACE_EMBEDDING_LENGTH,
  FACE_EMBEDDING_VERSION,
  FACE_REFERENCE_SAMPLE_COUNT,
} from '../../shared/faceBiometrics';

export const teacherRouter = Router();
teacherRouter.use(requireRole(['TEACHER', 'ADMIN']));

// Helper to get current teacher profile
function getTeacherProfile(req: AuthenticatedRequest) {
  if (req.user?.role === 'ADMIN') {
    // Admin can act on behalf of teacher 1 for evaluation or inspect all
    return db.teacherProfiles[0];
  }
  return db.teacherProfiles.find(tp => tp.userId === req.user?.id);
}

// 1. Teacher Dashboard Data
teacherRouter.get('/dashboard', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) {
    return res.status(404).json({ error: 'Teacher profile not found.' });
  }

  const assignments = db.teacherAssignments.filter(ta => ta.teacherId === teacher.id);
  const assignmentSectionIds = assignments.map(a => a.sectionId);
  const assignmentSubjectIds = assignments.map(a => a.subjectId);

  // Enrolled students in this teacher's sections
  const enrollments = db.sectionEnrollments.filter(
    se => assignmentSectionIds.includes(se.sectionId) && se.status === 'APPROVED'
  );

  const pendingRequests = db.registrationRequests.filter(
    rr => assignmentSectionIds.includes(rr.sectionId) && rr.status === 'PENDING'
  );

  const activeSessions = db.attendanceSessions.filter(
    s => s.teacherId === teacher.id && s.status === 'ACTIVE'
  );

  const completedSessions = db.attendanceSessions.filter(
    s => s.teacherId === teacher.id && s.status === 'CLOSED'
  );

  const recentRecords = db.attendanceRecords
    .filter(r => r.teacherId === teacher.id)
    .slice(-10)
    .reverse()
    .map(r => {
      const student = db.studentProfiles.find(s => s.id === r.studentId);
      const subject = db.subjects.find(s => s.id === r.subjectId);
      const section = db.sections.find(s => s.id === r.sectionId);
      return {
        ...r,
        studentName: student?.fullName,
        schoolId: student?.schoolId,
        subjectCode: subject?.code,
        sectionName: section?.name,
      };
    });

  const failureAttempts = db.verificationAttempts
    .slice(-10)
    .reverse();

  return res.json({
    teacher,
    stats: {
      assignedSectionsCount: assignments.length,
      enrolledStudentsCount: enrollments.length,
      pendingRequestsCount: pendingRequests.length,
      activeSessionsCount: activeSessions.length,
      completedSessionsCount: completedSessions.length,
    },
    activeSessions,
    recentRecords,
    failureAttempts,
  });
});

teacherRouter.get('/profile', (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'TEACHER') return res.status(403).json({ error: 'Teacher profile settings are only available to teacher accounts.' });
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });
  const user = db.users.find(item => item.id === teacher.userId);
  if (!user) return res.status(404).json({ error: 'Teacher account not found.' });
  return res.json({
    profile: teacher,
    account: { username: user.username, email: user.email },
  });
});

teacherRouter.put('/profile', (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'TEACHER') return res.status(403).json({ error: 'Teacher profile settings are only available to teacher accounts.' });
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });
  const user = db.users.find(item => item.id === teacher.userId);
  if (!user) return res.status(404).json({ error: 'Teacher account not found.' });

  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const facultyId = typeof req.body.facultyId === 'string' ? req.body.facultyId.trim() : '';
  const department = typeof req.body.department === 'string' ? req.body.department.trim() : '';
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const contactNumber = typeof req.body.contactNumber === 'string' ? req.body.contactNumber.trim() : '';
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const profilePhoto = req.body.profilePhoto;

  if (!fullName || !facultyId || !department || !title || !username || !email) {
    return res.status(400).json({ error: 'Name, faculty ID, department, title, username, and email are required.' });
  }
  if (fullName.length > 200 || facultyId.length > 80 || department.length > 200 ||
      title.length > 100 || contactNumber.length > 40 || username.length > 80 || email.length > 254) {
    return res.status(400).json({ error: 'A profile field exceeds the allowed length.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (db.users.some(item => item.id !== user.id &&
      (item.username.toLowerCase() === username.toLowerCase() || item.email.toLowerCase() === email))) {
    return res.status(409).json({ error: 'That username or email is already in use.' });
  }
  if (profilePhoto !== undefined && profilePhoto !== null &&
      (typeof profilePhoto !== 'string' ||
       profilePhoto.length > 7_000_000 ||
       !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(profilePhoto))) {
    return res.status(400).json({ error: 'Profile photo must be a JPEG, PNG, or WebP image up to 5 MB.' });
  }

  Object.assign(teacher, { fullName, facultyId, department, title, contactNumber });
  if (profilePhoto !== undefined) teacher.profilePhoto = profilePhoto || undefined;
  Object.assign(user, { username, email, updatedAt: new Date().toISOString() });
  db.save();
  AuditService.log({
    actorUserId: user.id,
    actorRole: 'TEACHER',
    action: 'UPDATE_TEACHER_PROFILE',
    targetType: 'TEACHER_PROFILE',
    targetId: teacher.id,
    details: { facultyId, username, email, profilePhotoUpdated: profilePhoto !== undefined },
    ipAddress: req.ip,
  });
  return res.json({ profile: teacher, account: { username: user.username, email: user.email } });
});

teacherRouter.put('/profile/password', (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'TEACHER') return res.status(403).json({ error: 'Teacher password settings are only available to teacher accounts.' });
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });
  const user = db.users.find(item => item.id === teacher.userId);
  if (!user) return res.status(404).json({ error: 'Teacher account not found.' });

  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (!db.verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }
  if (newPassword.length < 10 || newPassword.length > 128) {
    return res.status(400).json({ error: 'New password must be between 10 and 128 characters.' });
  }

  user.passwordHash = db.hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  db.save();
  AuditService.log({
    actorUserId: user.id,
    actorRole: 'TEACHER',
    action: 'CHANGE_TEACHER_PASSWORD',
    targetType: 'USER',
    targetId: user.id,
    details: { passwordChanged: true },
    ipAddress: req.ip,
  });
  return res.json({ message: 'Password updated successfully.' });
});

// 2. Teacher's Assigned Classes (Sections & Subjects)
teacherRouter.get('/my-classes', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const assignments = db.teacherAssignments.filter(ta => ta.teacherId === teacher.id);
  const viewSection = (sectionId: string, assignmentId: string, subjectId?: string) => {
    const section = db.sections.find(item => item.id === sectionId);
    if (!section) return null;
    const subject = subjectId ? db.subjects.find(item => item.id === subjectId) : undefined;
    const registeredStudents = db.sectionEnrollments
      .filter(enrollment => enrollment.sectionId === sectionId && enrollment.status === 'APPROVED')
      .reduce((students, enrollment) => {
        const student = db.studentProfiles.find(profile => profile.id === enrollment.studentId);
        if (student && !students.some(existing => existing.id === student.id)) {
          students.push({
            id: student.id,
            schoolId: student.schoolId,
            fullName: student.fullName,
            courseProgram: student.courseProgram,
            yearLevel: student.yearLevel,
            enrolledAt: enrollment.enrolledAt,
            isRegistered: true,
            registrationPending: false,
          });
        }
        return students;
      }, [] as Array<{
        id: string;
        schoolId: string;
        fullName: string;
        courseProgram: string;
        yearLevel: string;
        enrolledAt: string;
        isRegistered: boolean;
        registrationPending: boolean;
      }>);
    const rosterStudents = db.sectionRoster
      .filter(entry => entry.sectionId === sectionId)
      .map(entry => {
        const student = db.studentProfiles.find(profile => profile.schoolId.toUpperCase() === entry.schoolId);
        const registered = student && registeredStudents.find(item => item.id === student.id);
        const registrationPending = db.registrationRequests.some(
          request => request.schoolId === entry.schoolId &&
            request.sectionId === sectionId &&
            request.status === 'PENDING'
        );

        return {
          id: entry.id,
          rosterEntryId: entry.id,
          schoolId: entry.schoolId,
          fullName: student?.fullName || entry.fullName,
          courseProgram: student?.courseProgram || entry.courseProgram,
          yearLevel: student?.yearLevel || entry.yearLevel,
          enrolledAt: registered?.enrolledAt,
          isRegistered: !!registered,
          registrationPending,
        };
      });
    const rosterIds = new Set(rosterStudents.map(student => student.schoolId));
    const students = [
      ...rosterStudents,
      ...registeredStudents.filter(student => !rosterIds.has(student.schoolId.toUpperCase())),
    ];
    return {
      assignmentId,
      subjectId: subjectId || '',
      subjectCode: subject?.code,
      subjectTitle: subject?.title,
      sectionId,
      sectionName: section?.name,
      programId: section.programId,
      yearLevel: section?.yearLevel,
      registeredCount: registeredStudents.length,
      rosterCount: db.sectionRoster.filter(entry => entry.sectionId === sectionId).length,
      students,
    };
  };
  const classes = assignments
    .map(assignment => viewSection(assignment.sectionId, assignment.id, assignment.subjectId))
    .filter((item): item is NonNullable<typeof item> => !!item);
  const assignedSectionIds = new Set(assignments.map(assignment => assignment.sectionId));
  const standaloneSections = db.sections
    .filter(section => section.createdByTeacherId === teacher.id && !assignedSectionIds.has(section.id))
    .map(section => viewSection(section.id, section.id))
    .filter((item): item is NonNullable<typeof item> => !!item);

  return res.json([...classes, ...standaloneSections]);
});

teacherRouter.get('/class-options', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });
  const teacherSectionIds = new Set(
    db.teacherAssignments.filter(assignment => assignment.teacherId === teacher.id).map(assignment => assignment.sectionId)
  );
  db.sections
    .filter(section => section.createdByTeacherId === teacher.id)
    .forEach(section => teacherSectionIds.add(section.id));
  return res.json({
    programs: db.programs,
    subjects: db.subjects,
    sections: db.sections.filter(section => teacherSectionIds.has(section.id)),
  });
});

teacherRouter.post('/classes', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const units = Number(req.body.units);
  const { sectionId } = req.body;
  if (!code || !title || !sectionId || !Number.isInteger(units) || units < 1 || units > 20) {
    return res.status(400).json({ error: 'Class code, title, section, and a valid unit count (1–20) are required.' });
  }
  if (code.length > 30 || title.length > 200) {
    return res.status(400).json({ error: 'Class code or title exceeds the allowed length.' });
  }
  if (db.subjects.some(subject => subject.code.toUpperCase() === code)) {
    return res.status(409).json({ error: 'A class with this code already exists.' });
  }

  const section = db.sections.find(item => item.id === sectionId);
  const hasSectionAccess = section?.createdByTeacherId === teacher.id || db.teacherAssignments.some(
    assignment => assignment.teacherId === teacher.id && assignment.sectionId === sectionId
  );
  const academicYear = db.academicYears.find(item => item.isCurrent) || db.academicYears[0];
  const semester = db.semesters.find(item => item.isCurrent) || db.semesters[0];
  if (!section || !hasSectionAccess) {
    return res.status(403).json({ error: 'You can only add a class to a section you created or have been assigned.' });
  }
  if (!academicYear || !semester) {
    return res.status(400).json({ error: 'Select a valid section; academic year and semester must be configured.' });
  }

  const subject = { id: 'sub_' + crypto.randomUUID().slice(0, 8), code, title, units };
  const assignment = {
    id: 'ta_' + crypto.randomUUID().slice(0, 8),
    teacherId: teacher.id,
    subjectId: subject.id,
    sectionId: section.id,
    academicYearId: academicYear.id,
    semesterId: semester.id,
    createdAt: new Date().toISOString(),
  };
  db.subjects.push(subject);
  db.teacherAssignments.push(assignment);
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'CREATE_CLASS',
    targetType: 'SUBJECT',
    targetId: subject.id,
    details: { code, title, units, sectionId },
    ipAddress: req.ip,
  });

  return res.status(201).json({ subject, assignment });
});

teacherRouter.post('/sections', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const sectionName = typeof req.body.sectionName === 'string' ? req.body.sectionName.trim() : '';
  const { programId } = req.body;
  const yearLevel = typeof req.body.yearLevel === 'string' ? req.body.yearLevel.trim() : '';
  if (!sectionName || !programId || !yearLevel) {
    return res.status(400).json({ error: 'Section name, degree program, and year level are required.' });
  }
  if (sectionName.length > 100 || yearLevel.length > 50) {
    return res.status(400).json({ error: 'Section name or year level exceeds the allowed length.' });
  }

  const program = db.programs.find(item => item.id === programId);
  const academicYear = db.academicYears.find(item => item.isCurrent) || db.academicYears[0];
  if (!program || !academicYear) {
    return res.status(400).json({ error: 'Select a valid program; an academic year must be configured.' });
  }

  const duplicateSection = db.sections.some(section =>
    section.name.toLowerCase() === sectionName.toLowerCase() &&
    section.programId === programId &&
    section.yearLevel.toLowerCase() === yearLevel.toLowerCase() &&
    section.academicYearId === academicYear.id
  );
  if (duplicateSection) {
    return res.status(409).json({ error: 'This section already exists for the selected program and academic year.' });
  }

  const section = {
    id: 'sec_' + crypto.randomUUID().slice(0, 8),
    name: sectionName,
    programId,
    yearLevel,
    academicYearId: academicYear.id,
    createdByTeacherId: teacher.id,
  };
  db.sections.push(section);
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'CREATE_CLASS_SECTION',
    targetType: 'SECTION',
    targetId: section.id,
    details: { sectionName, programId, yearLevel },
    ipAddress: req.ip,
  });

  return res.status(201).json({ section });
});

teacherRouter.put('/sections/:sectionId', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const section = db.sections.find(item => item.id === req.params.sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found.' });
  const hasSectionAccess = section.createdByTeacherId === teacher.id || db.teacherAssignments.some(
    assignment => assignment.teacherId === teacher.id && assignment.sectionId === section.id
  );
  if (!hasSectionAccess) {
    return res.status(403).json({ error: 'You are not authorized to edit this section.' });
  }

  const name = typeof req.body.sectionName === 'string' ? req.body.sectionName.trim() : '';
  const yearLevel = typeof req.body.yearLevel === 'string' ? req.body.yearLevel.trim() : '';
  const programId = typeof req.body.programId === 'string' ? req.body.programId : '';
  if (!name || !yearLevel || !programId) {
    return res.status(400).json({ error: 'Section name, degree program, and year level are required.' });
  }
  if (name.length > 100 || yearLevel.length > 50) {
    return res.status(400).json({ error: 'Section name or year level exceeds the allowed length.' });
  }
  if (!db.programs.some(program => program.id === programId)) {
    return res.status(400).json({ error: 'Select a valid degree program.' });
  }

  const duplicateSection = db.sections.some(item =>
    item.id !== section.id &&
    item.name.toLowerCase() === name.toLowerCase() &&
    item.programId === programId &&
    item.yearLevel.toLowerCase() === yearLevel.toLowerCase() &&
    item.academicYearId === section.academicYearId
  );
  if (duplicateSection) {
    return res.status(409).json({ error: 'This section already exists for the selected program and academic year.' });
  }

  Object.assign(section, { name, programId, yearLevel });
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'UPDATE_CLASS_SECTION',
    targetType: 'SECTION',
    targetId: section.id,
    details: { name, programId, yearLevel },
    ipAddress: req.ip,
  });
  return res.json({ section });
});

teacherRouter.delete('/sections/:sectionId', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const section = db.sections.find(item => item.id === req.params.sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found.' });
  const hasSectionAccess = section.createdByTeacherId === teacher.id || db.teacherAssignments.some(
    assignment => assignment.teacherId === teacher.id && assignment.sectionId === section.id
  );
  if (!hasSectionAccess) {
    return res.status(403).json({ error: 'You are not authorized to delete this section.' });
  }

  const assignmentIds = new Set(
    db.teacherAssignments.filter(assignment => assignment.sectionId === section.id).map(assignment => assignment.id)
  );
  const hasStudents = db.sectionEnrollments.some(enrollment => enrollment.sectionId === section.id);
  const hasRegistrationRequests = db.registrationRequests.some(request => request.sectionId === section.id);
  const hasAttendance = db.attendanceSessions.some(session => session.sectionId === section.id) ||
    db.attendanceRecords.some(record => record.sectionId === section.id);
  const hasRegistrationLinks = db.registrationLinks.some(link => assignmentIds.has(link.teacherAssignmentId));
  if (hasStudents || hasRegistrationRequests || hasAttendance || hasRegistrationLinks) {
    return res.status(409).json({
      error: 'This section has students, registration activity, attendance records, or registration links and cannot be deleted.',
    });
  }

  const removedAssignments = db.teacherAssignments.filter(assignment => assignment.sectionId === section.id);
  db.teacherAssignments = db.teacherAssignments.filter(assignment => assignment.sectionId !== section.id);
  db.sections = db.sections.filter(item => item.id !== section.id);
  db.sectionRoster = db.sectionRoster.filter(entry => entry.sectionId !== section.id);
  const removableSubjectIds = removedAssignments
    .map(assignment => assignment.subjectId)
    .filter(subjectId => !db.teacherAssignments.some(assignment => assignment.subjectId === subjectId));
  db.subjects = db.subjects.filter(subject => !removableSubjectIds.includes(subject.id));
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'DELETE_CLASS_SECTION',
    targetType: 'SECTION',
    targetId: section.id,
    details: { name: section.name, removedAssignmentCount: removedAssignments.length },
    ipAddress: req.ip,
  });
  return res.json({ message: 'Section deleted.' });
});

teacherRouter.post('/sections/:sectionId/roster', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const sectionId = req.params.sectionId;
  const section = db.sections.find(item => item.id === sectionId);
  const hasSectionAccess = section?.createdByTeacherId === teacher.id || db.teacherAssignments.some(
    assignment => assignment.teacherId === teacher.id && assignment.sectionId === sectionId
  );
  if (!hasSectionAccess) {
    return res.status(403).json({ error: 'You are not authorized to add students to this section.' });
  }

  const { schoolId: rawSchoolId, fullName: rawFullName, courseProgram: rawProgram, yearLevel: rawYearLevel } = req.body;
  const schoolId = typeof rawSchoolId === 'string' ? rawSchoolId.trim().toUpperCase() : '';
  const fullName = typeof rawFullName === 'string' ? rawFullName.trim() : '';
  const courseProgram = typeof rawProgram === 'string' ? rawProgram.trim() : '';
  const yearLevel = typeof rawYearLevel === 'string' ? rawYearLevel.trim() : '';
  if (!schoolId || !fullName || !courseProgram || !yearLevel) {
    return res.status(400).json({ error: 'Student ID, full name, degree program, and year level are required.' });
  }
  if (schoolId.length > 80 || fullName.length > 200 || courseProgram.length > 200 || yearLevel.length > 50) {
    return res.status(400).json({ error: 'A student field exceeds the allowed length.' });
  }
  if (db.sectionRoster.some(entry => entry.sectionId === sectionId && entry.schoolId === schoolId)) {
    return res.status(409).json({ error: 'This Student ID is already on the section roster.' });
  }
  if (db.sectionRoster.filter(entry => entry.sectionId === sectionId).length >= 5000) {
    return res.status(409).json({ error: 'This section has reached the 5,000-student roster limit.' });
  }

  const entry = {
    id: 'roster_' + crypto.randomUUID().slice(0, 8),
    sectionId,
    schoolId,
    fullName,
    courseProgram,
    yearLevel,
    importedAt: new Date().toISOString(),
  };
  db.sectionRoster.push(entry);
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'ADD_SECTION_ROSTER_STUDENT',
    targetType: 'SECTION',
    targetId: sectionId,
    details: { schoolId },
    ipAddress: req.ip,
  });
  return res.status(201).json({ student: entry });
});

teacherRouter.put('/sections/:sectionId/roster/:rosterEntryId', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { sectionId, rosterEntryId } = req.params;
  const section = db.sections.find(item => item.id === sectionId);
  const hasSectionAccess = section?.createdByTeacherId === teacher.id || db.teacherAssignments.some(
    assignment => assignment.teacherId === teacher.id && assignment.sectionId === sectionId
  );
  if (!hasSectionAccess) {
    return res.status(403).json({ error: 'You are not authorized to edit this section roster.' });
  }
  const entry = db.sectionRoster.find(item => item.id === rosterEntryId && item.sectionId === sectionId);
  if (!entry) return res.status(404).json({ error: 'Student roster entry not found.' });

  const { schoolId: rawSchoolId, fullName: rawFullName, courseProgram: rawProgram, yearLevel: rawYearLevel } = req.body;
  const schoolId = typeof rawSchoolId === 'string' ? rawSchoolId.trim().toUpperCase() : '';
  const fullName = typeof rawFullName === 'string' ? rawFullName.trim() : '';
  const courseProgram = typeof rawProgram === 'string' ? rawProgram.trim() : '';
  const yearLevel = typeof rawYearLevel === 'string' ? rawYearLevel.trim() : '';
  if (!schoolId || !fullName || !courseProgram || !yearLevel) {
    return res.status(400).json({ error: 'Student ID, full name, degree program, and year level are required.' });
  }
  if (schoolId.length > 80 || fullName.length > 200 || courseProgram.length > 200 || yearLevel.length > 50) {
    return res.status(400).json({ error: 'A student field exceeds the allowed length.' });
  }
  if (schoolId !== entry.schoolId && (
    db.studentProfiles.some(student => student.schoolId.toUpperCase() === entry.schoolId) ||
    db.registrationRequests.some(request => request.sectionId === sectionId &&
      request.schoolId.toUpperCase() === entry.schoolId && request.status === 'PENDING')
  )) {
    return res.status(409).json({ error: 'Student ID cannot be changed while the student has an account or pending registration.' });
  }
  if (db.sectionRoster.some(item =>
    item.id !== entry.id && item.sectionId === sectionId && item.schoolId === schoolId
  )) {
    return res.status(409).json({ error: 'This Student ID is already on the section roster.' });
  }

  Object.assign(entry, { schoolId, fullName, courseProgram, yearLevel });
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'UPDATE_SECTION_ROSTER_STUDENT',
    targetType: 'SECTION',
    targetId: sectionId,
    details: { schoolId },
    ipAddress: req.ip,
  });
  return res.json({ student: entry });
});

teacherRouter.delete('/sections/:sectionId/roster/:rosterEntryId', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { sectionId, rosterEntryId } = req.params;
  const section = db.sections.find(item => item.id === sectionId);
  const hasSectionAccess = section?.createdByTeacherId === teacher.id || db.teacherAssignments.some(
    assignment => assignment.teacherId === teacher.id && assignment.sectionId === sectionId
  );
  if (!hasSectionAccess) {
    return res.status(403).json({ error: 'You are not authorized to edit this section roster.' });
  }
  const identifier = rosterEntryId;
  const entry = db.sectionRoster.find(item =>
    item.sectionId === sectionId &&
    (item.id === identifier || item.schoolId.toUpperCase() === identifier.toUpperCase())
  );
  const schoolId = entry?.schoolId || identifier;
  const student = db.studentProfiles.find(item => item.schoolId.toUpperCase() === schoolId.toUpperCase());
  const enrollments = student
    ? db.sectionEnrollments.filter(item => item.studentId === student.id && item.sectionId === sectionId)
    : [];
  if (!entry && enrollments.length === 0) {
    return res.status(404).json({ error: 'Student is not listed or enrolled in this section.' });
  }
  if (db.registrationRequests.some(request =>
    request.sectionId === sectionId && request.schoolId.toUpperCase() === schoolId.toUpperCase() && request.status === 'PENDING'
  )) {
    return res.status(409).json({ error: 'This student has a pending registration request and cannot be removed from the roster.' });
  }

  if (entry) {
    db.sectionRoster = db.sectionRoster.filter(item => item.id !== entry.id);
  }
  if (student) {
    db.sectionEnrollments = db.sectionEnrollments.filter(
      item => item.studentId !== student.id || item.sectionId !== sectionId
    );
  }
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'REMOVE_SECTION_ROSTER_STUDENT',
    targetType: 'SECTION',
    targetId: sectionId,
    details: { schoolId, removedRosterEntry: !!entry, removedEnrollmentCount: enrollments.length },
    ipAddress: req.ip,
  });
  return res.json({ message: 'Student removed from the section. Account and attendance history were preserved.' });
});

teacherRouter.post('/sections/:sectionId/roster/import', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const sectionId = req.params.sectionId;
  const section = db.sections.find(item => item.id === sectionId);
  const hasSectionAccess = section?.createdByTeacherId === teacher.id || db.teacherAssignments.some(
    assignment => assignment.teacherId === teacher.id && assignment.sectionId === sectionId
  );
  if (!hasSectionAccess) {
    return res.status(403).json({ error: 'You are not authorized to import students for this section.' });
  }

  const rows: unknown = req.body.students;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 5000) {
    return res.status(400).json({ error: 'Import must contain between 1 and 5,000 student rows.' });
  }

  const seenIds = new Set<string>();
  const importedAt = new Date().toISOString();
  const entries = [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object') {
      return res.status(400).json({ error: `Row ${index + 1} is invalid.` });
    }
    const candidate = row as Record<string, unknown>;
    const schoolId = typeof candidate.schoolId === 'string' ? candidate.schoolId.trim().toUpperCase() : '';
    const fullName = typeof candidate.fullName === 'string' ? candidate.fullName.trim() : '';
    const courseProgram = typeof candidate.courseProgram === 'string' ? candidate.courseProgram.trim() : '';
    const yearLevel = typeof candidate.yearLevel === 'string' ? candidate.yearLevel.trim() : '';
    if (!schoolId || !fullName || !courseProgram || !yearLevel) {
      return res.status(400).json({ error: `Row ${index + 1} must include Student ID, name, degree program, and year level.` });
    }
    if (schoolId.length > 80 || fullName.length > 200 || courseProgram.length > 200 || yearLevel.length > 50) {
      return res.status(400).json({ error: `Row ${index + 1} contains a value that is too long.` });
    }
    if (seenIds.has(schoolId)) {
      return res.status(400).json({ error: `Student ID ${schoolId} appears more than once in the import.` });
    }
    seenIds.add(schoolId);
    entries.push({
      id: 'roster_' + crypto.randomUUID().slice(0, 8),
      sectionId,
      schoolId,
      fullName,
      courseProgram,
      yearLevel,
      importedAt,
    });
  }

  db.sectionRoster = [
    ...db.sectionRoster.filter(entry => entry.sectionId !== sectionId),
    ...entries,
  ];
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'IMPORT_SECTION_ROSTER',
    targetType: 'SECTION',
    targetId: sectionId,
    details: { importedStudentCount: entries.length },
    ipAddress: req.ip,
  });

  return res.json({ importedCount: entries.length });
});

teacherRouter.get('/locations', (_req, res) => {
  return res.json(db.allowedLocations.filter(location => location.isActive));
});

teacherRouter.post('/locations', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const {
    name: rawName,
    building: rawBuilding,
    roomNumber: rawRoomNumber,
    latitude: rawLatitude,
    longitude: rawLongitude,
    radiusMeters: rawRadius,
    description: rawDescription,
  } = req.body;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const building = typeof rawBuilding === 'string' ? rawBuilding.trim() : '';
  const roomNumber = typeof rawRoomNumber === 'string' ? rawRoomNumber.trim() : '';
  const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  const radiusMeters = Number(rawRadius);

  if (!name || rawLatitude === undefined || rawLongitude === undefined) {
    return res.status(400).json({ error: 'Location name and map coordinates are required.' });
  }
  if (name.length > 200 || building.length > 200 || roomNumber.length > 80 || description.length > 500) {
    return res.status(400).json({ error: 'Location details exceed the allowed length.' });
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Select a valid classroom location on the map.' });
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters < 1 || radiusMeters > 1000) {
    return res.status(400).json({ error: 'Geofence radius must be between 1 and 1,000 meters.' });
  }

  const location: AllowedLocation = {
    id: 'loc_' + crypto.randomUUID().slice(0, 8),
    name,
    building: building || 'SSU Main Building',
    roomNumber,
    latitude,
    longitude,
    radiusMeters,
    description,
    isActive: true,
  };
  db.allowedLocations.push(location);
  db.save();
  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: 'CREATE_LOCATION',
    targetType: 'ALLOWED_LOCATION',
    targetId: location.id,
    details: location,
    ipAddress: req.ip,
  });
  return res.status(201).json(location);
});

// 3. Registration Links Management
teacherRouter.get('/registration-links', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const links = db.registrationLinks
    .filter(rl => rl.teacherId === teacher.id)
    .map(rl => {
      const subject = db.subjects.find(s => s.id === rl.subjectId);
      const section = db.sections.find(s => s.id === rl.sectionId);
      const isExpired = new Date(rl.expiresAt).getTime() < Date.now();
      const currentStatus = rl.status === 'REVOKED' ? 'REVOKED' : isExpired ? 'EXPIRED' : 'ACTIVE';

      // Count registrations from this link
      const requestCount = db.registrationRequests.filter(rr => rr.registrationLinkId === rl.id).length;

      return {
        ...rl,
        status: currentStatus,
        subjectCode: subject?.code,
        subjectTitle: subject?.title,
        sectionName: section?.name,
        requestCount,
      };
    })
    .reverse();

  return res.json(links);
});

teacherRouter.post('/registration-links', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { sectionId, durationHours } = req.body;
  if (typeof sectionId !== 'string' || !sectionId) {
    return res.status(400).json({ error: 'Section selection is required.' });
  }

  const sectionAssignments = db.teacherAssignments.filter(
    assignment => assignment.sectionId === sectionId && assignment.teacherId === teacher.id
  );
  const assignment = sectionAssignments[0];
  if (!assignment) {
    return res.status(403).json({ error: 'You are not authorized to create a registration link for this section.' });
  }

  const hours = Number(durationHours) || db.settings.defaultRegLinkDurationHours || 48;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 3600 * 1000).toISOString();

  // Cryptographically unpredictable token
  const token = 'ssu-reg-' + crypto.randomBytes(16).toString('hex');

  const newLink: RegistrationLink = {
    id: 'reg_link_' + crypto.randomUUID().slice(0, 8),
    token,
    teacherAssignmentId: assignment.id,
    teacherId: teacher.id,
    subjectId: assignment.subjectId,
    sectionId: assignment.sectionId,
    createdAt: now.toISOString(),
    expiresAt,
    status: 'ACTIVE',
  };

  db.registrationLinks.push(newLink);
  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'TEACHER',
    action: 'CREATE_REGISTRATION_LINK',
    targetType: 'REGISTRATION_LINK',
    targetId: newLink.id,
    details: { token, subjectId: assignment.subjectId, sectionId: assignment.sectionId, expiresAt },
    ipAddress: req.ip,
  });

  return res.status(201).json(newLink);
});

teacherRouter.post('/registration-links/:id/revoke', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const link = db.registrationLinks.find(rl => rl.id === req.params.id && rl.teacherId === teacher.id);
  if (!link) return res.status(404).json({ error: 'Registration link not found.' });

  link.status = 'REVOKED';
  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'TEACHER',
    action: 'REVOKE_REGISTRATION_LINK',
    targetType: 'REGISTRATION_LINK',
    targetId: link.id,
    details: { token: link.token },
    ipAddress: req.ip,
  });

  return res.json({ message: 'Registration link revoked.', link });
});

// 4. Pending Student Registrations Review
teacherRouter.get('/pending-registrations', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const assignments = db.teacherAssignments.filter(ta => ta.teacherId === teacher.id);
  const sectionIds = assignments.map(a => a.sectionId);

  const pendingRequests = db.registrationRequests
    .filter(rr => sectionIds.includes(rr.sectionId))
    .map(rr => {
      const section = db.sections.find(s => s.id === rr.sectionId);
      const subject = db.subjects.find(s => s.id === rr.subjectId);
      return {
        ...rr,
        sectionName: section?.name,
        subjectCode: subject?.code,
        subjectTitle: subject?.title,
      };
    })
    .reverse();

  return res.json(pendingRequests);
});

teacherRouter.post('/registrations/:id/approve', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const request = db.registrationRequests.find(rr => rr.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Registration request not found.' });

  if (request.status !== 'PENDING') {
    return res.status(400).json({ error: `Request has already been ${request.status}.` });
  }
  const rosterEntry = db.sectionRoster.find(
    entry => entry.sectionId === request.sectionId && entry.schoolId === request.schoolId.toUpperCase()
  );
  if (!rosterEntry) {
    return res.status(409).json({ error: 'This student is no longer listed on the imported class roster.' });
  }

  // Verify teacher teaches this section
  const isAuthorized = db.teacherAssignments.some(
    ta => ta.teacherId === teacher.id && ta.sectionId === request.sectionId
  );
  if (!isAuthorized && req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'You are not authorized to approve students for this section.' });
  }

  const hasReferenceSet = Array.isArray(request.faceEmbeddings) &&
    request.faceEmbeddings.length === FACE_REFERENCE_SAMPLE_COUNT &&
    request.faceEmbeddings.every(vector => Array.isArray(vector) &&
      vector.length === FACE_EMBEDDING_LENGTH &&
      vector.every(value => typeof value === 'number' && Number.isFinite(value))) &&
    Array.isArray(request.faceSnapshotDataList) &&
    request.faceSnapshotDataList.length === FACE_REFERENCE_SAMPLE_COUNT &&
    request.faceSnapshotDataList.every(snapshot => typeof snapshot === 'string');
  if (request.faceEmbeddingVersion !== FACE_EMBEDDING_VERSION || !hasReferenceSet) {
    return res.status(409).json({
      error: 'This registration needs three current face-enrollment samples. Ask the student to submit a new face enrollment before approval.',
    });
  }
  const referenceVectors = request.faceEmbeddings!;
  const referenceSnapshots = request.faceSnapshotDataList!;

  const now = new Date().toISOString();

  // Find or create student profile
  let studentProfile = db.studentProfiles.find(sp => sp.schoolId === request.schoolId);
  if (!studentProfile) {
    // Find or create user
    let user = db.users.find(u => u.email.toLowerCase() === request.email.toLowerCase() || u.username === request.schoolId);
    if (!user) {
      user = {
        id: 'usr_' + crypto.randomUUID().slice(0, 8),
        username: request.schoolId,
        email: request.email,
        passwordHash: db.hashPassword('Password123!'),
        role: 'STUDENT',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      db.users.push(user);
    }

    studentProfile = {
      id: 'sp_' + crypto.randomUUID().slice(0, 8),
      userId: user.id,
      schoolId: request.schoolId,
      fullName: request.fullName,
      courseProgram: request.courseProgram,
      yearLevel: request.yearLevel,
      isApproved: true,
      createdAt: now,
    };
    db.studentProfiles.push(studentProfile);
  } else {
    studentProfile.isApproved = true;
  }

  // Register QR Identity
  let qrIdentity = db.qrIdentities.find(q => q.studentId === studentProfile!.id);
  if (!qrIdentity) {
    qrIdentity = {
      id: 'qr_' + crypto.randomUUID().slice(0, 8),
      studentId: studentProfile.id,
      schoolId: studentProfile.schoolId,
      qrPayload: request.qrValue,
      enrolledAt: now,
    };
    db.qrIdentities.push(qrIdentity);
    studentProfile.qrIdentityId = qrIdentity.id;
  }

  // Register Facial Reference
  let faceEnrollment = db.faceEnrollments.find(f => f.studentId === studentProfile!.id);
  if (!faceEnrollment) {
    faceEnrollment = {
      id: 'fe_' + crypto.randomUUID().slice(0, 8),
      studentId: studentProfile.id,
      vector: referenceVectors[0],
      embeddingVersion: request.faceEmbeddingVersion,
      qualityScore: 0.95,
      faceSnapshot: referenceSnapshots[0],
      referenceVectors,
      referenceSnapshots,
      enrolledAt: now,
      version: 1,
    };
    db.faceEnrollments.push(faceEnrollment);
    studentProfile.faceEnrollmentId = faceEnrollment.id;
  } else {
    Object.assign(faceEnrollment, {
      vector: referenceVectors[0],
      embeddingVersion: request.faceEmbeddingVersion,
      qualityScore: 0.95,
      faceSnapshot: referenceSnapshots[0],
      referenceVectors,
      referenceSnapshots,
      enrolledAt: now,
      version: faceEnrollment.version + 1,
    });
  }

  // Create or activate section enrollment
  const sectionAssignments = db.teacherAssignments.filter(
    assignment => assignment.sectionId === request.sectionId
  );
  for (const assignment of sectionAssignments) {
    let enrollment = db.sectionEnrollments.find(
      item => item.studentId === studentProfile!.id &&
        item.sectionId === request.sectionId &&
        item.subjectId === assignment.subjectId
    );
    if (!enrollment) {
      enrollment = {
        id: 'se_' + crypto.randomUUID().slice(0, 8),
        studentId: studentProfile.id,
        sectionId: request.sectionId,
        subjectId: assignment.subjectId,
        status: 'APPROVED',
        enrolledAt: now,
      };
      db.sectionEnrollments.push(enrollment);
    } else {
      enrollment.status = 'APPROVED';
    }
  }

  // Mark request as APPROVED
  request.status = 'APPROVED';
  request.reviewedByTeacherId = teacher.id;
  request.reviewedAt = now;

  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'TEACHER',
    action: 'APPROVE_STUDENT_REGISTRATION',
    targetType: 'STUDENT_REGISTRATION',
    targetId: request.id,
    details: {
      studentId: studentProfile.id,
      schoolId: studentProfile.schoolId,
      fullName: studentProfile.fullName,
      sectionId: request.sectionId,
      enrolledSubjectCount: sectionAssignments.length,
    },
    ipAddress: req.ip,
  });

  return res.json({ message: 'Student registration approved successfully.', student: studentProfile });
});

teacherRouter.post('/registrations/:id/reject', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const { rejectionReason } = req.body;
  if (!rejectionReason || !rejectionReason.trim()) {
    return res.status(400).json({ error: 'A specific rejection reason is required.' });
  }

  const request = db.registrationRequests.find(rr => rr.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Registration request not found.' });

  request.status = 'REJECTED';
  request.rejectionReason = rejectionReason.trim();
  request.reviewedByTeacherId = teacher.id;
  request.reviewedAt = new Date().toISOString();

  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'TEACHER',
    action: 'REJECT_STUDENT_REGISTRATION',
    targetType: 'STUDENT_REGISTRATION',
    targetId: request.id,
    details: {
      schoolId: request.schoolId,
      fullName: request.fullName,
      rejectionReason,
    },
    ipAddress: req.ip,
  });

  return res.json({ message: 'Registration rejected.', request });
});

// 5. Attendance Sessions Management
teacherRouter.get('/attendance-sessions', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const sessions = db.attendanceSessions
    .filter(s => s.teacherId === teacher.id)
    .map(s => {
      const subject = db.subjects.find(sub => sub.id === s.subjectId);
      const section = db.sections.find(sec => sec.id === s.sectionId);
      const location = db.allowedLocations.find(l => l.id === s.locationId);

      const records = db.attendanceRecords.filter(r => r.attendanceSessionId === s.id);
      const presentCount = records.filter(r => r.attendanceStatus === 'PRESENT').length;
      const lateCount = records.filter(r => r.attendanceStatus === 'LATE').length;
      const absentCount = records.filter(r => r.attendanceStatus === 'ABSENT').length;

      const totalEnrolled = db.sectionEnrollments.filter(
        se => se.sectionId === s.sectionId && se.status === 'APPROVED'
      ).length;

      return {
        ...s,
        subjectCode: subject?.code,
        subjectTitle: subject?.title,
        sectionName: section?.name,
        locationName: location?.name,
        roomNumber: location?.roomNumber,
        stats: {
          totalEnrolled,
          presentCount,
          lateCount,
          absentCount,
        },
      };
    })
    .reverse();

  return res.json(sessions);
});

teacherRouter.post('/attendance-sessions', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const { teacherAssignmentId, locationId, title, durationMinutes, lateThresholdMinutes } = req.body;
  if (!teacherAssignmentId || !locationId) {
    return res.status(400).json({ error: 'Class assignment and classroom location are required.' });
  }

  const location = db.allowedLocations.find(item => item.id === locationId && item.isActive);
  if (!location) {
    return res.status(400).json({ error: 'Select an active classroom location inside the campus.' });
  }

  const assignment = db.teacherAssignments.find(
    ta => ta.id === teacherAssignmentId && ta.teacherId === teacher.id
  );
  if (!assignment) {
    return res.status(403).json({ error: 'Not authorized for this subject/section.' });
  }

  const now = new Date();
  const duration = Number(durationMinutes) || db.settings.defaultSessionDurationMinutes || 60;
  const lateCutoff = Number(lateThresholdMinutes) || db.settings.defaultLateThresholdMinutes || 15;

  const lateThresholdTime = new Date(now.getTime() + lateCutoff * 60 * 1000).toISOString();
  const endTime = new Date(now.getTime() + duration * 60 * 1000).toISOString();

  // Cryptographically secure session token
  const sessionToken = 'ssu-att-' + crypto.randomBytes(16).toString('hex');

  const subject = db.subjects.find(s => s.id === assignment.subjectId);
  const section = db.sections.find(s => s.id === assignment.sectionId);

  const newSession: AttendanceSession = {
    id: 'sess_' + crypto.randomUUID().slice(0, 8),
    sessionToken,
    teacherAssignmentId: assignment.id,
    teacherId: teacher.id,
    subjectId: assignment.subjectId,
    sectionId: assignment.sectionId,
    locationId,
    title: title || `${subject?.code || 'Class'} Attendance - ${section?.name || ''}`,
    sessionDate: now.toISOString().split('T')[0],
    startTime: now.toISOString(),
    lateThresholdTime,
    endTime,
    status: 'ACTIVE',
    createdAt: now.toISOString(),
  };

  db.attendanceSessions.push(newSession);
  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'TEACHER',
    action: 'START_ATTENDANCE_SESSION',
    targetType: 'ATTENDANCE_SESSION',
    targetId: newSession.id,
    details: {
      sessionToken,
      subjectId: assignment.subjectId,
      sectionId: assignment.sectionId,
      locationId,
      endTime,
    },
    ipAddress: req.ip,
  });

  return res.status(201).json(newSession);
});

// Live Session Monitoring
teacherRouter.get('/attendance-sessions/:id/live', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const session = db.attendanceSessions.find(s => s.id === req.params.id && s.teacherId === teacher.id);
  if (!session) return res.status(404).json({ error: 'Attendance session not found.' });

  const subject = db.subjects.find(s => s.id === session.subjectId);
  const section = db.sections.find(s => s.id === session.sectionId);
  const location = db.allowedLocations.find(l => l.id === session.locationId);

  // Get all enrolled students for this section
  const enrolledStudentProfiles = db.sectionEnrollments
    .filter(se => se.sectionId === session.sectionId && se.status === 'APPROVED')
    .map(se => db.studentProfiles.find(sp => sp.id === se.studentId))
    .filter(Boolean);

  // Get records recorded so far for this session
  const records = db.attendanceRecords.filter(r => r.attendanceSessionId === session.id);

  // Map each enrolled student with their live status
  const studentStatuses = enrolledStudentProfiles.map(student => {
    const record = records.find(r => r.studentId === student!.id);
    return {
      studentId: student!.id,
      schoolId: student!.schoolId,
      fullName: student!.fullName,
      courseProgram: student!.courseProgram,
      yearLevel: student!.yearLevel,
      status: record ? record.attendanceStatus : 'NOT_YET_RECORDED',
      verificationMethod: record?.verificationMethod,
      timestamp: record?.timestamp,
      isOverridden: record?.isOverridden,
      overrideReason: record?.overrideReason,
      distanceFromLocationMeters: record?.distanceFromLocationMeters,
      faceConfidenceScore: record?.faceConfidenceScore,
    };
  });

  // Recent verification attempts / failures for this session
  const attempts = db.verificationAttempts
    .filter(va => va.sessionId === session.id)
    .slice(-15)
    .reverse();

  return res.json({
    session,
    subject,
    section,
    location,
    isExpired: new Date(session.endTime).getTime() < Date.now(),
    studentStatuses,
    attempts,
  });
});

// Close Attendance Session: Transactionally mark unrecorded as ABSENT
teacherRouter.post('/attendance-sessions/:id/close', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const session = db.attendanceSessions.find(s => s.id === req.params.id && s.teacherId === teacher.id);
  if (!session) return res.status(404).json({ error: 'Attendance session not found.' });

  if (session.status === 'CLOSED') {
    return res.status(400).json({ error: 'Session is already closed and finalized.' });
  }

  const now = new Date().toISOString();
  session.status = 'CLOSED';
  session.closedAt = now;

  // Find all approved enrolled students
  const enrolledStudentIds = db.sectionEnrollments
    .filter(se => se.sectionId === session.sectionId && se.status === 'APPROVED')
    .map(se => se.studentId);

  // Existing records for this session
  const existingStudentIds = new Set(
    db.attendanceRecords.filter(r => r.attendanceSessionId === session.id).map(r => r.studentId)
  );

  let absentCount = 0;
  for (const studentId of enrolledStudentIds) {
    if (!existingStudentIds.has(studentId)) {
      const absentRecord: AttendanceRecord = {
        id: 'rec_' + crypto.randomUUID().slice(0, 8),
        attendanceSessionId: session.id,
        studentId,
        teacherId: teacher.id,
        subjectId: session.subjectId,
        sectionId: session.sectionId,
        attendanceStatus: 'ABSENT',
        verificationMethod: 'AUTOMATED_BIOMETRIC',
        timestamp: now,
        qrVerified: false,
        faceVerified: false,
        locationVerified: false,
      };
      db.attendanceRecords.push(absentRecord);
      absentCount++;
    }
  }

  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'TEACHER',
    action: 'CLOSE_ATTENDANCE_SESSION',
    targetType: 'ATTENDANCE_SESSION',
    targetId: session.id,
    details: {
      sessionTitle: session.title,
      absentStudentsMarked: absentCount,
    },
    ipAddress: req.ip,
  });

  return res.json({
    message: `Attendance session closed successfully. ${absentCount} unrecorded students marked ABSENT.`,
    session,
  });
});

// Manual Teacher Override
teacherRouter.post('/attendance-sessions/:id/override', (req: AuthenticatedRequest, res) => {
  const teacher = getTeacherProfile(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const { studentId, attendanceStatus, reason } = req.body;
  if (!studentId || !attendanceStatus || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'Student ID, target status (PRESENT/LATE/EXCUSED), and a valid reason are required.' });
  }

  const session = db.attendanceSessions.find(s => s.id === req.params.id && s.teacherId === teacher.id);
  if (!session) return res.status(404).json({ error: 'Attendance session not found.' });

  const student = db.studentProfiles.find(s => s.id === studentId);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const now = new Date().toISOString();
  let record = db.attendanceRecords.find(
    r => r.attendanceSessionId === session.id && r.studentId === student.id
  );

  const prevStatus = record ? record.attendanceStatus : 'NOT_YET_RECORDED';

  if (!record) {
    record = {
      id: 'rec_' + crypto.randomUUID().slice(0, 8),
      attendanceSessionId: session.id,
      studentId: student.id,
      teacherId: teacher.id,
      subjectId: session.subjectId,
      sectionId: session.sectionId,
      attendanceStatus: attendanceStatus,
      verificationMethod: 'MANUAL_OVERRIDE',
      timestamp: now,
      qrVerified: true,
      faceVerified: true,
      locationVerified: true,
      isOverridden: true,
      overrideReason: reason.trim(),
      overriddenByTeacherId: teacher.id,
      overriddenAt: now,
    };
    db.attendanceRecords.push(record);
  } else {
    record.attendanceStatus = attendanceStatus;
    record.verificationMethod = 'MANUAL_OVERRIDE';
    record.isOverridden = true;
    record.overrideReason = reason.trim();
    record.overriddenByTeacherId = teacher.id;
    record.overriddenAt = now;
  }

  db.save();

  AuditService.log({
    actorUserId: req.user?.id,
    actorRole: 'TEACHER',
    action: 'TEACHER_ATTENDANCE_OVERRIDE',
    targetType: 'ATTENDANCE_RECORD',
    targetId: record.id,
    details: {
      sessionId: session.id,
      studentId: student.id,
      schoolId: student.schoolId,
      studentName: student.fullName,
      previousStatus: prevStatus,
      newStatus: attendanceStatus,
      overrideReason: reason.trim(),
    },
    ipAddress: req.ip,
  });

  return res.json({ message: 'Attendance override applied successfully.', record });
});
