const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const { USER_STATUS, isStaff, isSuperAdmin } = require('../utils/roles');
const { runInTransaction } = require('../utils/transaction');
const audit = require('./auditService');
const providerService = require('./providerService');

/**
 * Suspends or reinstates an account. A suspended user is blocked on every request straight away (the auth middleware checks
 * status each time) and their sessions are revoked. A suspended provider is also taken off public search: their
 * verification is withdrawn, which pauses their live listings. Reinstating does not restore verification; an administrator
 * verifies them again deliberately.
 */
async function setStatus(admin, userId, { status, reason }, ctx) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  if (String(user._id) === String(admin._id)) throw new AppError(409, 'You cannot change your own account status', 'CANNOT_MODERATE_SELF');
  if (isStaff(user) && !isSuperAdmin(admin)) throw new AppError(403, 'Staff accounts can only be suspended by a super admin', 'CANNOT_MODERATE_ADMIN');
  if (user.status === status) return user; // already in that state

  const suspending = status === USER_STATUS.SUSPENDED;
  await runInTransaction(async (session) => {
    const opts = session ? { session } : {};
    await User.updateOne(
      { _id: user._id },
      suspending
        ? { $set: { status, suspendedAt: new Date(), suspensionReason: reason }, $inc: { tokenVersion: 1 } }
        : { $set: { status }, $unset: { suspendedAt: '', suspensionReason: '' } },
      opts,
    );
    await audit.record({ actor: admin._id, action: suspending ? 'user.suspended' : 'user.reinstated', entityType: 'User', entityId: user._id, metadata: { reason }, ctx, strict: true, session });
  });

  if (suspending) {
    const profile = await ProviderProfile.findOne({ user: user._id, verificationStatus: 'verified' });
    if (profile) await providerService.setVerification(profile._id, { status: 'unverified', note: 'Account suspended' }, admin, ctx);
  }
  return User.findById(user._id);
}

module.exports = { setStatus };
