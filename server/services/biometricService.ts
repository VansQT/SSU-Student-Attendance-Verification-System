import { db } from '../db';
import { existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  FACE_EMBEDDING_LENGTH,
  FACE_EMBEDDING_MATCH_THRESHOLD,
  FACE_REFERENCE_SAMPLE_COUNT,
} from '../../shared/faceBiometrics';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// dlib's documented default (0.60) is designed for broad consumer matching.
// Attendance verification uses a deliberately narrower range to reduce false
// accepts when a different person is in front of the camera.
const MIN_TOLERANCE = 0.35;
const MAX_TOLERANCE = 0.45;

export interface BiometricVerificationResult {
  verified: boolean;
  /** A normalized reference score for reporting. The pass/fail decision uses face distance. */
  confidenceScore: number;
  embeddingSimilarity?: number;
  livenessPassed: boolean;
  message: string;
}

export interface LiveFaceCapture {
  imageDataUrl: unknown;
  embedding: unknown;
}

export interface FaceVerificationOptions {
  /** Re-enrollment may be authorized against a legacy one-photo template. */
  requireMultipleSamples?: boolean;
}

export interface FaceRecognitionApi {
  validateFaceImage(image: Uint8Array): Promise<{ valid: boolean; message?: string }>;
  compareFaces(
    enrollmentImage: Uint8Array,
    liveImage: Uint8Array,
    tolerance: number
  ): Promise<{ matched: boolean; faceDistance: number; tolerance: number; message?: string }>;
}

export class InvalidFaceImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFaceImageError';
  }
}

export class FaceRecognitionServiceError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'FaceRecognitionServiceError';
  }
}

function parseJpegDataUrl(dataUrl: string): Uint8Array {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    throw new InvalidFaceImageError('A valid JPEG face image is required.');
  }

  const imageBytes = Buffer.from(match[1], 'base64');
  if (imageBytes.length === 0 ||
      imageBytes.length > MAX_IMAGE_BYTES ||
      imageBytes.toString('base64') !== match[1] ||
      imageBytes[0] !== 0xff ||
      imageBytes[1] !== 0xd8 ||
      imageBytes[imageBytes.length - 2] !== 0xff ||
      imageBytes[imageBytes.length - 1] !== 0xd9) {
    throw new InvalidFaceImageError('The face image is invalid or exceeds the 5 MB limit.');
  }

  return imageBytes;
}

function dataUrlToJpegBytes(faceImageDataUrl: unknown): Uint8Array {
  if (typeof faceImageDataUrl !== 'string') {
    throw new InvalidFaceImageError('A face capture image is required.');
  }
  return parseJpegDataUrl(faceImageDataUrl);
}

function configuredFaceServiceUrl(): string {
  return (process.env.FACE_RECOGNITION_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
}

function canUseLocalPythonWorker(): boolean {
  try {
    const url = new URL(configuredFaceServiceUrl());
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

class HttpFaceRecognitionApi implements FaceRecognitionApi {
  private readonly baseUrl = configuredFaceServiceUrl();
  private readonly apiKey = process.env.FACE_RECOGNITION_API_KEY;

  private async request(
    path: '/validate' | '/verify',
    fields: Record<string, string>,
    images: Record<string, Uint8Array>
  ): Promise<Record<string, unknown>> {
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) body.append(name, value);
    for (const [name, bytes] of Object.entries(images)) {
      // Make an ArrayBuffer-backed copy. Node's Buffer/Uint8Array type may
      // also be backed by SharedArrayBuffer, which is not accepted by Blob.
      const imageCopy = new Uint8Array(bytes.length);
      imageCopy.set(bytes);
      body.append(name, new Blob([imageCopy.buffer], { type: 'image/jpeg' }), `${name}.jpg`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
        body,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => ({}));
      const message = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Face-recognition service returned an invalid response.';

      if (!response.ok) {
        throw new FaceRecognitionServiceError(message, response.status);
      }
      if (!payload || typeof payload !== 'object') {
        throw new FaceRecognitionServiceError('Face-recognition service returned an invalid response.');
      }
      return payload as Record<string, unknown>;
    } catch (error) {
      if (error instanceof FaceRecognitionServiceError) throw error;
      const detail = error instanceof Error && error.name === 'AbortError'
        ? 'Face-recognition service timed out.'
        : 'Face-recognition service is unavailable.';
      throw new FaceRecognitionServiceError(detail, 503);
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateFaceImage(image: Uint8Array): Promise<{ valid: boolean; message?: string }> {
    const payload = await this.request('/validate', {}, { image });
    return {
      valid: payload.valid === true,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }

  async compareFaces(
    enrollmentImage: Uint8Array,
    liveImage: Uint8Array,
    tolerance: number
  ): Promise<{ matched: boolean; faceDistance: number; tolerance: number; message?: string }> {
    const payload = await this.request('/verify', { tolerance: String(tolerance) }, {
      enrollment: enrollmentImage,
      candidate: liveImage,
    });
    if (typeof payload.matched !== 'boolean' ||
        typeof payload.faceDistance !== 'number' ||
        !Number.isFinite(payload.faceDistance) ||
        typeof payload.tolerance !== 'number' ||
        !Number.isFinite(payload.tolerance)) {
      throw new FaceRecognitionServiceError('Face-recognition service returned an invalid comparison result.');
    }
    return {
      matched: payload.matched,
      faceDistance: payload.faceDistance,
      tolerance: payload.tolerance,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }
}

/**
 * Uses the same face_recognition installation without requiring a permanently
 * running Flask process. This is a reliability fallback for local Windows
 * deployments where background development processes may be stopped.
 */
class LocalPythonFaceRecognitionApi implements FaceRecognitionApi {
  private readonly serviceDirectory = path.join(process.cwd(), 'attendance_system_face_recognition_api-master');
  // Windows uses the project virtual environment. Containers and Linux hosts
  // use PYTHON_EXECUTABLE (or python3), so the same private worker can run in
  // a single public-cloud application container.
  private readonly pythonExecutable = process.env.PYTHON_EXECUTABLE ||
    (process.platform === 'win32'
      ? path.join(this.serviceDirectory, '.venv', 'Scripts', 'python.exe')
      : 'python3');
  private readonly workerScript = path.join(this.serviceDirectory, 'face_cli.py');

  private async run(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!existsSync(this.workerScript)) {
      throw new FaceRecognitionServiceError('The local face-recognition engine is not installed.', 503);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonExecutable, [this.workerScript], {
        cwd: this.serviceDirectory,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish(() => reject(new FaceRecognitionServiceError('Local face-recognition processing timed out.', 503)));
      }, 20_000);

      child.stdout?.on('data', chunk => { stdout += String(chunk); });
      child.stderr?.on('data', chunk => { stderr += String(chunk); });
      child.once('error', () => {
        finish(() => reject(new FaceRecognitionServiceError('Local face-recognition engine could not be started.', 503)));
      });
      child.once('close', () => {
        finish(() => {
          try {
            const response: unknown = JSON.parse(stdout);
            if (!response || typeof response !== 'object') {
              throw new Error('Missing worker response');
            }
            const result = response as { ok?: unknown; status?: unknown; error?: unknown } & Record<string, unknown>;
            if (result.ok !== true) {
              const status = typeof result.status === 'number' && Number.isInteger(result.status)
                ? result.status
                : 503;
              const message = typeof result.error === 'string'
                ? result.error
                : 'Local face-recognition processing failed.';
              reject(new FaceRecognitionServiceError(message, status));
              return;
            }
            resolve(result);
          } catch {
            // stderr is intentionally not returned to the browser because it
            // can contain local implementation details.
            void stderr;
            reject(new FaceRecognitionServiceError('Local face-recognition processing failed.', 503));
          }
        });
      });
      child.stdin?.end(JSON.stringify(payload));
    });
  }

  async validateFaceImage(image: Uint8Array): Promise<{ valid: boolean; message?: string }> {
    const payload = await this.run({
      operation: 'validate',
      image: Buffer.from(image).toString('base64'),
    });
    return {
      valid: payload.valid === true,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }

  async compareFaces(
    enrollmentImage: Uint8Array,
    liveImage: Uint8Array,
    tolerance: number
  ): Promise<{ matched: boolean; faceDistance: number; tolerance: number; message?: string }> {
    const payload = await this.run({
      operation: 'verify',
      enrollment: Buffer.from(enrollmentImage).toString('base64'),
      candidate: Buffer.from(liveImage).toString('base64'),
      tolerance,
    });
    if (typeof payload.matched !== 'boolean' ||
        typeof payload.faceDistance !== 'number' || !Number.isFinite(payload.faceDistance) ||
        typeof payload.tolerance !== 'number' || !Number.isFinite(payload.tolerance)) {
      throw new FaceRecognitionServiceError('Local face-recognition engine returned an invalid comparison result.', 503);
    }
    return {
      matched: payload.matched,
      faceDistance: payload.faceDistance,
      tolerance: payload.tolerance,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }
}

class ResilientFaceRecognitionApi implements FaceRecognitionApi {
  private readonly httpApi = new HttpFaceRecognitionApi();
  private readonly localApi = new LocalPythonFaceRecognitionApi();

  private async withLocalFallback<T>(operation: (api: FaceRecognitionApi) => Promise<T>): Promise<T> {
    try {
      return await operation(this.httpApi);
    } catch (error) {
      if (canUseLocalPythonWorker() && error instanceof FaceRecognitionServiceError && error.status === 503) {
        return operation(this.localApi);
      }
      throw error;
    }
  }

  validateFaceImage(image: Uint8Array) {
    return this.withLocalFallback(api => api.validateFaceImage(image));
  }

  compareFaces(enrollmentImage: Uint8Array, liveImage: Uint8Array, tolerance: number) {
    return this.withLocalFallback(api => api.compareFaces(enrollmentImage, liveImage, tolerance));
  }
}

/**
 * The legacy 90–100% policy remains an administrator-friendly strictness
 * control. The Python face_recognition library uses a distance tolerance:
 * 90% maps to 0.45 and 100% to the strict 0.35. These values are narrower
 * than dlib's generic 0.60 default to reduce false-positive attendance.
 */
function getComparisonTolerance(): number {
  const strictness = Number(db.settings.faceMatchThreshold);
  if (!Number.isFinite(strictness) || strictness < 0.9 || strictness > 1) {
    throw new Error('Face recognition strictness must be between 90% and 100%.');
  }
  return Math.min(MAX_TOLERANCE, Math.max(MIN_TOLERANCE, 0.45 - (strictness - 0.9)));
}

function reportingScore(faceDistance: number): number {
  // face_recognition provides a distance, not a calibrated probability. Keep
  // a normalized closeness value only for historical reports and audit views.
  return Math.round(Math.min(1, Math.max(0, 1 - faceDistance)) * 10_000) / 10_000;
}

function isFaceEmbedding(vector: unknown): vector is number[] {
  return Array.isArray(vector) &&
    vector.length === FACE_EMBEDDING_LENGTH &&
    vector.every(value => typeof value === 'number' && Number.isFinite(value));
}

function cosineSimilarity(enrolledVector: unknown, liveVector: unknown): number | null {
  if (!isFaceEmbedding(enrolledVector) || !isFaceEmbedding(liveVector)) {
    return null;
  }

  let dotProduct = 0;
  let enrolledMagnitude = 0;
  let liveMagnitude = 0;
  for (let index = 0; index < FACE_EMBEDDING_LENGTH; index += 1) {
    const enrolledValue = enrolledVector[index];
    const liveValue = liveVector[index] as number;
    dotProduct += enrolledValue * liveValue;
    enrolledMagnitude += enrolledValue * enrolledValue;
    liveMagnitude += liveValue * liveValue;
  }
  if (enrolledMagnitude === 0 || liveMagnitude === 0) return null;
  return dotProduct / Math.sqrt(enrolledMagnitude * liveMagnitude);
}

export class BiometricService {
  constructor(private readonly faceRecognitionApi: FaceRecognitionApi = new HttpFaceRecognitionApi()) {}

  async validateFaceImage(faceImageDataUrl: unknown): Promise<{ valid: boolean; message?: string }> {
    let imageBytes: Uint8Array;
    try {
      imageBytes = dataUrlToJpegBytes(faceImageDataUrl);
    } catch (error) {
      if (error instanceof InvalidFaceImageError) return { valid: false, message: error.message };
      throw error;
    }
    return this.faceRecognitionApi.validateFaceImage(imageBytes);
  }

  /**
   * Prevent an enrollment from being built from several people's faces. Every
   * reference frame must agree with the first frame in both recognition models.
   */
  async validateEnrollmentCaptureSet(captures: LiveFaceCapture[]): Promise<{ valid: boolean; message?: string }> {
    if (!Array.isArray(captures) || captures.length !== FACE_REFERENCE_SAMPLE_COUNT) {
      return { valid: false, message: `Exactly ${FACE_REFERENCE_SAMPLE_COUNT} enrollment face captures are required.` };
    }

    const firstCapture = captures[0];
    const descriptorMismatch = captures.slice(1).some(capture => {
      const similarity = cosineSimilarity(firstCapture.embedding, capture.embedding);
      return similarity === null || similarity < FACE_EMBEDDING_MATCH_THRESHOLD;
    });
    if (descriptorMismatch) {
      return { valid: false, message: 'All enrollment captures must show the same face. Please capture them again.' };
    }

    try {
      const firstImage = dataUrlToJpegBytes(firstCapture.imageDataUrl);
      const comparisons = await Promise.all(captures.slice(1).map(capture =>
        this.faceRecognitionApi.compareFaces(
          firstImage,
          dataUrlToJpegBytes(capture.imageDataUrl),
          getComparisonTolerance()
        )
      ));
      if (comparisons.some(comparison => !comparison.matched)) {
        return { valid: false, message: 'All enrollment captures must show the same face. Please capture them again.' };
      }
      return { valid: true };
    } catch (error) {
      if (error instanceof InvalidFaceImageError) return { valid: false, message: error.message };
      throw error;
    }
  }

  async verifyFace(
    studentId: string,
    liveCaptures: LiveFaceCapture[],
    livenessMetadata?: {
      blinkDetected?: boolean;
      headPoseVariance?: number;
      qualityScore?: number;
      challengeResponseValid?: boolean;
    },
    options: FaceVerificationOptions = {}
  ): Promise<BiometricVerificationResult> {
    const requireMultipleSamples = options.requireMultipleSamples !== false;
    const enrollment = db.faceEnrollments.find(face => face.studentId === studentId);
    if (!enrollment || typeof enrollment.faceSnapshot !== 'string') {
      return {
        verified: false,
        confidenceScore: 0,
        livenessPassed: false,
        message: 'No saved enrollment photo is available for this student. Please contact your instructor.',
      };
    }

    const livenessPassed = !db.settings.requireLivenessCheck ||
      (livenessMetadata?.challengeResponseValid === true &&
        typeof livenessMetadata.qualityScore === 'number' &&
        livenessMetadata.qualityScore >= 0.5);
    if (!livenessPassed) {
      return {
        verified: false,
        confidenceScore: 0,
        livenessPassed: false,
        message: 'Live face check failed. Please complete the camera check and try again.',
      };
    }

    const referenceVectors = Array.isArray(enrollment.referenceVectors) &&
      enrollment.referenceVectors.length === FACE_REFERENCE_SAMPLE_COUNT &&
      enrollment.referenceVectors.every(isFaceEmbedding)
      ? enrollment.referenceVectors
      : requireMultipleSamples
        ? null
        : [enrollment.vector];
    const referenceSnapshots = Array.isArray(enrollment.referenceSnapshots) &&
      enrollment.referenceSnapshots.length === FACE_REFERENCE_SAMPLE_COUNT &&
      enrollment.referenceSnapshots.every(snapshot => typeof snapshot === 'string')
      ? enrollment.referenceSnapshots
      : requireMultipleSamples
        ? null
        : [enrollment.faceSnapshot];

    if (!referenceVectors || !referenceSnapshots) {
      return {
        verified: false,
        confidenceScore: 0,
        livenessPassed,
        message: 'Your registered face needs the new 3-sample enrollment. Update it in Profile Settings before taking attendance.',
      };
    }
    if (!Array.isArray(liveCaptures) ||
        (requireMultipleSamples && liveCaptures.length !== FACE_REFERENCE_SAMPLE_COUNT) ||
        (!requireMultipleSamples && liveCaptures.length !== 1)) {
      return {
        verified: false,
        confidenceScore: 0,
        livenessPassed,
        message: `Capture ${requireMultipleSamples ? FACE_REFERENCE_SAMPLE_COUNT : 'one'} clear live face ${requireMultipleSamples ? 'frames' : 'frame'} and try again.`,
      };
    }

    const selectedReferences = liveCaptures.map(capture => {
      const similarities = referenceVectors.map(vector => cosineSimilarity(vector, capture.embedding));
      const bestSimilarity = Math.max(...similarities.map(similarity => similarity ?? -1));
      const referenceIndex = similarities.findIndex(similarity => similarity === bestSimilarity);
      return { bestSimilarity, referenceIndex };
    });
    const unusableDescriptor = selectedReferences.find(reference => reference.referenceIndex < 0);
    if (unusableDescriptor) {
      return {
        verified: false,
        confidenceScore: Math.max(0, unusableDescriptor.bestSimilarity),
        embeddingSimilarity: unusableDescriptor.bestSimilarity,
        livenessPassed,
        message: 'A valid live face descriptor could not be created. Improve lighting and try again.',
      };
    }

    let comparisons: Array<{ matched: boolean; faceDistance: number; tolerance: number; message?: string }>;
    try {
      comparisons = await Promise.all(liveCaptures.map(async (capture, index) => {
        const referenceIndex = selectedReferences[index].referenceIndex;
        return this.faceRecognitionApi.compareFaces(
          parseJpegDataUrl(referenceSnapshots[referenceIndex]),
          dataUrlToJpegBytes(capture.imageDataUrl),
          getComparisonTolerance()
        );
      }));
    } catch (error) {
      if (error instanceof InvalidFaceImageError) {
        return { verified: false, confidenceScore: 0, livenessPassed, message: error.message };
      }
      throw error;
    }

    const failedComparison = comparisons.find(comparison => !comparison.matched);
    const lowestEmbeddingSimilarity = Math.min(...selectedReferences.map(reference => reference.bestSimilarity));
    // The browser descriptor chooses the best pose/reference pair, but the
    // Python 1:1 face distance is the authority for pass/fail and confidence.
    // This avoids rejecting the registered person merely because lighting or
    // a normal expression changes the browser model's cosine score.
    const confidenceScore = Math.min(...comparisons.map(comparison => reportingScore(comparison.faceDistance)));
    const highestFaceDistance = Math.max(...comparisons.map(comparison => comparison.faceDistance));
    const tolerance = comparisons[0]?.tolerance ?? getComparisonTolerance();
    const distanceDetails = `worst face distance: ${highestFaceDistance.toFixed(3)}; allowed: ${tolerance.toFixed(3)}`;
    return {
      verified: !failedComparison,
      confidenceScore,
      embeddingSimilarity: lowestEmbeddingSimilarity,
      livenessPassed,
      message: failedComparison
        ? `One or more live frames did not match the enrollment (${distanceDetails}).`
        : `${liveCaptures.length}-frame face recognition match passed (${distanceDetails}).`,
    };
  }
}

export const biometricService = new BiometricService(new ResilientFaceRecognitionApi());
