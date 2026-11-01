const bcrypt = require('bcrypt');
const env = require('../config/env');
const logger = require('../config/logger');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { ROLES, USER_STATUS, isStaff } = require('../utils/roles');
const { signAccessToken, generateOpaqueToken, hashToken } = require('./tokenService');
const mailer = require('./emailService');
const audit = require('./auditService');

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

// Compared against when the email is unknown, so response time does not reveal which emails exist.
let dummyHashPromise;
const getDummyHash = () => {
  dummyHashPromise = dummyHashPromise || bcrypt.hash('timing-equaliser-password', env.BCRYPT_ROUNDS);
  return dummyHashPromise;
};

/**
 * A longer session is only for ordinary accounts. People who can verify providers, move money or create accounts are always
 * signed out after JWT_EXPIRES_IN, however they ask. Logging out (or changing the password) revokes any session at once.
 */
const sessionFor = (user, { remember = false } = {}) => {
  const long = remember && !isStaff(user);
  return { user, accessToken: signAccessToken(user, { remember: long }), tokenType: 'Bearer', expiresIn: long ? env.JWT_REMEMBER_EXPIRES_IN : env.JWT_EXPIRES_IN, remembered: long };
};

async function sendSafely(fn) {
  try {
    await fn();
  } catch (err) {
    logger.error({ err }, 'Failed to send email');
  }
}

const emailTaken = () => new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');

async function register({ fullName, email, phone, password, roles, remember }, ctx) {
  if (await User.exists({ email })) throw emailTaken();

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const verificationToken = generateOpaqueToken();

  let user;
  try {
    user = await User.create({
      fullName,
      email,
      phone,
      passwordHash,
      roles: roles && roles.length ? roles : [ROLES.CUSTOMER],
      emailVerificationTokenHash: hashToken(verificationToken),
      emailVerificationExpires: new Date(Date.now() + VERIFY_TTL_MS),
    });
  } catch (err) {
    if (err.code === 11000) throw emailTaken(); // lost a race with a concurrent sign-up
    throw err;
  }

  await sendSafely(() => mailer.sendVerificationEmail(user, verificationToken));
  await audit.record({ actor: user._id, action: 'auth.register', entityType: 'User', entityId: user._id, ctx });
  return sessionFor(user, { remember });
}

async function login({ email, password, remember }, ctx) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const hash = user ? user.passwordHash : await getDummyHash();
  const matches = await bcrypt.compare(password, hash);

  if (!user || !matches) {
    if (user) {
      await audit.record({ actor: user._id, action: 'auth.login_failed', entityType: 'User', entityId: user._id, ctx });
    }
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw new AppError(403, 'This account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });
  await audit.record({ actor: user._id, action: 'auth.login', entityType: 'User', entityId: user._id, ctx });
  return sessionFor(user, { remember });
}

/** Revokes every access token issued so far for this user (all devices). */
async function logout(user, ctx) {
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  await audit.record({ actor: user._id, action: 'auth.logout', entityType: 'User', entityId: user._id, ctx });
}

async function verifyEmail(token, ctx) {
  // Single atomic update => the token can only be used once.
  const user = await User.findOneAndUpdate(
    { emailVerificationTokenHash: hashToken(token), emailVerificationExpires: { $gt: new Date() } },
    {
      $set: { emailVerified: true },
      $unset: { emailVerificationTokenHash: '', emailVerificationExpires: '' },
    },
    { new: true },
  );
  if (!user) throw new AppError(400, 'Verification link is invalid or has expired', 'INVALID_TOKEN');
  await audit.record({ actor: user._id, action: 'auth.email_verified', entityType: 'User', entityId: user._id, ctx });
  return user;
}

async function resendVerification(user, ctx) {
  if (user.emailVerified) throw new AppError(409, 'Email is already verified', 'ALREADY_VERIFIED');
  const token = generateOpaqueToken();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerificationTokenHash: hashToken(token),
        emailVerificationExpires: new Date(Date.now() + VERIFY_TTL_MS),
      },
    },
  );
  await sendSafely(() => mailer.sendVerificationEmail(user, token));
  await audit.record({ actor: user._id, action: 'auth.verification_resent', entityType: 'User', entityId: user._id, ctx });
}

/** Always resolves the same way, whether or not the email exists (prevents account enumeration). */
async function forgotPassword({ email }, ctx) {
  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE });
  if (!user) return;
  const token = generateOpaqueToken();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpires: new Date(Date.now() + RESET_TTL_MS),
      },
    },
  );
  await sendSafely(() => mailer.sendPasswordResetEmail(user, token));
  await audit.record({ actor: user._id, action: 'auth.password_reset_requested', entityType: 'User', entityId: user._id, ctx });
}

async function resetPassword({ token, password }, ctx) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  // Atomic and single-use; also revokes every existing session via tokenVersion.
  const user = await User.findOneAndUpdate(
    {
      passwordResetTokenHash: hashToken(token),
      passwordResetExpires: { $gt: new Date() },
      status: USER_STATUS.ACTIVE,
    },
    {
      $set: { passwordHash, invitePending: false },
      $unset: { passwordResetTokenHash: '', passwordResetExpires: '' },
      $inc: { tokenVersion: 1 },
    },
    { new: true },
  );
  if (!user) throw new AppError(400, 'Reset link is invalid or has expired', 'INVALID_TOKEN');
  await audit.record({ actor: user._id, action: 'auth.password_reset', entityType: 'User', entityId: user._id, ctx });
}

/** Name and phone only. Roles, status and email can never be changed through this. */
async function updateProfile(user, { fullName, phone }, ctx) {
  const changed = [];
  if (fullName !== undefined && fullName !== user.fullName) { user.fullName = fullName; changed.push('fullName'); }
  if (phone !== undefined && (phone || undefined) !== user.phone) { user.phone = phone || undefined; changed.push('phone'); }
  if (changed.length) {
    await user.save();
    await audit.record({ actor: user._id, action: 'auth.profile_updated', entityType: 'User', entityId: user._id, metadata: { fields: changed }, ctx });
  }
  return user;
}

/**
 * Needs the current password (a stolen session alone cannot take over the account). Every other session is revoked, and the
 * caller gets a fresh token so this device stays signed in.
 */
async function changePassword(user, { currentPassword, newPassword }, ctx, { remember = false } = {}) {
  const withHash = await User.findById(user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, withHash.passwordHash))) {
    await audit.record({ actor: user._id, action: 'auth.password_change_failed', entityType: 'User', entityId: user._id, ctx });
    throw new AppError(400, 'Your current password is not correct', 'WRONG_PASSWORD');
  }
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  const updated = await User.findByIdAndUpdate(user._id, { $set: { passwordHash }, $inc: { tokenVersion: 1 } }, { new: true });
  await audit.record({ actor: user._id, action: 'auth.password_changed', entityType: 'User', entityId: user._id, ctx });
  return sessionFor(updated, { remember });
}

module.exports = {
  updateProfile,
  changePassword,
  register,
  login,
  logout,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
};
