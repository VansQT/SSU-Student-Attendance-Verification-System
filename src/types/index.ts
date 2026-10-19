export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface StudentProfile {
  id: string;
  userId: string;
  schoolId: string;
  fullName: string;
  courseProgram: string;
  yearLevel: string;
  contactNumber?: string;
  qrIdentityId?: string;
  faceEnrollmentId?: string;
  isApproved: boolean;
  createdAt: string;
}

export interface TeacherProfile {
  id: string;
  userId: string;
  facultyId: string;
  fullName: string;
  department: string;
  title: string;
  contactNumber?: string;
  profilePhoto?: string;
  createdAt: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface Semester {
  id: string;
  name: string;
  academicYearId: string;
  isCurrent: boolean;
}

export interface Program {
  id: string;
  code: string;
  name: string;
  department: string;
}

export interface Section {
  id: string;
  name: string;
  programId: string;
  yearLevel: string;
  academicYearId: string;
}

export interface Subject {
  id: string;
  code: string;
  title: string;
  units: number;
}

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
  academicYearId: string;
  semesterId: string;
  teacherName?: string;
  subjectCode?: string;
  subjectTitle?: string;
  sectionName?: string;
  createdAt: string;
}

export interface AllowedLocation {
  id: string;
  name: string;
  building: string;
  roomNumber: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  description?: string;
  isActive: boolean;
}

export interface RegistrationLink {
  id: string;
  token: string;
  teacherAssignmentId: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
  createdAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  subjectCode?: string;
  subjectTitle?: string;
  sectionName?: string;
  requestCount?: number;
}

export interface RegistrationRequest {
  id: string;
  registrationLinkId: string;
  schoolId: string;
  fullName: string;
  email: string;
  courseProgram: string;
  yearLevel: string;
  sectionId: string;
  subjectId: string;
  qrValue: string;
  faceEmbedding: number[];
  faceSnapshotData?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  reviewedByTeacherId?: string;
  reviewedAt?: string;
  createdAt: string;
  sectionName?: string;
  subjectCode?: string;
  subjectTitle?: string;
}

export interface AttendanceSession {
  id: string;
  sessionToken: string;
  teacherAssignmentId: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
  locationId: string;
  title: string;
  sessionDate: string;
  startTime: string;
  lateThresholdTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  createdAt: string;
  closedAt?: string;
  subjectCode?: string;
  subjectTitle?: string;
  sectionName?: string;
  locationName?: string;
  roomNumber?: string;
  stats?: {
    totalEnrolled: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
  };
}

export interface AttendanceRecord {
  id: string;
  attendanceSessionId: string;
  studentId: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
  attendanceStatus: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';
  verificationMethod: 'AUTOMATED_BIOMETRIC' | 'MANUAL_OVERRIDE';
  timestamp: string;
  qrVerified: boolean;
  faceVerified: boolean;
  locationVerified: boolean;
  distanceFromLocationMeters?: number;
  faceConfidenceScore?: number;
  isOverridden?: boolean;
  overrideReason?: string;
  overriddenByTeacherId?: string;
  overriddenAt?: string;
  studentName?: string;
  schoolId?: string;
  subjectCode?: string;
  subjectTitle?: string;
  sectionName?: string;
  teacherName?: string;
  sessionTitle?: string;
}

export interface VerificationAttempt {
  id: string;
  sessionId: string;
  studentId?: string;
  schoolIdAttempted?: string;
  stepFailed?: 'AUTH' | 'QR_MISMATCH' | 'FACE_MISMATCH' | 'LIVENESS_FAIL' | 'LOCATION_OUT_OF_BOUNDS' | 'DUPLICATE' | 'SESSION_CLOSED';
  details: string;
  timestamp: string;
  ipAddress?: string;
}

export interface AuditLog {
  id: string;
  actorUserId?: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  timestamp: string;
}

export interface SystemSettings {
  institutionName: string;
  logoDataUrl?: string;
  defaultLateThresholdMinutes: number;
  defaultSessionDurationMinutes: number;
  defaultRegLinkDurationHours: number;
  maxLocationDistanceMeters: number;
  faceMatchThreshold: number;
  requireLivenessCheck: boolean;
  allowTeacherOverride: boolean;
  autoCloseExpiredSessions: boolean;
}
