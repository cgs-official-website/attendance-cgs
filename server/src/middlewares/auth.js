import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "hrms-super-secret-key-2026";

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
    req.user = user;
    next();
  });
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

export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
};
