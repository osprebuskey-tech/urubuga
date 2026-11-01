const PlatformSetting = require('../models/PlatformSetting');
const env = require('../config/env');
const audit = require('./auditService');
const { runInTransaction } = require('../utils/transaction');

const COMMISSION_KEY = 'commission_bps';

const toJSON = (bps) => ({ commissionRateBps: bps, commissionRatePercent: bps / 100 });

/** The current platform commission in basis points. Falls back to DEFAULT_COMMISSION_BPS until an admin sets one. */
async function getCommissionBps() {
  const setting = await PlatformSetting.findOne({ key: COMMISSION_KEY });
  return setting ? setting.value : env.DEFAULT_COMMISSION_BPS;
}

async function getSettings() {
  return toJSON(await getCommissionBps());
}

/** Changing the rate only affects payments created afterwards (each payment stores its own snapshot). */
async function setCommissionBps(admin, rateBps, ctx) {
  const before = await getCommissionBps();
  await runInTransaction(async (session) => {
    const opts = session ? { session } : {};
    await PlatformSetting.updateOne({ key: COMMISSION_KEY }, { $set: { value: rateBps, updatedBy: admin._id } }, { upsert: true, ...opts });
    await audit.record({ actor: admin._id, action: 'settings.commission_changed', entityType: 'PlatformSetting', metadata: { from: before, to: rateBps }, ctx, strict: true, session });
  });
  return toJSON(rateBps);
}

// ---- Verification fee: set and published by the super administrator only ----
const FEE_KEY = 'verification_fee';

/** The published fee, or null until the super administrator has published one. */
async function getVerificationFee() {
  const s = await PlatformSetting.findOne({ key: FEE_KEY });
  return s ? s.value : null;
}

/** Each change publishes a new version. Applications keep the fee they saw when they applied. */
async function setVerificationFee(admin, { amount, currency, instructions }, ctx) {
  const before = await getVerificationFee();
  const value = { amount, currency, instructions, version: (before?.version ?? 0) + 1, publishedAt: new Date(), publishedBy: String(admin._id) };
  await runInTransaction(async (session) => {
    const opts = session ? { session } : {};
    await PlatformSetting.updateOne({ key: FEE_KEY }, { $set: { value, updatedBy: admin._id } }, { upsert: true, ...opts });
    await audit.record({ actor: admin._id, action: 'settings.verification_fee_changed', entityType: 'PlatformSetting', metadata: { from: before ? { amount: before.amount, currency: before.currency } : null, to: { amount, currency } }, ctx, strict: true, session });
  });
  return value;
}

module.exports = { getCommissionBps, getSettings, setCommissionBps, getVerificationFee, setVerificationFee };
