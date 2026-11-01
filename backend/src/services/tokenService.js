const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const ISSUER = 'imbehe';

/**
 * The token carries only the user id (sub) and the session version (tv).
 * Roles are deliberately NOT in the token: they are always read from the database.
 */
function signAccessToken(user, { remember = false } = {}) {
  // `rem` only records that this is a "keep me signed in" session, so a refreshed token (after a password change) lasts as long.
  return jwt.sign({ tv: user.tokenVersion, ...(remember ? { rem: true } : {}) }, env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: remember ? env.JWT_REMEMBER_EXPIRES_IN : env.JWT_EXPIRES_IN,
    issuer: ISSUER,
    algorithm: 'HS256',
  });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError(401, 'Your session has expired. Please log in again.', 'TOKEN_EXPIRED');
    }
    throw new AppError(401, 'Invalid authentication token', 'INVALID_TOKEN');
  }
}

/** Random one-time token for email verification / password reset (64 hex chars). */
const generateOpaqueToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { signAccessToken, verifyAccessToken, generateOpaqueToken, hashToken };
