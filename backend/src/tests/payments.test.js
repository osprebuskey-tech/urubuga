const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Payment = require('../models/Payment');
const PaymentEvent = require('../models/PaymentEvent');
const PlatformSetting = require('../models/PlatformSetting');
const sandbox = require('../services/payments/sandboxProvider');
const { api, bearer, createCategory, createSession, createProvider, createAdmin, createBookingDoc } = require('./helpers');

async function setup(bookingStatus = 'accepted', overrides = {}) {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
  const booking = await createBookingDoc({ customer, provider, category, status: bookingStatus, ...overrides }); // agreed price 40,000 RWF
  const admin = await createAdmin();
  return { category, customer, provider, booking, admin };
}

const checkout = (token, body) => api().post('/api/payments/checkout').set(bearer(token)).send(body);
const webhook = (signed, path = '/api/payments/webhook') => api().post(path).set('Content-Type', 'application/json').set(signed.headers).send(signed.rawBody);
const event = (payment, overrides = {}) => sandbox.buildSignedEvent({ reference: payment.gatewayReference, amount: payment.amount, ...overrides });
let refCounter = 0;
const makePayment = (booking, overrides = {}) =>
  Payment.create({
    booking: booking._id, customer: booking.customer, provider: booking.provider, providerUser: booking.providerUser,
    gateway: 'manual', amount: 40000, commissionRateBps: 1200, commissionAmount: 4800, providerAmount: 35200,
    status: 'succeeded', gatewayReference: `bank-ref-${(refCounter += 1)}`, confirmedAt: new Date(), ...overrides,
  });

describe('POST /api/payments/checkout', () => {
  test('creates a pending payment whose amount and commission come from the server', async () => {
    const { customer, booking } = await setup();
    const res = await checkout(customer.token, { bookingId: String(booking._id), gateway: 'sandbox' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ status: 'pending', gateway: 'sandbox', amount: 40000, currency: 'RWF', myRole: 'customer' });
    expect(res.body.data.payment.gatewayReference).toMatch(/^sbx_/);

    const saved = await Payment.findOne();
    expect(saved).toMatchObject({ amount: 40000, commissionRateBps: 1200, commissionAmount: 4800, providerAmount: 35200, active: true });
    // customers never see the commission split
    expect(res.body.data.payment.commission).toBeUndefined();
    expect(res.body.data.payment.providerShare).toBeUndefined();
  });

  test('refuses client-supplied money or ownership fields', async () => {
    const { customer, booking } = await setup();
    for (const extra of [{ amount: 1 }, { commissionAmount: 0 }, { status: 'succeeded' }, { customer: String(booking.provider) }]) {
      expect((await checkout(customer.token, { bookingId: String(booking._id), ...extra })).status).toBe(400);
    }
    expect(await Payment.countDocuments()).toBe(0);
  });

  test('repeating a checkout returns the same payment, even when simultaneous', async () => {
    const { customer, booking } = await setup();
    const first = await checkout(customer.token, { bookingId: String(booking._id) });
    const again = await checkout(customer.token, { bookingId: String(booking._id) });
    expect(again.status).toBe(200);
    expect(again.body.data.payment.id).toBe(first.body.data.payment.id);

    const other = await setup();
    const both = await Promise.all([1, 2, 3].map(() => checkout(other.customer.token, { bookingId: String(other.booking._id) })));
    expect(both.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(new Set(both.map((r) => r.body.data.payment.id)).size).toBe(1);
    expect(await Payment.countDocuments({ booking: other.booking._id })).toBe(1);
  });

  test('only the customer of a payable job can pay, and only through an available method', async () => {
    const { customer, provider, booking } = await setup();
    const body = { bookingId: String(booking._id) };
    expect((await checkout(provider.token, body)).status).toBe(404);
    expect((await checkout((await createSession(['customer'])).token, body)).status).toBe(404);
    expect((await api().post('/api/payments/checkout').send(body)).status).toBe(401);
    expect((await checkout(customer.token, { ...body, gateway: 'stripe' })).status).toBe(400);

    for (const status of ['cancelled', 'disputed']) {
      const closed = await setup(status);
      const res = await checkout(closed.customer.token, { bookingId: String(closed.booking._id) });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
    }
  });

  test('a paid job cannot be paid twice, and a pending payment blocks a different method until cancelled', async () => {
    const { customer, booking } = await setup();
    const body = { bookingId: String(booking._id) };
    const first = (await checkout(customer.token, { ...body, gateway: 'sandbox' })).body.data.payment;

    const other = await checkout(customer.token, { ...body, gateway: 'manual' });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('PAYMENT_IN_PROGRESS');

    expect((await api().post(`/api/payments/${first.id}/cancel`).set(bearer(customer.token))).status).toBe(200);
    const manual = await checkout(customer.token, { ...body, gateway: 'manual' });
    expect(manual.status).toBe(201);
    expect(manual.body.data.payment.instructions).toBeTruthy();

    await Payment.updateOne({ _id: manual.body.data.payment.id }, { status: 'succeeded' });
    expect((await checkout(customer.token, body)).body.error.code).toBe('ALREADY_PAID');
  });

  test('the commission rate in force when the payment is created is the one it keeps', async () => {
    const { customer, booking, admin } = await setup();
    const first = (await checkout(customer.token, { bookingId: String(booking._id) })).body.data.payment;
    expect((await api().put('/api/admin/settings/commission').set(bearer(admin.token)).send({ rateBps: 1000 })).status).toBe(200);
    expect(await Payment.findById(first.id)).toMatchObject({ commissionRateBps: 1200, commissionAmount: 4800 });

    await api().post(`/api/payments/${first.id}/cancel`).set(bearer(customer.token));
    const second = (await checkout(customer.token, { bookingId: String(booking._id) })).body.data.payment;
    expect(await Payment.findById(second.id)).toMatchObject({ commissionRateBps: 1000, commissionAmount: 4000, providerAmount: 36000 });
  });
});

describe('POST /api/payments/webhook', () => {
  async function pending() {
    const ctx = await setup();
    const payment = (await checkout(ctx.customer.token, { bookingId: String(ctx.booking._id) })).body.data.payment;
    return { ...ctx, payment };
  }

  test('a correctly signed success event marks the payment succeeded and tells both sides', async () => {
    const { customer, provider, payment } = await pending();
    const res = await webhook(event(payment));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ received: true, outcome: 'succeeded' });

    const saved = await Payment.findById(payment.id);
    expect(saved.status).toBe('succeeded');
    expect(saved.confirmedAt).toBeTruthy();
    const notes = await Notification.find({ type: 'payment.updated' });
    expect(notes.map((n) => String(n.user)).sort()).toEqual([String(customer.user._id), String(provider.user._id)].sort());
    expect(await AuditLog.countDocuments({ action: 'payment.succeeded' })).toBe(1);
  });

  test('is idempotent: the same event delivered again, or at the same time, is applied once', async () => {
    const { payment } = await pending();
    const signed = event(payment);
    expect((await webhook(signed)).body.data.outcome).toBe('succeeded');
    const again = await webhook(signed);
    expect(again.status).toBe(200);
    expect(again.body.data.duplicate).toBe(true);
    expect(await Notification.countDocuments({ type: 'payment.updated' })).toBe(2);

    const racing = await pending();
    const one = event(racing.payment);
    const results = await Promise.all([webhook(one), webhook(one), webhook(one)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await PaymentEvent.countDocuments({ eventId: JSON.parse(one.rawBody).id })).toBe(1);
    expect(await Notification.countDocuments({ type: 'payment.updated', user: racing.customer.user._id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'payment.succeeded', entityId: racing.payment.id })).toBe(1);
  });

  test('a different event for an already-paid payment changes nothing', async () => {
    const { payment } = await pending();
    await webhook(event(payment));
    const res = await webhook(event(payment)); // new event id, same payment
    expect(res.body.data.outcome).toBe('no_change');
    expect(await Notification.countDocuments({ type: 'payment.updated' })).toBe(2);
  });

  test('rejects bad signatures, tampered bodies, stale timestamps and missing headers, and changes nothing', async () => {
    const { payment } = await pending();
    const good = event(payment);

    const wrongSecret = { rawBody: good.rawBody, headers: { ...good.headers, 'x-imbehe-signature': 'a'.repeat(64) } };
    expect((await webhook(wrongSecret)).status).toBe(401);

    const tampered = { rawBody: Buffer.from(good.rawBody.toString().replace('40000', '1')), headers: good.headers };
    expect((await webhook(tampered)).status).toBe(401);

    const stale = event(payment, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await webhook(stale)).status).toBe(401);

    expect((await webhook({ rawBody: good.rawBody, headers: {} })).status).toBe(401);
    expect((await webhook({ rawBody: good.rawBody, headers: { ...good.headers, 'x-imbehe-signature': 'not-hex' } })).status).toBe(401);

    expect((await Payment.findById(payment.id)).status).toBe('pending');
    expect(await PaymentEvent.countDocuments()).toBe(0);
  });

  test('never trusts the amount in the event: a mismatch is ignored and flagged', async () => {
    const { payment } = await pending();
    const res = await webhook(sandbox.buildSignedEvent({ reference: payment.gatewayReference, amount: 1 }));
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('amount_mismatch');
    expect((await Payment.findById(payment.id)).status).toBe('pending');
    expect(await AuditLog.countDocuments({ action: 'payment.amount_mismatch' })).toBe(1);
  });

  test('an event for an unknown reference is acknowledged and ignored', async () => {
    const res = await webhook(sandbox.buildSignedEvent({ reference: 'sbx_doesnotexist', amount: 40000 }));
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('unknown_reference');
  });

  test('a failure event fails the payment and lets the customer try again', async () => {
    const { customer, booking, payment } = await pending();
    const res = await webhook(event(payment, { type: 'payment.failed', reason: 'Insufficient funds' }));
    expect(res.body.data.outcome).toBe('failed');
    const saved = await Payment.findById(payment.id);
    expect(saved).toMatchObject({ status: 'failed', active: false, failureReason: 'Insufficient funds' });
    expect((await checkout(customer.token, { bookingId: String(booking._id) })).status).toBe(201);
  });

  test('a late success for a payment the customer cancelled is still honoured: the money arrived', async () => {
    const { customer, payment } = await pending();
    await api().post(`/api/payments/${payment.id}/cancel`).set(bearer(customer.token));
    const res = await webhook(event(payment));
    expect(res.body.data.outcome).toBe('succeeded');
    expect((await Payment.findById(payment.id)).status).toBe('succeeded');
  });

  test('a late success is flagged for review if the booking already has another live payment', async () => {
    const { customer, booking, payment } = await pending();
    await api().post(`/api/payments/${payment.id}/cancel`).set(bearer(customer.token));
    await checkout(customer.token, { bookingId: String(booking._id) }); // a second live payment
    const res = await webhook(event(payment));
    expect(res.body.data.outcome).toBe('needs_attention');
    expect(await AuditLog.countDocuments({ action: 'payment.needs_attention' })).toBe(1);
    expect((await Payment.findById(payment.id)).status).toBe('cancelled');
  });

  test('also works on the gateway-specific URL, and unknown gateways are refused', async () => {
    const { payment } = await pending();
    expect((await webhook(event(payment), '/api/payments/webhook/sandbox')).body.data.outcome).toBe('succeeded');
    expect((await webhook(event(payment), '/api/payments/webhook/manual')).status).toBe(404); // manual has no webhooks
    expect((await webhook(event(payment), '/api/payments/webhook/stripe')).status).toBe(400);
  });
});

describe('sandbox simulation (development only)', () => {
  test('runs a signed event through the real webhook pipeline', async () => {
    const { customer, booking } = await setup();
    const payment = (await checkout(customer.token, { bookingId: String(booking._id) })).body.data.payment;
    const res = await api().post(`/api/payments/${payment.id}/sandbox/succeed`).set(bearer(customer.token));
    expect(res.status).toBe(200);
    expect(res.body.data.payment.status).toBe('succeeded');
    expect(await PaymentEvent.countDocuments({ gateway: 'sandbox', status: 'processed' })).toBe(1);
  });

  test('only the customer who owns the payment can simulate it', async () => {
    const { customer, provider, booking } = await setup();
    const payment = (await checkout(customer.token, { bookingId: String(booking._id) })).body.data.payment;
    expect((await api().post(`/api/payments/${payment.id}/sandbox/succeed`).set(bearer(provider.token))).status).toBe(404);
    expect((await api().post(`/api/payments/${payment.id}/sandbox/maybe`).set(bearer(customer.token))).status).toBe(400);
    expect((await Payment.findById(payment.id)).status).toBe('pending');
  });
});

describe('GET /api/payments/:id and the list', () => {
  test('each viewer sees only the money facts that concern them', async () => {
    const { customer, provider, booking, admin } = await setup();
    const payment = await makePayment(booking);
    const get = (token) => api().get(`/api/payments/${payment._id}`).set(bearer(token));

    const c = (await get(customer.token)).body.data.payment;
    expect(c).toMatchObject({ amount: 40000, netPaid: 40000, myRole: 'customer' });
    expect(c.commission).toBeUndefined();
    expect(c.financials).toBeUndefined();

    const p = (await get(provider.token)).body.data.payment;
    expect(p).toMatchObject({ commission: 4800, providerShare: 35200, providerNet: 35200, payoutDue: 35200, myRole: 'provider' });
    expect(p.financials).toBeUndefined();

    const a = (await get(admin.token)).body.data.payment;
    expect(a.financials).toMatchObject({ gross: 40000, netCommission: 4800, providerNet: 35200, payoutDue: 35200 });

    expect((await get((await createSession(['customer'])).token)).status).toBe(404);
    expect((await api().get(`/api/payments/${payment._id}`)).status).toBe(401);
  });

  test('lists your own payments and filters by booking', async () => {
    const { customer, provider, booking } = await setup();
    await makePayment(booking);
    const stranger = await createSession(['customer']);
    expect((await api().get('/api/payments').set(bearer(customer.token))).body.data).toHaveLength(1);
    expect((await api().get('/api/payments').set(bearer(provider.token))).body.data).toHaveLength(1);
    expect((await api().get('/api/payments').set(bearer(stranger.token))).body.data).toEqual([]);
    expect((await api().get(`/api/payments?bookingId=${booking._id}`).set(bearer(customer.token))).body.data).toHaveLength(1);
  });
});

describe('manual payments recorded by an administrator', () => {
  const record = (token, body) => api().post('/api/admin/payments').set(bearer(token)).send(body);

  test('records a verified payment for a job, with an audit entry, and tells both sides', async () => {
    const { customer, provider, booking, admin } = await setup();
    const res = await record(admin.token, { bookingId: String(booking._id), reference: 'MTN-884213', note: 'Seen in the MoMo statement' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ status: 'succeeded', gateway: 'manual', amount: 40000, gatewayReference: 'MTN-884213' });
    expect(res.body.data.payment.financials).toMatchObject({ commission: 4800, providerShare: 35200 });

    const saved = await Payment.findOne();
    expect(String(saved.confirmedBy)).toBe(String(admin.user._id));
    const audit = await AuditLog.findOne({ action: 'payment.manual_recorded' });
    expect(audit.metadata).toMatchObject({ amount: 40000, reference: 'MTN-884213' });
    expect(String(audit.actor)).toBe(String(admin.user._id));
    expect(await Notification.countDocuments({ type: 'payment.updated', user: { $in: [customer.user._id, provider.user._id] } })).toBe(2);
  });

  test('confirms a manual payment the customer already started', async () => {
    const { customer, booking, admin } = await setup();
    const started = (await checkout(customer.token, { bookingId: String(booking._id), gateway: 'manual' })).body.data.payment;
    const res = await record(admin.token, { bookingId: String(booking._id), reference: 'BK-2290-AB' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment.id).toBe(started.id);
    expect(await Payment.countDocuments()).toBe(1);
  });

  test('refuses a job that is paid, a gateway payment still pending, a reused reference, or a closed job', async () => {
    const { customer, booking, admin } = await setup();
    const body = { bookingId: String(booking._id), reference: 'REF-0001' };

    await checkout(customer.token, { bookingId: String(booking._id), gateway: 'sandbox' });
    expect((await record(admin.token, body)).body.error.code).toBe('GATEWAY_PAYMENT_PENDING');
    await Payment.deleteMany({});

    expect((await record(admin.token, body)).status).toBe(201);
    expect((await record(admin.token, { ...body, reference: 'REF-0002' })).body.error.code).toBe('ALREADY_PAID');

    const second = await setup();
    const reused = await record(second.admin.token, { bookingId: String(second.booking._id), reference: 'REF-0001' });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe('REFERENCE_USED');

    const cancelled = await setup('cancelled');
    expect((await record(cancelled.admin.token, { bookingId: String(cancelled.booking._id), reference: 'REF-0003' })).body.error.code).toBe('BOOKING_NOT_PAYABLE');
  });

  test('is admin-only and validates its input', async () => {
    const { customer, provider, booking, admin } = await setup();
    const body = { bookingId: String(booking._id), reference: 'REF-1234' };
    expect((await record(customer.token, body)).status).toBe(403);
    expect((await record(provider.token, body)).status).toBe(403);
    expect((await api().post('/api/admin/payments').send(body)).status).toBe(401);
    expect((await record(admin.token, { ...body, reference: 'ab' })).status).toBe(400);
    expect((await record(admin.token, { ...body, amount: 5 })).status).toBe(400);
    expect((await record(admin.token, { bookingId: '64b7f0f0f0f0f0f0f0f0f0f0', reference: 'REF-1234' })).status).toBe(404);
    expect(await Payment.countDocuments()).toBe(0);
  });
});

describe('refunds', () => {
  const refund = (token, id, body) => api().post(`/api/admin/payments/${id}/refund`).set(bearer(token)).send(body);

  test('a partial refund reduces what the customer paid and comes out of commission and provider share proportionally', async () => {
    const { booking, admin } = await setup();
    const payment = await makePayment(booking);
    const res = await refund(admin.token, payment._id, { amount: 10000, reason: 'Part of the work was not done' });
    expect(res.status).toBe(200);
    expect(res.body.data.payment.financials).toMatchObject({ gross: 40000, refunded: 10000, netReceived: 30000, commissionRefunded: 1200, netCommission: 3600, providerRefunded: 8800, providerNet: 26400 });
    expect(await AuditLog.countDocuments({ action: 'payment.refunded' })).toBe(1);
  });

  test('refunds in steps add up exactly, and can never exceed what was paid', async () => {
    const { booking, admin } = await setup();
    const payment = await makePayment(booking);
    for (const amount of [13337, 9999]) expect((await refund(admin.token, payment._id, { amount, reason: 'Goodwill gesture' })).status).toBe(200);
    const tooMuch = await refund(admin.token, payment._id, { amount: 16665, reason: 'One franc too many' });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.code).toBe('REFUND_TOO_LARGE');
    expect((await refund(admin.token, payment._id, { amount: 16664, reason: 'The rest of the money' })).status).toBe(200);

    const saved = await Payment.findById(payment._id);
    expect(saved).toMatchObject({ refundedAmount: 40000, commissionRefunded: 4800, providerRefunded: 35200 });
    expect(saved.refunds).toHaveLength(3);
  });

  test('simultaneous refunds cannot overspend the payment', async () => {
    const { booking, admin } = await setup();
    const payment = await makePayment(booking);
    const results = await Promise.all([1, 2, 3].map(() => refund(admin.token, payment._id, { amount: 30000, reason: 'Duplicate click' })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await Payment.findById(payment._id)).refundedAmount).toBe(30000);
  });

  test('only a received payment can be refunded, only by an administrator, with a reason', async () => {
    const { customer, provider, booking, admin } = await setup();
    const pendingPayment = await makePayment(booking, { status: 'pending', gatewayReference: undefined });
    expect((await refund(admin.token, pendingPayment._id, { amount: 100, reason: 'Not paid yet' })).body.error.code).toBe('PAYMENT_NOT_REFUNDABLE');

    const done = await makePayment((await setup()).booking);
    expect((await refund(customer.token, done._id, { amount: 100, reason: 'Give me my money' })).status).toBe(403);
    expect((await refund(provider.token, done._id, { amount: 100, reason: 'Refund my own job' })).status).toBe(403);
    expect((await refund(admin.token, done._id, { amount: 100, reason: 'no' })).status).toBe(400);
    expect((await refund(admin.token, done._id, { amount: 0, reason: 'Zero is not a refund' })).status).toBe(400);
    expect((await refund(admin.token, done._id, { amount: 10.5, reason: 'Fractions of a franc' })).status).toBe(400);
    expect((await Payment.findById(done._id)).refundedAmount).toBe(0);
  });
});

describe('provider payouts', () => {
  const payout = (token, id, body) => api().post(`/api/admin/payments/${id}/payout`).set(bearer(token)).send(body);

  test('are recorded only for received payments on completed jobs, and never exceed what is due', async () => {
    const { provider, booking, admin } = await setup('completed', { completedAt: new Date() });
    const payment = await makePayment(booking);

    expect((await payout(admin.token, payment._id, { amount: 40000, reference: 'MOMO-1' })).body.error.code).toBe('PAYOUT_TOO_LARGE'); // 35,200 is due
    const part = await payout(admin.token, payment._id, { amount: 20000, reference: 'MOMO-77120' });
    expect(part.status).toBe(200);
    expect(part.body.data.payment.financials).toMatchObject({ paidOut: 20000, payoutDue: 15200 });
    const rest = await payout(admin.token, payment._id, { reference: 'MOMO-77121' }); // no amount = everything still due
    expect(rest.body.data.payment.financials).toMatchObject({ paidOut: 35200, payoutDue: 0 });
    expect((await payout(admin.token, payment._id, { reference: 'MOMO-77122' })).body.error.code).toBe('NOTHING_DUE');

    expect(await AuditLog.countDocuments({ action: 'payment.payout_recorded' })).toBe(2);
    const notes = await Notification.find({ type: 'payment.updated', user: provider.user._id });
    expect(notes.some((n) => /Payout sent/.test(n.title))).toBe(true);
  });

  test('wait until the job is completed and the money was received', async () => {
    const early = await setup('in_progress');
    const payment = await makePayment(early.booking);
    expect((await payout(early.admin.token, payment._id, { reference: 'MOMO-1' })).body.error.code).toBe('JOB_NOT_COMPLETED');

    const unpaid = await setup('completed', { completedAt: new Date() });
    const pending = await makePayment(unpaid.booking, { status: 'pending', gatewayReference: undefined });
    expect((await payout(unpaid.admin.token, pending._id, { reference: 'MOMO-2' })).body.error.code).toBe('PAYMENT_NOT_PAYABLE');
  });

  test('a refund lowers what is due, and one made after a payout shows what the provider owes back', async () => {
    const { booking, admin } = await setup('completed', { completedAt: new Date() });
    const payment = await makePayment(booking);
    await api().post(`/api/admin/payments/${payment._id}/refund`).set(bearer(admin.token)).send({ amount: 10000, reason: 'Partial refund before payout' });
    expect((await Payment.findById(payment._id)).providerRefunded).toBe(8800);
    const full = await payout(admin.token, payment._id, { reference: 'MOMO-9' });
    expect(full.body.data.payment.financials).toMatchObject({ paidOut: 26400, payoutDue: 0 });

    const after = await api().post(`/api/admin/payments/${payment._id}/refund`).set(bearer(admin.token)).send({ amount: 10000, reason: 'Second refund after payout' });
    expect(after.body.data.payment.financials).toMatchObject({ providerNet: 17600, paidOut: 26400, payoutDue: 0, providerOwes: 8800 });
  });

  test('are admin-only', async () => {
    const { customer, provider, booking } = await setup('completed', { completedAt: new Date() });
    const payment = await makePayment(booking);
    expect((await payout(provider.token, payment._id, { reference: 'MOMO-1' })).status).toBe(403);
    expect((await payout(customer.token, payment._id, { reference: 'MOMO-1' })).status).toBe(403);
    expect((await Payment.findById(payment._id)).paidOut).toBe(0);
  });
});

describe('finance summary and commission setting', () => {
  test('keeps gross transaction value, refunds, platform revenue and provider money apart', async () => {
    const a = await setup('completed', { completedAt: new Date() });
    const b = await setup();
    const paidA = await makePayment(a.booking);
    await makePayment(b.booking, { amount: 100000, commissionAmount: 12000, providerAmount: 88000 });
    await makePayment((await setup()).booking, { status: 'pending', gatewayReference: undefined });
    await api().post(`/api/admin/payments/${paidA._id}/refund`).set(bearer(a.admin.token)).send({ amount: 10000, reason: 'Partial refund for the report' });
    await api().post(`/api/admin/payments/${paidA._id}/payout`).set(bearer(a.admin.token)).send({ amount: 5000, reference: 'MOMO-5' });

    const res = await api().get('/api/admin/payments/summary').set(bearer(a.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({
      grossTransactionValue: 140000, // 40,000 + 100,000
      refunds: 10000,
      netReceived: 130000,
      commissionCharged: 16800, // 4,800 + 12,000
      commissionRefunded: 1200,
      platformRevenue: 15600,
      providerShare: 123200,
      providerRefunded: 8800,
      providerPayouts: { paid: 5000, pending: 109400, owedBackByProviders: 0 }, // (35,200 - 8,800 - 5,000) + 88,000
      pendingPaymentsValue: 40000,
      counts: { succeeded: 2, pending: 1, failed: 0, cancelled: 0 },
      commissionRateBps: 1200,
    });
    expect(res.body.data.summary.profit).toBeUndefined(); // revenue is never presented as profit
  });

  test('is admin-only', async () => {
    const { customer } = await setup();
    expect((await api().get('/api/admin/payments/summary').set(bearer(customer.token))).status).toBe(403);
    expect((await api().get('/api/admin/payments')).status).toBe(401);
  });

  test('lists payments for admins with names and filters', async () => {
    const { booking, admin } = await setup();
    await makePayment(booking);
    const res = await api().get('/api/admin/payments?status=succeeded&gateway=manual').set(bearer(admin.token));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ bookingTitle: 'Fix my office network', status: 'succeeded' });
    expect((await api().get('/api/admin/payments?status=pending').set(bearer(admin.token))).body.data).toHaveLength(0);
  });

  test('the commission defaults to 12%, an administrator can change it, and the change is audited', async () => {
    const { customer, admin } = await setup();
    expect((await api().get('/api/admin/settings').set(bearer(admin.token))).body.data.settings).toEqual({ commissionRateBps: 1200, commissionRatePercent: 12 });

    const res = await api().put('/api/admin/settings/commission').set(bearer(admin.token)).send({ rateBps: 1500 });
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toEqual({ commissionRateBps: 1500, commissionRatePercent: 15 });
    expect((await PlatformSetting.findOne({ key: 'commission_bps' })).value).toBe(1500);
    const audit = await AuditLog.findOne({ action: 'settings.commission_changed' });
    expect(audit.metadata).toEqual({ from: 1200, to: 1500 });

    expect((await api().put('/api/admin/settings/commission').set(bearer(customer.token)).send({ rateBps: 0 })).status).toBe(403);
  });

  test('rejects rates that are not whole basis points between 0 and 50%', async () => {
    const { admin } = await setup();
    for (const rateBps of [-1, 5001, 12.5, '1200', null]) {
      expect((await api().put('/api/admin/settings/commission').set(bearer(admin.token)).send({ rateBps })).status).toBe(400);
    }
    expect((await api().put('/api/admin/settings/commission').set(bearer(admin.token)).send({})).status).toBe(400);
    expect((await api().put('/api/admin/settings/commission').set(bearer(admin.token)).send({ rateBps: 0 })).status).toBe(200);
  });
});
