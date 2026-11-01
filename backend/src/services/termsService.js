const TermsDocument = require('../models/TermsDocument');
const TermsAcceptance = require('../models/TermsAcceptance');
const AppError = require('../utils/AppError');
const audit = require('./auditService');
const defaults = require('./termsDefaults');

/** The current terms: the highest published version. The built-in first version is created the first time it is needed. */
async function current() {
  let doc = await TermsDocument.findOne().sort({ version: -1 });
  if (!doc) {
    try {
      doc = await TermsDocument.create({ version: 1, title: defaults.title, body: defaults.body, publishedAt: new Date() });
    } catch (err) {
      if (err.code !== 11000) throw err;
      doc = await TermsDocument.findOne().sort({ version: -1 }); // another request created it first
    }
  }
  return doc;
}

async function statusFor(user) {
  const terms = await current();
  const accepted = await TermsAcceptance.findOne({ user: user._id, termsVersion: terms.version });
  const latest = accepted ? null : await TermsAcceptance.findOne({ user: user._id }).sort({ termsVersion: -1 });
  return { terms: terms.toJSON(), accepted: Boolean(accepted), acceptedAt: accepted?.acceptedAt, previouslyAcceptedVersion: latest?.termsVersion };
}

/** Throws TERMS_NOT_ACCEPTED unless this user has accepted the CURRENT version. */
async function assertAccepted(user) {
  const terms = await current();
  if (!(await TermsAcceptance.exists({ user: user._id, termsVersion: terms.version }))) {
    throw new AppError(403, 'Please read and accept the Terms and Conditions first', 'TERMS_NOT_ACCEPTED', { version: terms.version });
  }
  return terms.version;
}

async function accept(user, version, ctx) {
  const terms = await current();
  if (version !== terms.version) throw new AppError(409, 'The terms were updated. Please read the latest version.', 'STALE_TERMS', { version: terms.version });
  try {
    await TermsAcceptance.create({ user: user._id, termsVersion: terms.version, acceptedAt: new Date(), ip: ctx?.ip, userAgent: ctx?.userAgent ? String(ctx.userAgent).slice(0, 300) : undefined });
    await audit.record({ actor: user._id, action: 'terms.accepted', entityType: 'TermsDocument', entityId: terms._id, metadata: { version: terms.version }, ctx });
  } catch (err) {
    if (err.code !== 11000) throw err; // already accepted: nothing new to record
  }
  return statusFor(user);
}

async function publish(admin, { title, body }, ctx) {
  const latest = await current();
  const doc = await TermsDocument.create({ version: latest.version + 1, title, body, publishedBy: admin._id, publishedAt: new Date() });
  await audit.record({ actor: admin._id, action: 'terms.published', entityType: 'TermsDocument', entityId: doc._id, metadata: { version: doc.version }, ctx, strict: true });
  return doc;
}

async function listVersions() {
  await current();
  const docs = await TermsDocument.find().sort({ version: -1 }).select('-body');
  const counts = await TermsAcceptance.aggregate([{ $group: { _id: '$termsVersion', n: { $sum: 1 } } }]);
  const byVersion = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  return docs.map((d) => ({ ...d.toJSON(), acceptedBy: byVersion[d.version] ?? 0 }));
}

module.exports = { current, statusFor, assertAccepted, accept, publish, listVersions };
