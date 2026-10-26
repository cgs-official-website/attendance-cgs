/**
 * Liveness & Verification Session Service
 * =======================================
 * Manages single-use verification session tokens and active liveness integration.
 *
 * Notice on Liveness & Anti-Spoofing:
 *  - 2D deep learning face representations (ArcFace/DeepFace) verify identity.
 *  - They do NOT detect presentation attacks (e.g. video replay, printed photos).
 *  - If an external active liveness provider (e.g., AWS Rekognition Face Liveness)
 *    is not configured, the liveness_result is reported as "not_checked".
 */

import crypto from "crypto";

export function generateVerificationSessionToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export default {
  generateVerificationSessionToken,
  hashToken
};
