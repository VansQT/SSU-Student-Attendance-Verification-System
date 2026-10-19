import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { QRScanner } from '../../components/qr/QRScanner';
import { FaceBiometricCapture } from '../../components/face/FaceBiometricCapture';
import { LocationChecker } from '../../components/location/LocationChecker';
import {
  QrCode,
  UserCheck,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  GraduationCap,
} from 'lucide-react';

interface StudentAttendanceVerificationProps {
  initialSessionToken?: string;
  onDone?: () => void;
  onSessionExpired?: () => void;
}

export const StudentAttendanceVerification: React.FC<StudentAttendanceVerificationProps> = ({
  initialSessionToken = '',
  onDone,
  onSessionExpired,
}) => {
  const { user, profile } = useAuth();

  const [sessionTokenInput, setSessionTokenInput] = useState<string>(initialSessionToken);
  const [sessionData, setSessionData] = useState<any | null>(null);
  const [loadingSession, setLoadingSession] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Verification Multi-Step State
  // 1: SESSION_CHECK, 2: SCAN_QR, 3: VERIFY_FACE, 4: VALIDATE_LOCATION, 5: CONFIRM_SUBMIT
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Collected Evidence
  const [scannedQrValue, setScannedQrValue] = useState<string | null>(null);
  const [capturedFaceData, setCapturedFaceData] = useState<{
    vector: number[];
    embeddingVersion: string;
    livenessPassed: boolean;
    snapshotData?: string;
    vectors: number[][];
    snapshotDataList: string[];
    livenessMetadata: any;
  } | null>(null);
  const [faceVerificationToken, setFaceVerificationToken] = useState<string | null>(null);
  const [faceVerificationStatus, setFaceVerificationStatus] = useState<'IDLE' | 'VERIFYING' | 'VERIFIED' | 'ERROR'>('IDLE');
  const [faceVerificationMessage, setFaceVerificationMessage] = useState<string | null>(null);
  const [faceCaptureKey, setFaceCaptureKey] = useState(0);
  const [validatedLocation, setValidatedLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    distanceMeters: number;
  } | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [attendanceReceipt, setAttendanceReceipt] = useState<any | null>(null);

  // If initial token passed, load session info immediately
  useEffect(() => {
    if (initialSessionToken) {
      loadSession(initialSessionToken);
    }
  }, [initialSessionToken]);

  const loadSession = async (token: string) => {
    if (!token.trim()) return;
    setLoadingSession(true);
    setSessionError(null);
    try {
      const data = await api.get<any>(`/attendance/session-info/${token.trim()}`);
      setSessionData(data);
      if (data.isExpired) onSessionExpired?.();
      setCurrentStep(2); // Move to QR scanning
    } catch (err: any) {
      if (err.status === 410) {
        setSessionData({ isExpired: true });
        onSessionExpired?.();
        return;
      }
      setSessionError(err.message || 'Attendance session not found or inactive.');
      setSessionData(null);
    } finally {
      setLoadingSession(false);
    }
  };

  // Step 2 Handler: QR Scanned
  const handleQrScanned = (decodedQr: string) => {
    setScannedQrValue(decodedQr);
    setCapturedFaceData(null);
    setFaceVerificationToken(null);
    setFaceVerificationStatus('IDLE');
    setFaceVerificationMessage(null);
    setCurrentStep(3); // Proceed to Face Verification
  };

  // Step 3: require a server-side face match before geofencing can begin.
  const handleFaceCaptured = async (faceResult: {
    vector: number[];
    embeddingVersion: string;
    livenessPassed: boolean;
    snapshotData?: string;
    vectors: number[][];
    snapshotDataList: string[];
    livenessMetadata: any;
  }) => {
    if (!sessionData || !scannedQrValue) return;
    setFaceVerificationStatus('VERIFYING');
    setFaceVerificationMessage(null);
    try {
      const result = await api.post<{
        verified: boolean;
        faceVerificationToken: string;
        message: string;
      }>('/attendance/verify-face', {
        sessionToken: sessionData.sessionToken,
        qrValue: scannedQrValue,
        liveFaceImageData: faceResult.snapshotData,
        liveFaceEmbedding: faceResult.vector,
        liveFaceImageDataList: faceResult.snapshotDataList,
        liveFaceEmbeddings: faceResult.vectors,
        faceEmbeddingVersion: faceResult.embeddingVersion,
        livenessMetadata: faceResult.livenessMetadata,
      });
      setCapturedFaceData(faceResult);
      setFaceVerificationToken(result.faceVerificationToken);
      setFaceVerificationStatus('VERIFIED');
      setFaceVerificationMessage(result.message);
      window.setTimeout(() => setCurrentStep(4), 1_400);
    } catch (error) {
      setCapturedFaceData(null);
      setFaceVerificationToken(null);
      setFaceVerificationStatus('ERROR');
      setFaceVerificationMessage(error instanceof Error ? error.message : 'Face recognition could not be completed. Please try again.');
      setFaceCaptureKey(current => current + 1);
    }
  };

  // Step 4 Handler: Location Verified
  const handleLocationVerified = (loc: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    distanceMeters: number;
  }) => {
    setValidatedLocation(loc);
  };

  // Step 5: Final Submission to Server
  const submitFinalAttendance = async () => {
    if (attendanceReceipt) return;
    if (!sessionData || !scannedQrValue || !capturedFaceData || !faceVerificationToken || !validatedLocation) {
      setSubmissionError('Please complete all verification stages before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmissionError(null);

    try {
      const response = await api.post<any>('/attendance/verify', {
        sessionToken: sessionData.sessionToken,
        qrValue: scannedQrValue,
        faceVerificationToken,
        latitude: validatedLocation.latitude,
        longitude: validatedLocation.longitude,
        accuracyMeters: validatedLocation.accuracyMeters,
      });

      setAttendanceReceipt(response.receipt);
    } catch (err: any) {
      setSubmissionError(err.message || 'Attendance verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const startNextAttendance = () => {
    setSessionTokenInput('');
    setSessionData(null);
    setSessionError(null);
    setScannedQrValue(null);
    setCapturedFaceData(null);
    setFaceVerificationToken(null);
    setFaceVerificationStatus('IDLE');
    setFaceVerificationMessage(null);
    setFaceCaptureKey(0);
    setValidatedLocation(null);
    setSubmissionError(null);
    setAttendanceReceipt(null);
    setCurrentStep(1);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-100 text-blue-800 rounded-xl">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Attendance Verification Portal</h1>
              <p className="text-xs text-slate-500">
                Printed School ID QR • Live Face Match • Classroom Geofencing
              </p>
            </div>
          </div>
          {!sessionData?.isExpired && currentStep > 1 && currentStep < 6 && (
            <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              Step {currentStep - 1} of 4
            </span>
          )}
        </div>

        {/* Progress Bar */}
        {!sessionData?.isExpired && currentStep > 1 && currentStep < 6 && (
          <div className="mt-5 grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
            <div className={`py-1 rounded-md transition ${currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              1. Printed QR
            </div>
            <div className={`py-1 rounded-md transition ${currentStep >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              2. Face Check
            </div>
            <div className={`py-1 rounded-md transition ${currentStep >= 4 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              3. Geofence
            </div>
            <div className={`py-1 rounded-md transition ${currentStep >= 5 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              4. Submit
            </div>
          </div>
        )}
      </div>

      {sessionData?.isExpired && (
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xs">
          <AlertTriangle className="mx-auto h-12 w-12 text-rose-500" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">Link Expired</h2>
          <p className="mt-2 text-xs text-slate-600">
            This attendance link has expired or was closed by the instructor.
          </p>
          <button
            type="button"
            onClick={() => {
              if (onDone) {
                onDone();
              } else {
                setSessionData(null);
                setSessionTokenInput('');
                setSessionError(null);
                setCurrentStep(1);
              }
            }}
            className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {onDone ? 'Return' : 'Enter Another Link'}
          </button>
        </div>
      )}

      {/* STEP 1: Enter or Confirm Session Token */}
      {!sessionData?.isExpired && currentStep === 1 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Enter Attendance Session Link</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste the attendance session token provided by your instructor or open the direct link.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Session Token *</label>
              <input
                type="text"
                value={sessionTokenInput}
                onChange={e => setSessionTokenInput(e.target.value)}
                placeholder="e.g. ssu-att-live-lab3-session-982"
                className="w-full text-xs font-mono rounded-xl border border-slate-300 p-3 focus:ring-2 focus:ring-blue-600 outline-hidden"
              />
            </div>

            {/* Quick Demo Pre-fills */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-400 font-medium">Test Session Pre-fill:</span>
              <button
                type="button"
                onClick={() => setSessionTokenInput('ssu-att-live-lab3-session-982')}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-blue-700 px-2 py-1 rounded font-mono font-semibold"
              >
                ssu-att-live-lab3-session-982 (IT-312 Lab 3)
              </button>
            </div>

            {sessionError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{sessionError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={loadingSession || !sessionTokenInput.trim()}
              onClick={() => loadSession(sessionTokenInput)}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              {loadingSession ? 'Verifying Session...' : 'Continue to Verification'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Scan Printed School ID QR */}
      {!sessionData?.isExpired && currentStep === 2 && sessionData && (
        <div className="space-y-4">
          {/* Class details badge */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center justify-between">
            <div>
              <span className="font-bold">{sessionData.subject.code}: {sessionData.subject.title}</span>
              <p className="text-[11px] text-blue-700">{sessionData.section.name} • Room: {sessionData.location.name}</p>
            </div>
            <span className="font-mono text-[10px] bg-blue-200/60 px-2 py-0.5 rounded text-blue-900 font-semibold">
              Late Cutoff: {new Date(sessionData.lateThresholdTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <QRScanner
            onScan={handleQrScanned}
            title="Step 1: Scan Printed School ID QR"
            onCancel={() => setCurrentStep(1)}
          />
        </div>
      )}

      {/* STEP 3: Live Face Verification */}
      {!sessionData?.isExpired && currentStep === 3 && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-center justify-between">
            <div>
              <span className="font-bold">Printed QR Verified:</span>
              <p className="text-[11px] text-emerald-700 font-mono break-all">{scannedQrValue}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          </div>

          <FaceBiometricCapture
            key={faceCaptureKey}
            mode="VERIFICATION"
            isProcessing={faceVerificationStatus === 'VERIFYING'}
            onCapture={handleFaceCaptured}
            onCancel={() => {
              setFaceVerificationStatus('IDLE');
              setFaceVerificationMessage(null);
              setCurrentStep(2);
            }}
          />
          {faceVerificationStatus === 'VERIFYING' && (
            <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              Checking the captured face against the registered student identity. Location verification is locked until this passes.
            </div>
          )}
          {faceVerificationStatus === 'VERIFIED' && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              <span><strong>Face recognition correct.</strong> {faceVerificationMessage}</span>
            </div>
          )}
          {faceVerificationStatus === 'ERROR' && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
              <span><strong>Face recognition did not match.</strong> {faceVerificationMessage} Geofence verification will not start. Please try again with the registered face.</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Location Validation */}
      {!sessionData?.isExpired && currentStep === 4 && sessionData && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-center justify-between">
            <div>
              <span className="font-bold">Biometrics Verified:</span>
              <p className="text-[11px] text-emerald-700">Face descriptor matched • Live-face check passed</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          </div>

          <LocationChecker
            targetLatitude={sessionData.location.latitude}
            targetLongitude={sessionData.location.longitude}
            locationName={sessionData.location.name}
            buildingName={sessionData.location.building}
            roomNumber={sessionData.location.roomNumber}
            allowedRadiusMeters={sessionData.location.radiusMeters}
            onLocationVerified={handleLocationVerified}
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setCapturedFaceData(null);
                setFaceVerificationToken(null);
                setFaceVerificationStatus('IDLE');
                setFaceVerificationMessage(null);
                setFaceCaptureKey(current => current + 1);
                setCurrentStep(3);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              type="button"
              disabled={!validatedLocation}
              onClick={() => setCurrentStep(5)}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
            >
              Review & Submit Attendance
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Review & Final Submission */}
      {!sessionData?.isExpired && currentStep === 5 && sessionData && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Attendance Verification Summary</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Confirm your verified credentials before official recording into Samar State University records.
            </p>
          </div>

          {submissionError && (
            <div
              role="alert"
              aria-live="assertive"
              className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{submissionError}</span>
            </div>
          )}

          {attendanceReceipt && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                Attendance Successfully Recorded!
              </div>
              <p className="mt-1 text-xs">
                {attendanceReceipt.date} at {attendanceReceipt.attendanceTime}
                {' · '}
                Status: {attendanceReceipt.attendanceStatus}
              </p>
            </div>
          )}

          {/* Student & Class Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Student:</span>
              <span className="font-bold text-slate-900">{profile?.fullName || user?.username} ({profile?.schoolId})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Subject:</span>
              <span className="font-semibold text-slate-800">{sessionData.subject.code} - {sessionData.subject.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Section:</span>
              <span className="font-semibold text-slate-800">{sessionData.section.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Classroom:</span>
              <span className="font-semibold text-slate-800">{sessionData.location.name}</span>
            </div>
          </div>

          {/* 3 Evidence Verification Checks */}
          <div className="space-y-2 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-emerald-950">Printed School ID QR Verified</span>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-emerald-950">Live Face Matched Reference (Liveness Passed)</span>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-emerald-950">
                  Location Verified: {validatedLocation?.distanceMeters}m from classroom
                </span>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            {attendanceReceipt ? (
              <button
                type="button"
                onClick={startNextAttendance}
                className="ml-auto inline-flex items-center rounded-xl bg-blue-700 px-6 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-800"
              >
                Next Attendance
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={submitFinalAttendance}
                  className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center gap-2"
                >
                  {submitting ? 'Recording Attendance...' : 'Confirm & Record Attendance'}
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
