/**
 * Face Verification Policy & Decision Logic
 * ==========================================
 * Centralizes thresholds, match evaluation, embedding sanity checks,
 * and failure classification.
 */

export const DEFAULT_SIMILARITY_THRESHOLD = parseFloat(
  process.env.FACE_SIMILARITY_THRESHOLD || "0.40"
);

export const EXPECTED_EMBEDDING_DIM = 512; // ArcFace standard dimension

/**
 * Validates that an embedding is an array of non-empty, finite numbers.
 */
export function isValidEmbedding(embedding, expectedDim = null) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return false;
  }
  if (expectedDim && embedding.length !== expectedDim) {
    return false;
  }
  for (let i = 0; i < embedding.length; i++) {
    const val = embedding[i];
    if (typeof val !== "number" || !Number.isFinite(val)) {
      return false;
    }
  }
  return true;
}

/**
 * Classifies a verification failure into standard audit categories.
 */
export function classifyFaceFailure(verifyResult) {
  if (!verifyResult) {
    return "face_mismatch";
  }

  const { face_count, liveness_result } = verifyResult;

  if (face_count === 0) {
    return "no_face";
  }
  if (face_count > 1) {
    return "multiple_faces";
  }
  if (liveness_result === "failed" || liveness_result === "spoof") {
    return "liveness_failed";
  }
  if (liveness_result === "inconclusive") {
    return "liveness_inconclusive";
  }
  return "face_mismatch";
}

/**
 * Evaluates whether a face verification result satisfies policy requirements.
 * Fail-closed: requires matched === true, finite distance <= threshold.
 */
export function evaluateFaceMatch(verifyResult, customThreshold = null) {
  const threshold = customThreshold !== null ? customThreshold : DEFAULT_SIMILARITY_THRESHOLD;

  if (!verifyResult || typeof verifyResult !== "object") {
    return {
      passed: false,
      reason: "Missing or malformed verification response",
      failureCategory: "face_mismatch"
    };
  }

  const { matched, distance, face_count } = verifyResult;

  if (face_count !== 1) {
    return {
      passed: false,
      reason: face_count === 0 ? "No face detected in selfie" : "Multiple faces detected in selfie",
      failureCategory: classifyFaceFailure(verifyResult)
    };
  }

  if (typeof distance !== "number" || !Number.isFinite(distance)) {
    return {
      passed: false,
      reason: "Invalid distance metric returned by face service",
      failureCategory: "face_mismatch"
    };
  }

  const passed = matched === true && distance <= threshold;

  return {
    passed,
    distance,
    threshold,
    reason: passed ? "Face verified successfully" : "Face does not match enrolled reference",
    failureCategory: passed ? null : classifyFaceFailure(verifyResult)
  };
}

export default {
  DEFAULT_SIMILARITY_THRESHOLD,
  EXPECTED_EMBEDDING_DIM,
  isValidEmbedding,
  classifyFaceFailure,
  evaluateFaceMatch
};
