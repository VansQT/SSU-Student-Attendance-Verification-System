import { Router } from 'express';
import { db, RegistrationRequest } from '../db';
import { AuditService } from '../services/auditService';
import { biometricService } from '../services/biometricService';
import crypto from 'crypto';
import {
  FACE_EMBEDDING_LENGTH,
  FACE_EMBEDDING_VERSION,
  FACE_REFERENCE_SAMPLE_COUNT,
} from '../../shared/faceBiometrics';

export const registrationRouter = Router();

function isFaceEmbedding(value: unknown): value is number[] {
  return Array.isArray(value) &&
    value.length === FACE_EMBEDDING_LENGTH &&
    value.every(item => typeof item === 'number' && Number.isFinite(item));
}

function isFaceCaptureSet(embeddings: unknown, snapshots: unknown): embeddings is number[][] {
  return Array.isArray(embeddings) &&
    embeddings.length === FACE_REFERENCE_SAMPLE_COUNT &&
    embeddings.every(isFaceEmbedding) &&
    Array.isArray(snapshots) &&
    snapshots.length === FACE_REFERENCE_SAMPLE_COUNT &&
    snapshots.every(snapshot => typeof snapshot === 'string' &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(snapshot) &&
      snapshot.length <= 1_000_000);
}

// Validate registration link token
registrationRouter.get('/registration-link/:token', (req, res) => {
  const { token } = req.params;
  const link = db.registrationLinks.find(rl => rl.token === token);

  if (!link) {
    return res.status(404).json({ error: 'Registration link not found or invalid.' });
  }

  if (link.status === 'REVOKED') {
    return res.status(410).json({ error: 'This registration link has been revoked by the instructor.' });
  }

  if (new Date(link.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: 'This registration link has expired.' });
  }

  const teacher = db.teacherProfiles.find(t => t.id === link.teacherId);
  const subject = db.subjects.find(s => s.id === link.subjectId);
  const section = db.sections.find(s => s.id === link.sectionId);
  const program = db.programs.find(p => p.id === section?.programId);

  return res.json({
    valid: true,
    linkId: link.id,
    token: link.token,
    expiresAt: link.expiresAt,
    teacherName: teacher?.fullName,
    teacherDepartment: teacher?.department,
    subjectCode: subject?.code,
    subjectTitle: subject?.title,
    sectionName: section?.name,
    programName: program?.name,
    yearLevel: section?.yearLevel,
    rosterImported: db.sectionRoster.some(entry => entry.sectionId === link.sectionId),
  });
});

registrationRouter.get('/registration-link/:token/verify-student/:schoolId', (req, res) => {
  const link = db.registrationLinks.find(item => item.token === req.params.token);
  if (!link) return res.status(404).json({ error: 'Registration link not found or invalid.' });
  if (link.status === 'REVOKED') {
    return res.status(410).json({ error: 'This registration link has been revoked by the instructor.' });
  }
  if (new Date(link.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: 'This registration link has expired.' });
  }

  const schoolId = req.params.schoolId.trim().toUpperCase();
  const rosterEntry = db.sectionRoster.find(
    entry => entry.sectionId === link.sectionId && entry.schoolId === schoolId
  );
  if (!rosterEntry) {
    const hasRoster = db.sectionRoster.some(entry => entry.sectionId === link.sectionId);
    return res.status(403).json({
      error: hasRoster
        ? 'This Student ID is not on the imported roster for this class.'
        : 'The instructor has not imported the student roster for this class yet.',
    });
  }

  return res.json({
    eligible: true,
    student: {
      schoolId: rosterEntry.schoolId,
      fullName: rosterEntry.fullName,
      courseProgram: rosterEntry.courseProgram,
      yearLevel: rosterEntry.yearLevel,
      qrValue: db.qrIdentities.find(identity => identity.schoolId === rosterEntry.schoolId)?.qrPayload ||
        `SSU-ID:${rosterEntry.schoolId}`,
    },
  });
});

// Submit Student Registration
registrationRouter.post('/register-student', async (req, res) => {
  const {
    token,
    schoolId,
    fullName,
    email,
    password,
    courseProgram,
    yearLevel,
    qrValue,
    faceEmbedding,
    faceEmbeddingVersion,
    faceSnapshotData,
    faceEmbeddings,
    faceSnapshotDataList,
  } = req.body;

  if (!token || !schoolId || !fullName || !email || !qrValue) {
    return res.status(400).json({ error: 'Missing required student registration details.' });
  }

  const link = db.registrationLinks.find(rl => rl.token === token);
  if (!link) {
    return res.status(404).json({ error: 'Registration link is invalid.' });
  }
  if (link.status === 'REVOKED') {
    return res.status(410).json({ error: 'This registration link has been revoked.' });
  }
  if (new Date(link.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: 'This registration link has expired.' });
  }

  // Sanitize school ID
  const cleanSchoolId = String(schoolId).trim().toUpperCase();
  const rosterEntry = db.sectionRoster.find(
    entry => entry.sectionId === link.sectionId && entry.schoolId === cleanSchoolId
  );
  if (!rosterEntry) {
    return res.status(403).json({
      error: db.sectionRoster.some(entry => entry.sectionId === link.sectionId)
        ? 'This Student ID is not on the imported roster for this class.'
        : 'The instructor has not imported the student roster for this class yet.',
    });
  }

  // Validate QR Code relationship
  const cleanQr = String(qrValue).trim();
  if (!cleanQr || cleanQr.length < 4) {
    return res.status(400).json({ error: 'Physical printed school ID QR scan payload is invalid or empty.' });
  }

  // Format verification check: Does QR contain or match the student's ID?
  // SSU ID QR formats usually include the school ID e.g. "SSU-ID:SSU-2023-XXXXX" or "SSU-2023-XXXXX"
  const qrContainsId = cleanQr.toUpperCase().includes(cleanSchoolId.replace(/[^A-Z0-9]/g, '')) ||
                       cleanQr.toUpperCase().includes(cleanSchoolId);
  if (!qrContainsId && !cleanQr.startsWith('SSU-ID:')) {
    // If it's a raw student barcode/QR format, we record it with a format notice
    console.log(`Notice: QR code (${cleanQr}) does not directly match school ID (${cleanSchoolId}).`);
  }

  // Check if this QR identity is already registered by ANOTHER student
  const existingQr = db.qrIdentities.find(q => q.qrPayload === cleanQr);
  if (existingQr && existingQr.schoolId !== cleanSchoolId) {
    return res.status(409).json({
      error: `Conflict: This printed QR code is already registered to another student ID (${existingQr.schoolId}).`,
    });
  }

  // Check if student already has a pending registration for this section
  const existingPending = db.registrationRequests.find(
    rr => rr.schoolId === cleanSchoolId && rr.sectionId === link.sectionId && rr.status === 'PENDING'
  );
  if (existingPending) {
    return res.status(409).json({
      error: 'You already have a pending registration submission for this section awaiting teacher review.',
    });
  }

  // Check if student is already approved and enrolled in this section
  const existingStudent = db.studentProfiles.find(sp => sp.schoolId === cleanSchoolId);
  if (existingStudent) {
    const existingEnrollment = db.sectionEnrollments.find(
      se => se.studentId === existingStudent.id && se.sectionId === link.sectionId && se.status === 'APPROVED'
    );
    if (existingEnrollment) {
      return res.status(409).json({
        error: 'You are already registered and approved for this section.',
      });
    }
  }

  // Facial embedding check
  if (faceEmbeddingVersion !== FACE_EMBEDDING_VERSION ||
      !isFaceEmbedding(faceEmbedding) ||
      !isFaceCaptureSet(faceEmbeddings, faceSnapshotDataList)) {
    return res.status(400).json({
      error: 'Three valid face-recognition enrollment captures are required. Please capture your face again with the latest face verification screen.',
    });
  }

  try {
    const imageChecks = await Promise.all(faceSnapshotDataList.map((snapshot: string) => biometricService.validateFaceImage(snapshot)));
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
    console.error('Face-recognition API registration image validation failed:', error);
    return res.status(503).json({
      error: 'Face verification service is temporarily unavailable. Please try again later.',
    });
  }

  // Create or retrieve login account credentials
  let user = db.users.find(u => u.username === cleanSchoolId || u.email.toLowerCase() === email.toLowerCase());
  if (!user && password) {
    user = {
      id: 'usr_' + crypto.randomUUID().slice(0, 8),
      username: cleanSchoolId,
      email: email.trim().toLowerCase(),
      passwordHash: db.hashPassword(password),
      role: 'STUDENT',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.users.push(user);
  }

  // Create Registration Request
  const newRequest: RegistrationRequest = {
    id: 'rr_' + crypto.randomUUID().slice(0, 8),
    registrationLinkId: link.id,
    schoolId: cleanSchoolId,
    fullName: rosterEntry.fullName,
    email: email.trim().toLowerCase(),
    courseProgram: rosterEntry.courseProgram,
    yearLevel: rosterEntry.yearLevel,
    sectionId: link.sectionId, // Strictly enforced from teacher's token
    subjectId: link.subjectId,
    qrValue: cleanQr,
    faceEmbedding: faceEmbeddings[0],
    faceEmbeddingVersion,
    faceSnapshotData: faceSnapshotDataList[0],
    faceEmbeddings,
    faceSnapshotDataList,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  db.registrationRequests.push(newRequest);
  db.save();

  AuditService.log({
    actorRole: 'STUDENT',
    action: 'SUBMIT_STUDENT_REGISTRATION',
    targetType: 'STUDENT_REGISTRATION',
    targetId: newRequest.id,
    details: {
      schoolId: cleanSchoolId,
      fullName,
      email,
      sectionId: link.sectionId,
      subjectId: link.subjectId,
    },
    ipAddress: req.ip,
  });

  return res.status(201).json({
    success: true,
    message: 'Your registration has been submitted successfully! Your instructor will review and approve your enrollment.',
    requestId: newRequest.id,
    schoolId: cleanSchoolId,
    status: 'PENDING',
  });
});
