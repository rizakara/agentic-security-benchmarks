import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, ACCESS_SECRET, { algorithms: ["HS256"] });
    req.user = { id: payload.sub, role: payload.role, tokenVersion: payload.ver };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function verifyTokenVersion(req, res, next) {
  const { rows } = await pool.query(
    "SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL",
    [req.user.id]
  );
  if (!rows.length || rows[0].token_version !== req.user.tokenVersion) {
    return res.status(401).json({ error: "Token has been revoked" });
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
