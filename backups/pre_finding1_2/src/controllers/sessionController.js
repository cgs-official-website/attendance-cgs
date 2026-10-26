import sessionService from "../services/sessionService.js";

/**
 * Controller for Device & Session Management
 */
export const getActiveSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    const currentSessionId = req.user.sid || req.session?.session_id || null;

    const sessions = await sessionService.getUserActiveSessions(userId, currentSessionId);
    res.json({ sessions });
  } catch (err) {
    console.error("Error retrieving active sessions:", err);
    res.status(500).json({ error: "Failed to retrieve active sessions." });
  }
};

export const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required." });
    }

    const userId = req.user.id;
    const success = await sessionService.revokeSession(sessionId, userId, userId, "Revoked by user");

    res.json({
      success,
      message: success ? "Session revoked successfully." : "Session not found or already revoked."
    });
  } catch (err) {
    console.error("Error revoking session:", err);
    res.status(500).json({ error: "Failed to revoke session." });
  }
};

export const revokeOtherSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    const currentSessionId = req.user.sid || null;

    const result = await sessionService.revokeAllOtherSessions(userId, currentSessionId);
    res.json({
      success: true,
      revokedCount: result.revokedCount,
      message: `Successfully logged out of ${result.revokedCount} other session(s).`
    });
  } catch (err) {
    console.error("Error revoking other sessions:", err);
    res.status(500).json({ error: "Failed to revoke other sessions." });
  }
};
