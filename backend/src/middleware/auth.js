const User = require('../models/User');
const AppError = require('../utils/AppError');
const { ROLES, USER_STATUS } = require('../utils/roles');
const { verifyAccessToken } = require('../services/tokenService');
const asyncHandler = require('./asyncHandler');

/** Validates the Bearer token and loads the CURRENT user (roles/status come from the DB, not the token). */
async function authenticate(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'Authentication required', 'UNAUTHENTICATED');
  }

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.tv) {
    throw new AppError(401, 'Invalid authentication token', 'INVALID_TOKEN');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw new AppError(403, 'This account has been suspended', 'ACCOUNT_SUSPENDED');
  }
  req.user = user;
  req.tokenRemember = Boolean(payload.rem);
}

const requireAuth = asyncHandler(async (req, res, next) => {
  await authenticate(req);
  next();
});

/** Anonymous visitors pass through; a token that is present but invalid is still rejected. */
const optionalAuth = asyncHandler(async (req, res, next) => {
  if (req.headers.authorization) await authenticate(req);
  next();
});

/** Must run after requireAuth. Allows the request if the user holds ANY of the listed roles. */
const requireRoles = (...asked) => {
  // A super admin can do everything an administrator can, so a route that admits admins admits them too.
  const allowed = asked.includes(ROLES.ADMIN) && !asked.includes(ROLES.SUPER_ADMIN) ? [...asked, ROLES.SUPER_ADMIN] : asked;
  const middleware = (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Authentication required', 'UNAUTHENTICATED'));
    if (!req.user.roles.some((r) => allowed.includes(r))) {
      return next(new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN'));
    }
    return next();
  };
  middleware.docs = { roles: allowed }; // read by src/docs/openapi.js to describe who may call a route
  return middleware;
};

/** For sensitive actions (listings, requests, payments...). */
const requireVerifiedEmail = (req, res, next) => {
  if (!req.user?.emailVerified) {
    return next(new AppError(403, 'Please verify your email address first', 'EMAIL_NOT_VERIFIED'));
  }
  return next();
};

// Metadata only (the API documentation is generated from the real route stack, so it cannot drift from the code).
requireAuth.docs = { auth: 'required' };
optionalAuth.docs = { auth: 'optional' };
requireVerifiedEmail.docs = { verifiedEmail: true };

module.exports = { requireAuth, optionalAuth, requireRoles, requireVerifiedEmail };
