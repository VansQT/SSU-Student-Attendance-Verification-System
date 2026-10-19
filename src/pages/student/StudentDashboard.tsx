import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FACE_EMBEDDING_VERSION } from '../../../shared/faceBiometrics';
import {
  GraduationCap,
  QrCode,
  Printer,
  ShieldCheck,
  Clock,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MapPin,
  Play,
  UserRound,
} from 'lucide-react';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);

interface StudentDashboardProps {
  onNavigate: (tabId: string, params?: any) => void;
  onLaunchSessionVerification?: (token: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onNavigate,
  onLaunchSessionVerification,
}) => {
  const { user } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [qrImage, setQrImage] = useState<string>('');
  const [qrError, setQrError] = useState<string>('');

  useEffect(() => {
    api.get<any>('/student/dashboard')
      .then(res => setData(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const qrValue = data?.qrValue;
  useEffect(() => {
    let cancelled = false;
    setQrImage('');
    setQrError('');
    if (!qrValue) return;

    QRCode.toDataURL(qrValue, { errorCorrectionLevel: 'H', margin: 2, width: 320 })
      .then(image => {
        if (!cancelled) setQrImage(image);
      })
      .catch(error => {
        console.error('Failed to generate student QR code:', error);
        if (!cancelled) setQrError('Unable to generate your QR code. Please refresh and try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [qrValue]);

  const handlePrintQr = () => {
    if (!qrImage || !qrValue) return;

    const printWindow = window.open('', '_blank', 'width=480,height=640');
    if (!printWindow) {
      setQrError('Allow pop-ups for this site to print your QR code.');
      return;
    }

    const name = escapeHtml(data?.student?.fullName || user?.username || 'SSU Student');
    const schoolId = escapeHtml(data?.student?.schoolId || '');
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Student QR Code - ${schoolId}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; text-align: center; margin: 40px auto; }
            h1 { font-size: 20px; margin: 0 0 6px; }
            p { margin: 4px 0; }
            .university { color: #1e3a8a; font-size: 12px; font-weight: bold; letter-spacing: 1px; }
            img { display: block; width: 320px; height: 320px; margin: 24px auto 12px; }
            .school-id { font-family: monospace; font-size: 16px; font-weight: bold; }
            @media print { body { margin: 0; padding-top: 20px; } }
          </style>
        </head>
        <body>
          <p class="university">SAMAR STATE UNIVERSITY</p>
          <h1>${name}</h1>
          <p class="school-id">${schoolId}</p>
          <img id="student-qr" src="${qrImage}" alt="Student identity QR code">
          <p>Student Identity QR Code</p>
        </body>
      </html>`);
    printWindow.document.close();

    const image = printWindow.document.querySelector<HTMLImageElement>('#student-qr');
    const print = () => {
      printWindow.focus();
      printWindow.print();
    };
    if (image?.complete) {
      print();
    } else {
      image?.addEventListener('load', print, { once: true });
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading Student Portal...</div>;
  }

  const {
    student,
    hasEnrolledQr,
    hasEnrolledFace,
    faceEmbeddingVersion,
    faceReferenceSampleCount,
    facePhoto,
    stats,
    activeSessions,
  } = data || {};
  const needsFaceEnrollment = !hasEnrolledFace ||
    faceEmbeddingVersion !== FACE_EMBEDDING_VERSION ||
    faceReferenceSampleCount < 3;
  const studentInitials = (student?.fullName || user?.username || 'S')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0].toUpperCase())
    .join('');

  return (
    <div className="space-y-6">
      {/* SSU Student Virtual ID Card */}
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-blue-700/50">
        {/* Decorative Gold & Blue Crest Background Accents */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 rounded-full bg-amber-400/10 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-48 h-48 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-3">
            <div className="w-fit">
              {facePhoto ? (
                <img
                  src={facePhoto}
                  alt={`${student?.fullName || 'Student'} profile`}
                  className="h-24 w-24 rounded-full border-4 border-amber-300 object-cover shadow-lg sm:h-28 sm:w-28"
                />
              ) : (
                <div
                  role="img"
                  aria-label={`${student?.fullName || 'Student'} profile photo unavailable`}
                  className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-amber-300 bg-blue-700 text-2xl font-extrabold text-white shadow-lg sm:h-28 sm:w-28"
                >
                  {studentInitials}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-extrabold tracking-widest bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full font-sans">
                SAMAR STATE UNIVERSITY
              </span>
              {student?.isApproved ? (
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-400/40 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> OFFICIAL STUDENT
                </span>
              ) : (
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-400/40">
                  PENDING APPROVAL
                </span>
              )}
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {student?.fullName || user?.username}
              </h1>
              <p className="text-xs sm:text-sm text-blue-200 mt-0.5">
                {student?.courseProgram} • {student?.yearLevel}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-blue-100 pt-1">
              <div>
                <span className="text-blue-300 text-[10px] uppercase block font-sans">Student ID</span>
                <span className="font-bold text-sm tracking-wide text-amber-300">{student?.schoolId}</span>
              </div>
              <div className="border-l border-blue-700/60 pl-4">
                <span className="text-blue-300 text-[10px] uppercase block font-sans">Enrolled QR Status</span>
                <span className="text-emerald-300 font-sans font-semibold text-xs flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" />
                  {hasEnrolledQr ? 'Printed ID Linked' : 'Not Linked'}
                </span>
              </div>
              <div className="border-l border-blue-700/60 pl-4">
                <span className="text-blue-300 text-[10px] uppercase block font-sans">Biometric Template</span>
                <span className="text-emerald-300 font-sans font-semibold text-xs flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {needsFaceEnrollment ? 'Face Enrollment Needs Update' : 'Face Template Ready'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick ID Badge preview */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-center flex flex-col items-center justify-center shrink-0 self-start sm:self-auto">
            <div className="w-24 h-24 rounded-xl bg-white text-slate-900 flex items-center justify-center shadow-md mb-2 overflow-hidden">
              {qrImage ? (
                <img src={qrImage} alt="Your enrolled student QR code" className="w-full h-full" />
              ) : (
                <QrCode className="w-12 h-12 text-slate-800" />
              )}
            </div>
            <span className="text-[10px] font-mono text-blue-100 font-bold">{student?.schoolId}</span>
            {hasEnrolledQr && qrValue ? (
              <button
                type="button"
                onClick={handlePrintQr}
                disabled={!qrImage}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-blue-900 transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
              >
                <Printer className="h-3.5 w-3.5" />
                {qrImage ? 'Print My QR' : 'Preparing QR...'}
              </button>
            ) : (
              <span className="text-[9px] text-amber-200">No enrolled QR code</span>
            )}
            {qrError && <span className="mt-1 max-w-40 text-[10px] text-amber-200">{qrError}</span>}
          </div>
        </div>
      </div>

      {needsFaceEnrollment && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-amber-950">Face enrollment needs updating</h2>
            <p className="mt-1 text-xs text-amber-800">
              Attendance requires three current face-recognition samples. Update your enrollment before verifying attendance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('student-profile')}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-amber-800"
          >
            <ShieldCheck className="h-4 w-4" />
            Open Profile Settings
          </button>
        </div>
      )}

      {/* Live Attendance Alert Banner */}
      {activeSessions && activeSessions.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-lg border border-emerald-500">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                <h3 className="text-base font-bold">Attendance Session In Progress!</h3>
              </div>
              <p className="text-xs text-emerald-100">
                {activeSessions[0].title} ({activeSessions[0].subjectCode}) • Instructor: {activeSessions[0].teacherName}
              </p>
              <div className="flex items-center gap-3 text-xs text-emerald-100 pt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {activeSessions[0].locationName}
                </span>
                <span>• Closes at {new Date(activeSessions[0].endTime).toLocaleTimeString()}</span>
              </div>
            </div>

            <div>
              {activeSessions[0].hasAttended ? (
                <div className="bg-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" /> Attendance Recorded
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (onLaunchSessionVerification) {
                      onLaunchSessionVerification(activeSessions[0].sessionToken);
                    } else {
                      onNavigate('student-attendance', { sessionToken: activeSessions[0].sessionToken });
                    }
                  }}
                  className="px-5 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current text-emerald-700" />
                  Verify Attendance Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attendance Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Attendance Rate</span>
            <CalendarCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-blue-900">{stats?.attendanceRate || 0}%</div>
          <p className="text-[11px] text-slate-500 mt-1">Across all registered classes</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Present (On-Time)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">{stats?.presentCount || 0}</div>
          <p className="text-[11px] text-emerald-600 mt-1">Verified on-time sessions</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Late Sessions</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700">{stats?.lateCount || 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">Recorded after cutoff</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Absences</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-rose-700">{stats?.absentCount || 0}</div>
          <p className="text-[11px] text-rose-600 mt-1">Unrecorded closed sessions</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('student-attendance')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Attendance Verification Portal</h3>
              <p className="text-xs text-slate-500">Scan printed ID QR, live face check & GPS verification</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </div>

        <div
          onClick={() => onNavigate('student-history')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">View Attendance History</h3>
              <p className="text-xs text-slate-500">Official university attendance timestamps and records</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </div>

        <div
          onClick={() => onNavigate('student-profile')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
              <UserRound className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Profile Settings</h3>
              <p className="text-xs text-slate-500">Retake face capture or change your password</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </div>
      </div>
    </div>
  );
};
