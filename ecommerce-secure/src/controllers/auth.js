const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const config = require('../config');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;

    const existing = await db('users').where({ email: email.toLowerCase() }).first();
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [user] = await db('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        name,
      })
      .returning(['id', 'email', 'name', 'role', 'created_at']);

    const token = signToken(user);
    logger.info('User registered', { userId: user.id });

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await db('users').where({ email: email.toLowerCase() }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    logger.info('User logged in', { userId: user.id });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await db('users')
      .select('id', 'email', 'name', 'role', 'created_at')
      .where({ id: req.user.id })
      .first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
