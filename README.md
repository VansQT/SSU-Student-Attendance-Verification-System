# SSU Student Attendance Verification System

The attendance flow verifies a printed SSU ID QR code, a live face capture, and the student’s classroom location. Face comparison is provided by the bundled `attendance_system_face_recognition_api-master` Flask service; the Express server is its only client, so the browser never calls the face API directly.

## Run locally

You need Node.js and Python 3.9+ with the build tools required by `dlib` / `face_recognition`. On Windows, Python 3.9 or 3.10 is the safest choice; install CMake and Visual Studio Build Tools (Desktop development with C++) before `pip install` if a binary is not available. Start the face service in one terminal:

```powershell
cd attendance_system_face_recognition_api-master
./setup-windows.ps1
.\.venv\Scripts\Activate.ps1
$env:FACE_RECOGNITION_API_KEY = "replace-with-a-long-random-secret"
python app.py
```

Then, in a second terminal at the repository root, create `.env` from `.env.example`, setting the same `FACE_RECOGNITION_API_KEY`, and run:

```powershell
npm install
npm run dev
```

On Linux or a Windows machine with the C++ build tools installed, `pip install -r requirements.txt` remains supported. The Windows setup script uses a compatible prebuilt `dlib` runtime instead.

The Python service listens privately on `http://127.0.0.1:5000` by default. Change `FACE_RECOGNITION_API_URL` in the Node application's environment when it is hosted elsewhere. Set `FACE_RECOGNITION_HOST=0.0.0.0` only when a reverse proxy or private network policy protects a deployed API. Confirm it is ready with `GET /health`.

## Face-recognition API

The supplied project was updated from its original class-photo endpoint—which called a retired external attendance backend—to a private 1:1 verification service suitable for this application:

| Endpoint | Request | Purpose |
| --- | --- | --- |
| `GET /health` | — | Confirms the service and recognition engine are running. |
| `POST /validate` | multipart field `image` | Rejects enrollment captures without exactly one readable face. |
| `POST /verify` | multipart fields `enrollment`, `candidate`, `tolerance` | Compares a live capture with the saved enrollment photo. |

The service accepts JPEG images up to 5 MB and requires exactly one face in each image. Set `FACE_RECOGNITION_API_KEY` in both services for any non-local deployment; requests then require `Authorization: Bearer <key>`. Keep it on a private network behind HTTPS, because biometric images are sent from the Express server to this service.

The administrator’s 90–100% **Face Recognition Match Strictness** control is mapped to the local library’s face-distance tolerance: 90% uses `0.45`, the default 95% setting uses `0.40`, and 100% uses the strictest `0.35`. This intentionally narrow range reduces false-positive attendance matches. It is a strictness control, not a calibrated probability.

The browser’s existing camera-based liveness challenge remains a separate gate. A successful liveness check does not replace server-side face matching.

## Multi-sample face protection

New enrollment captures three reference frames (straight ahead, slight left, slight right). Attendance captures three live frames, and every frame must match one of those registered references in both the browser descriptor and the private Python service. Existing students with an older one-photo enrollment must update their face enrollment in **Profile Settings** before taking attendance.
