# SSU Face Recognition API

This Flask service performs private, 1:1 face verification for the SSU Student Attendance Verification System. It uses the `face_recognition` library to create encodings from an enrolled reference photo and a live camera capture.

It has been adapted from the original sample project: it no longer fetches student images from an external attendance backend and it does not expose a public class-photo attendance endpoint. The Express attendance server sends the two required images directly.

## Setup

On Windows, use Python 3.9 or 3.10 and make sure CMake plus Visual Studio Build Tools (Desktop development with C++) are installed before creating the environment if `dlib` needs to compile.

```powershell
./setup-windows.ps1
.\.venv\Scripts\Activate.ps1
$env:FACE_RECOGNITION_API_KEY = "replace-with-a-long-random-secret"
python app.py
```

The helper installs a compatible prebuilt `dlib` runtime for Python 3.9, avoiding the Windows C++ compilation requirement. On Linux, or on Windows with C++ build tools installed, `pip install -r requirements.txt` is also supported.

The service binds privately to `127.0.0.1:5000` locally, or to `PORT` when set by the host. Set `FACE_RECOGNITION_HOST=0.0.0.0` only when it is protected by a reverse proxy or private network.

## Endpoints

- `GET /health` returns the service status.
- `POST /validate` accepts multipart field `image` and succeeds only if it contains one face.
- `POST /verify` accepts multipart fields `enrollment`, `candidate`, and optional `tolerance`. It returns `matched`, `faceDistance`, and the applied tolerance.

Images must be JPEG files no larger than 5 MB. When `FACE_RECOGNITION_API_KEY` is set, all endpoints except `/health` require `Authorization: Bearer <key>`.

The default detector is CPU-friendly HOG. Set `FACE_DETECTION_MODEL=cnn` only on a host that supports the CNN detector. Attendance comparison allows a deliberately strict distance from `0.35` to `0.45`; lower values are stricter and reduce false accepts.

Keep this service private and use HTTPS in deployment. It processes sensitive biometric images and is intended to be called only by the application server.
