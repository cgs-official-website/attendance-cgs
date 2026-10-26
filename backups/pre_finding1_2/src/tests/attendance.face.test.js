/**
 * HRMS Face Verification — Automated Unit Tests
 * ==============================================
 * Uses Node.js built-in test runner (node:test).
 * Run with: node --test server/src/tests/attendance.face.test.js
 *
 * These are UNIT tests using service modules.
 * No real biometric employee data is used.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyFaceFailure,
  isValidEmbedding,
  evaluateFaceMatch,
  DEFAULT_SIMILARITY_THRESHOLD
} from "../services/faceVerificationPolicy.js";

import {
  validateEnrollmentPayload,
  canEnrollFace
} from "../services/faceEnrollmentValidation.js";

import {
  generateVerificationSessionToken,
  hashToken
} from "../services/livenessVerification.js";

import {
  FaceServiceUnavailableError
} from "../services/faceServiceClient.js";

function makeSyntheticEmbedding(dim = 512, seed = 1) {
  const raw = Array.from({ length: dim }, (_, i) => Math.sin(seed * (i + 1)));
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0));
  return raw.map(v => v / norm);
}

describe("classifyFaceFailure", () => {
  it("returns no_face when face_count === 0", () => {
    assert.equal(classifyFaceFailure({ face_count: 0 }), "no_face");
  });

  it("returns multiple_faces when face_count > 1", () => {
    assert.equal(classifyFaceFailure({ face_count: 3 }), "multiple_faces");
  });

  it("returns liveness_failed when liveness_result === 'failed'", () => {
    assert.equal(
      classifyFaceFailure({ face_count: 1, liveness_result: "failed" }),
      "liveness_failed"
    );
  });

  it("returns liveness_inconclusive when liveness_result === 'inconclusive'", () => {
    assert.equal(
      classifyFaceFailure({ face_count: 1, liveness_result: "inconclusive" }),
      "liveness_inconclusive"
    );
  });

  it("returns face_mismatch as default for a single unmatched face", () => {
    assert.equal(
      classifyFaceFailure({ face_count: 1, liveness_result: "not_checked" }),
      "face_mismatch"
    );
  });
});

describe("isValidEmbedding", () => {
  it("accepts valid float array of 512 dimensions", () => {
    assert.equal(isValidEmbedding(makeSyntheticEmbedding(512), 512), true);
  });

  it("accepts variable dimension array when expectedDim is not specified", () => {
    assert.equal(isValidEmbedding([0.1, 0.2, 0.9]), true);
  });

  it("rejects empty array", () => {
    assert.equal(isValidEmbedding([]), false);
  });

  it("rejects non-array values", () => {
    assert.equal(isValidEmbedding(null), false);
    assert.equal(isValidEmbedding("not-an-array"), false);
  });

  it("rejects arrays containing NaN or non-finite values", () => {
    assert.equal(isValidEmbedding([0.1, NaN, 0.3]), false);
    assert.equal(isValidEmbedding([0.1, Infinity, 0.3]), false);
  });
});

describe("evaluateFaceMatch", () => {
  it("accepts a matching face within threshold", () => {
    const result = evaluateFaceMatch({
      matched: true,
      distance: 0.25,
      face_count: 1
    }, 0.40);

    assert.equal(result.passed, true);
    assert.equal(result.failureCategory, null);
  });

  it("rejects a face exceeding threshold", () => {
    const result = evaluateFaceMatch({
      matched: false,
      distance: 0.55,
      face_count: 1
    }, 0.40);

    assert.equal(result.passed, false);
    assert.equal(result.failureCategory, "face_mismatch");
  });

  it("rejects when no face was detected", () => {
    const result = evaluateFaceMatch({
      matched: false,
      distance: 1.0,
      face_count: 0
    }, 0.40);

    assert.equal(result.passed, false);
    assert.equal(result.failureCategory, "no_face");
  });

  it("rejects when multiple faces are in frame", () => {
    const result = evaluateFaceMatch({
      matched: false,
      distance: 1.0,
      face_count: 2
    }, 0.40);

    assert.equal(result.passed, false);
    assert.equal(result.failureCategory, "multiple_faces");
  });

  it("rejects malformed response objects", () => {
    assert.equal(evaluateFaceMatch(null).passed, false);
    assert.equal(evaluateFaceMatch(undefined).passed, false);
  });
});

describe("faceEnrollmentValidation", () => {
  it("rejects enrollment when biometric consent is not given", () => {
    const res = validateEnrollmentPayload({
      imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      consentGiven: false
    });
    assert.equal(res.valid, false);
    assert.match(res.error, /consent/i);
  });

  it("rejects tiny / invalid payload", () => {
    const res = validateEnrollmentPayload({
      imageBase64: "tiny",
      consentGiven: true
    });
    assert.equal(res.valid, false);
  });

  it("allows admin direct enrollment", () => {
    const check = canEnrollFace({
      requesterRole: "admin",
      isSelf: false,
      isAuthorizedByAdmin: false
    });
    assert.equal(check.allowed, true);
  });

  it("allows self-enrollment only when authorized by admin", () => {
    const unauthorized = canEnrollFace({
      requesterRole: "employee",
      isSelf: true,
      isAuthorizedByAdmin: false
    });
    assert.equal(unauthorized.allowed, false);

    const authorized = canEnrollFace({
      requesterRole: "employee",
      isSelf: true,
      isAuthorizedByAdmin: true
    });
    assert.equal(authorized.allowed, true);
  });
});

describe("livenessVerification & Session Tokens", () => {
  it("generates 64-character raw hex token and matching SHA-256 hash", () => {
    const { rawToken, tokenHash } = generateVerificationSessionToken();
    assert.equal(typeof rawToken, "string");
    assert.equal(rawToken.length, 64);
    assert.equal(tokenHash, hashToken(rawToken));
  });

  it("generates cryptographically unique session tokens", () => {
    const s1 = generateVerificationSessionToken();
    const s2 = generateVerificationSessionToken();
    assert.notEqual(s1.rawToken, s2.rawToken);
    assert.notEqual(s1.tokenHash, s2.tokenHash);
  });
});

describe("faceServiceClient error handling", () => {
  it("FaceServiceUnavailableError has status 503 and category face_service_unavailable", () => {
    const err = new FaceServiceUnavailableError("Service is offline");
    assert.equal(err.status, 503);
    assert.equal(err.category, "face_service_unavailable");
  });
});
