import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { FaceBiometricCapture } from '../../components/face/FaceBiometricCapture';
import { FACE_EMBEDDING_VERSION } from '../../../shared/faceBiometrics';
import QRCode from 'qrcode';
import {
  GraduationCap,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

interface StudentRegistrationPageProps {
  token: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const StudentRegistrationPage: React.FC<StudentRegistrationPageProps> = ({
  token,
  onSuccess,
  onCancel,
}) => {
  const [loadingLink, setLoadingLink] = useState<boolean>(true);
  const [linkData, setLinkData] = useState<any | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);
  const [branding, setBranding] = useState<{ institutionName: string; logoDataUrl: string | null }>({
    institutionName: 'Samar State University',
    logoDataUrl: null,
  });

  // Form State
  const [step, setStep] = useState<number>(1);
  const [schoolId, setSchoolId] = useState<string>('');
  const [schoolIdCheck, setSchoolIdCheck] = useState<{ status: 'checking' | 'verified' | 'failed'; message: string } | null>(null);
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('Password123!');
  const [courseProgram, setCourseProgram] = useState<string>('BS Information Technology');
  const [yearLevel, setYearLevel] = useState<string>('3rd Year');
  const [studentQrValue, setStudentQrValue] = useState<string>('');
  const [studentQrImage, setStudentQrImage] = useState<string | null>(null);
  const [studentQrError, setStudentQrError] = useState<string | null>(null);

  // Biometrics
  const [faceData, setFaceData] = useState<{
    vector: number[];
    embeddingVersion: string;
    livenessPassed: boolean;
    snapshotData?: string;
    vectors: number[][];
    snapshotDataList: string[];
  } | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(false);

  useEffect(() => {
    const loadBranding = () => {
      api.get<{ institutionName: string; logoDataUrl: string | null }>('/public/branding')
        .then(setBranding)
        .catch(error => console.error('Failed to load system branding:', error));
    };
    loadBranding();
    window.addEventListener('system-branding-updated', loadBranding);
    return () => window.removeEventListener('system-branding-updated', loadBranding);
  }, []);

  useEffect(() => {
    async function validateToken() {
      setLoadingLink(true);
      setLinkError(null);
      setLinkExpired(false);
      try {
        const data = await api.get<any>(`/public/registration-link/${token}`);
        setLinkData(data);
        if (data.programName) setCourseProgram(data.programName);
        if (data.yearLevel) setYearLevel(data.yearLevel);
      } catch (err: any) {
        if (err.status === 410) {
          setLinkExpired(true);
          setLinkError('This registration link has expired or was closed by the instructor.');
          return;
        }
        setLinkError(err.message || 'This registration link is invalid or has expired.');
      } finally {
        setLoadingLink(false);
      }
    }
    if (token) validateToken();
  }, [token]);

  const handleFaceCapture = (result: {
    vector: number[];
    embeddingVersion: string;
    livenessPassed: boolean;
    snapshotData?: string;
    vectors: number[][];
    snapshotDataList: string[];
  }) => {
    setFaceData(result);
    setStep(4); // Proceed to Review & Submit
  };

  const verifyStudentId = async () => {
    const cleanSchoolId = schoolId.trim().toUpperCase();
    if (!cleanSchoolId) return false;
    if (schoolIdCheck?.status === 'verified' &&
        studentQrImage &&
        studentQrValue === `SSU-ID:${cleanSchoolId}`) {
      return true;
    }

    setSchoolIdCheck({ status: 'checking', message: 'Verifying ID and preparing QR code...' });
    setStudentQrImage(null);
    setStudentQrError(null);
    try {
      const result = await api.get<{
        eligible: boolean;
        student: { schoolId: string; fullName: string; courseProgram: string; yearLevel: string };
      }>(`/public/registration-link/${encodeURIComponent(token)}/verify-student/${encodeURIComponent(cleanSchoolId)}`);
      const qrValue = `SSU-ID:${result.student.schoolId}`;
      const qrImage = await QRCode.toDataURL(qrValue, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 160,
      });
      setSchoolId(result.student.schoolId);
      setFullName(result.student.fullName);
      setCourseProgram(result.student.courseProgram);
      setYearLevel(result.student.yearLevel);
      setStudentQrValue(qrValue);
      setStudentQrImage(qrImage);
      setStudentQrError(null);
      setSchoolIdCheck({ status: 'verified', message: 'Student ID found on this class roster.' });
      return true;
    } catch (err: any) {
      if (err.status === 410) {
        setLinkExpired(true);
        setLinkError('This registration link has expired or was closed by the instructor.');
        return false;
      }
      console.error('Unable to verify student ID or prepare its QR code:', err);
      const message = err.message || 'Unable to verify this Student ID.';
      setStudentQrError(message);
      setSchoolIdCheck({ status: 'failed', message });
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentQrImage || !faceData) {
      setSubmitError('Please generate your student ID QR code and complete face biometric enrollment.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await api.post('/public/register-student', {
        token,
        schoolId: schoolId.trim().toUpperCase(),
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        courseProgram,
        yearLevel,
        qrValue: studentQrValue,
        faceEmbedding: faceData.vector,
        faceEmbeddingVersion: FACE_EMBEDDING_VERSION,
        faceSnapshotData: faceData.snapshotData,
        faceEmbeddings: faceData.vectors,
        faceSnapshotDataList: faceData.snapshotDataList,
      });

      setSubmittedSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      if (err.status === 410) {
        setLinkExpired(true);
        setLinkError('This registration link has expired or was closed by the instructor.');
        return;
      }
      setSubmitError(err.message || 'Registration submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingLink) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-700">Verifying Samar State University Registration Link...</p>
        </div>
      </div>
    );
  }

  if (linkExpired || linkError || !linkData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">
            {linkExpired ? 'Link Expired' : 'Registration Link Unavailable'}
          </h2>
          <p className="text-xs text-slate-500">
            {linkExpired ? 'This registration link has expired or was closed by the instructor.' : linkError}
          </p>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* University Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm text-center space-y-2">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-blue-900 text-amber-300 font-extrabold flex items-center justify-center mx-auto shadow-md ring-2 ring-amber-400">
            {branding.logoDataUrl ? (
              <img src={branding.logoDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <GraduationCap className="w-10 h-10" />
            )}
          </div>
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              {branding.institutionName}
            </span>
            <h1 className="text-lg font-extrabold text-slate-900 mt-1">Student Attendance Registration</h1>
            <p className="text-xs text-slate-500">
              Instructor: <strong className="text-slate-800">{linkData.teacherName}</strong> • {linkData.subjectCode} ({linkData.sectionName})
            </p>
          </div>

          {/* Stepper indicator */}
          {!submittedSuccess && (
            <div className="pt-3 grid grid-cols-4 gap-2 text-[10px] font-bold">
              <div className={`py-1 rounded-md transition ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                1. Info
              </div>
              <div className={`py-1 rounded-md transition ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                2. ID QR
              </div>
              <div className={`py-1 rounded-md transition ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                3. Biometrics
              </div>
              <div className={`py-1 rounded-md transition ${step >= 4 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                4. Submit
              </div>
            </div>
          )}
        </div>

        {/* STEP 1: Personal Info Form */}
        {step === 1 && !submittedSuccess && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (!await verifyStudentId()) return;
              setStep(2);
            }}
            className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4 text-xs"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 1: Student Information</h2>
              <p className="text-slate-500 text-[11px]">Enter your official university student credentials.</p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">SSU School ID Number *</label>
              <input
                type="text"
                value={schoolId}
                onChange={e => {
                  setSchoolId(e.target.value);
                  setSchoolIdCheck(null);
                  setStudentQrValue('');
                  setStudentQrImage(null);
                  setStudentQrError(null);
                }}
                onBlur={() => {
                  if (schoolId.trim()) void verifyStudentId();
                }}
                placeholder="e.g. SSU-2023-01492"
                className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-xs outline-hidden focus:ring-2 focus:ring-blue-600"
                required
              />
              {schoolIdCheck ? (
                <span className={`mt-1 flex items-center gap-1 text-[10px] ${
                  schoolIdCheck.status === 'verified' ? 'text-emerald-700' :
                    schoolIdCheck.status === 'failed' ? 'text-rose-700' : 'text-blue-700'
                }`}>
                  {schoolIdCheck.status === 'verified' && <CheckCircle2 className="h-3 w-3" />}
                  {schoolIdCheck.message}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">Must match an ID on the instructor’s imported class roster.</span>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Full Legal Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Juan De La Cruz"
                className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Degree Program</label>
                <input
                  type="text"
                  value={courseProgram}
                  onChange={e => setCourseProgram(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Year Level</label>
                <input
                  type="text"
                  value={yearLevel}
                  onChange={e => setYearLevel(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700 block">Assigned Section:</span>
              <span className="text-blue-800 font-semibold">{linkData.sectionName} ({linkData.subjectCode}: {linkData.subjectTitle})</span>
              <p className="text-[10px] text-slate-400 mt-0.5">Section resolved securely from instructor link.</p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. student@ssu.edu.ph"
                className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Account Password *</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={schoolIdCheck?.status === 'checking'}
                className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
              >
                Continue to Student ID QR
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Generate Student ID QR */}
        {step === 2 && !submittedSuccess && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5 text-center">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Step 2: Your Student ID QR Code</h2>
              <p className="mt-1 text-xs text-slate-500">
                This QR code is generated from your verified school ID. No printed ID card is needed to register.
              </p>
            </div>
            <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
              {studentQrImage ? (
                <img src={studentQrImage} alt={`Generated QR code for student ID ${schoolId}`} className="h-full w-full" />
              ) : studentQrError ? (
                <p role="alert" className="px-4 text-xs text-rose-700">{studentQrError}</p>
              ) : (
                <div className="text-xs text-slate-500">
                  <QrCode className="mx-auto mb-2 h-8 w-8 animate-pulse text-blue-600" />
                  Generating your ID QR code...
                </div>
              )}
            </div>
            <p className="font-mono text-sm font-bold text-blue-800">{schoolId.trim().toUpperCase()}</p>
            {studentQrError && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900"
              >
                Go back and retry
              </button>
            )}
            <div className="flex justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 px-4 py-2 font-semibold text-slate-600 hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                type="button"
                disabled={!studentQrImage}
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
              >
                Continue to Face Enrollment <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Face Biometric Enrollment */}
        {step === 3 && !submittedSuccess && (
          <div className="space-y-4">
            <FaceBiometricCapture
              mode="ENROLLMENT"
              onCapture={handleFaceCapture}
              onCancel={() => setStep(2)}
            />
          </div>
        )}

        {/* STEP 4: Review and Submit */}
        {step === 4 && !submittedSuccess && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6 text-xs">
            <div>
              <h2 className="text-base font-bold text-slate-900">Step 4: Review Registration Information</h2>
              <p className="text-slate-500">Confirm your data before submitting for instructor review.</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Full Name:</span>
                <span className="font-bold text-slate-900">{fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">School ID:</span>
                <span className="font-mono font-bold text-blue-700">{schoolId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Program & Year:</span>
                <span className="font-semibold text-slate-800">{courseProgram} ({yearLevel})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Section:</span>
                <span className="font-semibold text-slate-800">{linkData.sectionName}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-700" />
                  <span className="font-bold text-emerald-950">Student ID QR Code Generated</span>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span className="font-bold text-emerald-950">Face recognition template created</span>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-800 flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-md transition flex items-center gap-2"
              >
                {submitting ? 'Submitting Registration...' : 'Submit Registration for Approval'}
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* SUCCESS CONFIRMATION */}
        {submittedSuccess && (
          <div className="bg-white rounded-3xl p-8 border-2 border-emerald-500 shadow-2xl text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                REGISTRATION SUBMITTED
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-2">
                Registration Awaiting Teacher Review
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Your account details, student ID QR code, and facial biometric reference have been received. Your instructor{' '}
                <strong className="text-slate-700">{linkData.teacherName}</strong> will review and approve your enrollment.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 max-w-sm mx-auto text-left text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Student Name:</span>
                <span className="font-bold text-slate-900">{fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">School ID:</span>
                <span className="font-mono font-bold text-blue-700">{schoolId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Section:</span>
                <span className="font-semibold text-slate-800">{linkData.sectionName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-amber-600">PENDING APPROVAL</span>
              </div>
            </div>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
