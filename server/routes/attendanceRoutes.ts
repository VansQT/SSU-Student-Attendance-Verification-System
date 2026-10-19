import { Router } from 'express';
import { db, AttendanceRecord, VerificationAttempt } from '../db';
import { AuthenticatedRequest } from '../auth';
import { biometricService } from '../services/biometricService';
import { LocationService } from '../services/locationService';
import { AuditService } from '../services/auditService';
import crypto from 'crypto';
import { FACE_EMBEDDING_VERSION } from '../../shared/faceBiometrics';

export const attendanceRouter = Router();

const FACE_VERIFICATION_GRANT_TTL_MS = 2 * 60 * 1000;
const faceVerificationGrants = new Map<string, {
  sessionId: string;
  studentId: string;
  expiresAt: number;
  confidenceScore: number;
}>();

// 1. Public Session Info by Token
attendanceRouter.get('/session-info/:token', (req, res) => {
  const { token } = req.params;
  const session = db.attendanceSessions.find(s => s.sessionToken === token);

  if (!session) {
    return res.status(404).json({ error: 'Attendance session not found.' });
  }

  const now = Date.now();
  const isPastEnd = new Date(session.endTime).getTime() < now;
  const isExpired = session.status === 'CLOSED' || session.status === 'CANCELLED' || isPastEnd;

  const subject = db.subjects.find(s => s.id === session.subjectId);
  const section = db.sections.find(s => s.id === session.sectionId);
  const teacher = db.teacherProfiles.find(t => t.id === session.teacherId);
  const location = db.allowedLocations.find(l => l.id === session.locationId);

  return res.json({
    sessionId: session.id,
    sessionToken: session.sessionToken,
    title: session.title,
    sessionDate: session.sessionDate,
    startTime: session.startTime,
    lateThresholdTime: session.lateThresholdTime,
    endTime: session.endTime,
    status: isExpired ? 'CLOSED' : session.status,
    isExpired,
    subject: {
      code: subject?.code,
      title: subject?.title,
    },
    section: {
      name: section?.name,
      yearLevel: section?.yearLevel,
    },
    teacher: {
      fullName: teacher?.fullName,
      title: teacher?.title,
    },
    location: {
      id: location?.id,
      name: location?.name,
      building: location?.building,
      roomNumber: location?.roomNumber,
      radiusMeters: location?.radiusMeters,
      // Target lat/lon provided for student client-side distance helper display
      latitude: location?.latitude,
      longitude: location?.longitude,
    },
  });
});

// Helper to log failed attempts
function logFailedAttempt(sessionId: string, studentId: string | undefined, schoolId: string | undefined, step: VerificationAttempt['stepFailed'], details: string, ip?: string) {
  const attempt: VerificationAttempt = {
    id: 'va_' + crypto.randomUUID().slice(0, 8),
    sessionId,
    studentId,
    schoolIdAttempted: schoolId,
    stepFailed: step,
    details,
    timestamp: new Date().toISOString(),
    ipAddress: ip,
  };
  db.verificationAttempts.push(attempt);
  db.save();
}

function liveCapturesFromRequest(body: Record<string, unknown>) {
  const imageList = body.liveFaceImageDataList;
  const embeddingList = body.liveFaceEmbeddings;
  if (Array.isArray(imageList) && Array.isArray(embeddingList)) {
    return imageList.map((imageDataUrl, index) => ({
      imageDataUrl,
      embedding: embeddingList[index],
    }));
  }
  return [{
    imageDataUrl: body.liveFaceImageData,
    embedding: body.liveFaceEmbedding,
  }];
}

// Face verification is a separate, server-authoritative gate. The client must
// obtain this short-lived receipt before it is allowed to begin geofencing.
attendanceRouter.post('/verify-face', async (req: AuthenticatedRequest, res) => {
  const {
    sessionToken,
    qrValue,
    faceEmbeddingVersion,
    livenessMetadata,
  } = req.body;

  const session = db.attendanceSessions.find(item => item.sessionToken === sessionToken);
  if (!session) return res.status(404).json({ error: 'Attendance session not found.' });
  if (session.status !== 'ACTIVE' || new Date(session.endTime).getTime() < Date.now()) {
    return res.status(410).json({ error: 'This attendance link has expired or was closed by the instructor.' });
  }
  if (!qrValue) return res.status(400).json({ error: 'Please scan your printed school ID QR code first.' });

  const cleanScannedQr = String(qrValue).trim();
  const enrolledQr = db.qrIdentities.find(item => item.qrPayload === cleanScannedQr);
  const student = enrolledQr
    ? db.studentProfiles.find(item => item.id === enrolledQr.studentId)
    : db.studentProfiles.find(item =>
        !db.qrIdentities.some(qr => qr.studentId === item.id) && cleanScannedQr.includes(item.schoolId)
      );
  if (!student) {
    logFailedAttempt(session.id, req.user?.id, cleanScannedQr, 'QR_MISMATCH', 'Face check started with an unrecognized QR code.', req.ip);
    return res.status(403).json({ error: 'QR Verification Failed: The scanned QR code is not enrolled to a student account.' });
  }

  const authenticatedStudent = req.user && db.studentProfiles.find(item => item.userId === req.user?.id);
  if (authenticatedStudent && authenticatedStudent.id !== student.id) {
    logFailedAttempt(session.id, student.id, student.schoolId, 'QR_MISMATCH', 'Scanned ID does not match the signed-in student.', req.ip);
    return res.status(403).json({ error: 'The scanned school ID does not match the signed-in student account.' });
  }
  if (!student.isApproved) {
    return res.status(403).json({ error: 'Your student registration has not yet been approved by your instructor.' });
  }
  const isEnrolled = db.sectionEnrollments.some(item =>
    item.studentId === student.id && item.sectionId === session.sectionId && item.status === 'APPROVED'
  );
  if (!isEnrolled) {
    return res.status(403).json({ error: 'You are not enrolled in this section for this attendance session.' });
  }

  const faceEnrollment = db.faceEnrollments.find(item => item.studentId === student.id);
  if (faceEmbeddingVersion !== FACE_EMBEDDING_VERSION || typeof faceEnrollment?.faceSnapshot !== 'string') {
    logFailedAttempt(session.id, student.id, student.schoolId, 'FACE_MISMATCH', 'No current face enrollment is available.', req.ip);
    return res.status(409).json({ error: 'No saved enrollment photo is available for face verification. Register your face before taking attendance.' });
  }

  let faceResult;
  try {
    faceResult = await biometricService.verifyFace(
      student.id,
      liveCapturesFromRequest(req.body),
      livenessMetadata,
    );
  } catch (error) {
    console.error('Face-recognition attendance pre-check failed:', error);
    return res.status(503).json({ error: 'Face verification service is temporarily unavailable. Please try again later.' });
  }
  if (!faceResult.livenessPassed) {
    logFailedAttempt(session.id, student.id, student.schoolId, 'LIVENESS_FAIL', faceResult.message, req.ip);
    return res.status(400).json({ error: `Liveness Verification Failed: ${faceResult.message}` });
  }
  if (!faceResult.verified) {
    logFailedAttempt(session.id, student.id, student.schoolId, 'FACE_MISMATCH', faceResult.message, req.ip);
    return res.status(400).json({
      error: `Facial Verification Failed: ${faceResult.message}`,
      confidenceScore: faceResult.confidenceScore,
    });
  }

  const now = Date.now();
  for (const [token, grant] of faceVerificationGrants) {
    if (grant.expiresAt <= now) faceVerificationGrants.delete(token);
  }
  const faceVerificationToken = crypto.randomUUID();
  faceVerificationGrants.set(faceVerificationToken, {
    sessionId: session.id,
    studentId: student.id,
    expiresAt: now + FACE_VERIFICATION_GRANT_TTL_MS,
    confidenceScore: faceResult.confidenceScore,
  });
  return res.json({
    verified: true,
    faceVerificationToken,
    confidenceScore: faceResult.confidenceScore,
    message: 'Face recognized and matched to the registered student. Continue to location verification.',
  });
});

// 2. Complete Student Attendance Verification
attendanceRouter.post('/verify', async (req: AuthenticatedRequest, res) => {
  const {
    sessionToken,
    qrValue,
    faceVerificationToken,
    latitude,
    longitude,
    accuracyMeters,
  } = req.body;

  // STEP 1: Session Validation
  const session = db.attendanceSessions.find(s => s.sessionToken === sessionToken);
  if (!session) {
    return res.status(404).json({ error: 'Attendance session not found.' });
  }

  const now = new Date();
  if (session.status !== 'ACTIVE' || new Date(session.endTime).getTime() < now.getTime()) {
    logFailedAttempt(session.id, req.user?.id, req.user?.username, 'SESSION_CLOSED', 'Attempted attendance on closed or expired session.', req.ip);
    return res.status(410).json({ error: 'This attendance link has expired or was closed by the instructor.' });
  }

  // STEP 2: Identify the student from their enrolled school ID QR.
  if (!qrValue) {
    logFailedAttempt(session.id, req.user?.id, req.user?.username, 'QR_MISMATCH', 'QR code scan payload is missing.', req.ip);
    return res.status(400).json({ error: 'Please scan your printed school ID QR code.' });
  }

  const cleanScannedQr = String(qrValue).trim();
  const enrolledQr = db.qrIdentities.find(q => q.qrPayload === cleanScannedQr);
  const student = enrolledQr
    ? db.studentProfiles.find(sp => sp.id === enrolledQr.studentId)
    : db.studentProfiles.find(sp =>
        !db.qrIdentities.some(q => q.studentId === sp.id) && cleanScannedQr.includes(sp.schoolId)
      );

  if (!student) {
    logFailedAttempt(session.id, req.user?.id, cleanScannedQr, 'QR_MISMATCH', 'Scanned QR code does not match an enrolled student identity.', req.ip);
    return res.status(403).json({ error: 'QR Verification Failed: The scanned QR code is not enrolled to a student account.' });
  }

  const authenticatedStudent = req.user && db.studentProfiles.find(sp => sp.userId === req.user?.id);
  if (authenticatedStudent && authenticatedStudent.id !== student.id) {
    logFailedAttempt(session.id, student.id, student.schoolId, 'QR_MISMATCH', 'Scanned ID does not match the signed-in student.', req.ip);
    return res.status(403).json({ error: 'The scanned school ID does not match the signed-in student account.' });
  }

  if (!student.isApproved) {
    logFailedAttempt(session.id, student.id, student.schoolId, 'AUTH', 'Student account is not yet approved by instructor.', req.ip);
    return res.status(403).json({ error: 'Your student registration has not yet been approved by your instructor.' });
  }

  const isEnrolled = db.sectionEnrollments.some(
    se => se.studentId === student.id && se.sectionId === session.sectionId && se.status === 'APPROVED'
  );

  if (!isEnrolled) {
    logFailedAttempt(session.id, student.id, student.schoolId, 'AUTH', `Student ${student.schoolId} is not enrolled in section ${session.sectionId}.`, req.ip);
    return res.status(403).json({ error: 'You are not enrolled in this section for this attendance session.' });
  }

  // STEP 6: Duplicate Check (Enforce UNIQUE(attendance_session_id, student_id))
  const existingRecord = db.attendanceRecords.find(
    r => r.attendanceSessionId === session.id && r.studentId === student.id
  );
  if (existingRecord) {
    logFailedAttempt(session.id, student.id, student.schoolId, 'DUPLICATE', 'Student attempted duplicate attendance submission.', req.ip);
    return res.status(409).json({
      error: `Duplicate attendance: You already completed attendance for this session at ${new Date(existingRecord.timestamp).toLocaleTimeString()} with status "${existingRecord.attendanceStatus}".`,
      existingRecord,
    });
  }

  // STEP 4: A server-validated face receipt is required before location data
  // is accepted. It is bound to this student and attendance session.
  const faceGrant = typeof faceVerificationToken === 'string'
    ? faceVerificationGrants.get(faceVerificationToken)
    : undefined;
  if (!faceGrant ||
      faceGrant.expiresAt <= Date.now() ||
      faceGrant.sessionId !== session.id ||
      faceGrant.studentId !== student.id) {
    if (typeof faceVerificationToken === 'string') faceVerificationGrants.delete(faceVerificationToken);
    logFailedAttempt(session.id, student.id, student.schoolId, 'FACE_MISMATCH', 'No valid face-verification receipt was supplied before geofencing.', req.ip);
    return res.status(400).json({
      error: 'Face verification is required before location verification. Return to face check and try again.',
    });
  }

  // STEP 5: Location Validation
  if (latitude === undefined || longitude === undefined) {
    logFailedAttempt(session.id, student.id, student.schoolId, 'LOCATION_OUT_OF_BOUNDS', 'Missing GPS coordinates.', req.ip);
    return res.status(400).json({ error: 'Location permission required: Please allow location access.' });
  }

  const locationResult = LocationService.validateLocation(
    session.locationId,
    Number(latitude),
    Number(longitude),
    Number(accuracyMeters) || 15
  );

  if (!locationResult.valid) {
    logFailedAttempt(
      session.id,
      student.id,
      student.schoolId,
      'LOCATION_OUT_OF_BOUNDS',
      `Distance: ${locationResult.distanceMeters}m, Max allowed: ${locationResult.allowedRadiusMeters}m. Accuracy: ${accuracyMeters}m`,
      req.ip
    );
    return res.status(400).json({
      error: locationResult.message,
      distanceMeters: locationResult.distanceMeters,
      allowedRadiusMeters: locationResult.allowedRadiusMeters,
    });
  }

  // STEP 7: Record Attendance
  const lateCutoffTime = new Date(session.lateThresholdTime).getTime();
  const isLate = now.getTime() > lateCutoffTime;
  const attendanceStatus = isLate ? 'LATE' : 'PRESENT';

  const newRecord: AttendanceRecord = {
    id: 'rec_' + crypto.randomUUID().slice(0, 8),
    attendanceSessionId: session.id,
    studentId: student.id,
    teacherId: session.teacherId,
    subjectId: session.subjectId,
    sectionId: session.sectionId,
    attendanceStatus,
    verificationMethod: 'AUTOMATED_BIOMETRIC',
    timestamp: now.toISOString(),
    qrVerified: true,
    faceVerified: true,
    locationVerified: true,
    distanceFromLocationMeters: locationResult.distanceMeters,
    faceConfidenceScore: faceGrant.confidenceScore,
  };

  db.attendanceRecords.push(newRecord);
  db.save();

  // Audit Log
  AuditService.log({
    actorUserId: student.userId,
    actorRole: 'STUDENT',
    action: 'VERIFIED_ATTENDANCE_RECORDED',
    targetType: 'ATTENDANCE_RECORD',
    targetId: newRecord.id,
    details: {
      sessionId: session.id,
      studentId: student.id,
      schoolId: student.schoolId,
      status: attendanceStatus,
      distance: locationResult.distanceMeters,
      faceConfidence: faceGrant.confidenceScore,
    },
    ipAddress: req.ip,
  });

  faceVerificationGrants.delete(faceVerificationToken);

  const subject = db.subjects.find(s => s.id === session.subjectId);
  const section = db.sections.find(s => s.id === session.sectionId);

  // STEP 8: Confirmation
  return res.status(201).json({
    success: true,
    message: 'Attendance Successfully Recorded!',
    receipt: {
      recordId: newRecord.id,
      studentName: student.fullName,
      schoolId: student.schoolId,
      subjectCode: subject?.code,
      subjectTitle: subject?.title,
      sectionName: section?.name,
      sessionTitle: session.title,
      date: session.sessionDate,
      attendanceTime: now.toLocaleTimeString(),
      attendanceStatus,
      qrVerified: true,
      faceConfidenceScore: faceGrant.confidenceScore,
      distanceFromClassroom: `${locationResult.distanceMeters}m`,
    },
  });
});
