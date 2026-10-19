"""One-request local face-recognition worker for the attendance server.

The JSON-lines protocol lets the Node server use the same recognition engine
when a separate Flask process is not available on a Windows workstation.
"""

from __future__ import annotations

import base64
import json
import sys

import face_recognition

from app import ApiError, MAX_TOLERANCE, MIN_TOLERANCE, extract_single_face_encoding


def decode_image(value: object, name: str) -> bytes:
    if not isinstance(value, str) or not value:
        raise ApiError(f"A {name} image is required.")
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, TypeError) as error:
        raise ApiError(f"The {name} image is not valid base64 data.") from error


def respond(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> None:
    try:
        request_data = json.load(sys.stdin)
        operation = request_data.get("operation")
        if operation == "validate":
            extract_single_face_encoding(decode_image(request_data.get("image"), "image"), "image")
            respond({"ok": True, "valid": True, "message": "A single face was detected."})
            return

        if operation == "verify":
            enrollment = extract_single_face_encoding(
                decode_image(request_data.get("enrollment"), "enrollment"), "enrollment"
            )
            candidate = extract_single_face_encoding(
                decode_image(request_data.get("candidate"), "candidate"), "candidate"
            )
            try:
                requested_tolerance = float(request_data.get("tolerance"))
            except (TypeError, ValueError) as error:
                raise ApiError("Face-match tolerance must be a number.") from error
            tolerance = min(MAX_TOLERANCE, max(MIN_TOLERANCE, requested_tolerance))
            distance = float(face_recognition.face_distance([enrollment], candidate)[0])
            matched = bool(face_recognition.compare_faces([enrollment], candidate, tolerance=tolerance)[0])
            respond({
                "ok": True,
                "matched": matched,
                "faceDistance": round(distance, 4),
                "tolerance": tolerance,
                "message": "Face match passed." if matched else "Face does not match the enrolled reference.",
            })
            return

        raise ApiError("Unsupported face-recognition operation.")
    except ApiError as error:
        respond({"ok": False, "status": error.status, "error": error.message})
    except Exception:
        # Do not expose stack traces or image data to the caller.
        respond({"ok": False, "status": 500, "error": "Local face-recognition processing failed."})


if __name__ == "__main__":
    main()
