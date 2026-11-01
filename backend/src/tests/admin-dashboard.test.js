const AuditLog = require('../models/AuditLog');
const ServiceListing = require('../models/ServiceListing');
const ProviderProfile = require('../models/ProviderProfile');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const { api, bearer, PASSWORD, createCategory, createSession, createProvider, createAdmin, createBookingDoc, createRequestDoc, createListingDoc, validListing } = require('./helpers');

const dash = (token) => api().get('/api/admin/dashboard').set(bearer(token));

describe('GET /api/admin/dashboard', () => {
  test('counts users, providers, requests, jobs, reviews, disputes and money', async () => {
    const category = await createCategory();
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    await createProvider({ verified: false });
    await createRequestDoc(customer.user, category);
    await createRequestDoc(customer.user, category, { status: 'cancelled' });
    const done = await createBookingDoc({ customer, provider, category, status: 'completed', completedAt: new Date() });
    await createBookingDoc({ customer, provider, category, status: 'in_progress' });
    const inDispute = await createBookingDoc({ customer, provider, category, status: 'in_progress' });
    await api().patch(`/api/bookings/${inDispute._id}/status`).set(bearer(customer.token)).send({ status: 'disputed', note: 'The provider stopped answering calls.' });
    await Payment.create({ booking: done._id, customer: customer.user._id, provider: provider.profile._id, providerUser: provider.user._id, gateway: 'manual', amount: 40000, commissionRateBps: 1200, commissionAmount: 4800, providerAmount: 35200, status: 'succeeded', gatewayReference: 'ref-dash-1', confirmedAt: new Date() });
    await Review.create({ booking: done._id, provider: provider.profile._id, customer: customer.user._id, rating: 4, comment: 'Good work overall, thank you.', reportCount: 1 });

    const res = await dash(admin.token);
    expect(res.status).toBe(200);
    const d = res.body.data.dashboard;
    expect(d.users).toMatchObject({ total: 4, suspended: 0, joinedLast7Days: 4, byRole: { customer: 1, provider: 2, business: 0, admin: 1 } });
    expect(d.providers).toMatchObject({ total: 2, verified: 1, unverified: 1, pending: 0 });
    // the three jobs each came from a request that was accepted
    expect(d.requests).toMatchObject({ total: 5, open: 1, cancelled: 1, accepted: 3 });
    expect(d.jobs).toMatchObject({ total: 3, active: 1, completed: 1, disputed: 1 });
    expect(d.reviews).toMatchObject({ published: 1, hidden: 0, reported: 1 });
    expect(d.disputes).toMatchObject({ open: 1, underReview: 0 });
    expect(d.needsAttention).toEqual({ providersToVerify: 0, reportedReviews: 1, openDisputes: 1, manualPaymentsWaiting: 0 });
  });

  test('keeps gross transaction value apart from platform revenue', async () => {
    const category = await createCategory();
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    const booking = await createBookingDoc({ customer, provider, category, status: 'completed', completedAt: new Date() });
    await Payment.create({ booking: booking._id, customer: customer.user._id, provider: provider.profile._id, providerUser: provider.user._id, gateway: 'manual', amount: 100000, commissionRateBps: 1200, commissionAmount: 12000, providerAmount: 88000, status: 'succeeded', gatewayReference: 'ref-dash-2', confirmedAt: new Date() });

    const { finance } = (await dash(admin.token)).body.data.dashboard;
    expect(finance).toMatchObject({ grossTransactionValue: 100000, platformRevenue: 12000, providerShare: 88000 });
    expect(finance.profit).toBeUndefined();
  });

  test('lists recent administrative activity, newest first, without sign-in noise', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ verified: false });
    await api().patch(`/api/admin/providers/${provider.profile._id}/verification`).set(bearer(admin.token)).send({ status: 'verified' });
    await AuditLog.create({ actor: admin.user._id, action: 'auth.login', entityType: 'User', entityId: admin.user._id });

    const activity = (await dash(admin.token)).body.data.dashboard.recentActivity;
    expect(activity.map((a) => a.action)).toContain('provider.verification_changed');
    expect(activity.some((a) => a.action.startsWith('auth.'))).toBe(false);
    expect(activity[0]).toMatchObject({ actor: admin.user.fullName, entityType: 'ProviderProfile' });
  });

  test('is admin-only', async () => {
    const customer = await createSession(['customer']);
    expect((await dash(customer.token)).status).toBe(403);
    expect((await api().get('/api/admin/dashboard')).status).toBe(401);
  });
});

describe('GET /api/admin/reports', () => {
  const report = (token, q = '') => api().get(`/api/admin/reports${q}`).set(bearer(token));

  test('defaults to the last 30 days with every day present', async () => {
    const admin = await createAdmin();
    const res = await report(admin.token);
    expect(res.status).toBe(200);
    const r = res.body.data.report;
    expect(r.series).toHaveLength(30);
    expect(r.series.at(-1).date).toBe(new Date().toISOString().slice(0, 10));
    expect(r.series.filter((d) => d.newUsers > 0)).toHaveLength(1); // only today, when the admin was created
    expect(r.totals).toMatchObject({ newUsers: 1, grossValue: 0, completedJobs: 0 });
  });

  test('counts what happened on each day', async () => {
    const category = await createCategory();
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    await createRequestDoc(customer.user, category);
    const booking = await createBookingDoc({ customer, provider, category, status: 'completed', completedAt: new Date() });
    await Payment.create({ booking: booking._id, customer: customer.user._id, provider: provider.profile._id, providerUser: provider.user._id, gateway: 'manual', amount: 40000, commissionRateBps: 1200, commissionAmount: 4800, providerAmount: 35200, status: 'succeeded', gatewayReference: 'ref-rep-1', confirmedAt: new Date(), refunds: [{ amount: 10000, commissionPart: 1200, providerPart: 8800, reason: 'Partial refund', by: admin.user._id, at: new Date() }], refundedAmount: 10000 });

    const today = new Date().toISOString().slice(0, 10);
    const r = (await report(admin.token, `?from=${today}&to=${today}`)).body.data.report;
    expect(r.series).toHaveLength(1);
    expect(r.series[0]).toMatchObject({ date: today, newUsers: 3, requests: 2, completedJobs: 1, grossValue: 40000, commission: 4800, refunds: 10000 });
    expect(r.totals).toMatchObject({ completedJobs: 1, grossValue: 40000, commission: 4800 });
  });

  test('rejects bad ranges', async () => {
    const admin = await createAdmin();
    for (const q of ['?from=2026-02-30', '?from=yesterday', '?from=2026-05-02&to=2026-05-01', '?from=2024-01-01&to=2026-01-01']) {
      expect((await report(admin.token, q)).status).toBe(400);
    }
    expect((await report(admin.token, '?from=2026-05-01&to=2026-05-01')).status).toBe(200);
  });

  test('is admin-only', async () => {
    const customer = await createSession(['customer']);
    expect((await report(customer.token)).status).toBe(403);
  });
});

describe('PATCH /api/admin/users/:id/status', () => {
  const setStatus = (token, id, body) => api().patch(`/api/admin/users/${id}/status`).set(bearer(token)).send(body);

  test('suspending blocks the account at once, ends its sessions, and is audited with a reason', async () => {
    const admin = await createAdmin();
    const victim = await createSession(['customer']);
    expect((await api().get('/api/auth/me').set(bearer(victim.token))).status).toBe(200);

    const res = await setStatus(admin.token, victim.user._id, { status: 'suspended', reason: 'Abusive messages to providers' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ status: 'suspended', suspensionReason: 'Abusive messages to providers' });

    const me = await api().get('/api/auth/me').set(bearer(victim.token));
    expect(me.status).toBe(401); // the session itself was revoked
    const login = await api().post('/api/auth/login').send({ email: victim.user.email, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const audit = await AuditLog.findOne({ action: 'user.suspended' });
    expect(audit.metadata.reason).toBe('Abusive messages to providers');
    expect(String(audit.actor)).toBe(String(admin.user._id));
  });

  test('reinstating lets them log in again and clears the reason', async () => {
    const admin = await createAdmin();
    const victim = await createSession(['customer']);
    await setStatus(admin.token, victim.user._id, { status: 'suspended', reason: 'Under investigation' });
    const res = await setStatus(admin.token, victim.user._id, { status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.suspensionReason).toBeUndefined();
    expect((await api().post('/api/auth/login').send({ email: victim.user.email, password: PASSWORD })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'user.reinstated' })).toBe(1);
  });

  test('suspending a verified provider takes them off public search and pauses their listings', async () => {
    const admin = await createAdmin();
    const category = await createCategory();
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    const listing = await createListingDoc(provider.profile, category, { status: 'active' });

    expect((await api().get('/api/services')).body.data.map((l) => l.id)).toContain(String(listing._id));
    await setStatus(admin.token, provider.user._id, { status: 'suspended', reason: 'Fraud complaint received' });

    expect((await ProviderProfile.findById(provider.profile._id)).verificationStatus).toBe('unverified');
    expect((await ServiceListing.findById(listing._id)).status).toBe('paused');
    expect((await api().get('/api/services')).body.data).toEqual([]);
    expect((await api().get(`/api/providers/${provider.profile._id}`)).status).toBe(404);

    await setStatus(admin.token, provider.user._id, { status: 'active' });
    expect((await ProviderProfile.findById(provider.profile._id)).verificationStatus).toBe('unverified'); // verification is a separate, deliberate step
  });

  test('a reason is required to suspend; admins and yourself are protected', async () => {
    const admin = await createAdmin();
    const other = await createAdmin();
    const victim = await createSession(['customer']);
    expect((await setStatus(admin.token, victim.user._id, { status: 'suspended' })).status).toBe(400);
    expect((await setStatus(admin.token, victim.user._id, { status: 'suspended', reason: 'no' })).status).toBe(400);
    expect((await setStatus(admin.token, victim.user._id, { status: 'banned', reason: 'Not a real status' })).status).toBe(400);
    expect((await setStatus(admin.token, victim.user._id, { status: 'suspended', reason: 'Spam', roles: ['admin'] })).status).toBe(400);
    expect((await setStatus(admin.token, admin.user._id, { status: 'suspended', reason: 'Locking myself out' })).body.error.code).toBe('CANNOT_MODERATE_SELF');
    expect((await setStatus(admin.token, other.user._id, { status: 'suspended', reason: 'Another administrator' })).body.error.code).toBe('CANNOT_MODERATE_ADMIN');
    expect((await User.findById(victim.user._id)).status).toBe('active');
  });

  test('is admin-only, idempotent, and 404s for unknown users', async () => {
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    const victim = await createSession(['customer']);
    expect((await setStatus(customer.token, victim.user._id, { status: 'suspended', reason: 'I do not like them' })).status).toBe(403);
    expect((await api().patch(`/api/admin/users/${victim.user._id}/status`).send({ status: 'suspended', reason: 'Anonymous attempt' })).status).toBe(401);
    expect((await setStatus(admin.token, '64b7f0f0f0f0f0f0f0f0f0f0', { status: 'suspended', reason: 'No such user' })).status).toBe(404);

    await setStatus(admin.token, victim.user._id, { status: 'suspended', reason: 'First suspension' });
    expect((await setStatus(admin.token, victim.user._id, { status: 'suspended', reason: 'First suspension' })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'user.suspended' })).toBe(1);
  });
});
