import sessionService from "../services/sessionService.js";

/**
 * Non-disruptive Session Validator Middleware
 * 
 * Verifies that the active token's session ID (sid) has not been revoked.
 * Backwards compatible: tokens issued without a 'sid' pass through cleanly.
 */
export const validateActiveSession = async (req, res, next) => {
  // If user is not authenticated yet or has no session ID (legacy token), allow through safely
  if (!req.user || !req.user.sid) {
    return next();
  }

  try {
    const result = await sessionService.validateSession(req.user.sid);

    if (!result.valid) {
      if (result.code === "SESSION_REVOKED") {
        return res.status(401).json({
          error: "Session has been revoked. Please log in again.",
          code: "SESSION_REVOKED"
        });
      }

      if (result.code === "SESSION_EXPIRED") {
        return res.status(401).json({
          error: "Session has expired. Please log in again.",
          code: "SESSION_EXPIRED"
        });
      }
    }

    // Attach active session data to request
    if (result.session) {
      req.session = result.session;
    }

    next();
  } catch (err) {
    // Fail-open on unexpected validation errors to preserve zero downtime
    console.error("Session validation error (fail-open):", err);
    next();
  }
};

export default validateActiveSession;
