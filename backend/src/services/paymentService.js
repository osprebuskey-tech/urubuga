const Payment = require('../models/Payment');
const PaymentEvent = require('../models/PaymentEvent');
const Booking = require('../models/Booking');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const logger = require('../config/logger');
const { canManagePayments } = require('../utils/roles');
const { splitGross, splitRefund } = require('../utils/money');
const { runInTransaction } = require('../utils/transaction');
const gateways = require('./payments');
const settings = require('./settingsService');
const notifications = require('./notificationService');
const verificationService = require('./verificationService');
const audit = require('./auditService');

const idOf = (v) => String(v?._id ?? v);
const PAYABLE_BOOKING = ['accepted', 'in_progress', 'completed'];
const notFound = () => new AppError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
const fmt = (n) => `${n.toLocaleString('en-US')} RWF`;

// ---------------------------------------------------------------------------------------------
// Money view. Gross value, commission, refunds and payouts are tracked separately and never netted
// into one number: "gross" is what customers paid, "netCommission" is the platform's revenue (before its own costs, so
// it is not profit), "providerNet" is what providers are owed.
// ---------------------------------------------------------------------------------------------
function financials(p) {
  const received = p.status === 'succeeded';
  const providerNet = received ? p.providerAmount - p.providerRefunded : 0;
  return {
    gross: p.amount,
    refunded: p.refundedAmount,
    netReceived: received ? p.amount - p.refundedAmount : 0,
    commissionRateBps: p.commissionRateBps,
    commission: p.commissionAmount,
    commissionRefunded: p.commissionRefunded,
    netCommission: received ? p.commissionAmount - p.commissionRefunded : 0,
    providerShare: p.providerAmount,
    providerRefunded: p.providerRefunded,
    providerNet,
    paidOut: p.paidOut,
    payoutDue: Math.max(providerNet - p.paidOut, 0),
    providerOwes: Math.max(p.paidOut - providerNet, 0), // only after a refund that came after a payout
  };
}

const roleOf = (p, user) => {
  if (idOf(p.customer) === String(user._id)) return 'customer';
  if (idOf(p.providerUser) === String(user._id)) return 'provider';
  return canManagePayments(user) ? 'admin' : null; // administrators and the payment follow-up role see the full money picture
};

/** Each viewer sees only the money facts that concern them: customers never see the commission split. */
function toPaymentJSON(p, role) {
  const f = financials(p);
  const base = {
    id: String(p._id),
    booking: idOf(p.booking),
    status: p.status,
    gateway: p.gateway,
    amount: p.amount,
    currency: p.currency,
    refundedAmount: p.refundedAmount,
    refunds: p.refunds.map((r) => ({ amount: r.amount, reason: r.reason, at: r.at })),
    gatewayReference: p.gatewayReference,
    instructions: p.status === 'pending' ? p.instructions : undefined,
    failureReason: p.failureReason,
    confirmedAt: p.confirmedAt,
    createdAt: p.createdAt,
    myRole: role,
  };
  if (role === 'customer') return { ...base, netPaid: f.netReceived };
  const provider = { commissionRateBps: f.commissionRateBps, commission: f.commission, providerShare: f.providerShare, providerNet: f.providerNet, paidOut: f.paidOut, payoutDue: f.payoutDue, payouts: p.payouts.map((x) => ({ amount: x.amount, reference: x.reference, at: x.at })) };
  if (role === 'provider') return { ...base, ...provider };
  return { ...base, ...provider, financials: f, confirmedBy: p.confirmedBy ? idOf(p.confirmedBy) : undefined, booking: idOf(p.booking) };
}

const withRefs = (q) => q.populate('booking', 'title status').populate('customer', 'fullName').populate('provider', 'displayName');

function toAdminListJSON(p, viewer) {
  return { ...toPaymentJSON(p, 'admin'), bookingTitle: p.booking?.title, bookingStatus: p.booking?.status, customerName: p.customer?.fullName, providerName: p.provider?.displayName, myRole: roleOf(p, viewer) || 'admin' };
}

async function activePaymentFor(bookingId) {
  return Payment.findOne({ booking: bookingId, active: true });
}

// ---------------------------------------------------------------------------------------------
// Customer: checkout, view, cancel
// ---------------------------------------------------------------------------------------------
async function checkout(user, { bookingId, gateway }) {
  const booking = await Booking.findById(bookingId);
  if (!booking || idOf(booking.customer) !== String(user._id)) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  if (!PAYABLE_BOOKING.includes(booking.status)) throw new AppError(409, 'This job can no longer be paid for', 'BOOKING_NOT_PAYABLE');

  const gatewayName = gateway || gateways.defaultGateway();
  const provider = gateways.getProvider(gatewayName);

  // Repeating a checkout is harmless: you get the payment you already started.
  const reuse = async () => {
    const existing = await activePaymentFor(booking._id);
    if (!existing) return null;
    if (existing.status === 'succeeded') throw new AppError(409, 'This job is already paid for', 'ALREADY_PAID');
    if (existing.gateway !== gatewayName) throw new AppError(409, 'You already have a payment in progress. Cancel it to choose another method.', 'PAYMENT_IN_PROGRESS');
    return existing;
  };
  const existing = await reuse();
  if (existing) return { payment: existing, created: false };

  // The amount and commission come from the booking and the platform setting, never from the request.
  const rateBps = await settings.getCommissionBps();
  const { commission, provider: providerAmount } = splitGross(booking.agreedPrice, rateBps);
  let payment;
  try {
    payment = await Payment.create({
      booking: booking._id, customer: user._id, provider: booking.provider, providerUser: booking.providerUser,
      gateway: gatewayName, amount: booking.agreedPrice, commissionRateBps: rateBps, commissionAmount: commission, providerAmount,
    });
  } catch (err) {
    if (err.code === 11000) { // a second checkout raced us; the unique index let only one through
      const raced = await reuse();
      if (raced) return { payment: raced, created: false };
    }
    throw err;
  }

  try {
    const result = await provider.createCheckout(payment);
    payment.gatewayReference = result.reference;
    payment.instructions = result.instructions;
    await payment.save();
  } catch (err) {
    await Payment.updateOne({ _id: payment._id }, { $set: { status: 'cancelled', active: false, failureReason: 'The payment method could not be started' } });
    logger.error({ err, gateway: gatewayName }, 'Payment checkout failed');
    throw new AppError(502, 'The payment method could not be started. Please try again.', 'PAYMENT_GATEWAY_ERROR');
  }
  return { payment, created: true };
}

async function getOne(user, id) {
  const payment = await Payment.findById(id);
  const role = payment && roleOf(payment, user);
  if (!role) throw notFound(); // outsiders cannot tell a payment exists
  return toPaymentJSON(payment, role);
}

async function list(user, { page, limit, status, bookingId }) {
  const filter = { $or: [{ customer: user._id }, { providerUser: user._id }] };
  if (status) filter.status = status;
  if (bookingId) filter.booking = bookingId;
  const [docs, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Payment.countDocuments(filter),
  ]);
  return { items: docs.map((p) => toPaymentJSON(p, roleOf(p, user))), total };
}

async function cancel(user, id) {
  const payment = await Payment.findOneAndUpdate(
    { _id: id, customer: user._id, status: 'pending' },
    { $set: { status: 'cancelled', active: false } },
    { new: true },
  );
  if (!payment) {
    const exists = await Payment.exists({ _id: id, customer: user._id });
    throw exists ? new AppError(409, 'Only a pending payment can be cancelled', 'INVALID_STATUS_TRANSITION') : notFound();
  }
  return toPaymentJSON(payment, 'customer');
}

// ---------------------------------------------------------------------------------------------
// Gateway webhooks: verified, idempotent, and never trusted for the amount
// ---------------------------------------------------------------------------------------------
async function notifyBoth(payment, { customerTitle, providerTitle, body }) {
  const link = `/dashboard/bookings/${payment.booking}`;
  await notifications.notify(payment.customer, { type: 'payment.updated', title: customerTitle, body, link });
  if (providerTitle) await notifications.notify(payment.providerUser, { type: 'payment.updated', title: providerTitle, body, link });
}

async function applySuccess(payment, event) {
  // A success normally arrives for a pending payment. If the customer had cancelled it but the gateway took the money
  // anyway, the money is real, so the payment is still marked succeeded (unless another live payment exists).
  try {
    const updated = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $in: ['pending', 'cancelled', 'failed'] } },
      { $set: { status: 'succeeded', active: true, confirmedAt: new Date() }, $unset: { failureReason: '' } },
      { new: true },
    );
    if (!updated) return 'no_change'; // already succeeded: a repeated event changes nothing
    await audit.record({ action: 'payment.succeeded', entityType: 'Payment', entityId: payment._id, metadata: { source: 'webhook', gateway: payment.gateway, amount: payment.amount, event: event.id } });
    await notifyBoth(updated, { customerTitle: 'Payment received', providerTitle: 'The customer has paid', body: `${fmt(updated.amount)} received for this job.` });
    return 'succeeded';
  } catch (err) {
    if (err.code === 11000) {
      logger.error({ payment: String(payment._id), event: event.id }, 'Gateway reported success for a payment, but the booking has another live payment');
      await audit.record({ action: 'payment.needs_attention', entityType: 'Payment', entityId: payment._id, metadata: { reason: 'success_while_another_payment_active', gateway: payment.gateway, event: event.id } });
      return 'needs_attention';
    }
    throw err;
  }
}

async function applyFailure(payment, event) {
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'pending' },
    { $set: { status: 'failed', active: false, failureReason: String(event.reason || 'The payment was not completed').slice(0, 300) } },
    { new: true },
  );
  if (!updated) return 'no_change';
  await notifyBoth(updated, { customerTitle: 'Payment failed', body: 'Your payment did not go through. You can try again.' });
  return 'failed';
}

async function handleWebhook(gatewayName, { rawBody, headers }) {
  const provider = gateways.getProvider(gatewayName);
  if (!provider.online || !provider.verifyWebhook) throw new AppError(404, 'Not found', 'NOT_FOUND');
  if (!Buffer.isBuffer(rawBody)) throw new AppError(400, 'Malformed webhook body', 'INVALID_WEBHOOK');

  // 1. Authenticate. Nothing in the body is used before this passes.
  const event = provider.verifyWebhook({ rawBody, headers });

  // 2. Idempotency: claim the event id. A re-delivery finds the row and stops here.
  const record = await PaymentEvent.findOneAndUpdate(
    { gateway: gatewayName, eventId: event.id },
    { $setOnInsert: { gateway: gatewayName, eventId: event.id, type: event.type, reference: event.reference, status: 'received' } },
    { upsert: true, new: true },
  ).catch(async (err) => {
    if (err.code === 11000) return PaymentEvent.findOne({ gateway: gatewayName, eventId: event.id }); // two deliveries raced on the upsert
    throw err;
  });
  if (record.status !== 'received') return { duplicate: true };

  // 3. Apply. Every step below is itself guarded, so if we crash after claiming the event, the gateway's retry
  //    (status is still "received") safely applies it again.
  const finish = async (status, outcome) => {
    await PaymentEvent.updateOne({ _id: record._id }, { $set: { status, outcome, processedAt: new Date() } });
    return { received: true, outcome };
  };

  const payment = await Payment.findOne({ gateway: gatewayName, gatewayReference: event.reference });
  if (!payment) {
    // Not a job payment: it may be a verification fee. That service runs the same amount and idempotency checks.
    const verification = await verificationService.applyGatewayEvent(gatewayName, event);
    return verification ? finish('processed', verification) : finish('ignored', 'unknown_reference');
  }

  // The gateway's word is not enough: the amount must match what we expect for this booking.
  if (event.amount !== payment.amount || event.currency !== payment.currency) {
    logger.error({ payment: String(payment._id), event: event.id }, 'Webhook amount did not match the payment');
    await audit.record({ action: 'payment.amount_mismatch', entityType: 'Payment', entityId: payment._id, metadata: { gateway: gatewayName, event: event.id, expected: payment.amount, received: event.amount } });
    return finish('ignored', 'amount_mismatch');
  }

  if (event.type === 'payment.succeeded') return finish('processed', await applySuccess(payment, event));
  if (event.type === 'payment.failed') return finish('processed', await applyFailure(payment, event));
  return finish('ignored', 'unsupported_event');
}

/** Development only: asks the fake gateway to "send" a signed webhook, then runs it through the real pipeline. */
async function simulateSandbox(user, id, outcome) {
  if (!gateways.sandboxEnabled()) throw new AppError(404, 'Not found', 'NOT_FOUND');
  const payment = await Payment.findOne({ _id: id, customer: user._id, gateway: 'sandbox' });
  if (!payment) throw notFound();
  const provider = gateways.getProvider('sandbox');
  const signed = provider.buildSignedEvent({ reference: payment.gatewayReference, amount: payment.amount, type: outcome === 'fail' ? 'payment.failed' : 'payment.succeeded', reason: outcome === 'fail' ? 'Declined in test mode' : undefined });
  await handleWebhook('sandbox', signed);
  return getOne(user, id);
}

// ---------------------------------------------------------------------------------------------
// Administrators: manual payments, refunds, payouts, reports
// ---------------------------------------------------------------------------------------------
const auditStrict = (session, entry) => audit.record({ ...entry, strict: true, session });

/**
 * Records money an administrator has verified outside the app (bank or mobile money). If the customer had started a
 * manual payment it is confirmed; otherwise a new succeeded payment is created. Audited in the same transaction.
 */
async function recordManual(admin, { bookingId, reference, note }, ctx) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  if (!PAYABLE_BOOKING.includes(booking.status)) throw new AppError(409, 'This job can no longer be paid for', 'BOOKING_NOT_PAYABLE');

  const now = new Date();
  let payment;
  try {
    payment = await runInTransaction(async (session) => {
      const opts = session ? { session } : {};
      const existing = await Payment.findOne({ booking: booking._id, active: true }).session(session || null);
      let result;
      if (existing) {
        if (existing.status === 'succeeded') throw new AppError(409, 'This job is already paid for', 'ALREADY_PAID');
        if (existing.gateway !== 'manual') throw new AppError(409, 'A gateway payment is waiting for the customer. Cancel it first, or wait for the gateway.', 'GATEWAY_PAYMENT_PENDING');
        result = await Payment.findOneAndUpdate(
          { _id: existing._id, status: 'pending' },
          { $set: { status: 'succeeded', gatewayReference: reference, confirmedAt: now, confirmedBy: admin._id, manualNote: note } },
          { new: true, ...opts },
        );
        if (!result) throw new AppError(409, 'This payment just changed. Reload and try again.', 'PAYMENT_CHANGED');
      } else {
        const rateBps = await settings.getCommissionBps();
        const split = splitGross(booking.agreedPrice, rateBps);
        [result] = await Payment.create(
          [{
            booking: booking._id, customer: booking.customer, provider: booking.provider, providerUser: booking.providerUser,
            gateway: 'manual', amount: booking.agreedPrice, commissionRateBps: rateBps, commissionAmount: split.commission, providerAmount: split.provider,
            status: 'succeeded', gatewayReference: reference, confirmedAt: now, confirmedBy: admin._id, manualNote: note,
          }],
          opts,
        );
      }
      await auditStrict(session, { actor: admin._id, action: 'payment.manual_recorded', entityType: 'Payment', entityId: result._id, metadata: { booking: String(booking._id), amount: result.amount, reference, note }, ctx });
      return result;
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'That reference has already been used for another payment', 'REFERENCE_USED');
    throw err;
  }

  await notifyBoth(payment, { customerTitle: 'Payment confirmed', providerTitle: 'The customer has paid', body: `${fmt(payment.amount)} was confirmed by an administrator.` });
  return toPaymentJSON(payment, 'admin');
}

async function refund(admin, id, { amount, reason }, ctx) {
  const payment = await Payment.findById(id);
  if (!payment) throw notFound();
  if (payment.status !== 'succeeded') throw new AppError(409, 'Only a payment that was received can be refunded', 'PAYMENT_NOT_REFUNDABLE');
  const refundable = payment.amount - payment.refundedAmount;
  if (amount > refundable) throw new AppError(400, `At most ${fmt(refundable)} can still be refunded`, 'REFUND_TOO_LARGE');

  const split = splitRefund({ amount: payment.amount, commissionAmount: payment.commissionAmount, refundedSoFar: payment.refundedAmount, commissionRefundedSoFar: payment.commissionRefunded, refund: amount });
  const updated = await runInTransaction(async (session) => {
    const opts = session ? { session } : {};
    // Guarded by the refunded total we just read: a simultaneous refund makes this match nothing instead of overspending.
    const doc = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'succeeded', refundedAmount: payment.refundedAmount },
      { $inc: { refundedAmount: amount, commissionRefunded: split.commissionPart, providerRefunded: split.providerPart }, $push: { refunds: { amount, commissionPart: split.commissionPart, providerPart: split.providerPart, reason, by: admin._id, at: new Date() } } },
      { new: true, ...opts },
    );
    if (!doc) throw new AppError(409, 'This payment just changed. Reload and try again.', 'PAYMENT_CHANGED');
    await auditStrict(session, { actor: admin._id, action: 'payment.refunded', entityType: 'Payment', entityId: payment._id, metadata: { amount, ...split, reason }, ctx });
    return doc;
  });

  await notifyBoth(updated, { customerTitle: 'Refund recorded', providerTitle: 'A refund was recorded for a job', body: `${fmt(amount)} refunded. ${reason}` });
  return toPaymentJSON(updated, 'admin');
}

/** Records a payout an administrator has already sent to the provider (the platform does not move money itself yet). */
async function payout(admin, id, { amount, reference }, ctx) {
  const payment = await Payment.findById(id);
  if (!payment) throw notFound();
  if (payment.status !== 'succeeded') throw new AppError(409, 'Only a received payment can be paid out', 'PAYMENT_NOT_PAYABLE');
  const booking = await Booking.findById(payment.booking).select('status');
  if (!booking || booking.status !== 'completed') throw new AppError(409, 'Providers are paid after the job is completed', 'JOB_NOT_COMPLETED');

  const due = financials(payment).payoutDue;
  const pay = amount ?? due;
  if (pay < 1) throw new AppError(409, 'Nothing is due to the provider', 'NOTHING_DUE');
  if (pay > due) throw new AppError(400, `At most ${fmt(due)} is due to the provider`, 'PAYOUT_TOO_LARGE');

  const updated = await runInTransaction(async (session) => {
    const opts = session ? { session } : {};
    const doc = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'succeeded', paidOut: payment.paidOut, refundedAmount: payment.refundedAmount },
      { $inc: { paidOut: pay }, $push: { payouts: { amount: pay, reference, by: admin._id, at: new Date() } } },
      { new: true, ...opts },
    );
    if (!doc) throw new AppError(409, 'This payment just changed. Reload and try again.', 'PAYMENT_CHANGED');
    await auditStrict(session, { actor: admin._id, action: 'payment.payout_recorded', entityType: 'Payment', entityId: payment._id, metadata: { amount: pay, reference }, ctx });
    return doc;
  });

  await notifications.notify(updated.providerUser, { type: 'payment.updated', title: `Payout sent: ${fmt(pay)}`, body: `Reference ${reference}`, link: `/dashboard/bookings/${updated.booking}` });
  return toPaymentJSON(updated, 'admin');
}

async function listForAdmin(admin, { page, limit, status, gateway, bookingId }) {
  const filter = {};
  if (status) filter.status = status;
  if (gateway) filter.gateway = gateway;
  if (bookingId) filter.booking = bookingId;
  const [docs, total] = await Promise.all([
    withRefs(Payment.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)),
    Payment.countDocuments(filter),
  ]);
  return { items: docs.map((p) => toAdminListJSON(p, admin)), total };
}

/**
 * Platform-wide money report. Keep these apart: "gross" is customers' money passing through, "netCommission" is the
 * platform's revenue, and neither is profit (hosting, gateway fees, taxes and staff are not subtracted anywhere).
 */
async function summary() {
  const [received] = await Payment.aggregate([
    { $match: { status: 'succeeded' } },
    { $project: { amount: 1, refundedAmount: 1, commissionAmount: 1, commissionRefunded: 1, providerAmount: 1, providerRefunded: 1, paidOut: 1,
      due: { $max: [0, { $subtract: [{ $subtract: ['$providerAmount', '$providerRefunded'] }, '$paidOut'] }] },
      owes: { $max: [0, { $subtract: ['$paidOut', { $subtract: ['$providerAmount', '$providerRefunded'] }] }] } } },
    { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$amount' }, refunded: { $sum: '$refundedAmount' }, commission: { $sum: '$commissionAmount' }, commissionRefunded: { $sum: '$commissionRefunded' }, providerShare: { $sum: '$providerAmount' }, providerRefunded: { $sum: '$providerRefunded' }, paidOut: { $sum: '$paidOut' }, payoutDue: { $sum: '$due' }, providerOwes: { $sum: '$owes' } } },
  ]);
  const byStatus = await Payment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]);
  const count = (s) => byStatus.find((x) => x._id === s)?.count ?? 0;
  const r = received || {};
  const n = (v) => v ?? 0;
  return {
    grossTransactionValue: n(r.gross),
    refunds: n(r.refunded),
    netReceived: n(r.gross) - n(r.refunded),
    commissionCharged: n(r.commission),
    commissionRefunded: n(r.commissionRefunded),
    platformRevenue: n(r.commission) - n(r.commissionRefunded), // revenue, NOT profit
    providerShare: n(r.providerShare),
    providerRefunded: n(r.providerRefunded),
    providerPayouts: { paid: n(r.paidOut), pending: n(r.payoutDue), owedBackByProviders: n(r.providerOwes) },
    pendingPaymentsValue: byStatus.find((x) => x._id === 'pending')?.amount ?? 0,
    counts: { succeeded: count('succeeded'), pending: count('pending'), failed: count('failed'), cancelled: count('cancelled') },
    commissionRateBps: await settings.getCommissionBps(),
  };
}

module.exports = { financials, checkout, getOne, list, cancel, handleWebhook, simulateSandbox, recordManual, refund, payout, listForAdmin, summary, options: gateways.options, defaultGateway: gateways.defaultGateway };
