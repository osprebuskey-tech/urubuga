const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Payment = require('../models/Payment');
const { api, bearer, createCategory, createSession, createProvider, createBookingDoc, futureDate } = require('./helpers');

const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const dayString = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
let ref = 0;
const makePayment = (booking, overrides = {}) =>
  Payment.create({
    booking: booking._id, customer: booking.customer, provider: booking.provider, providerUser: booking.providerUser,
    gateway: 'manual', amount: 40000, commissionRateBps: 1200, commissionAmount: 4800, providerAmount: 35200,
    status: 'succeeded', gatewayReference: `ref-${(ref += 1)}`, confirmedAt: daysAgo(10), ...overrides,
  });

async function setup() {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
  const finance = await createSession(['finance']);
  const make = (overrides) => createBookingDoc({ customer, provider, category, ...overrides });

  const unpaid = await make({ status: 'completed', startedAt: daysAgo(8), completedAt: daysAgo(5) }); // finished 5 days ago, never paid
  const waiting = await make({ status: 'in_progress', startedAt: daysAgo(4) });
  await makePayment(waiting, { status: 'pending', confirmedAt: undefined, gatewayReference: undefined, createdAt: daysAgo(3) }); // customer said they paid, nobody confirmed
  const owed = await make({ status: 'completed', startedAt: daysAgo(9), completedAt: daysAgo(6) });
  await makePayment(owed); // paid by the customer, provider not yet paid
  await make({ status: 'accepted' }); // not started: nothing to chase
  return { customer, provider, finance, unpaid, waiting, owed };
}

const get = (token, path) => api().get(`/api/admin/payments/follow-up${path}`).set(bearer(token));
const log = (token, body) => api().post('/api/admin/payments/follow-ups').set(bearer(token)).send(body);

describe('payment follow-up backlog', () => {
  test('shows how much is waiting in each of the three buckets, and how much is overdue', async () => {
    const { finance } = await setup();
    const res = await get(finance.token, '');
    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    expect(s.unpaid_jobs).toMatchObject({ count: 1, value: 40000, overdue: 1 }); // finished 5 days ago, limit is 3
    expect(s.awaiting_confirmation).toMatchObject({ count: 1, value: 40000, overdue: 1 }); // 3 days, limit is 1
    expect(s.payouts_due).toMatchObject({ count: 1, value: 35200, overdue: 1 });
  });

  test('lists the items of one bucket with names, amounts and how long they have waited', async () => {
    const { finance, customer, unpaid } = await setup();
    const res = await get(finance.token, '/unpaid_jobs');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ bookingId: String(unpaid._id), amount: 40000, bookingStatus: 'completed', ageDays: 5, overdue: true, followUpCount: 0, customerName: customer.user.fullName });

    const payouts = await get(finance.token, '/payouts_due');
    expect(payouts.body.data[0]).toMatchObject({ amount: 35200, bookingStatus: 'completed' });
    expect((await get(finance.token, '/nonsense')).status).toBe(400);
  });

  test('administrators can use it too; customers and providers cannot', async () => {
    const { customer, provider } = await setup();
    const admin = await createSession(['admin']);
    expect((await get(admin.token, '')).status).toBe(200);
    expect((await get(customer.token, '')).status).toBe(403);
    expect((await get(provider.token, '')).status).toBe(403);
  });
});

describe('logging a follow-up', () => {
  test('records who was contacted and what was said, and pushes the next look to the date chosen', async () => {
    const { finance, unpaid } = await setup();
    const res = await log(finance.token, { bookingId: String(unpaid._id), kind: 'payment', outcome: 'promised', note: 'Called the customer. Will pay by mobile money on Friday.', nextFollowUpAt: dayString(3) });
    expect(res.status).toBe(201);
    expect(res.body.data.followUp).toMatchObject({ kind: 'payment', outcome: 'promised', by: finance.user.fullName, reminderSent: false });

    const after = await get(finance.token, '/unpaid_jobs');
    expect(after.body.data[0]).toMatchObject({ followUpCount: 1, overdue: false, lastFollowUp: { outcome: 'promised', note: expect.stringMatching(/Friday/) } });
    expect((await get(finance.token, '')).body.data.summary.unpaid_jobs.overdue).toBe(0);

    const history = await api().get(`/api/admin/payments/follow-ups?bookingId=${unpaid._id}`).set(bearer(finance.token));
    expect(history.body.data).toHaveLength(1);
    expect(await AuditLog.findOne({ action: 'payment.follow_up_logged', actor: finance.user._id })).toBeTruthy();
  });

  test('can remind the customer, but not more than once a day', async () => {
    const { finance, customer, unpaid } = await setup();
    const body = { bookingId: String(unpaid._id), kind: 'payment', note: 'Sent a reminder.', remindCustomer: true };
    expect((await log(finance.token, body)).status).toBe(201);
    const note = await Notification.findOne({ user: customer.user._id, title: 'Payment reminder' });
    expect(note.body).toMatch(/40,000 RWF/);
    expect(note.link).toBe(`/dashboard/bookings/${unpaid._id}`);

    const again = await log(finance.token, body);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REMINDER_TOO_SOON');
    expect(await Notification.countDocuments({ user: customer.user._id, title: 'Payment reminder' })).toBe(1);
    // a note without a reminder is always fine
    expect((await log(finance.token, { ...body, remindCustomer: false, note: 'Still no answer.' })).status).toBe(201);
  });

  test('refuses nonsense: paid jobs, payouts with nothing received, short notes, past dates', async () => {
    const { finance, unpaid, owed } = await setup();
    const paid = await log(finance.token, { bookingId: String(owed._id), kind: 'payment', note: 'Chasing a paid job.' });
    expect(paid.status).toBe(409);
    expect(paid.body.error.code).toBe('ALREADY_PAID');
    expect((await log(finance.token, { bookingId: String(unpaid._id), kind: 'payout', note: 'Payout without payment.' })).body.error.code).toBe('NOTHING_TO_PAY_OUT');
    expect((await log(finance.token, { bookingId: String(unpaid._id), kind: 'payment', note: 'ok' })).status).toBe(400);
    expect((await log(finance.token, { bookingId: String(unpaid._id), kind: 'payment', note: 'Asked again.', nextFollowUpAt: dayString(-2) })).status).toBe(400);
    expect((await log(finance.token, { bookingId: String(unpaid._id), kind: 'payout', note: 'Reminder on a payout.', remindCustomer: true })).status).toBe(409);
  });

  test('a payout can be followed up once the customer has paid', async () => {
    const { finance, owed } = await setup();
    const res = await log(finance.token, { bookingId: String(owed._id), kind: 'payout', outcome: 'contacted', note: 'Asked the provider for their mobile money number.' });
    expect(res.status).toBe(201);
    expect((await get(finance.token, '/payouts_due')).body.data[0]).toMatchObject({ followUpCount: 1 });
  });
});

describe('the follow-up officer acts on what they chase', () => {
  test('recording the payment takes the job off the backlog, in the officer\'s name', async () => {
    const { finance, unpaid } = await setup();
    const res = await api().post('/api/admin/payments').set(bearer(finance.token)).send({ bookingId: String(unpaid._id), reference: 'MOMO-123456', note: 'Confirmed on the statement' });
    expect(res.status).toBe(201);
    expect((await get(finance.token, '')).body.data.summary.unpaid_jobs.count).toBe(0);
    expect((await get(finance.token, '')).body.data.summary.payouts_due.count).toBe(2);
    expect((await AuditLog.findOne({ action: 'payment.manual_recorded' })).actor.toString()).toBe(String(finance.user._id));
  });

  test('can record a payout, which clears it from the backlog', async () => {
    const { finance, owed } = await setup();
    const payment = await Payment.findOne({ booking: owed._id });
    const res = await api().post(`/api/admin/payments/${payment._id}/payout`).set(bearer(finance.token)).send({ reference: 'PAYOUT-1' });
    expect(res.status).toBe(200);
    expect((await get(finance.token, '')).body.data.summary.payouts_due.count).toBe(0);
  });

  test('cannot change the commission rate', async () => {
    const { finance } = await setup();
    expect((await api().put('/api/admin/settings/commission').set(bearer(finance.token)).send({ rateBps: 500 })).status).toBe(403);
  });
});
