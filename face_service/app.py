"""
HRMS Face Verification Microservice
====================================
Python 3.10+ · FastAPI · DeepFace (ArcFace) · OpenCV

Security & Architecture:
  - Internal service only: Node.js backend calls this microservice using X-Internal-Key.
  - Constant-time comparison (hmac.compare_digest) for internal key verification.
  - In-memory processing: raw selfies are decoded in-memory and immediately discarded.
  - Zero PII / raw biometric images written to disk or logs.
  - DeepFace (ArcFace model, cosine distance threshold: 0.40).
  - Explicit liveness limitation: ArcFace performs 2D facial identity verification;
    it does NOT perform active 3D anti-spoofing without an external liveness provider.
"""

import os
import base64
import logging
import hmac
import time
from typing import Optional, List

import numpy as np
import cv2
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
from deepface import DeepFace

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("face_service")

INTERNAL_KEY: str     = os.environ.get("FACE_SERVICE_INTERNAL_KEY", "hrms_face_internal_secret_2026")
FACE_MODEL: str       = os.environ.get("FACE_MODEL", "ArcFace")
FACE_DETECTOR: str    = os.environ.get("FACE_DETECTOR", "opencv")
THRESHOLD: float      = float(os.environ.get("FACE_SIMILARITY_THRESHOLD", "0.40"))
MAX_IMAGE_BYTES: int  = 5 * 1024 * 1024  # 5 MB

app = FastAPI(
    title="HRMS Face Verification Microservice",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)

class EnrollRequest(BaseModel):
    image_base64: str

class EnrollResponse(BaseModel):
    embedding: List[float]
    model: str
    embedding_dimension: int
    face_count: int
    quality_score: float

class VerifyRequest(BaseModel):
    enrolled_embedding: List[float]
    image_base64: str
    liveness_session_id: Optional[str] = None

class VerifyResponse(BaseModel):
    matched: bool
    distance: float
    threshold: float
    model: str
    face_count: int
    quality_score: float
    liveness_result: str

def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    if not INTERNAL_KEY:
        return
    if not x_internal_key or not hmac.compare_digest(x_internal_key.encode(), INTERNAL_KEY.encode()):
        raise HTTPException(status_code=403, detail="Unauthorized: invalid internal service key.")

def decode_image(image_base64: str) -> np.ndarray:
    if not image_base64 or not isinstance(image_base64, str):
        raise HTTPException(status_code=400, detail="Missing or invalid image_base64 field.")

    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]

    try:
        raw_bytes = base64.b64decode(image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data.")

    if len(raw_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large. Maximum 5 MB.")

    if len(raw_bytes) < 100:
        raise HTTPException(status_code=400, detail="Image payload is too small to be a valid image.")

    img_array = np.frombuffer(raw_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(
            status_code=400,
            detail="Could not decode image. Please provide a valid JPEG or PNG."
        )
    return img

def compute_quality_score(img: np.ndarray, face_areas: list) -> float:
    if not face_areas:
        return 0.0

    h, w = img.shape[:2]
    image_area = max(h * w, 1)
    largest = max(face_areas, key=lambda f: f.get("w", 0) * f.get("h", 0), default={})
    face_area = largest.get("w", 0) * largest.get("h", 0)
    coverage = min(face_area / image_area, 1.0)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sharpness = min(cv2.Laplacian(gray, cv2.CV_64F).var() / 500.0, 1.0)

    return round(float(coverage * 0.4 + sharpness * 0.6), 3)

def extract_faces_safe(img: np.ndarray) -> list:
    try:
        faces = DeepFace.extract_faces(
            img_path=img,
            detector_backend=FACE_DETECTOR,
            enforce_detection=False,
            align=True
        )
        valid_faces = [f for f in faces if f.get("confidence", 0) > 0.4]
        return valid_faces
    except Exception as err:
        logger.warning(f"Face extraction error: {err}")
        return []

def generate_embedding(img: np.ndarray) -> list:
    results = DeepFace.represent(
        img_path=img,
        model_name=FACE_MODEL,
        detector_backend=FACE_DETECTOR,
        enforce_detection=False,
        align=True
    )
    if not results or "embedding" not in results[0]:
        raise HTTPException(
            status_code=400,
            detail="Failed to generate face embedding. Please provide a clearer selfie."
        )
    return results[0]["embedding"]

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model": FACE_MODEL,
        "detector": FACE_DETECTOR,
        "threshold": THRESHOLD,
        "timestamp": time.time()
    }

@app.post("/enroll", response_model=EnrollResponse, dependencies=[Depends(verify_internal_key)])
async def enroll_face(request: EnrollRequest):
    img = decode_image(request.image_base64)
    faces = extract_faces_safe(img)

    if len(faces) == 0:
        raise HTTPException(
            status_code=400,
            detail="No face detected. Please ensure your face is well-lit and centered."
        )
    if len(faces) > 1:
        raise HTTPException(
            status_code=400,
            detail=f"{len(faces)} faces detected. Only one person may be in the frame."
        )

    face_areas = [{"w": f["facial_area"]["w"], "h": f["facial_area"]["h"]} for f in faces]
    quality = compute_quality_score(img, face_areas)

    embedding = generate_embedding(img)

    return EnrollResponse(
        embedding=embedding,
        model=FACE_MODEL,
        embedding_dimension=len(embedding),
        face_count=len(faces),
        quality_score=quality
    )

@app.post("/verify", response_model=VerifyResponse, dependencies=[Depends(verify_internal_key)])
async def verify_face(request: VerifyRequest):
    img = decode_image(request.image_base64)
    faces = extract_faces_safe(img)

    face_areas = [{"w": f["facial_area"]["w"], "h": f["facial_area"]["h"]} for f in faces]
    quality = compute_quality_score(img, face_areas)

    if len(faces) == 0:
        return VerifyResponse(
            matched=False,
            distance=1.0,
            threshold=THRESHOLD,
            model=FACE_MODEL,
            face_count=0,
            quality_score=quality,
            liveness_result="not_checked"
        )

    if len(faces) != 1:
        return VerifyResponse(
            matched=False,
            distance=1.0,
            threshold=THRESHOLD,
            model=FACE_MODEL,
            face_count=len(faces),
            quality_score=quality,
            liveness_result="not_checked"
        )

    live_embedding = np.array(generate_embedding(img), dtype=np.float64)
    enrolled_embedding = np.array(request.enrolled_embedding, dtype=np.float64)

    norm_live = np.linalg.norm(live_embedding)
    norm_enrolled = np.linalg.norm(enrolled_embedding)

    if norm_live == 0 or norm_enrolled == 0:
        distance = 1.0
    else:
        cosine_similarity = np.dot(live_embedding, enrolled_embedding) / (norm_live * norm_enrolled)
        distance = round(float(1.0 - cosine_similarity), 6)

    matched = bool(distance < THRESHOLD)

    return VerifyResponse(
        matched=matched,
        distance=distance,
        threshold=THRESHOLD,
        model=FACE_MODEL,
        face_count=len(faces),
        quality_score=quality,
        liveness_result="not_checked"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5002)
