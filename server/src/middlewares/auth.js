import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { validateActiveSession } from "./sessionValidator.js";

const JWT_SECRET = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    if (user.type === "mfa_pending" || user.pending) {
      return res.status(401).json({ error: "Access denied. MFA verification required." });
    }
    req.user = user;
    if (user.sid) {
      return validateActiveSession(req, res, next);
    }
    next();
  });
};

export const authenticateTokenOrExternalLink = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    return jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: "Invalid or expired token." });
      }
      req.user = user;
      next();
    });
  }

  const linkToken = req.headers["x-external-link-token"] || req.query.linkToken;
  if (linkToken) {
    try {
      const linkRes = await query("SELECT * FROM external_links WHERE link_token = $1 AND status != 'revoked'", [linkToken]);
      if (linkRes.rows.length > 0) {
        const link = linkRes.rows[0];
        req.externalLink = link;
        req.user = {
          id: `client_${link.id}`,
          name: link.client_name || "Client",
          email: link.client_email || "client@external.portal",
          role: "client",
          companyId: link.company_id,
          channelId: link.channel_id
        };
        return next();
      }
    } catch (e) {
      console.error("External link auth error:", e);
    }
  }

  return res.status(401).json({ error: "Access denied. Valid auth token or external link token required." });
};

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err && user.type !== "mfa_pending" && !user.pending) req.user = user;
      next();
    });
  } else {
    next();
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const role = req.user.role?.toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin" || role === "system admin";

  if (!isAdmin) {
    return res.status(403).json({ error: "Access forbidden. Admin role required." });
  }

  next();
};

export const requireManagerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const role = req.user.role?.toLowerCase();
  const isAllowed = role === "admin" || role === "superadmin" || role === "system admin" || role === "manager";

  if (!isAllowed) {
    return res.status(403).json({ error: "Access forbidden. Manager or Admin role required." });
  }

  next();
};

export const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const role = req.user.role?.toLowerCase();
  if (role !== "superadmin") {
    return res.status(403).json({ error: "Access forbidden. Superadmin role required." });
  }

  next();
};

export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
};

