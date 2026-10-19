"""Face-recognition service used by the SSU attendance application.

The Express application is the only intended client for this service. It sends
the enrolled reference photo and a new live capture to ``/verify``; this
service never fetches student records or images from an external URL.
"""

from __future__ import annotations

import hmac
import io
import os

import face_recognition
import flask
import numpy as np
from flask import jsonify, request
from PIL import UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge


app = flask.Flask(__name__)

MAX_IMAGE_BYTES = 5 * 1024 * 1024
DEFAULT_TOLERANCE = 0.40
MIN_TOLERANCE = 0.35
MAX_TOLERANCE = 0.45
app.config["MAX_CONTENT_LENGTH"] = (MAX_IMAGE_BYTES * 2) + (1024 * 1024)


class ApiError(Exception):
    """An expected request error returned as JSON."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def configured_tolerance() -> float:
    try:
        value = float(os.environ.get("FACE_MATCH_TOLERANCE", DEFAULT_TOLERANCE))
    except ValueError:
        return DEFAULT_TOLERANCE
    return min(MAX_TOLERANCE, max(MIN_TOLERANCE, value))


def is_authorized() -> bool:
    """Require a bearer token only when FACE_RECOGNITION_API_KEY is configured."""
    expected_key = os.environ.get("FACE_RECOGNITION_API_KEY")
    if not expected_key:
        return True
    authorization = request.headers.get("Authorization", "")
    provided_key = authorization.removeprefix("Bearer ").strip()
    return hmac.compare_digest(provided_key, expected_key)


@app.before_request
def require_service_auth():
    if request.endpoint == "health":
        return None
    if not is_authorized():
        return jsonify({"error": "Unauthorized face-recognition service request."}), 401
    return None


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return jsonify({"error": error.message}), error.status


@app.errorhandler(UnidentifiedImageError)
def handle_image_error(_error: UnidentifiedImageError):
    return jsonify({"error": "The uploaded file is not a readable image."}), 400


@app.errorhandler(RequestEntityTooLarge)
def handle_oversized_request(_error: RequestEntityTooLarge):
    return jsonify({"error": "Face-recognition images exceed the request size limit."}), 413


def read_image(field_name: str) -> bytes:
    uploaded = request.files.get(field_name)
    if uploaded is None or not uploaded.filename:
        raise ApiError(f"A {field_name} image is required.")

    image_bytes = uploaded.stream.read(MAX_IMAGE_BYTES + 1)
    if not image_bytes:
        raise ApiError(f"The {field_name} image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ApiError(f"The {field_name} image exceeds the 5 MB limit.", 413)
    return image_bytes


def extract_single_face_encoding(image_bytes: bytes, image_name: str) -> np.ndarray:
    image = face_recognition.load_image_file(io.BytesIO(image_bytes))
    # HOG is the portable CPU detector. Set FACE_DETECTION_MODEL=cnn only when
    # the service host has the resources required by the CNN detector.
    detector_model = os.environ.get("FACE_DETECTION_MODEL", "hog")
    locations = face_recognition.face_locations(image, model=detector_model)
    if len(locations) != 1:
        raise ApiError(
            f"The {image_name} image must contain exactly one clear face; found {len(locations)}."
        )

    encodings = face_recognition.face_encodings(image, known_face_locations=locations)
    if len(encodings) != 1:
        raise ApiError(f"A face encoding could not be created from the {image_name} image.")
    return encodings[0]


def requested_tolerance() -> float:
    value = configured_tolerance()
    raw_tolerance = request.form.get("tolerance")
    if raw_tolerance is None:
        return value
    try:
        requested = float(raw_tolerance)
    except ValueError as error:
        raise ApiError("Face-match tolerance must be a number.") from error
    # The Node server chooses the tolerance. Clamp it here as a second guard
    # against an accidentally permissive request. Attendance verification uses
    # a narrower range than dlib's generic 0.60 default to reduce false accepts.
    return min(MAX_TOLERANCE, max(MIN_TOLERANCE, requested))


@app.get("/health")
def health():
    return jsonify({"status": "ok", "engine": "face_recognition"})


@app.post("/validate")
def validate():
    image_bytes = read_image("image")
    extract_single_face_encoding(image_bytes, "image")
    return jsonify({"valid": True, "message": "A single face was detected."})


@app.post("/verify")
def verify():
    enrollment_bytes = read_image("enrollment")
    candidate_bytes = read_image("candidate")
    tolerance = requested_tolerance()

    enrollment_encoding = extract_single_face_encoding(enrollment_bytes, "enrollment")
    candidate_encoding = extract_single_face_encoding(candidate_bytes, "candidate")
    distance = float(face_recognition.face_distance([enrollment_encoding], candidate_encoding)[0])
    matched = bool(face_recognition.compare_faces(
        [enrollment_encoding], candidate_encoding, tolerance=tolerance
    )[0])

    return jsonify({
        "matched": matched,
        "faceDistance": round(distance, 4),
        "tolerance": tolerance,
        "message": "Face match passed." if matched else "Face does not match the enrolled reference.",
    })


if __name__ == "__main__":
    # Keep a local development instance private by default. Container and
    # platform deployments can set FACE_RECOGNITION_HOST=0.0.0.0.
    app.run(
        host=os.environ.get("FACE_RECOGNITION_HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        threaded=True,
    )
