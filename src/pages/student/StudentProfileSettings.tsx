import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Fingerprint, LockKeyhole } from 'lucide-react';
import { FaceBiometricCapture } from '../../components/face/FaceBiometricCapture';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface FaceCapture {
  vector: number[];
  embeddingVersion: string;
  snapshotData?: string;
  vectors: number[][];
  snapshotDataList: string[];
  livenessMetadata: {
    blinkDetected: boolean;
    headPoseVariance: number;
    qualityScore: number;
    challengeResponseValid: boolean;
  };
}

export const StudentProfileSettings: React.FC = () => {
  const { user, profile } = useAuth();
  const isStudentAccount = user?.role === 'STUDENT';
  const [hasEnrolledFace, setHasEnrolledFace] = useState(false);
  const [loadingFaceStatus, setLoadingFaceStatus] = useState(true);
  const [showFaceCapture, setShowFaceCapture] = useState(false);
  const [savingFace, setSavingFace] = useState(false);
  const [faceCaptureKey, setFaceCaptureKey] = useState(0);
  const [faceMessage, setFaceMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!isStudentAccount) {
      setLoadingFaceStatus(false);
      return;
    }

    api.get<{ hasEnrolledFace: boolean }>('/student/dashboard')
      .then(data => setHasEnrolledFace(data.hasEnrolledFace))
      .catch(error => {
        console.error('Failed to load student face enrollment status:', error);
        setFaceMessage({
          text: error instanceof Error ? error.message : 'Unable to load face enrollment status.',
          error: true,
        });
      })
      .finally(() => setLoadingFaceStatus(false));
  }, [isStudentAccount]);

  if (!isStudentAccount) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-xs">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h1 className="text-base font-bold">Student face enrollment only</h1>
            <p className="mt-2 text-sm leading-6">
              Face capture and retake are available only to the student whose attendance is being verified.
              Teachers should review and approve a student's initial enrollment from <strong>Pending Approvals</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleFaceCapture = async (capture: FaceCapture) => {
    setSavingFace(true);
    setFaceMessage(null);
    try {
      await api.put('/student/face-enrollment', {
        faceEmbedding: capture.vector,
        faceEmbeddingVersion: capture.embeddingVersion,
        faceSnapshotData: capture.snapshotData,
        faceEmbeddings: capture.vectors,
        faceSnapshotDataList: capture.snapshotDataList,
        livenessMetadata: capture.livenessMetadata,
      });
      setHasEnrolledFace(true);
      setShowFaceCapture(false);
      setFaceMessage({ text: 'Face enrollment updated successfully.', error: false });
    } catch (error) {
      setFaceMessage({
        text: error instanceof Error ? error.message : 'Unable to update your face enrollment.',
        error: true,
      });
      // The capture component intentionally holds its success frame while the
      // server compares it. Remount it after a rejection so the student can
      // immediately make a fresh attempt instead of being left on that frame.
      setFaceCaptureKey(current => current + 1);
    } finally {
      setSavingFace(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: 'New password and confirmation do not match.', error: true });
      return;
    }

    setSavingPassword(true);
    try {
      const result = await api.put<{ message: string }>('/student/profile/password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({ text: result.message, error: false });
    } catch (error) {
      setPasswordMessage({
        text: error instanceof Error ? error.message : 'Unable to change your password.',
        error: true,
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const studentName = profile?.fullName || user?.username || 'Student';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Profile Settings</h1>
        <p className="mt-1 text-xs text-slate-500">Manage your student account password and face enrollment.</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Student profile</p>
          <h2 className="mt-1 text-lg font-bold">{studentName}</h2>
          <p className="text-xs text-blue-200">{profile?.schoolId || 'Student ID unavailable'}</p>
        </div>
        <dl className="grid gap-4 p-6 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Username</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{user?.username || '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{user?.email || '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Program</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{profile?.courseProgram || '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Year level</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{profile?.yearLevel || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Face Recognition</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                {hasEnrolledFace
                  ? 'Retake your face capture using the camera. The new capture must match your current enrollment.'
                  : 'Register a new face capture using the camera after an instructor has reset your enrollment.'}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-700">
                {loadingFaceStatus ? 'Checking enrollment…' : hasEnrolledFace ? 'Face enrollment on file' : 'No face enrollment on file'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loadingFaceStatus || savingFace || profile?.isApproved !== true}
            onClick={() => {
              setFaceMessage(null);
              setShowFaceCapture(true);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Fingerprint className="h-4 w-4" />
            {hasEnrolledFace ? 'Retake Face Capture' : 'Register New Face'}
          </button>
        </div>
        {!loadingFaceStatus && !hasEnrolledFace && profile?.isApproved !== true && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Your initial face enrollment must be approved by your instructor before you can retake it here.
          </p>
        )}
        {!loadingFaceStatus && !hasEnrolledFace && profile?.isApproved === true && (
          <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            Your previous face enrollment was reset. Capture three new live frames to register a replacement.
          </p>
        )}
        {faceMessage && (
          <div role={faceMessage.error ? 'alert' : 'status'} className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs ${
            faceMessage.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}>
            {faceMessage.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {faceMessage.text}
          </div>
        )}
      </section>

      <form onSubmit={handleChangePassword} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-blue-700" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Change Password</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Use your current password to set a new one (10–128 characters).</p>
          </div>
        </div>
        {passwordMessage && (
          <div role={passwordMessage.error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-xs ${
            passwordMessage.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}>{passwordMessage.text}</div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-700">
            Current password
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" required />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            New password
            <input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" required />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Confirm new password
            <input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" required />
          </label>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button type="submit" disabled={savingPassword} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            <LockKeyhole className="h-4 w-4" /> {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>

      {showFaceCapture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">{hasEnrolledFace ? 'Retake Face Capture' : 'Register New Face'}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {hasEnrolledFace
                    ? 'The new capture is compared with your current saved face before replacing it.'
                    : 'Capture three clear live frames to register your new approved face enrollment.'}
                </p>
              </div>
              <button
                type="button"
                disabled={savingFace}
                onClick={() => setShowFaceCapture(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <FaceBiometricCapture
              key={faceCaptureKey}
              mode="ENROLLMENT"
              isProcessing={savingFace}
              onCapture={handleFaceCapture}
              onCancel={() => setShowFaceCapture(false)}
            />
            {faceMessage?.error && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {faceMessage.text}
              </p>
            )}
            {savingFace && <p className="mt-3 text-center text-xs font-semibold text-blue-700">Checking and saving your face capture...</p>}
          </div>
        </div>
      )}
    </div>
  );
};
