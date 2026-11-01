const AuditLog = require('../models/AuditLog');
const Dispute = require('../models/Dispute');
const Payment = require('../models/Payment');
const ProviderProfile = require('../models/ProviderProfile');
const { api, bearer, createCategory, createSession, createProvider, createBookingDoc } = require('./helpers');

const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const report = (token, query = '') => api().get(`/api/admin/reports/activity${query}`).set(bearer(token));
const pendingOf = (body, key) => body.data.report.pendings.find((p) => p.key === key);

async function setup() {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id], displayName: 'Eric Electric' } });
  const other = await createProvider({ profileOverrides: { categories: [category._id], displayName: 'Quiet Provider' } });
  const make = (overrides) => createBookingDoc({ customer, provider, category, ...overrides });

  await make({ status: 'completed', startedAt: daysAgo(4), completedAt: daysAgo(2) }); // 2 days of work
  await make({ status: 'completed', startedAt: daysAgo(6), completedAt: daysAgo(2) }); // 4 days of work
  await make({ status: 'cancelled', cancelledAt: daysAgo(1) });
  await make({ status: 'in_progress', startedAt: daysAgo(1) });
  const sa = await createSession(['super_admin']);
  return { category, customer, provider, other, sa };
}

describe('GET /api/admin/reports/activity', () => {
  test('only a super admin can read it', async () => {
    const { customer } = await setup();
    const admin = await createSession(['admin']);
    const finance = await createSession(['finance']);
    expect((await report(admin.token)).status).toBe(403);
    expect((await report(finance.token)).status).toBe(403);
    expect((await report(customer.token)).status).toBe(403);
    expect((await api().get('/api/admin/reports/activity')).status).toBe(401);
  });

  test('has the four sections', async () => {
    const { sa } = await setup();
    const res = await report(sa.token);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data.report)).toEqual(expect.arrayContaining(['from', 'to', 'generatedAt', 'pendings', 'providers', 'delivery', 'adminWork']));
  });

  test('rejects a backwards or oversized period', async () => {
    const { sa } = await setup();
    expect((await report(sa.token, '?from=2026-10-10&to=2026-10-01')).status).toBe(400);
    expect((await report(sa.token, '?from=2024-01-01&to=2026-01-01')).status).toBe(400);
    expect((await report(sa.token, '?from=yesterday')).status).toBe(400);
  });
});

describe('provider activity', () => {
  test('one row per provider who did something, with jobs, value and quotations', async () => {
    const { sa, provider } = await setup();
    const { providers } = (await report(sa.token)).body.data.report;
    expect(providers.activeProviders).toBe(1); // "Quiet Provider" did nothing
    expect(providers.inactiveVerifiedProviders).toBe(1);
    expect(providers.rows[0]).toMatchObject({ providerId: String(provider.profile._id), name: 'Eric Electric', quotationsSent: 4, quotationsAccepted: 4, jobsWon: 4, jobsCompleted: 2, jobsCancelled: 1, completedValue: 80000 });
  });

  test('counts only what happened in the period', async () => {
    const { sa } = await setup();
    const res = await report(sa.token, `?from=2020-01-01&to=2020-01-31`);
    expect(res.body.data.report.providers.rows).toEqual([]);
    expect(res.body.data.report.delivery.jobs.total).toBe(0);
  });

  test('counts disputes raised against a provider', async () => {
    const { sa, provider, customer, category } = await setup();
    const booking = await createBookingDoc({ customer, provider, category, status: 'disputed' });
    await Dispute.create({ booking: booking._id, customer: customer.user._id, providerUser: provider.user._id, opener: customer.user._id, openerRole: 'customer', reason: 'The work was left unfinished.' });
    const row = (await report(sa.token)).body.data.report.providers.rows[0];
    expect(row.disputes).toBe(1);
  });
});

describe('service delivery', () => {
  test('job outcomes, completion rate and how long jobs take', async () => {
    const { sa } = await setup();
    const { delivery } = (await report(sa.token)).body.data.report;
    expect(delivery.jobs).toEqual({ total: 4, accepted: 0, in_progress: 1, completed: 2, cancelled: 1, disputed: 0 });
    expect(delivery.completedValue).toBe(80000);
    expect(delivery.completionRate).toBe(66.7); // 2 completed of the 3 that have ended
    expect(delivery.avgDaysToComplete).toBe(3); // (2 + 4) / 2
    expect(delivery.funnel.requests).toBe(4);
    expect(delivery.byCategory[0]).toMatchObject({ jobs: 4, completed: 2, value: 160000 });
  });
});

describe('admin work', () => {
  test('shows what each staff member did, and lists the ones who did nothing', async () => {
    const { sa } = await setup();
    const admin = await createSession(['admin']);
    const finance = await createSession(['finance']);
    const idle = await createSession(['admin']);
    const act = (who, action, n = 1) => AuditLog.insertMany(Array.from({ length: n }, () => ({ actor: who.user._id, action })));
    await act(admin, 'provider.verification_changed', 3);
    await act(admin, 'review.moderated', 2);
    await act(finance, 'payment.manual_recorded', 4);
    await act(admin, 'auth.login', 9); // signing in is not work
    await AuditLog.create({ actor: admin.user._id, action: 'provider.verification_changed', createdAt: new Date('2020-01-01') }); // outside the period

    const { adminWork } = (await report(sa.token)).body.data.report;
    const byName = new Map(adminWork.members.map((m) => [m.id, m]));
    expect(byName.get(String(admin.user._id))).toMatchObject({ total: 5, actions: [{ action: 'provider.verification_changed', count: 3 }, { action: 'review.moderated', count: 2 }] });
    expect(byName.get(String(finance.user._id)).total).toBe(4);
    expect(byName.get(String(idle.user._id)).total).toBe(0); // listed, with nothing done
    expect(adminWork.members.every((m) => m.roles.some((r) => ['admin', 'super_admin', 'finance'].includes(r)))).toBe(true);
    expect(adminWork.byAction[0]).toEqual({ action: 'payment.manual_recorded', count: 4 });
  });
});

describe('pendings', () => {
  test('lists what is waiting, with how many and since when', async () => {
    const { sa, customer, provider, category } = await setup();

    const unverified = await createProvider({ verified: false });
    await ProviderProfile.updateOne({ _id: unverified.profile._id }, { verificationStatus: 'pending' });
    const booking = await createBookingDoc({ customer, provider, category, status: 'disputed' });
    await Dispute.create({ booking: booking._id, customer: customer.user._id, providerUser: provider.user._id, opener: customer.user._id, openerRole: 'customer', reason: 'The work was left unfinished.' });
    const unpaid = await createBookingDoc({ customer, provider, category, status: 'completed', completedAt: daysAgo(5) });
    await Payment.create({
      booking: unpaid._id, customer: customer.user._id, provider: provider.profile._id, providerUser: provider.user._id, gateway: 'manual', amount: 40000,
      commissionRateBps: 1200, commissionAmount: 4800, providerAmount: 35200, status: 'pending', createdAt: daysAgo(2),
    });

    const body = (await report(sa.token)).body;
    expect(pendingOf(body, 'providers_awaiting_verification')).toMatchObject({ group: 'Providers', count: 1 });
    expect(pendingOf(body, 'disputes_open')).toMatchObject({ count: 1 });
    expect(pendingOf(body, 'payments_awaiting_confirmation')).toMatchObject({ count: 1, value: 40000, overdue: 1 });
    expect(pendingOf(body, 'jobs_in_progress').count).toBe(1);
    expect(pendingOf(body, 'providers_asked_for_info').count).toBe(0);
    expect(new Date(pendingOf(body, 'payments_awaiting_confirmation').oldestAt).getTime()).toBeLessThan(Date.now() - DAY);
  });

  test('pendings ignore the chosen period: they are about now', async () => {
    const { sa } = await setup();
    const res = await report(sa.token, '?from=2020-01-01&to=2020-01-31');
    expect(pendingOf(res.body, 'jobs_in_progress').count).toBe(1);
  });
});
