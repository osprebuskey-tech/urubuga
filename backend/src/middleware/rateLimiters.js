const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const build = ({ limit, windowMs }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError(429, 'Too many requests. Please try again later.', 'RATE_LIMITED')),
  });

module.exports = {
  // Every /api request
  globalLimiter: build({ limit: env.GLOBAL_RATE_LIMIT_MAX, windowMs: 15 * 60 * 1000 }),
  // register, login, verify-email: guards against credential stuffing
  authLimiter: build({ limit: env.AUTH_RATE_LIMIT_MAX, windowMs: 15 * 60 * 1000 }),
  // forgot-password, reset-password, resend-verification: guards against email abuse
  sensitiveLimiter: build({ limit: env.SENSITIVE_RATE_LIMIT_MAX, windowMs: 60 * 60 * 1000 }),
  // public search / directory listings: the most expensive public queries
  searchLimiter: build({ limit: env.SEARCH_RATE_LIMIT_MAX, windowMs: 60 * 1000 }),
  // creating requests and quotations (they notify other people, so they are limited against spam)
  writeLimiter: build({ limit: env.WRITE_RATE_LIMIT_MAX, windowMs: 60 * 60 * 1000 }),
};
