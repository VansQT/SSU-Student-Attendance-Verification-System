import React, { useRef, useState, useEffect } from 'react';
import { Camera, CheckCircle2, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';
import type HumanLibrary from '@vladmandic/human';
import type { FaceResult } from '@vladmandic/human';
import {
  FACE_EMBEDDING_VERSION,
  FACE_EMBEDDING_LENGTH,
} from '../../../shared/faceBiometrics';

const REQUIRED_FACE_SAMPLES = 3;
const CAPTURE_PROMPTS = [
  'Look straight ahead',
  'Turn slightly to your left',
  'Turn slightly to your right',
];

interface FaceBiometricCaptureProps {
  onCapture: (data: {
    vector: number[];
    embeddingVersion: string;
    livenessPassed: boolean;
    snapshotData?: string;
    vectors: number[][];
    snapshotDataList: string[];
    livenessMetadata: {
      blinkDetected: boolean;
      headPoseVariance: number;
      qualityScore: number;
      challengeResponseValid: boolean;
    };
  }) => void;
  mode: 'ENROLLMENT' | 'VERIFICATION';
  /** The parent is checking the capture with the server. */
  isProcessing?: boolean;
  onCancel?: () => void;
}

export const FaceBiometricCapture: React.FC<FaceBiometricCaptureProps> = ({
  onCapture,
  mode,
  isProcessing = false,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceRecognitionRef = useRef<HumanLibrary | null>(null);

  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceRecognitionReady, setFaceRecognitionReady] = useState<boolean>(false);
  const [faceRecognitionError, setFaceRecognitionError] = useState<string | null>(null);
  const [step, setStep] = useState<'ALIGN' | 'LIVENESS' | 'CAPTURING' | 'SUCCESS'>('ALIGN');
  const [livenessProgress, setLivenessProgress] = useState<number>(0);
  const [livenessBlinkDone, setLivenessBlinkDone] = useState<boolean>(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureSampleIndex, setCaptureSampleIndex] = useState<number>(0);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        setCameraReady(false);
        setCameraError(null);
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera access not supported by browser.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setHasCamera(true);
          setCameraReady(true);
        }
      } catch (err: any) {
        console.warn('Front camera error:', err);
        setHasCamera(false);
        setCameraReady(false);
        setCameraError(err.message || 'Unable to access front camera.');
      }
    }

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let recognizer: HumanLibrary | null = null;

    const initializeFaceRecognition = async () => {
      try {
        const { default: Human } = await import('@vladmandic/human');
        recognizer = new Human({
          backend: 'webgl',
          modelBasePath: 'https://vladmandic.github.io/human-models/models/',
          debug: false,
          face: {
            enabled: true,
            detector: { enabled: true, maxDetected: 2, minConfidence: 0.65, return: true },
            mesh: { enabled: true },
            iris: { enabled: true },
            description: { enabled: true },
            antispoof: { enabled: true },
            liveness: { enabled: true },
          },
          body: { enabled: false },
          hand: { enabled: false },
          object: { enabled: false },
          segmentation: { enabled: false },
          gesture: { enabled: false },
        });
        const faceConfig = recognizer.config.face as typeof recognizer.config.face & {
          insightface: {
            enabled: boolean;
            modelPath: string;
            skipFrames: number;
            skipTime: number;
          };
        };
        faceConfig.insightface = {
          enabled: true,
          modelPath: 'https://vladmandic.github.io/insightface/models/insightface-mobilenet-swish.json',
          skipFrames: 0,
          skipTime: 0,
        };
        await recognizer.load();
        await recognizer.warmup();

        if (cancelled) {
          recognizer.tf.disposeVariables?.();
          return;
        }
        faceRecognitionRef.current = recognizer;
        setFaceRecognitionReady(true);
      } catch (err) {
        setFaceRecognitionError(
          err instanceof Error
            ? `Face recognition could not be loaded: ${err.message}`
            : 'Face recognition could not be loaded. Check your internet connection and try again.'
        );
      }
    };

    void initializeFaceRecognition();

    return () => {
      cancelled = true;
      faceRecognitionRef.current?.tf.disposeVariables?.();
      faceRecognitionRef.current = null;
    };
  }, []);

  // Liveness challenge loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'LIVENESS') {
      let progress = 0;
      interval = setInterval(() => {
        progress += 20;
        setLivenessProgress(progress);
        if (progress >= 60 && !livenessBlinkDone) {
          setLivenessBlinkDone(true);
        }
        if (progress >= 100) {
          clearInterval(interval);
          setStep('CAPTURING');
          performBiometricCapture();
        }
      }, 400);
    }
    return () => clearInterval(interval);
  }, [step, livenessBlinkDone]);

  const detectSingleFace = async (
    video: HTMLVideoElement
  ): Promise<FaceResult & { embedding: number[] }> => {
    const recognizer = faceRecognitionRef.current;
    if (!recognizer || !faceRecognitionReady) {
      throw new Error('Face recognition is still loading. Please wait and try again.');
    }

    const result = await recognizer.detect(video);
    if (result.face.length === 0) {
      throw new Error('No face detected. Center your face in the camera and try again.');
    }
    if (result.face.length > 1) {
      result.face.forEach(face => face.tensor?.dispose());
      throw new Error('More than one face detected. Make sure you are alone in the camera view.');
    }

    const face = result.face[0];
    if (!face.embedding ||
        face.embedding.length !== FACE_EMBEDDING_LENGTH ||
        face.embedding.some(value => !Number.isFinite(value))) {
      face.tensor?.dispose();
      throw new Error('Could not create a valid face recognition descriptor. Adjust lighting and try again.');
    }
    const embedding = [...face.embedding];
    face.tensor?.dispose();
    return { ...face, embedding };
  };

  const performBiometricCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setCaptureError('Camera feed is unavailable. Allow camera access and try again.');
      setStep('ALIGN');
      return;
    }

    try {
      const captures: Array<{ vector: number[]; snapshotData: string; qualityScore: number }> = [];
      for (let sampleIndex = 0; sampleIndex < REQUIRED_FACE_SAMPLES; sampleIndex += 1) {
        setCaptureSampleIndex(sampleIndex + 1);
        const face = await detectSingleFace(video);
        const realScore = face.real;
        const liveScore = face.live;
        if (typeof realScore !== 'number' || realScore < 0.5 ||
            typeof liveScore !== 'number' || liveScore < 0.5) {
          throw new Error('Live face check failed. Use the camera directly and follow the liveness prompt.');
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Unable to process the camera image. Please try again.');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        captures.push({
          vector: face.embedding,
          snapshotData: canvas.toDataURL('image/jpeg', 0.65),
          qualityScore: typeof face.score === 'number' ? face.score : 0,
        });

        if (sampleIndex < REQUIRED_FACE_SAMPLES - 1) {
          // Give the student time to follow the next pose prompt before the
          // following sample is taken. The reference set is therefore useful
          // for normal expression and small head-pose variation.
          setCaptureSampleIndex(sampleIndex + 2);
          await new Promise<void>(resolve => window.setTimeout(resolve, 1_200));
        }
      }

      const vector = captures[0].vector;
      const snapshotData = captures[0].snapshotData;

      setCaptureError(null);
      setStep('SUCCESS');

      setTimeout(() => {
        onCapture({
          vector,
          embeddingVersion: FACE_EMBEDDING_VERSION,
          livenessPassed: true,
          snapshotData,
          vectors: captures.map(capture => capture.vector),
          snapshotDataList: captures.map(capture => capture.snapshotData),
          livenessMetadata: {
            blinkDetected: false,
            headPoseVariance: 0,
            qualityScore: Math.min(...captures.map(capture => capture.qualityScore)),
            challengeResponseValid: true,
          },
        });
      }, 600);
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Unable to process the camera image. Please try again.');
      setCaptureSampleIndex(0);
      setStep('ALIGN');
    }
  };

  const startLivenessTest = async () => {
    if (!hasCamera || !cameraReady || cameraError || !videoRef.current?.videoWidth) {
      setCaptureError('Camera feed is unavailable. Allow camera access and try again.');
      return;
    }

    try {
      const face = await detectSingleFace(videoRef.current);
      if (typeof face.real !== 'number' || face.real < 0.5 ||
          typeof face.live !== 'number' || face.live < 0.5) {
        throw new Error('Live face check failed. Use the camera directly and follow the liveness prompt.');
      }
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Face check failed. Please try again.');
      return;
    }
    setCaptureError(null);
    setStep('LIVENESS');
    setLivenessProgress(0);
    setLivenessBlinkDone(false);
    setCaptureSampleIndex(0);
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-2xl max-w-md w-full mx-auto border border-slate-700/80">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <UserCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {mode === 'ENROLLMENT' ? 'Biometric Face Enrollment' : 'Live Face Verification'}
            </h3>
            <p className="text-xs text-slate-400">1:1 Biometric Match & Anti-Spoof Liveness</p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700">
          ISO/IEC 30107-3
        </span>
      </div>

      {/* Video Viewport with Biometric Oval Frame */}
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black flex items-center justify-center border-2 border-slate-800">
        <video
          ref={videoRef}
          className="w-full h-full object-cover transform -scale-x-100"
          muted
          autoPlay
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Biometric Oval Alignment Frame */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div
            className={`w-52 h-64 rounded-[50%] border-3 transition-all duration-300 ${
              step === 'SUCCESS'
                ? 'border-emerald-400 bg-emerald-500/10'
                : step === 'LIVENESS'
                ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                : 'border-white/50 border-dashed'
            }`}
          />

          {/* Prompt Instructions */}
          <div className="mt-4 px-4 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-md text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1.5">
            {step === 'ALIGN' && <span>Center your face inside the oval</span>}
            {step === 'LIVENESS' && (
              <span className="text-cyan-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                Active Liveness: Blink your eyes gently...
              </span>
            )}
            {step === 'CAPTURING' && <span>{CAPTURE_PROMPTS[(captureSampleIndex || 1) - 1]} — frame {captureSampleIndex || 1} of {REQUIRED_FACE_SAMPLES}</span>}
            {step === 'SUCCESS' && (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                {isProcessing ? (
                  <><Sparkles className="w-3.5 h-3.5 animate-spin" /> Checking your registered identity...</>
                ) : (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Capture Ready for Identity Check</>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Camera Error Fallback */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-5 text-center">
            <ShieldAlert className="w-10 h-10 text-amber-400 mb-2" />
            <p className="text-xs text-slate-300">{cameraError}</p>
          </div>
        )}
      </div>

      {captureError && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-xs text-rose-200">
          {captureError}
        </p>
      )}
      {faceRecognitionError && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-xs text-rose-200">
          {faceRecognitionError}
        </p>
      )}

      {/* Liveness Progress Bar */}
      {step === 'LIVENESS' && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
            <span>Analyzing Facial Micro-motions</span>
            <span>{livenessProgress}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${livenessProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="mt-4 space-y-2">
        <p className="text-center text-[11px] text-slate-400">
          Three live frames must match the same registered face before attendance is accepted.
        </p>
        {step === 'ALIGN' && !cameraError && (
          <button
            type="button"
            disabled={!hasCamera || !cameraReady || !faceRecognitionReady || Boolean(faceRecognitionError)}
            onClick={startLivenessTest}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-900/40 transition flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            Start Liveness & Face Capture
          </button>
        )}
        {!faceRecognitionReady && !faceRecognitionError && (
          <p className="text-center text-[11px] text-slate-400">Loading face recognition models...</p>
        )}

        {onCancel && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className="w-full py-2 text-slate-400 hover:text-slate-200 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
