import React, { useRef, useState, useEffect } from 'react';
import jsQR from 'jsqr';
import { Camera, RefreshCw, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  title?: string;
  onCancel?: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  onScan,
  title = 'Scan Printed School ID QR Code',
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    async function startCamera() {
      try {
        setCameraError(null);
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera access API is not supported in this browser.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          requestAnimationFrame(scanFrame);
        }
      } catch (err: any) {
        console.warn('Camera stream error:', err);
        setHasCamera(false);
        setCameraError(err.message || 'Unable to access camera. Please allow camera permissions or upload an ID photo.');
      }
    }

    function scanFrame() {
      if (!isScanning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data && code.data.trim().length > 0) {
            handleSuccessfulScan(code.data.trim());
            return;
          }
        }
      }

      animationFrameId = requestAnimationFrame(scanFrame);
    }

    startCamera();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [facingMode, isScanning]);

  const handleSuccessfulScan = (codeData: string) => {
    setIsScanning(false);
    setScannedResult(codeData);

    // Audio feedback if supported
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // Audio feedback optional
    }

    setTimeout(() => {
      onScan(codeData);
    }, 400);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            handleSuccessfulScan(code.data.trim());
          } else {
            alert('No valid QR code was detected in the uploaded ID photo. Please try a clearer picture.');
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const flipCamera = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-2xl max-w-md w-full mx-auto border border-slate-700/80">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            <p className="text-xs text-slate-400">Scan physical QR code from Samar State University ID</p>
          </div>
        </div>
        {hasCamera && (
          <button
            type="button"
            onClick={flipCamera}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Switch Camera"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Viewfinder Window */}
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black flex items-center justify-center border-2 border-slate-800">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          autoPlay
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Viewfinder Overlay Targeting Reticle */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-3/4 h-3/4 relative border-2 border-blue-400/60 rounded-xl">
            {/* Corner accents */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />

            {/* Laser scanning line animation */}
            {isScanning && (
              <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse top-1/2 -translate-y-1/2" />
            )}

            {/* Verified indicator */}
            {scannedResult && (
              <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4 rounded-lg">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2 animate-bounce" />
                <p className="text-sm font-semibold text-emerald-300">Printed QR Detected!</p>
                <p className="text-xs font-mono text-emerald-100 bg-emerald-900/60 px-2 py-1 rounded mt-1 break-all">
                  {scannedResult}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Camera Permission / Error State */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-5 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400 mb-2" />
            <p className="text-xs text-slate-300 mb-3">{cameraError}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Photo of Printed ID
            </button>
          </div>
        )}
      </div>

      {/* Scanner Controls */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Position your printed ID QR within the box</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
          >
            <Upload className="w-3 h-3" />
            Upload ID Photo
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
