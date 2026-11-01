const VerificationApplication = require('../models/VerificationApplication');
const VerificationPayment = require('../models/VerificationPayment');
const VerificationRecommendation = require('../models/VerificationRecommendation');
const UserDocument = require('../models/UserDocument');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceListing = require('../models/ServiceListing');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');
const gateways = require('./payments');
const settings = require('./settingsService');
const documentService = require('./documentService');
const notifications = require('./notificationService');
const audit = require('./auditService');
const { ROLES, isSuperAdmin } = require('../utils/roles');

const idOf = (v) => String(v?._id ?? v);
const NOT_FOUND = () => new AppError(404, 'Verification application not found', 'APPLICATION_NOT_FOUND');
const PAID = ['confirmed', 'waived']; // payment states that allow review
const OPEN = ['pending_payment', 'payment_confirmed', 'under_review', 'more_info_required', 'recommended'];
const money = (n, c = 'RWF') => `${Number(n).toLocaleString('en-US')} ${c}`;
const actorRole = (user) => (isSuperAdmin(user) ? 'super_admin' : user.roles.includes(ROLES.FINANCE) && !user.roles.includes(ROLES.ADMIN) ? 'finance' : 'admin');

const entry = (user, role, action, from, to, note) => ({ at: new Date(), by: user?._id, role, action, from, to, note: note ? String(note).slice(0, 600) : undefined });

/** Compare-and-set a status change: matches nothing (and we say so) if anyone moved the application meanwhile. */
async function move(app, from, set, historyEntry) {
  const updated = await VerificationApplication.findOneAndUpdate(
    { _id: app._id, status: { $in: [].concat(from) } },
    { $set: set, $push: { history: historyEntry } },
    { new: true },
  );
  if (!updated) throw new AppError(409, 'This application just changed. Reload and try again.', 'APPLICATION_CHANGED');
  return updated;
}

/** Keeps the provider's profile in step with the application: status, the administrator's note, and (when answering) their reply. */
function profileStatus(app, status, note, extra = {}) {
  const set = { verificationStatus: status, ...extra };
  const unset = {};
  if (note) set.verificationNote = note; else unset.verificationNote = '';
  if (!('verificationResponse' in extra)) unset.verificationResponse = ''; // a new decision closes the previous exchange
  return ProviderProfile.updateOne({ _id: app.provider }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
}

const ratingSnapshot = async (providerId) => {
  const p = await ProviderProfile.findById(providerId).select('ratingAvg ratingCount completedJobs');
  return { average: p?.ratingAvg ?? 0, count: p?.ratingCount ?? 0, completedJobs: p?.completedJobs ?? 0 };
};

const superAdminIds = async () => (await User.find({ roles: ROLES.SUPER_ADMIN, status: 'active' }).select('_id')).map((u) => u._id);
const tell = (user, title, body) => notifications.notify(user, { type: 'verification.updated', title, body, link: '/dashboard/provider/verification' });

// ---------------------------------------------------------------------------------------------
// JSON views. The applicant sees their own process; staff also see documents, ratings and the internal trail.
// ---------------------------------------------------------------------------------------------
const paymentJSON = (p) => p && ({ id: String(p._id), method: p.method, gateway: p.gateway, amount: p.amount, currency: p.currency, status: p.status, gatewayReference: p.gatewayReference, instructions: p.status === 'pending' ? p.instructions : undefined, confirmedAt: p.confirmedAt, failureReason: p.failureReason, createdAt: p.createdAt });

function toApplicantJSON(app, payment) {
  const lastAsk = app.infoRequests[app.infoRequests.length - 1];
  return {
    id: String(app._id), status: app.status, paymentStatus: app.paymentStatus, fee: app.fee, active: app.active,
    question: app.status === 'more_info_required' && lastAsk && !lastAsk.respondedAt ? lastAsk.message : undefined,
    decision: app.decision?.outcome ? { outcome: app.decision.outcome, reason: app.decision.reason, at: app.decision.at } : undefined,
    payment: paymentJSON(payment),
    history: app.history.filter((h) => h.action !== 'recommended').map((h) => ({ at: h.at, action: h.action, to: h.to, note: h.role === 'applicant' || ['info_requested', 'rejected', 'approved'].includes(h.action) ? h.note : undefined })),
    createdAt: app.createdAt, updatedAt: app.updatedAt,
  };
}

async function toStaffJSON(app, { detail = false } = {}) {
  const base = {
    id: String(app._id), status: app.status, paymentStatus: app.paymentStatus, fee: app.fee, active: app.active,
    provider: { id: idOf(app.provider), displayName: app.provider?.displayName, providerType: app.provider?.providerType, ratingAvg: app.provider?.ratingAvg, ratingCount: app.provider?.ratingCount, completedJobs: app.provider?.completedJobs },
    applicant: { name: app.user?.fullName, email: app.user?.email },
    recommendation: app.recommendation?.by ? { note: app.recommendation.note, at: app.recommendation.at, ratings: app.recommendation.ratings } : undefined,
    decision: app.decision?.outcome ? { outcome: app.decision.outcome, byRole: app.decision.byRole, reason: app.decision.reason, at: app.decision.at } : undefined,
    createdAt: app.createdAt, updatedAt: app.updatedAt,
  };
  if (!detail) return base;
  const [docs, payments, openRec] = await Promise.all([
    UserDocument.find({ _id: { $in: app.documents } }),
    VerificationPayment.find({ application: app._id }).sort({ createdAt: -1 }),
    VerificationRecommendation.findOne({ provider: idOf(app.provider), status: 'open' }),
  ]);
  return {
    ...base,
    documents: docs.map(documentService.toJSON),
    payments: payments.map(paymentJSON),
    infoRequests: app.infoRequests.map((r) => ({ message: r.message, at: r.at, response: r.response, respondedAt: r.respondedAt })),
    history: app.history.map((h) => ({ at: h.at, role: h.role, action: h.action, from: h.from, to: h.to, note: h.note })),
    ratingsNow: await ratingSnapshot(idOf(app.provider)),
    adminRecommendationOpen: openRec ? { note: openRec.note, ratings: openRec.ratings } : undefined,
  };
}

const withRefs = (q) => q.populate('provider', 'displayName providerType ratingAvg ratingCount completedJobs').populate('user', 'fullName email');

// ---------------------------------------------------------------------------------------------
// Applicant
// ---------------------------------------------------------------------------------------------
async function ownProfile(user) {
  const profile = await ProviderProfile.findOne({ user: user._id });
  if (!profile) throw new AppError(404, 'Create your provider profile first', 'PROFILE_REQUIRED');
  return profile;
}

async function getMine(user) {
  const profile = await ownProfile(user);
  const app = await VerificationApplication.findOne({ provider: profile._id }).sort({ createdAt: -1 });
  const payment = app ? await VerificationPayment.findOne({ application: app._id }).sort({ createdAt: -1 }) : null;
  const fee = await settings.getVerificationFee();
  const docs = await documentService.status(user);
  return {
    verificationStatus: profile.verificationStatus,
    fee: fee ? { amount: fee.amount, currency: fee.currency, instructions: fee.instructions, version: fee.version } : null,
    application: app ? toApplicantJSON(app, payment) : null,
    documents: docs.requirements.provide ?? null,
    paymentMethods: { methods: VerificationPayment.METHODS, gateways: gateways.options() },
  };
}

async function apply(user, ctx) {
  const profile = await ownProfile(user);
  if (profile.verificationStatus === 'verified') throw new AppError(409, 'Your profile is already verified', 'ALREADY_VERIFIED');
  if (await VerificationApplication.exists({ provider: profile._id, active: true })) throw new AppError(409, 'You already have a verification request in progress', 'ALREADY_PENDING');

  const missing = [];
  if (!profile.bio || profile.bio.length < 20) missing.push({ field: 'bio', message: 'Add a bio of at least 20 characters' });
  if (!profile.categories.length) missing.push({ field: 'categories', message: 'Choose at least one category' });
  if (!profile.location?.district) missing.push({ field: 'location.district', message: 'Set your district' });
  if (missing.length) throw new AppError(400, 'Complete your profile before requesting verification', 'PROFILE_INCOMPLETE', missing);

  const required = await documentService.assertComplete(user, 'provide');
  const fee = await settings.getVerificationFee();
  if (!fee) throw new AppError(409, 'The verification fee has not been published yet. Please try again later.', 'FEE_NOT_PUBLISHED');
  const docs = await UserDocument.find({ owner: user._id, status: 'active', kind: { $in: required } }).select('_id');

  const free = fee.amount === 0;
  let app;
  try {
    app = await VerificationApplication.create({
      provider: profile._id, user: user._id, fee: { amount: fee.amount, currency: fee.currency, version: fee.version }, documents: docs.map((d) => d._id),
      status: free ? 'payment_confirmed' : 'pending_payment', paymentStatus: free ? 'waived' : 'unpaid',
      history: [entry(user, 'applicant', 'applied', undefined, free ? 'payment_confirmed' : 'pending_payment', free ? 'No fee is currently charged' : `Fee shown: ${money(fee.amount, fee.currency)}`)],
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'You already have a verification request in progress', 'ALREADY_PENDING');
    throw err;
  }
  await profileStatus(app, 'pending');
  await audit.record({ actor: user._id, action: 'verification.applied', entityType: 'VerificationApplication', entityId: app._id, metadata: { fee: app.fee }, ctx });
  return toApplicantJSON(app, null);
}

/** The applicant picks how to pay. The amount comes from the fee they were shown, never from the request. */
async function startPayment(user, { method, payerPhone, gateway }, ctx) {
  const profile = await ownProfile(user);
  const app = await VerificationApplication.findOne({ provider: profile._id, active: true });
  if (!app) throw new AppError(404, 'Apply for verification first', 'APPLICATION_NOT_FOUND');
  if (app.status !== 'pending_payment') throw new AppError(409, app.paymentStatus === 'confirmed' ? 'This fee is already paid' : 'No payment is due for this application', 'PAYMENT_NOT_DUE');

  const gatewayName = gateway || gateways.defaultGateway();
  const provider = gateways.getProvider(gatewayName); // 400 if that gateway is not enabled
  const fee = await settings.getVerificationFee();

  let payment = await VerificationPayment.findOne({ application: app._id, active: true });
  if (payment) {
    if (payment.status === 'succeeded') throw new AppError(409, 'This fee is already paid', 'ALREADY_PAID');
    payment.method = method; // the applicant may still change how they will pay
    payment.payerPhone = payerPhone || undefined;
    await payment.save();
    return paymentJSON(payment);
  }
  try {
    payment = await VerificationPayment.create({ application: app._id, user: user._id, method, gateway: gatewayName, amount: app.fee.amount, currency: app.fee.currency, payerPhone: payerPhone || undefined });
  } catch (err) {
    if (err.code === 11000) return paymentJSON(await VerificationPayment.findOne({ application: app._id, active: true }));
    throw err;
  }
  try {
    const result = await provider.createCheckout(payment);
    payment.gatewayReference = result.reference;
    payment.instructions = (fee?.instructions || result.instructions || '').slice(0, 800);
    await payment.save();
  } catch (err) {
    await VerificationPayment.updateOne({ _id: payment._id }, { $set: { status: 'cancelled', active: false, failureReason: 'The payment method could not be started' } });
    logger.error({ err, gateway: gatewayName }, 'Verification payment checkout failed');
    throw new AppError(502, 'The payment method could not be started. Please try again.', 'PAYMENT_GATEWAY_ERROR');
  }
  await VerificationApplication.updateOne({ _id: app._id }, { $set: { paymentStatus: 'pending' }, $push: { history: entry(user, 'applicant', 'payment_started', undefined, undefined, method) } });
  await audit.record({ actor: user._id, action: 'verification.payment_started', entityType: 'VerificationPayment', entityId: payment._id, metadata: { method, gateway: gatewayName, amount: payment.amount }, ctx });
  return paymentJSON(payment);
}

async function cancelPayment(user) {
  const profile = await ownProfile(user);
  const app = await VerificationApplication.findOne({ provider: profile._id, active: true });
  const payment = app && (await VerificationPayment.findOneAndUpdate({ application: app._id, status: 'pending' }, { $set: { status: 'cancelled', active: false } }, { new: true }));
  if (!payment) throw new AppError(409, 'There is no pending payment to cancel', 'INVALID_STATUS_TRANSITION');
  await VerificationApplication.updateOne({ _id: app._id, paymentStatus: 'pending' }, { $set: { paymentStatus: 'unpaid' } });
  return paymentJSON(payment);
}

/** The applicant answers an administrator's question; the application goes back to review. */
async function respond(user, { message }) {
  const profile = await ownProfile(user);
  const app = await VerificationApplication.findOne({ provider: profile._id, active: true });
  if (!app || app.status !== 'more_info_required') throw new AppError(409, 'There is no open question to answer', 'INVALID_TRANSITION');
  const idx = app.infoRequests.length - 1;
  const required = await documentService.requiredKinds(user, 'provide');
  const docs = await UserDocument.find({ owner: user._id, status: 'active', kind: { $in: required } }).select('_id');
  const updated = await VerificationApplication.findOneAndUpdate(
    { _id: app._id, status: 'more_info_required' },
    { $set: { status: 'under_review', [`infoRequests.${idx}.response`]: message, [`infoRequests.${idx}.respondedAt`]: new Date(), documents: docs.map((d) => d._id) }, $push: { history: entry(user, 'applicant', 'responded', 'more_info_required', 'under_review', message) } },
    { new: true },
  );
  if (!updated) throw new AppError(409, 'This application just changed. Reload and try again.', 'APPLICATION_CHANGED');
  await profileStatus(app, 'pending', profile.verificationNote, { verificationResponse: message }); // the question stays beside the reply
  return toApplicantJSON(updated, null);
}

// ---------------------------------------------------------------------------------------------
// Payment confirmation: only ever from the server (signed webhook with a matching amount, or staff who saw the money)
// ---------------------------------------------------------------------------------------------
async function applyPaymentSuccess(payment, { source, by, reference, note }) {
  const set = { status: 'succeeded', active: true, confirmedAt: new Date() };
  if (by) set.confirmedBy = by._id;
  if (reference) set.gatewayReference = reference;
  if (note) set.note = note;
  const updated = await VerificationPayment.findOneAndUpdate({ _id: payment._id, status: { $in: ['pending', 'failed', 'cancelled'] } }, { $set: set, $unset: { failureReason: '' } }, { new: true });
  if (!updated) return 'no_change';
  const app = await VerificationApplication.findOneAndUpdate(
    { _id: payment.application, paymentStatus: { $ne: 'confirmed' } },
    { $set: { paymentStatus: 'confirmed' }, $push: { history: entry(by, by ? actorRole(by) : 'system', 'payment_confirmed', undefined, undefined, `${source}${reference ? `, reference ${reference}` : ''}`) } },
    { new: true },
  );
  if (app && app.status === 'pending_payment') {
    await VerificationApplication.updateOne({ _id: app._id, status: 'pending_payment' }, { $set: { status: 'payment_confirmed' }, $push: { history: entry(undefined, 'system', 'status_changed', 'pending_payment', 'payment_confirmed') } });
  }
  await audit.record({ actor: by?._id, action: 'verification.payment_confirmed', entityType: 'VerificationPayment', entityId: payment._id, metadata: { source, amount: payment.amount, currency: payment.currency }, strict: Boolean(by) });
  await tell(payment.user, 'Payment confirmed', 'Your verification fee was received. Your documents will now be reviewed. Payment alone does not verify you.');
  return 'succeeded';
}

/** Staff saw the money arrive (mobile money, bank, card receipt) and enter the transaction reference. */
async function confirmManual(staff, id, { reference, note }, ctx) {
  const payment = await VerificationPayment.findById(id);
  if (!payment) throw new AppError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  if (payment.gateway !== 'manual') throw new AppError(409, 'This payment is confirmed automatically by the payment gateway', 'GATEWAY_PAYMENT');
  if (payment.status === 'succeeded') throw new AppError(409, 'This payment is already confirmed', 'ALREADY_PAID');
  if (payment.status !== 'pending') throw new AppError(409, 'Only a pending payment can be confirmed', 'INVALID_STATUS_TRANSITION');
  let outcome;
  try {
    outcome = await applyPaymentSuccess(payment, { source: 'confirmed by staff', by: staff, reference, note });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'That reference has already been used for another payment', 'REFERENCE_USED');
    throw err;
  }
  if (outcome === 'no_change') throw new AppError(409, 'This payment just changed. Reload and try again.', 'PAYMENT_CHANGED');
  return paymentJSON(await VerificationPayment.findById(id));
}

/** Called by paymentService for a verified, de-duplicated gateway event. Returns null when the reference is not ours. */
async function applyGatewayEvent(gatewayName, event) {
  const payment = await VerificationPayment.findOne({ gateway: gatewayName, gatewayReference: event.reference });
  if (!payment) return null;
  if (event.amount !== payment.amount || event.currency !== payment.currency) {
    await audit.record({ action: 'verification.payment_amount_mismatch', entityType: 'VerificationPayment', entityId: payment._id, metadata: { gateway: gatewayName, expected: payment.amount, received: event.amount } });
    return 'amount_mismatch';
  }
  if (event.type === 'payment.succeeded') return applyPaymentSuccess(payment, { source: `${gatewayName} gateway` });
  if (event.type === 'payment.failed') {
    const failed = await VerificationPayment.findOneAndUpdate({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed', active: false, failureReason: String(event.reason || 'The payment was not completed').slice(0, 300) } }, { new: true });
    if (!failed) return 'no_change';
    await VerificationApplication.updateOne({ _id: payment.application, paymentStatus: 'pending' }, { $set: { paymentStatus: 'failed' } });
    await tell(payment.user, 'Payment failed', 'Your verification payment did not go through. You can try again.');
    return 'failed';
  }
  return 'unsupported_event';
}

/** Development only: asks the fake gateway to send a signed webhook through the real pipeline. */
async function simulateSandbox(user, outcome) {
  if (!gateways.sandboxEnabled()) throw new AppError(404, 'Not found', 'NOT_FOUND');
  const profile = await ownProfile(user);
  const app = await VerificationApplication.findOne({ provider: profile._id, active: true });
  const payment = app && (await VerificationPayment.findOne({ application: app._id, gateway: 'sandbox', active: true }));
  if (!payment) throw new AppError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  const signed = gateways.getProvider('sandbox').buildSignedEvent({ reference: payment.gatewayReference, amount: payment.amount, type: outcome === 'fail' ? 'payment.failed' : 'payment.succeeded', reason: outcome === 'fail' ? 'Simulated failure' : undefined });
  await require('./paymentService').handleWebhook('sandbox', signed); // lazy: paymentService requires this module
  return getMine(user);
}

// ---------------------------------------------------------------------------------------------
// Staff review. Everything below needs a CONFIRMED (or waived) payment first.
// ---------------------------------------------------------------------------------------------
async function loadForReview(id, { needPaid = true } = {}) {
  const app = await VerificationApplication.findById(id);
  if (!app) throw NOT_FOUND();
  if (needPaid && !PAID.includes(app.paymentStatus)) throw new AppError(409, 'Payment must be confirmed before this application can be reviewed', 'PAYMENT_NOT_CONFIRMED');
  return app;
}

const reasonRequired = (reason) => { if (!reason || reason.trim().length < 5) throw new AppError(400, 'Give a reason (at least 5 characters)', 'REASON_REQUIRED'); };

async function startReview(admin, id, _body, ctx) {
  const app = await loadForReview(id);
  const updated = await move(app, 'payment_confirmed', { status: 'under_review' }, entry(admin, actorRole(admin), 'review_started', 'payment_confirmed', 'under_review'));
  await audit.record({ actor: admin._id, action: 'verification.review_started', entityType: 'VerificationApplication', entityId: app._id, ctx, strict: true });
  await tell(app.user, 'Your verification is under review', 'An administrator is now checking your documents.');
  return withRefs(VerificationApplication.findById(updated._id)).then((a) => toStaffJSON(a, { detail: true }));
}

async function requestInfo(admin, id, { message }, ctx) {
  const app = await loadForReview(id);
  const updated = await move(app, ['payment_confirmed', 'under_review'], { status: 'more_info_required' }, entry(admin, actorRole(admin), 'info_requested', app.status, 'more_info_required', message));
  await VerificationApplication.updateOne({ _id: app._id }, { $push: { infoRequests: { by: admin._id, message, at: new Date() } } });
  await profileStatus(app, 'needs_info', message);
  await audit.record({ actor: admin._id, action: 'verification.info_requested', entityType: 'VerificationApplication', entityId: app._id, metadata: { message }, ctx, strict: true });
  await tell(app.user, 'We need more information', message.slice(0, 380));
  return toStaffJSON(await withRefs(VerificationApplication.findById(updated._id)), { detail: true });
}

/** An administrator recommends approval, with the ratings and job history as evidence. It never verifies the provider. */
async function recommend(admin, id, { note }, ctx) {
  const app = await loadForReview(id);
  const ratings = await ratingSnapshot(app.provider);
  const updated = await move(app, 'under_review', { status: 'recommended', recommendation: { by: admin._id, note, at: new Date(), ratings } }, entry(admin, actorRole(admin), 'recommended', 'under_review', 'recommended', note));
  await VerificationRecommendation.updateOne({ provider: app.provider, status: 'open' }, { $set: { status: 'actioned', resolvedBy: admin._id, resolvedAt: new Date(), resolutionNote: 'Recommended through the verification application' } });
  await audit.record({ actor: admin._id, action: 'verification.recommended', entityType: 'VerificationApplication', entityId: app._id, metadata: { note, ratings }, ctx, strict: true });
  await notifications.notifyMany(await superAdminIds(), { type: 'verification.recommendation', title: 'A provider is recommended for verification', body: note.slice(0, 380), link: `/dashboard/admin/verification/${app._id}` });
  await tell(app.user, 'Your application was passed to final review', 'An administrator reviewed your documents. The final decision is made by the super administrator.');
  return toStaffJSON(await withRefs(VerificationApplication.findById(updated._id)), { detail: true });
}

async function finishRejected(app, actor, reason, ctx, action) {
  const role = actorRole(actor);
  const updated = await move(app, OPEN.filter((s) => s !== 'pending_payment'), { status: 'rejected', active: false, decision: { outcome: 'rejected', by: actor._id, byRole: role, reason, at: new Date() } }, entry(actor, role, 'rejected', app.status, 'rejected', reason));
  await profileStatus(app, 'rejected', reason);
  await audit.record({ actor: actor._id, action, entityType: 'VerificationApplication', entityId: app._id, metadata: { reason }, ctx, strict: true });
  await tell(app.user, 'Your verification was not approved', reason.slice(0, 380));
  return toStaffJSON(await withRefs(VerificationApplication.findById(updated._id)), { detail: true });
}

/** An administrator rejects an application, giving a reason. The super administrator can reopen it. */
async function reject(admin, id, { reason }, ctx) {
  reasonRequired(reason);
  return finishRejected(await loadForReview(id), admin, reason, ctx, 'verification.rejected');
}

/** The final word. Only the super administrator, and approval only for an application an administrator recommended. */
async function decide(superAdmin, id, { outcome, reason }, ctx) {
  const app = await loadForReview(id);
  if (outcome === 'rejected') {
    reasonRequired(reason);
    return finishRejected(app, superAdmin, reason, ctx, 'verification.final_rejected');
  }
  if (app.status !== 'recommended') throw new AppError(409, 'An administrator must review and recommend this application before it can be approved', 'NOT_RECOMMENDED');
  const now = new Date();
  const updated = await move(app, 'recommended', { status: 'approved', active: false, decision: { outcome: 'approved', by: superAdmin._id, byRole: 'super_admin', reason: reason || undefined, at: now } }, entry(superAdmin, 'super_admin', 'approved', 'recommended', 'approved', reason));
  await profileStatus(app, 'verified', reason, { verifiedAt: now, verifiedBy: superAdmin._id });
  await audit.record({ actor: superAdmin._id, action: 'verification.approved', entityType: 'VerificationApplication', entityId: app._id, metadata: { reason }, ctx, strict: true });
  await tell(app.user, 'Your profile is verified', 'You now appear in search and can publish services.');
  return toStaffJSON(await withRefs(VerificationApplication.findById(updated._id)), { detail: true });
}

/** The super administrator can reopen an application an administrator rejected, if it was the provider's latest. */
async function reopen(superAdmin, id, { reason }, ctx) {
  reasonRequired(reason);
  const app = await loadForReview(id);
  if (app.status !== 'rejected' || app.decision?.byRole !== 'admin') throw new AppError(409, 'Only an application rejected by an administrator can be reopened', 'INVALID_TRANSITION');
  let updated;
  try {
    updated = await move(app, 'rejected', { status: 'under_review', active: true }, entry(superAdmin, 'super_admin', 'reopened', 'rejected', 'under_review', reason));
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'The provider already started a new application', 'ALREADY_PENDING');
    throw err;
  }
  await VerificationApplication.updateOne({ _id: app._id }, { $unset: { decision: '' } });
  await profileStatus(app, 'pending');
  await audit.record({ actor: superAdmin._id, action: 'verification.reopened', entityType: 'VerificationApplication', entityId: app._id, metadata: { reason }, ctx, strict: true });
  await tell(app.user, 'Your application was reopened', 'The super administrator asked for it to be reviewed again.');
  return toStaffJSON(await withRefs(VerificationApplication.findById(updated._id)), { detail: true });
}

/** Taking verification away from a provider who has it (super administrator). Their live listings are paused. */
async function revoke(superAdmin, profileId, { reason }, ctx) {
  reasonRequired(reason);
  const profile = await ProviderProfile.findById(profileId);
  if (!profile) throw new AppError(404, 'Provider not found', 'PROVIDER_NOT_FOUND');
  if (profile.verificationStatus !== 'verified') throw new AppError(409, 'This provider is not verified', 'INVALID_TRANSITION');
  await ProviderProfile.updateOne({ _id: profile._id }, { $set: { verificationStatus: 'unverified', verificationNote: reason }, $unset: { verifiedAt: '', verifiedBy: '' } });
  const paused = await ServiceListing.updateMany({ provider: profile._id, status: 'active' }, { $set: { status: 'paused' } });
  await audit.record({ actor: superAdmin._id, action: 'verification.revoked', entityType: 'ProviderProfile', entityId: profile._id, metadata: { reason, pausedListings: paused.modifiedCount }, ctx, strict: true });
  await tell(profile.user, 'Your verification was withdrawn', reason.slice(0, 380));
  return { id: String(profile._id), verificationStatus: 'unverified', pausedListings: paused.modifiedCount };
}

// ---- Staff lists ----
async function listForStaff({ page, limit, status, paymentStatus }) {
  const filter = { ...(status ? { status } : {}), ...(paymentStatus ? { paymentStatus } : {}) };
  const [docs, total] = await Promise.all([
    withRefs(VerificationApplication.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)),
    VerificationApplication.countDocuments(filter),
  ]);
  return { items: await Promise.all(docs.map((d) => toStaffJSON(d))), total };
}

async function getForStaff(id) {
  const app = await withRefs(VerificationApplication.findById(id));
  if (!app) throw NOT_FOUND();
  return toStaffJSON(app, { detail: true });
}

async function listPayments({ page, limit, status }) {
  const filter = status ? { status } : {};
  const [docs, total] = await Promise.all([
    VerificationPayment.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'fullName email').populate('application', 'status paymentStatus'),
    VerificationPayment.countDocuments(filter),
  ]);
  return { items: docs.map((p) => ({ ...paymentJSON(p), payerPhone: p.payerPhone, applicant: p.user?.fullName, applicationId: idOf(p.application), applicationStatus: p.application?.status })), total };
}

module.exports = { getMine, apply, startPayment, cancelPayment, respond, confirmManual, applyGatewayEvent, simulateSandbox, startReview, requestInfo, recommend, reject, decide, reopen, revoke, listForStaff, getForStaff, listPayments, ratingSnapshot, superAdminIds };
