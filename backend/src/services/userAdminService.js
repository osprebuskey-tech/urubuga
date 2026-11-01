const crypto = require('crypto');
const bcrypt = require('bcrypt');
const env = require('../config/env');
const logger = require('../config/logger');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { USER_STATUS } = require('../utils/roles');
const { generateOpaqueToken, hashToken } = require('./tokenService');
const mailer = require('./emailService');
const audit = require('./auditService');
const notifications = require('./notificationService');

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Nobody ever sees or sets another person's password. The new account gets an unguessable placeholder password and the person
 * receives a link (valid 72 hours) to choose their own. The same single-use token mechanism as "forgot password" is reused.
 */
async function issueInvite(user, invitedBy) {
  const token = generateOpaqueToken();
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordResetTokenHash: hashToken(token), passwordResetExpires: new Date(Date.now() + INVITE_TTL_MS) } },
  );
  try {
    await mailer.sendInviteEmail(user, token, invitedBy.fullName);
    return true;
  } catch (err) {
    logger.error({ err }, 'Failed to send invitation email');
    return false; // the account exists; the super admin can resend
  }
}

/** Super admin only (enforced by the route). Creates a user of any role, including administrators and payment follow-up staff. */
async function createUser(actor, { fullName, email, phone, roles }, ctx) {
  if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');

  const placeholder = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), env.BCRYPT_ROUNDS);
  const user = await User.create({ fullName, email, phone, passwordHash: placeholder, roles, emailVerified: true, invitePending: true });
  await audit.record({ actor: actor._id, action: 'user.created_by_admin', entityType: 'User', entityId: user._id, metadata: { roles }, ctx, strict: true });

  const inviteSent = await issueInvite(user, actor);
  return { user, inviteSent };
}

/** For someone who has not chosen a password yet: a fresh link (the old one stops working). */
async function resendInvite(actor, userId, ctx) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  if (user.status !== USER_STATUS.ACTIVE) throw new AppError(409, 'This account is suspended', 'ACCOUNT_SUSPENDED');
  if (!user.invitePending) throw new AppError(409, 'This person has already chosen a password. They can use "Forgot password" if they need a new one.', 'ALREADY_ACTIVE');

  const inviteSent = await issueInvite(user, actor);
  await audit.record({ actor: actor._id, action: 'user.invite_resent', entityType: 'User', entityId: user._id, ctx });
  return { user, inviteSent };
}

/**
 * Super admin only (enforced by the route). Marks an account as verified, or withdraws that. Nobody can verify their own account.
 * This is separate from provider verification (which has its own reviewed, paid flow) and from email confirmation.
 */
async function setAccountVerification(actor, userId, { verified, note }, ctx) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  if (String(user._id) === String(actor._id)) throw new AppError(409, 'You cannot verify or unverify your own account', 'SELF_VERIFICATION');
  if (user.status !== USER_STATUS.ACTIVE) throw new AppError(409, 'This account is suspended. Reinstate it first.', 'ACCOUNT_SUSPENDED');
  if (Boolean(user.accountVerified) === verified) throw new AppError(409, verified ? 'This account is already verified' : 'This account is not verified', 'NO_CHANGE');

  if (verified) {
    user.accountVerified = true;
    user.accountVerifiedAt = new Date();
    user.accountVerifiedBy = actor._id;
    user.accountVerificationNote = note || undefined;
  } else {
    user.accountVerified = false;
    user.accountVerifiedAt = undefined;
    user.accountVerifiedBy = undefined;
    user.accountVerificationNote = undefined;
  }
  await user.save();
  await audit.record({ actor: actor._id, action: verified ? 'user.verified' : 'user.unverified', entityType: 'User', entityId: user._id, metadata: note ? { note } : undefined, ctx, strict: true });
  await notifications.notify(user._id, {
    type: 'account.verification',
    title: verified ? 'Your account is verified' : 'Your account verification was withdrawn',
    body: verified ? 'The Imbehe team has verified your account.' : (note || '').slice(0, 380),
    link: '/dashboard/settings',
  });
  return user;
}

/** Super admin only. For someone who never received or cannot use the confirmation email. */
async function confirmEmail(actor, userId, ctx) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  if (user.emailVerified) throw new AppError(409, 'This email is already confirmed', 'NO_CHANGE');
  user.emailVerified = true;
  await user.save();
  await User.updateOne({ _id: user._id }, { $unset: { emailVerificationTokenHash: '', emailVerificationExpires: '' } });
  await audit.record({ actor: actor._id, action: 'user.email_confirmed_by_admin', entityType: 'User', entityId: user._id, ctx, strict: true });
  return user;
}

module.exports = { createUser, resendInvite, setAccountVerification, confirmEmail };
