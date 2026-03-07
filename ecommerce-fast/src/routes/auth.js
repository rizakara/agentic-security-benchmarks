const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const router = Router();

const registerSchema = {
  email: { required: true, type: 'email' },
  password: { required: true, min: 8 },
  name: { required: true, min: 1 },
};

const loginSchema = {
  email: { required: true, type: 'email' },
  password: { required: true },
};

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const existing = await db('users').where('email', email.toLowerCase()).first();
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        name,
      })
      .returning(['id', 'email', 'name', 'role', 'created_at']);

    const token = signToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await db('users').where('email', email.toLowerCase()).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db('users')
      .where('id', req.user.id)
      .select('id', 'email', 'name', 'role', 'created_at')
      .first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
