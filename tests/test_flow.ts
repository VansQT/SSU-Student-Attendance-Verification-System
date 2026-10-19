import { db } from '../server/db';
import { BiometricService, type FaceRecognitionApi } from '../server/services/biometricService';
import { LocationService } from '../server/services/locationService';
import { FACE_EMBEDDING_LENGTH, FACE_EMBEDDING_VERSION } from '../shared/faceBiometrics';

async function runTests() {
  console.log('--- STARTING SSU ATTENDANCE VERIFICATION AUTOMATED TEST SUITE ---');

  // Test 1: Seed Data Verification
  console.log('1. Checking Seed Data & Schema...');
  if (db.users.length < 3) throw new Error('Users count too low');
  if (db.allowedLocations.length < 1) throw new Error('No allowed locations found');
  console.log('✔ Database initialized with users, profiles, sections, subjects, and classroom GPS geofences.');

  // Test 2: local face_recognition API adapter and liveness checks
  console.log('2. Testing Face Recognition Service...');
  const student1 = db.studentProfiles[0];
  const enrolledFace = db.faceEnrollments.find(f => f.studentId === student1.id);
  if (!enrolledFace) throw new Error('Enrolled face not found for student 1');

  enrolledFace.embeddingVersion = FACE_EMBEDDING_VERSION;
  enrolledFace.vector = Array.from({ length: FACE_EMBEDDING_LENGTH }, (_, index) => Math.sin(42 * (index + 1)));
  const faceImage = 'data:image/jpeg;base64,/9j/2Q==';
  enrolledFace.faceSnapshot = faceImage;
  enrolledFace.referenceVectors = Array.from({ length: 3 }, () => [...enrolledFace.vector]);
  enrolledFace.referenceSnapshots = Array.from({ length: 3 }, () => faceImage);
  const liveCaptures = Array.from({ length: 3 }, () => ({
    imageDataUrl: faceImage,
    embedding: [...enrolledFace.vector],
  }));
  const expectedTolerance = 0.45 - (db.settings.faceMatchThreshold - 0.9);
  let distance = 0.2;
  let toleranceUsed = 0;
  let comparisonCalls = 0;
  const fakeFaceRecognitionApi: FaceRecognitionApi = {
    validateFaceImage: async image => ({
      valid: image.length > 0,
      message: image.length > 0 ? 'A single face was detected.' : 'Image is empty.',
    }),
    compareFaces: async (_enrollment, _candidate, tolerance) => {
      comparisonCalls += 1;
      toleranceUsed = tolerance;
      return {
        matched: distance <= tolerance,
        faceDistance: distance,
        tolerance,
      };
    },
  };
  const biometricService = new BiometricService(fakeFaceRecognitionApi);
  const matchResult = await biometricService.verifyFace(student1.id, liveCaptures, {
    blinkDetected: true,
    challengeResponseValid: true,
    qualityScore: 0.9,
  });
  if (!matchResult.verified || matchResult.confidenceScore <= 0) {
    throw new Error(`Self-match failed: ${JSON.stringify(matchResult)}`);
  }
  if (toleranceUsed !== expectedTolerance) {
    throw new Error(`Face-match tolerance was ${toleranceUsed}, expected ${expectedTolerance}`);
  }
  console.log(`✔ Local 1:1 face match verified (Score: ${matchResult.confidenceScore}, Liveness: ${matchResult.livenessPassed})`);

  distance = expectedTolerance + 0.01;
  const mismatchResult = await biometricService.verifyFace(student1.id, liveCaptures, {
    challengeResponseValid: true,
    qualityScore: 0.9,
  });
  if (mismatchResult.verified) {
    throw new Error('Face above the configured distance tolerance should have been rejected');
  }
  console.log(`✔ Face mismatch correctly rejected (Score: ${mismatchResult.confidenceScore})`);

  const descriptorMismatch = await biometricService.verifyFace(student1.id, liveCaptures.map(capture => ({
    ...capture,
    embedding: enrolledFace.vector.map(value => -value),
  })), {
    challengeResponseValid: true,
    qualityScore: 0.9,
  });
  if (descriptorMismatch.verified || descriptorMismatch.embeddingSimilarity !== -1) {
    throw new Error('A different live face descriptor should be rejected before image comparison');
  }
  console.log('✔ Independent live face descriptor mismatch correctly rejected.');

  const incompleteCapture = await biometricService.verifyFace(student1.id, liveCaptures.slice(0, 2), {
    challengeResponseValid: true,
    qualityScore: 0.9,
  });
  if (incompleteCapture.verified) {
    throw new Error('Attendance verification must reject a capture with fewer than three frames');
  }
  console.log('✔ Incomplete multi-frame capture correctly rejected.');

  distance = 0.2;
  const enrollmentSetResult = await biometricService.validateEnrollmentCaptureSet(liveCaptures);
  if (!enrollmentSetResult.valid) {
    throw new Error(`Three captures of the same enrolled face should be accepted: ${enrollmentSetResult.message}`);
  }
  const mixedEnrollmentSet = await biometricService.validateEnrollmentCaptureSet([
    liveCaptures[0],
    { ...liveCaptures[1], embedding: enrolledFace.vector.map(value => -value) },
    liveCaptures[2],
  ]);
  if (mixedEnrollmentSet.valid) {
    throw new Error('Mixed-person enrollment captures should be rejected');
  }
  console.log('✔ Mixed-person enrollment capture set correctly rejected.');

  const enrollmentImageCheck = await biometricService.validateFaceImage(faceImage);
  if (!enrollmentImageCheck.valid) throw new Error('A clear single-face enrollment image should be accepted');
  const livenessFailResult = await biometricService.verifyFace(student1.id, liveCaptures, {
    challengeResponseValid: false,
    qualityScore: 0.9,
  });
  if (livenessFailResult.livenessPassed) {
    throw new Error('Liveness check should fail when no challenge response is present');
  }
  if (comparisonCalls !== 11) throw new Error('Face comparison should run for each valid multi-frame check and stop on liveness failure');
  const invalidImageCheck = await biometricService.validateFaceImage('data:image/jpeg;base64,SGVsbG8=');
  if (invalidImageCheck.valid) throw new Error('Invalid JPEG data should be rejected');
  console.log('✔ Invalid images, face mismatch, and failed liveness captures are rejected.');

  // Test 3: Location Geofencing Validation
  console.log('3. Testing Haversine Geofencing Validation...');
  const loc = db.allowedLocations[0];
  const insideLocResult = LocationService.validateLocation(loc.id, loc.latitude + 0.00005, loc.longitude, 10);
  if (!insideLocResult.valid) {
    throw new Error(`Location inside classroom failed: ${insideLocResult.message}`);
  }
  console.log(`✔ Classroom presence verified: ${insideLocResult.distanceMeters}m (Allowed: ${insideLocResult.allowedRadiusMeters}m)`);

  const outsideLocResult = LocationService.validateLocation(loc.id, loc.latitude + 0.05, loc.longitude + 0.05, 10);
  if (outsideLocResult.valid) {
    throw new Error('Location outside classroom should have failed');
  }
  console.log(`✔ Off-campus location correctly blocked: ${outsideLocResult.distanceMeters}m away`);

  console.log('\n--- ALL AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
