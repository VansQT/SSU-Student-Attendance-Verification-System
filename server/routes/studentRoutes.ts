import { Router, type Response } from 'express';
import { db } from '../db';
import { AuthenticatedRequest, requireRole } from '../auth';
import { AuditService } from '../services/auditService';
import { biometricService, FaceRecognitionServiceError } from '../services/biometricService';
import {
  FACE_EMBEDDING_LENGTH,
  FACE_EMBEDDING_VERSION,
  FACE_REFERENCE_SAMPLE_COUNT,
} from '../../shared/faceBiometrics';

export const studentRouter = Router();
studentRouter.use(requireRole(['STUDENT', 'ADMIN']));

function isFaceEmbedding(value: unknown): value is number[] {
  return Array.isArray(value) &&
    value.length === FACE_EMBEDDING_LENGTH &&
    value.every(item => typeof item === 'number' && Number.isFinite(item));
}

// Helper to get student profile
function getStudentProfile(req: AuthenticatedRequest) {
  if (req.user?.role === 'ADMIN') {
    return db.studentProfiles[0];
  }
  return db.studentProfiles.find(sp => sp.userId === req.user?.id);
}

function sendFaceServiceError(res: Response, error: unknown) {
  if (error instanceof FaceRecognitionServiceError && error.status && error.status < 500) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error('Face-recognition service error:', error);
  return res.status(503).json({
    error: 'Face verification service is temporarily unavailable. Please try again later.',
  });
}

// 1. Student Dashboard
studentRouter.get('/dashboard', (req: AuthenticatedRequest, res) => {
  const student = getStudentProfile(req);
  if (!student) {
    return res.status(404).json({ error: 'Student profile not found.' });
  }

  const enrollments = db.sectionEnrollments.filter(
    se => se.studentId === student.id && se.status === 'APPROVED'
  );
  // Attendance stats for this student
  const records = db.attendanceRecords.filter(r => r.studentId === student.id);
  const presentCount = records.filter(r => r.attendanceStatus === 'PRESENT').length;
  const lateCount = records.filter(r => r.attendanceStatus === 'LATE').length;
  const absentCount = records.filter(r => r.attendanceStatus === 'ABSENT').length;
  const totalRecorded = records.length;

  const attendanceRate = totalRecorded > 0 ? Math.round(((presentCount + lateCount) / totalRecorded) * 100) : 100;

  // Active sessions right now for classes the student is enrolled in
  const activeSessions = db.attendanceSessions
    .filter(s => s.status === 'ACTIVE' && enrollments.some(
      enrollment => enrollment.sectionId === s.sectionId && enrollment.subjectId === s.subjectId
    ))
    .map(s => {
      const subject = db.subjects.find(sub => sub.id === s.subjectId);
      const section = db.sections.find(sec => sec.id === s.sectionId);
      const location = db.allowedLocations.find(l => l.id === s.locationId);
      const teacher = db.teacherProfiles.find(t => t.id === s.teacherId);
      const hasAttended = records.some(r => r.attendanceSessionId === s.id);

      return {
        id: s.id,
        sessionToken: s.sessionToken,
        title: s.title,
        subjectCode: subject?.code,
        subjectTitle: subject?.title,
        sectionName: section?.name,
        locationName: location?.name,
        teacherName: teacher?.fullName,
        endTime: s.endTime,
        hasAttended,
      };
    });

  const qrIdentity = db.qrIdentities.find(q => q.studentId === student.id);
  const faceEnrollment = db.faceEnrollments.find(f => f.studentId === student.id);
  const faceSnapshot = faceEnrollment?.faceSnapshot;
  const facePhoto = typeof faceSnapshot === 'string' &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(faceSnapshot)
    ? faceSnapshot
    : undefined;

  return res.json({
    student,
    hasEnrolledQr: !!qrIdentity,
    qrValue: qrIdentity?.qrPayload,
    hasEnrolledFace: !!faceEnrollment,
    faceEmbeddingVersion: faceEnrollment?.embeddingVersion,
    faceReferenceSampleCount: faceEnrollment?.referenceVectors?.length || 0,
    faceQuality: faceEnrollment?.qualityScore,
    facePhoto,
    stats: {
      enrolledClassesCount: enrollments.length,
      presentCount,
      lateCount,
      absentCount,
      attendanceRate,
    },
    activeSessions,
  });
});

studentRouter.put('/profile/password', (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'STUDENT') {
    return res.status(403).json({ error: 'Only a signed-in student can change their password.' });
  }

  const student = getStudentProfile(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });
  const user = db.users.find(item => item.id === student.userId);
  if (!user) return res.status(404).json({ error: 'Student account not found.' });

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
    actorRole: 'STUDENT',
    action: 'CHANGE_STUDENT_PASSWORD',
    targetType: 'USER',
    targetId: user.id,
    details: { passwordChanged: true },
    ipAddress: req.ip,
  });
  return res.json({ message: 'Password updated successfully.' });
});

studentRouter.put('/face-enrollment', async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'STUDENT') {
    return res.status(403).json({ error: 'Only a signed-in student can update their own face enrollment.' });
  }

  const student = getStudentProfile(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });
  if (!student.isApproved) {
    return res.status(403).json({
      error: 'Your student account must be approved by an instructor before you can register a face.',
    });
  }

  const {
    faceEmbedding,
    faceEmbeddingVersion,
    faceSnapshotData,
    faceEmbeddings,
    faceSnapshotDataList,
    livenessMetadata,
  } = req.body;
  if (faceEmbeddingVersion !== FACE_EMBEDDING_VERSION ||
      !isFaceEmbedding(faceEmbedding) ||
      !Array.isArray(faceEmbeddings) ||
      faceEmbeddings.length !== FACE_REFERENCE_SAMPLE_COUNT ||
      !faceEmbeddings.every(isFaceEmbedding) ||
      !Array.isArray(faceSnapshotDataList) ||
      faceSnapshotDataList.length !== FACE_REFERENCE_SAMPLE_COUNT ||
      !faceSnapshotDataList.every((snapshot: unknown) => typeof snapshot === 'string' &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(snapshot) && snapshot.length <= 1_000_000)) {
    return res.status(400).json({ error: 'Three valid face-recognition captures are required. Please capture your face again.' });
  }

  if (livenessMetadata?.challengeResponseValid !== true ||
      typeof livenessMetadata.qualityScore !== 'number' ||
      livenessMetadata.qualityScore < 0.5) {
    return res.status(400).json({ error: 'The live face check did not pass. Please capture your face again.' });
  }

  if (typeof faceSnapshotData !== 'string' ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(faceSnapshotData) ||
      faceSnapshotData.length > 1_000_000) {
    return res.status(400).json({ error: 'A valid face capture image is required.' });
  }

  try {
    const imageChecks = await Promise.all(faceSnapshotDataList.map(snapshot => biometricService.validateFaceImage(snapshot)));
    const failedImageCheck = imageChecks.find(check => !check.valid);
    if (failedImageCheck) {
      return res.status(400).json({ error: failedImageCheck.message });
    }
    const captureSetCheck = await biometricService.validateEnrollmentCaptureSet(
      faceSnapshotDataList.map((imageDataUrl: string, index: number) => ({
        imageDataUrl,
        embedding: faceEmbeddings[index],
      }))
    );
    if (!captureSetCheck.valid) {
      return res.status(400).json({ error: captureSetCheck.message });
    }
  } catch (error) {
    return sendFaceServiceError(res, error);
  }

  const enrollment = db.faceEnrollments.find(item => item.studentId === student.id);
  if (!enrollment) {
    const newEnrollment = {
      id: 'fe_' + crypto.randomUUID().slice(0, 8),
      studentId: student.id,
      vector: faceEmbeddings[0],
      embeddingVersion: FACE_EMBEDDING_VERSION,
      qualityScore: 1,
      faceSnapshot: faceSnapshotDataList[0],
      referenceVectors: faceEmbeddings,
      referenceSnapshots: faceSnapshotDataList,
      enrolledAt: new Date().toISOString(),
      version: 1,
    };
    db.faceEnrollments.push(newEnrollment);
    student.faceEnrollmentId = newEnrollment.id;
    db.save();
    AuditService.log({
      actorUserId: req.user.id,
      actorRole: 'STUDENT',
      action: 'REGISTER_REPLACEMENT_FACE_ENROLLMENT',
      targetType: 'STUDENT',
      targetId: student.id,
      details: { embeddingVersion: FACE_EMBEDDING_VERSION },
      ipAddress: req.ip,
    });
    return res.status(201).json({ success: true, embeddingVersion: newEnrollment.embeddingVersion });
  }
  if (typeof enrollment.faceSnapshot !== 'string') {
    return res.status(409).json({
      error: 'An instructor must verify your initial face enrollment before it can be changed.',
    });
  }

  let reEnrollmentCheck;
  try {
    reEnrollmentCheck = await biometricService.verifyFace(
      student.id,
      [{ imageDataUrl: faceSnapshotDataList[0], embedding: faceEmbeddings[0] }],
      livenessMetadata,
      { requireMultipleSamples: false }
    );
  } catch (error) {
    return sendFaceServiceError(res, error);
  }
  if (!reEnrollmentCheck.verified) {
    return res.status(403).json({
      error: 'The new capture does not match your current enrollment. Contact your instructor if your face template needs to be replaced.',
    });
  }

  Object.assign(enrollment, {
    vector: faceEmbeddings[0],
    embeddingVersion: FACE_EMBEDDING_VERSION,
    qualityScore: 1,
    faceSnapshot: faceSnapshotDataList[0],
    referenceVectors: faceEmbeddings,
    referenceSnapshots: faceSnapshotDataList,
    enrolledAt: new Date().toISOString(),
    version: enrollment.version + 1,
  });

  db.save();
  AuditService.log({
    actorUserId: req.user.id,
    actorRole: 'STUDENT',
    action: 'UPDATE_FACE_ENROLLMENT',
    targetType: 'STUDENT',
    targetId: student.id,
    details: { embeddingVersion: FACE_EMBEDDING_VERSION, enrollmentVersion: enrollment.version },
    ipAddress: req.ip,
  });
  return res.json({ success: true, embeddingVersion: enrollment.embeddingVersion });
});

// 2. Attendance History
studentRouter.get('/attendance-history', (req: AuthenticatedRequest, res) => {
  const student = getStudentProfile(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const history = db.attendanceRecords
    .filter(r => r.studentId === student.id)
    .map(r => {
      const subject = db.subjects.find(s => s.id === r.subjectId);
      const section = db.sections.find(s => s.id === r.sectionId);
      const teacher = db.teacherProfiles.find(t => t.id === r.teacherId);
      const session = db.attendanceSessions.find(s => s.id === r.attendanceSessionId);

      return {
        ...r,
        subjectCode: subject?.code,
        subjectTitle: subject?.title,
        sectionName: section?.name,
        teacherName: teacher?.fullName,
        sessionTitle: session?.title,
        sessionDate: session?.sessionDate,
      };
    })
    .reverse();

  return res.json(history);
});

// 3. My Classes
studentRouter.get('/my-classes', (req: AuthenticatedRequest, res) => {
  const student = getStudentProfile(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const enrollments = db.sectionEnrollments.filter(
    se => se.studentId === student.id &&
      se.status === 'APPROVED' &&
      db.teacherAssignments.some(assignment => assignment.sectionId === se.sectionId && assignment.subjectId === se.subjectId)
  );

  const classes = enrollments.map(se => {
    const section = db.sections.find(s => s.id === se.sectionId);
    const subject = db.subjects.find(s => s.id === se.subjectId);
    const assignment = db.teacherAssignments.find(
      ta => ta.sectionId === se.sectionId && ta.subjectId === se.subjectId
    );
    const teacher = assignment ? db.teacherProfiles.find(t => t.id === assignment.teacherId) : null;

    // Attendance stats for this specific subject
    const subjectRecords = db.attendanceRecords.filter(
      r => r.studentId === student.id && r.subjectId === se.subjectId && r.sectionId === se.sectionId
    );
    const present = subjectRecords.filter(r => r.attendanceStatus === 'PRESENT').length;
    const late = subjectRecords.filter(r => r.attendanceStatus === 'LATE').length;
    const absent = subjectRecords.filter(r => r.attendanceStatus === 'ABSENT').length;
    const total = subjectRecords.length;
    const percent = total > 0 ? Math.round(((present + late) / total) * 100) : 100;

    return {
      enrollmentId: se.id,
      sectionId: se.sectionId,
      sectionName: section?.name,
      subjectId: se.subjectId,
      subjectCode: subject?.code,
      subjectTitle: subject?.title,
      units: subject?.units,
      teacherName: teacher?.fullName || 'TBA',
      teacherDepartment: teacher?.department || 'SSU Faculty',
      attendance: {
        present,
        late,
        absent,
        total,
        percentage: percent,
      },
    };
  });

  return res.json(classes);
});
