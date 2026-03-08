import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import pool from "../config/db.js";
import { validate } from "../middleware/validate.js";
import { authenticate, verifyTokenVersion } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimiter.js";
import { registerSchema, loginSchema, refreshSchema } from "../schemas/auth.js";

const router = Router();
const SALT_ROUNDS = 12;
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES_SEC = 7 * 24 * 60 * 60; // 7 days

const authLimiter = rateLimit({ windowSec: 900, maxRequests: 15, prefix: "rl:auth" });

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, ver: user.token_version },
    ACCESS_SECRET,
    { algorithm: "HS256", expiresIn: ACCESS_EXPIRES }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// POST /auth/register
router.post("/register", authLimiter, validate(registerSchema), async (req, res) => {
  const { email, password } = req.body;

  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL",
    [email]
  );
  if (existing.rows.length) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     RETURNING id, email, role, token_version`,
    [email, passwordHash]
  );

  const user = rows[0];
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_EXPIRES_SEC} seconds')`,
    [user.id, hashToken(refreshToken)]
  );

  res.status(201).json({
    user: { id: user.id, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
});

// POST /auth/login
router.post("/login", authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(
    "SELECT id, email, role, password_hash, token_version FROM users WHERE email = $1 AND deleted_at IS NULL",
    [email]
  );
  if (!rows.length) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_EXPIRES_SEC} seconds')`,
    [user.id, hashToken(refreshToken)]
  );

  res.json({
    user: { id: user.id, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
});

// POST /auth/refresh  — refresh token rotation
router.post("/refresh", authLimiter, validate(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;
  const tokenHash = hashToken(refreshToken);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT rt.id, rt.user_id, rt.revoked, u.token_version, u.role, u.email
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id AND u.deleted_at IS NULL
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (!rows.length) {
      await client.query("COMMIT");
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const record = rows[0];

    // If token was already revoked, possible theft — revoke all tokens for user
    if (record.revoked) {
      await client.query(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1",
        [record.user_id]
      );
      await client.query(
        "UPDATE users SET token_version = token_version + 1 WHERE id = $1",
        [record.user_id]
      );
      await client.query("COMMIT");
      return res.status(401).json({ error: "Token reuse detected, all sessions revoked" });
    }

    // Revoke the old token
    await client.query(
      "UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1",
      [record.id]
    );

    // Issue new pair
    const newRefreshToken = generateRefreshToken();
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_EXPIRES_SEC} seconds')`,
      [record.user_id, hashToken(newRefreshToken)]
    );

    await client.query("COMMIT");

    const user = { id: record.user_id, role: record.role, token_version: record.token_version };
    const accessToken = generateAccessToken(user);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// POST /auth/logout
router.post("/logout", authenticate, verifyTokenVersion, async (req, res) => {
  await pool.query(
    "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE",
    [req.user.id]
  );
  await pool.query(
    "UPDATE users SET token_version = token_version + 1 WHERE id = $1",
    [req.user.id]
  );
  res.json({ message: "Logged out" });
});

export default router;
