/**
 * Face Verification Service Client
 * =================================
 * Communicates with the internal Python FastAPI microservice (DeepFace / ArcFace).
 *
 * Security:
 *  - Sends internal secret key via X-Internal-Key header.
 *  - Communicates only over loopback (127.0.0.1) in local deployment.
 *  - Fail-closed: network or timeout errors throw structured errors to ensure
 *    attendance cannot be granted when biometrics are unreachable.
 */

function getFaceServiceUrl() {
  return process.env.FACE_SERVICE_URL || "http://127.0.0.1:5002";
}
const INTERNAL_KEY = process.env.FACE_SERVICE_INTERNAL_KEY || "hrms_face_internal_secret_2026";
const TIMEOUT_MS = Number(process.env.FACE_SERVICE_TIMEOUT_MS) || 15000;

class FaceServiceUnavailableError extends Error {
  constructor(message = "Biometric face verification service is unavailable.") {
    super(message);
    this.name = "FaceServiceUnavailableError";
    this.status = 503;
    this.category = "face_service_unavailable";
  }
}

class FaceServiceVerificationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "FaceServiceVerificationError";
    this.status = 400;
    this.details = details;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new FaceServiceUnavailableError("Face verification service timed out.");
    }
    if (err.code === "ECONNREFUSED" || err.cause?.code === "ECONNREFUSED") {
      throw new FaceServiceUnavailableError("Face verification service is offline.");
    }
    throw new FaceServiceUnavailableError(`Face service network error: ${err.message}`);
  }
}

export async function checkHealth() {
  try {
    const res = await fetchWithTimeout(`${getFaceServiceUrl()}/health`, { method: "GET" }, 3000);
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function enrollFace(imageBase64) {
  if (!imageBase64) {
    throw new FaceServiceVerificationError("Image data is required for enrollment.");
  }

  const res = await fetchWithTimeout(`${getFaceServiceUrl()}/enroll`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": INTERNAL_KEY
    },
    body: JSON.stringify({ image_base64: imageBase64 })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status >= 500) {
      throw new FaceServiceUnavailableError(
        data.detail || "Face enrollment service is unavailable."
      );
    }
    throw new FaceServiceVerificationError(
      data.detail || "Face enrollment failed in biometric service.",
      { status: res.status, data }
    );
  }

  return data;
}

export async function verifyFace({ enrolledEmbedding, imageBase64, livenessSessionId = null }) {
  if (!enrolledEmbedding || !Array.isArray(enrolledEmbedding)) {
    throw new FaceServiceVerificationError("Enrolled reference embedding is missing or invalid.");
  }
  if (!imageBase64) {
    throw new FaceServiceVerificationError("Selfie image is required for verification.");
  }

  const res = await fetchWithTimeout(`${getFaceServiceUrl()}/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": INTERNAL_KEY
    },
    body: JSON.stringify({
      enrolled_embedding: enrolledEmbedding,
      image_base64: imageBase64,
      liveness_session_id: livenessSessionId
    })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status >= 500) {
      throw new FaceServiceUnavailableError(
        data.detail || "Biometric face verification service is unavailable."
      );
    }
    throw new FaceServiceVerificationError(
      data.detail || "Biometric matching failed.",
      { status: res.status, data }
    );
  }

  return data;
}

export {
  FaceServiceUnavailableError,
  FaceServiceVerificationError
};

export default {
  checkHealth,
  enrollFace,
  verifyFace,
  FaceServiceUnavailableError,
  FaceServiceVerificationError
};
