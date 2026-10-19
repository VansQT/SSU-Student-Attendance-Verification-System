import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentProfile {
  id: string;
  userId: string;
  schoolId: string; // e.g. "SSU-2023-01492"
  fullName: string;
  courseProgram: string; // e.g. "BS Information Technology"
  yearLevel: string; // e.g. "3rd Year"
  contactNumber?: string;
  qrIdentityId?: string;
  faceEnrollmentId?: string;
  isApproved: boolean;
  createdAt: string;
}

export interface TeacherProfile {
  id: string;
  userId: string;
  facultyId: string; // e.g. "FAC-2019-041"
  fullName: string;
  department: string;
  title: string; // e.g. "Engr.", "Prof.", "Dr."
  contactNumber?: string;
  profilePhoto?: string;
  createdAt: string;
}

export interface AcademicYear {
  id: string;
  name: string; // e.g. "2026-2027"
  isCurrent: boolean;
}

export interface Semester {
  id: string;
  name: string; // "1st Semester" | "2nd Semester" | "Summer"
  academicYearId: string;
  isCurrent: boolean;
}

export interface Program {
  id: string;
  code: string; // e.g. "BSIT"
  name: string; // "Bachelor of Science in Information Technology"
  department: string;
}

export interface Section {
  id: string;
  name: string; // e.g. "BSIT 3-A"
  programId: string;
  yearLevel: string; // "3rd Year"
  academicYearId: string;
  createdByTeacherId?: string;
}

export interface Subject {
  id: string;
  code: string; // e.g. "IT-312"
  title: string; // e.g. "Web Systems and Technologies"
  units: number;
}

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  subjectId: string;
  sectionId: string;
  academicYearId: string;
  semesterId: string;
  createdAt: string;
}

export interface SectionEnrollment {
  id: string;
  studentId: string; // points to StudentProfile.id
  sectionId: string;
  subjectId: string;
  status: 'PENDING' | 'APPROVED' | 'DROPPED';
  enrolledAt: string;
}

export interface SectionRosterEntry {
  id: string;
  sectionId: string;
  schoolId: string;
  fullName: string;
  courseProgram: string;
  yearLevel: string;
  importedAt: string;
}

export interface AllowedLocation {
  id: string;
  name: string; // e.g. "SSU Main - IT Computer Lab 3"
  building: string;
  roomNumber: string;
  latitude: number;
  longitude: number;
  radiusMeters: number; // e.g. 50
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
  faceEmbeddingVersion?: string;
  faceSnapshotData?: string; // base64 thumbnail for teacher visual comparison
  faceEmbeddings?: number[][];
  faceSnapshotDataList?: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  reviewedByTeacherId?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface QRIdentity {
  id: string;
  studentId: string;
  schoolId: string;
  qrPayload: string; // decoded physical QR code string
  enrolledAt: string;
}

export interface FaceEnrollment {
  id: string;
  studentId: string;
  vector: number[];
  embeddingVersion?: string;
  qualityScore: number;
  faceSnapshot?: string; // safe compressed thumbnail
  referenceVectors?: number[][];
  referenceSnapshots?: string[];
  enrolledAt: string;
  version: number;
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
  lateThresholdTime: string; // cutoff after which status is LATE
  endTime: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  createdAt: string;
  closedAt?: string;
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

// In-Memory Database with JSON Persistence
class DatabaseStore {
  // A deployment must set DATA_DIR to its persistent disk mount.  The
  // fallback remains convenient for local development and Vercel previews.
  private dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : process.env.VERCEL
      ? path.join(os.tmpdir(), 'ssu-attendance-data')
      : path.resolve(process.cwd(), 'data');
  private dataFile = path.resolve(this.dataDir, 'ssu_attendance.json');
  private readonly isProduction = process.env.NODE_ENV === 'production';

  public users: User[] = [];
  public studentProfiles: StudentProfile[] = [];
  public teacherProfiles: TeacherProfile[] = [];
  public academicYears: AcademicYear[] = [];
  public semesters: Semester[] = [];
  public programs: Program[] = [];
  public sections: Section[] = [];
  public subjects: Subject[] = [];
  public teacherAssignments: TeacherAssignment[] = [];
  public sectionEnrollments: SectionEnrollment[] = [];
  public sectionRoster: SectionRosterEntry[] = [];
  public allowedLocations: AllowedLocation[] = [];
  public registrationLinks: RegistrationLink[] = [];
  public registrationRequests: RegistrationRequest[] = [];
  public qrIdentities: QRIdentity[] = [];
  public faceEnrollments: FaceEnrollment[] = [];
  public attendanceSessions: AttendanceSession[] = [];
  public attendanceRecords: AttendanceRecord[] = [];
  public verificationAttempts: VerificationAttempt[] = [];
  public auditLogs: AuditLog[] = [];
  public settings: SystemSettings = {
    institutionName: 'Samar State University (SSU)',
    defaultLateThresholdMinutes: 15,
    defaultSessionDurationMinutes: 60,
    defaultRegLinkDurationHours: 48,
    maxLocationDistanceMeters: 100,
    faceMatchThreshold: 0.95,
    requireLivenessCheck: true,
    allowTeacherOverride: true,
    autoCloseExpiredSessions: true,
  };

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    if (fs.existsSync(this.dataFile)) {
      try {
        const raw = fs.readFileSync(this.dataFile, 'utf-8');
        const parsed = JSON.parse(raw);
        Object.assign(this, parsed);
        if (!Number.isFinite(this.settings.faceMatchThreshold) || this.settings.faceMatchThreshold < 0.9) {
          this.settings.faceMatchThreshold = 0.95;
          this.save();
        }
        return;
      } catch (err) {
        console.error('Failed to parse database file, re-seeding default data:', err);
      }
    }

    if (this.isProduction) {
      this.seedProductionAdmin();
    } else {
      this.seedDefaultData();
    }
    this.save();
  }

  public save() {
    try {
      const dump = {
        users: this.users,
        studentProfiles: this.studentProfiles,
        teacherProfiles: this.teacherProfiles,
        academicYears: this.academicYears,
        semesters: this.semesters,
        programs: this.programs,
        sections: this.sections,
        subjects: this.subjects,
        teacherAssignments: this.teacherAssignments,
        sectionEnrollments: this.sectionEnrollments,
        sectionRoster: this.sectionRoster,
        allowedLocations: this.allowedLocations,
        registrationLinks: this.registrationLinks,
        registrationRequests: this.registrationRequests,
        qrIdentities: this.qrIdentities,
        faceEnrollments: this.faceEnrollments,
        attendanceSessions: this.attendanceSessions,
        attendanceRecords: this.attendanceRecords,
        verificationAttempts: this.verificationAttempts,
        auditLogs: this.auditLogs,
        settings: this.settings,
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(dump, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving database to file:', err);
    }
  }

  public hashPassword(plain: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const digest = crypto.scryptSync(plain, salt, 64).toString('hex');
    return `scrypt$${salt}$${digest}`;
  }

  /** Verifies both current scrypt hashes and local data created by older builds. */
  public verifyPassword(plain: string, storedHash: string): boolean {
    const [algorithm, salt, digest] = storedHash.split('$');
    if (algorithm === 'scrypt' && salt && digest) {
      const candidate = crypto.scryptSync(plain, salt, 64).toString('hex');
      const expected = Buffer.from(digest, 'hex');
      const actual = Buffer.from(candidate, 'hex');
      return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    }

    // Preserve local accounts from earlier development builds. A successful
    // login upgrades the account to scrypt in the authentication route.
    const legacy = crypto.createHash('sha256').update(plain + 'ssu_salt_secure_2026').digest('hex');
    const expected = Buffer.from(storedHash, 'utf8');
    const actual = Buffer.from(legacy, 'utf8');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  public passwordNeedsUpgrade(storedHash: string): boolean {
    return !storedHash.startsWith('scrypt$');
  }

  /**
   * A public deployment intentionally starts empty except for the supplied
   * administrator. Demo accounts and biometric data must never be seeded on
   * an Internet-facing system.
   */
  private seedProductionAdmin() {
    const username = process.env.INITIAL_ADMIN_USERNAME?.trim();
    const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!username || !email || !password) {
      throw new Error('Production requires INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD.');
    }
    if (username.length < 3 || password.length < 12) {
      throw new Error('The initial administrator username must be at least 3 characters and the password at least 12 characters.');
    }

    const now = new Date().toISOString();
    this.users = [{
      id: 'usr_admin_' + crypto.randomUUID().slice(0, 8),
      username,
      email,
      passwordHash: this.hashPassword(password),
      role: 'ADMIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }];
  }

  public seedDefaultData() {
    const now = new Date().toISOString();
    const defaultPasswordHash = this.hashPassword('Password123!');

    // 1. Users
    const adminUser: User = {
      id: 'usr_admin_01',
      username: 'admin',
      email: 'admin@ssu.edu.ph',
      passwordHash: defaultPasswordHash,
      role: 'ADMIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const teacherUser1: User = {
      id: 'usr_teacher_01',
      username: 'jdelacruz',
      email: 'jdelacruz@ssu.edu.ph',
      passwordHash: defaultPasswordHash,
      role: 'TEACHER',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const teacherUser2: User = {
      id: 'usr_teacher_02',
      username: 'msantos',
      email: 'msantos@ssu.edu.ph',
      passwordHash: defaultPasswordHash,
      role: 'TEACHER',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const studentUser1: User = {
      id: 'usr_student_01',
      username: '2301492',
      email: 'juan.luna@ssu.edu.ph',
      passwordHash: defaultPasswordHash,
      role: 'STUDENT',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const studentUser2: User = {
      id: 'usr_student_02',
      username: '2301844',
      email: 'maria.clara@ssu.edu.ph',
      passwordHash: defaultPasswordHash,
      role: 'STUDENT',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const studentUser3: User = {
      id: 'usr_student_03',
      username: '2302011',
      email: 'crisostomo.ibarra@ssu.edu.ph',
      passwordHash: defaultPasswordHash,
      role: 'STUDENT',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.users = [adminUser, teacherUser1, teacherUser2, studentUser1, studentUser2, studentUser3];

    // 2. Teacher Profiles
    const tProfile1: TeacherProfile = {
      id: 'tp_01',
      userId: teacherUser1.id,
      facultyId: 'FAC-2018-092',
      fullName: 'Engr. Juan Dela Cruz, M.Sc.',
      department: 'College of Industrial Technology & Computing',
      title: 'Associate Professor',
      createdAt: now,
    };

    const tProfile2: TeacherProfile = {
      id: 'tp_02',
      userId: teacherUser2.id,
      facultyId: 'FAC-2021-034',
      fullName: 'Prof. Maria Santos, Ph.D.',
      department: 'College of Science & Information Technology',
      title: 'Assistant Professor',
      createdAt: now,
    };

    this.teacherProfiles = [tProfile1, tProfile2];

    // 3. Student Profiles
    const sProfile1: StudentProfile = {
      id: 'sp_01',
      userId: studentUser1.id,
      schoolId: 'SSU-2023-01492',
      fullName: 'Juan Luna',
      courseProgram: 'BS Information Technology',
      yearLevel: '3rd Year',
      contactNumber: '09171234567',
      isApproved: true,
      createdAt: now,
    };

    const sProfile2: StudentProfile = {
      id: 'sp_02',
      userId: studentUser2.id,
      schoolId: 'SSU-2023-01844',
      fullName: 'Maria Clara De Los Santos',
      courseProgram: 'BS Information Technology',
      yearLevel: '3rd Year',
      contactNumber: '09187654321',
      isApproved: true,
      createdAt: now,
    };

    const sProfile3: StudentProfile = {
      id: 'sp_03',
      userId: studentUser3.id,
      schoolId: 'SSU-2023-02011',
      fullName: 'Crisostomo Ibarra',
      courseProgram: 'BS Computer Science',
      yearLevel: '2nd Year',
      contactNumber: '09205556677',
      isApproved: false, // Pending student for testing approval flow
      createdAt: now,
    };

    this.studentProfiles = [sProfile1, sProfile2, sProfile3];

    // 4. Academic Structure
    const ay1: AcademicYear = { id: 'ay_01', name: '2026-2027', isCurrent: true };
    this.academicYears = [ay1];

    const sem1: Semester = { id: 'sem_01', name: '1st Semester', academicYearId: ay1.id, isCurrent: true };
    const sem2: Semester = { id: 'sem_02', name: '2nd Semester', academicYearId: ay1.id, isCurrent: false };
    this.semesters = [sem1, sem2];

    const prog1: Program = { id: 'prog_01', code: 'BSIT', name: 'BS Information Technology', department: 'CITC' };
    const prog2: Program = { id: 'prog_02', code: 'BSCS', name: 'BS Computer Science', department: 'CITC' };
    const prog3: Program = { id: 'prog_03', code: 'BSCPE', name: 'BS Computer Engineering', department: 'COE' };
    this.programs = [prog1, prog2, prog3];

    const sec1: Section = { id: 'sec_01', name: 'BSIT 3-A', programId: prog1.id, yearLevel: '3rd Year', academicYearId: ay1.id };
    const sec2: Section = { id: 'sec_02', name: 'BSIT 3-B', programId: prog1.id, yearLevel: '3rd Year', academicYearId: ay1.id };
    const sec3: Section = { id: 'sec_03', name: 'BSCS 2-A', programId: prog2.id, yearLevel: '2nd Year', academicYearId: ay1.id };
    this.sections = [sec1, sec2, sec3];

    const sub1: Subject = { id: 'sub_01', code: 'IT-312', title: 'Web Systems and Technologies', units: 3 };
    const sub2: Subject = { id: 'sub_02', code: 'IT-314', title: 'Information Assurance and Security', units: 3 };
    const sub3: Subject = { id: 'sub_03', code: 'CS-205', title: 'Data Structures and Algorithms', units: 3 };
    this.subjects = [sub1, sub2, sub3];

    // 5. Teacher Assignments
    const ta1: TeacherAssignment = {
      id: 'ta_01',
      teacherId: tProfile1.id,
      subjectId: sub1.id,
      sectionId: sec1.id,
      academicYearId: ay1.id,
      semesterId: sem1.id,
      createdAt: now,
    };
    const ta2: TeacherAssignment = {
      id: 'ta_02',
      teacherId: tProfile1.id,
      subjectId: sub2.id,
      sectionId: sec2.id,
      academicYearId: ay1.id,
      semesterId: sem1.id,
      createdAt: now,
    };
    const ta3: TeacherAssignment = {
      id: 'ta_03',
      teacherId: tProfile2.id,
      subjectId: sub3.id,
      sectionId: sec3.id,
      academicYearId: ay1.id,
      semesterId: sem1.id,
      createdAt: now,
    };
    this.teacherAssignments = [ta1, ta2, ta3];

    // 6. Section Enrollments
    this.sectionEnrollments = [
      {
        id: 'se_01',
        studentId: sProfile1.id,
        sectionId: sec1.id,
        subjectId: sub1.id,
        status: 'APPROVED',
        enrolledAt: now,
      },
      {
        id: 'se_02',
        studentId: sProfile2.id,
        sectionId: sec1.id,
        subjectId: sub1.id,
        status: 'APPROVED',
        enrolledAt: now,
      },
      {
        id: 'se_03',
        studentId: sProfile3.id,
        sectionId: sec3.id,
        subjectId: sub3.id,
        status: 'PENDING',
        enrolledAt: now,
      },
    ];

    // 7. Allowed Locations (Samar State University Main Campus, Catbalogan City, Samar)
    // SSU Coordinates: ~11.7766° N, 124.8814° E
    this.allowedLocations = [
      {
        id: 'loc_01',
        name: 'SSU IT Lab 3 (College of Computing)',
        building: 'CITC New Building, 3rd Floor',
        roomNumber: 'Room 304',
        latitude: 11.77662,
        longitude: 124.88142,
        radiusMeters: 80,
        description: 'Computer Laboratory 3 with Air Conditioning & Dedicated Fiber Link',
        isActive: true,
      },
      {
        id: 'loc_02',
        name: 'SSU Engineering Rm 201',
        building: 'College of Engineering Main Hall',
        roomNumber: 'Room 201',
        latitude: 11.77685,
        longitude: 124.88195,
        radiusMeters: 60,
        description: 'Lecture Hall 201',
        isActive: true,
      },
      {
        id: 'loc_03',
        name: 'SSU University Auditorium / Gymnasium',
        building: 'SSU Activity Center',
        roomNumber: 'Main Stage',
        latitude: 11.77610,
        longitude: 124.88090,
        radiusMeters: 150,
        description: 'Large university hall for convocations and general lectures',
        isActive: true,
      },
    ];

    // 8. QR Identities (Printed School ID QR code values)
    // Standard SSU ID QR format: "SSU-ID:SSU-2023-01492:LUNA"
    this.qrIdentities = [
      {
        id: 'qr_01',
        studentId: sProfile1.id,
        schoolId: sProfile1.schoolId,
        qrPayload: `SSU-ID:${sProfile1.schoolId}:LUNA`,
        enrolledAt: now,
      },
      {
        id: 'qr_02',
        studentId: sProfile2.id,
        schoolId: sProfile2.schoolId,
        qrPayload: `SSU-ID:${sProfile2.schoolId}:DELOSSANTOS`,
        enrolledAt: now,
      },
      {
        id: 'qr_03',
        studentId: sProfile3.id,
        schoolId: sProfile3.schoolId,
        qrPayload: `SSU-ID:${sProfile3.schoolId}:IBARRA`,
        enrolledAt: now,
      },
    ];

    // 9. Face Enrollments (legacy synthetic templates; must be replaced by student enrollment)
    // We create realistic unit-normalized feature vectors for sample students
    const generateSyntheticVector = (seed: number) => {
      const vec: number[] = [];
      let sumSq = 0;
      for (let i = 0; i < 128; i++) {
        const val = Math.sin(seed * (i + 1)) * Math.cos((seed + 3) * (i + 2));
        vec.push(val);
        sumSq += val * val;
      }
      const norm = Math.sqrt(sumSq) || 1;
      return vec.map(v => v / norm);
    };

    this.faceEnrollments = [
      {
        id: 'fe_01',
        studentId: sProfile1.id,
        vector: generateSyntheticVector(42),
        qualityScore: 0.94,
        enrolledAt: now,
        version: 1,
      },
      {
        id: 'fe_02',
        studentId: sProfile2.id,
        vector: generateSyntheticVector(89),
        qualityScore: 0.96,
        enrolledAt: now,
        version: 1,
      },
      {
        id: 'fe_03',
        studentId: sProfile3.id,
        vector: generateSyntheticVector(133),
        qualityScore: 0.91,
        enrolledAt: now,
        version: 1,
      },
    ];

    // 10. Sample Registration Link created by Teacher 1
    const regLink1: RegistrationLink = {
      id: 'reg_link_01',
      token: 'ssu-reg-citc-it312-3a-2026',
      teacherAssignmentId: ta1.id,
      teacherId: tProfile1.id,
      subjectId: sub1.id,
      sectionId: sec1.id,
      createdAt: now,
      expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      status: 'ACTIVE',
    };
    this.registrationLinks = [regLink1];

    // 11. Sample Pending Registration Request for Teacher review
    this.registrationRequests = [
      {
        id: 'rr_01',
        registrationLinkId: regLink1.id,
        schoolId: 'SSU-2023-02011',
        fullName: 'Crisostomo Ibarra',
        email: 'crisostomo.ibarra@ssu.edu.ph',
        courseProgram: 'BS Computer Science',
        yearLevel: '2nd Year',
        sectionId: sec1.id,
        subjectId: sub1.id,
        qrValue: 'SSU-ID:SSU-2023-02011:IBARRA',
        faceEmbedding: generateSyntheticVector(133),
        status: 'PENDING',
        createdAt: now,
      },
    ];

    // 12. Sample Active Attendance Session
    const session1: AttendanceSession = {
      id: 'sess_01',
      sessionToken: 'ssu-att-live-lab3-session-982',
      teacherAssignmentId: ta1.id,
      teacherId: tProfile1.id,
      subjectId: sub1.id,
      sectionId: sec1.id,
      locationId: this.allowedLocations[0].id,
      title: 'IT-312: Laboratory Session 5 - Secure REST Verification',
      sessionDate: new Date().toISOString().split('T')[0],
      startTime: new Date(Date.now() - 1000 * 60 * 10).toISOString(), // 10 mins ago
      lateThresholdTime: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 mins from now
      endTime: new Date(Date.now() + 1000 * 60 * 50).toISOString(), // 50 mins from now
      status: 'ACTIVE',
      createdAt: now,
    };

    // Sample Past Closed Session
    const session2: AttendanceSession = {
      id: 'sess_02',
      sessionToken: 'ssu-att-closed-prev-week',
      teacherAssignmentId: ta1.id,
      teacherId: tProfile1.id,
      subjectId: sub1.id,
      sectionId: sec1.id,
      locationId: this.allowedLocations[0].id,
      title: 'IT-312: Lecture 4 - Frontend Biometric Integration',
      sessionDate: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
      startTime: new Date(Date.now() - 86400000 * 2).toISOString(),
      lateThresholdTime: new Date(Date.now() - 86400000 * 2 + 1000 * 60 * 15).toISOString(),
      endTime: new Date(Date.now() - 86400000 * 2 + 1000 * 60 * 60).toISOString(),
      status: 'CLOSED',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      closedAt: new Date(Date.now() - 86400000 * 2 + 1000 * 60 * 60).toISOString(),
    };

    this.attendanceSessions = [session1, session2];

    // 13. Sample Attendance Records
    this.attendanceRecords = [
      {
        id: 'rec_01',
        attendanceSessionId: session2.id,
        studentId: sProfile1.id,
        teacherId: tProfile1.id,
        subjectId: sub1.id,
        sectionId: sec1.id,
        attendanceStatus: 'PRESENT',
        verificationMethod: 'AUTOMATED_BIOMETRIC',
        timestamp: new Date(Date.now() - 86400000 * 2 + 1000 * 60 * 5).toISOString(),
        qrVerified: true,
        faceVerified: true,
        locationVerified: true,
        distanceFromLocationMeters: 14.2,
        faceConfidenceScore: 0.92,
      },
      {
        id: 'rec_02',
        attendanceSessionId: session2.id,
        studentId: sProfile2.id,
        teacherId: tProfile1.id,
        subjectId: sub1.id,
        sectionId: sec1.id,
        attendanceStatus: 'LATE',
        verificationMethod: 'AUTOMATED_BIOMETRIC',
        timestamp: new Date(Date.now() - 86400000 * 2 + 1000 * 60 * 25).toISOString(),
        qrVerified: true,
        faceVerified: true,
        locationVerified: true,
        distanceFromLocationMeters: 22.8,
        faceConfidenceScore: 0.88,
      },
    ];

    // 14. Audit Logs
    this.auditLogs = [
      {
        id: 'log_01',
        actorUserId: adminUser.id,
        actorRole: 'ADMIN',
        action: 'SYSTEM_INITIALIZATION',
        targetType: 'SYSTEM',
        details: { message: 'SSU Attendance Verification System Database Initialized' },
        timestamp: now,
      },
      {
        id: 'log_02',
        actorUserId: teacherUser1.id,
        actorRole: 'TEACHER',
        action: 'ATTENDANCE_SESSION_STARTED',
        targetType: 'ATTENDANCE_SESSION',
        targetId: session1.id,
        details: { title: session1.title, section: 'BSIT 3-A', subject: 'IT-312' },
        timestamp: now,
      },
    ];
  }
}

export const db = new DatabaseStore();
