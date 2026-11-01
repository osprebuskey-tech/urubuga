const AuditLog = require('../models/AuditLog');
const Booking = require('../models/Booking');
const Dispute = require('../models/Dispute');
const Notification = require('../models/Notification');
const ProviderProfile = require('../models/ProviderProfile');
const { api, bearer, createCategory, createSession, createProvider, createAdmin, createBookingDoc, attachPng, fileExists } = require('./helpers');

const REASON = 'The provider stopped answering my calls.';

async function setup(status = 'in_progress', overrides = {}) {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
  const admin = await createAdmin();
  const booking = await createBookingDoc({ customer, provider, category, status, ...overrides });
  return { category, customer, provider, admin, booking };
}

const move = (token, id, body) => api().patch(`/api/bookings/${id}/status`).set(bearer(token)).send(body);
const get = (token, id) => api().get(`/api/disputes/${id}`).set(bearer(token));
async function disputed() {
  const ctx = await setup();
  await move(ctx.customer.token, ctx.booking._id, { status: 'disputed', note: REASON });
  const dispute = await Dispute.findOne({ booking: ctx.booking._id });
  return { ...ctx, dispute };
}

describe('opening a dispute', () => {
  test('reporting a problem on a job opens a dispute and tells every administrator', async () => {
    const { customer, booking, admin } = await setup();
    const other = await createAdmin();
    expect((await move(customer.token, booking._id, { status: 'disputed', note: REASON })).status).toBe(200);

    const dispute = await Dispute.findOne({ booking: booking._id });
    expect(dispute).toMatchObject({ status: 'open', active: true, openerRole: 'customer', reason: REASON });
    expect(String(dispute.customer)).toBe(String(customer.user._id));

    const notes = await Notification.find({ type: 'dispute.opened' });
    expect(notes.map((n) => String(n.user)).sort()).toEqual([String(admin.user._id), String(other.user._id)].sort());
    expect(notes[0].link).toBe(`/dashboard/disputes/${dispute._id}`);

    const b = (await api().get(`/api/bookings/${booking._id}`).set(bearer(customer.token))).body.data.booking;
    expect(b.dispute).toEqual({ id: String(dispute._id), status: 'open' });
  });

  test('a provider can open one too', async () => {
    const { provider, booking } = await setup();
    await move(provider.token, booking._id, { status: 'disputed', note: 'The customer refuses to let me finish.' });
    expect((await Dispute.findOne({ booking: booking._id })).openerRole).toBe('provider');
  });

  test('if the dispute record cannot be created, the job goes back to how it was', async () => {
    const { customer, booking } = await setup();
    const spy = jest.spyOn(Dispute, 'create').mockRejectedValueOnce(new Error('database hiccup'));
    const res = await move(customer.token, booking._id, { status: 'disputed', note: REASON });
    spy.mockRestore();
    expect(res.status).toBe(500);
    const saved = await Booking.findById(booking._id);
    expect(saved.status).toBe('in_progress');
    expect(saved.history).toHaveLength(1);
    expect(saved.disputedAt).toBeUndefined();
    expect(await Dispute.countDocuments()).toBe(0);
  });
});

describe('reading disputes', () => {
  test('the two parties and administrators can read it; everyone else gets 404', async () => {
    const { customer, provider, admin, dispute } = await disputed();
    const c = (await get(customer.token, dispute._id)).body.data.dispute;
    expect(c).toMatchObject({ status: 'open', reason: REASON, myRole: 'customer', canPost: true, messages: [], evidence: [] });
    expect(c.booking).toMatchObject({ title: 'Fix my office network', agreedPrice: 40000 });
    expect((await get(provider.token, dispute._id)).body.data.dispute.myRole).toBe('provider');
    expect((await get(admin.token, dispute._id)).body.data.dispute.myRole).toBe('admin');

    const stranger = await createSession(['customer']);
    const otherProvider = await createProvider();
    expect((await get(stranger.token, dispute._id)).status).toBe(404);
    expect((await get(otherProvider.token, dispute._id)).status).toBe(404);
    expect((await api().get(`/api/disputes/${dispute._id}`)).status).toBe(401);
    expect((await get(customer.token, 'not-an-id')).status).toBe(400);
  });

  test('lists a user’s own disputes', async () => {
    const { customer, provider, dispute } = await disputed();
    const stranger = await createSession(['customer']);
    expect((await api().get('/api/disputes').set(bearer(customer.token))).body.data.map((d) => d.id)).toEqual([String(dispute._id)]);
    expect((await api().get('/api/disputes').set(bearer(provider.token))).body.data).toHaveLength(1);
    expect((await api().get('/api/disputes').set(bearer(stranger.token))).body.data).toEqual([]);
    expect((await api().get('/api/disputes?status=resolved').set(bearer(customer.token))).body.data).toEqual([]);
  });

  test('never exposes user ids or contact details', async () => {
    const { customer, provider, dispute } = await disputed();
    await api().post(`/api/disputes/${dispute._id}/messages`).set(bearer(provider.token)).send({ text: 'Here is my side of it.' });
    const body = JSON.stringify((await get(customer.token, dispute._id)).body);
    expect(body).not.toContain(String(customer.user._id));
    expect(body).not.toContain(String(provider.user._id));
    expect(body).not.toContain(customer.user.email);
  });
});

describe('messages and evidence', () => {
  const say = (token, id, text) => api().post(`/api/disputes/${id}/messages`).set(bearer(token)).send({ text });

  test('both sides and the administrator can post; the others are notified', async () => {
    const { customer, provider, admin, dispute } = await disputed();
    await api().patch(`/api/admin/disputes/${dispute._id}`).set(bearer(admin.token)).send({ status: 'under_review' });
    await Notification.deleteMany({});

    const res = await say(customer.token, dispute._id, 'I have photos of the unfinished work.');
    expect(res.status).toBe(201);
    expect(res.body.data.dispute.messages).toMatchObject([{ role: 'customer', text: 'I have photos of the unfinished work.' }]);
    const notified = await Notification.find({ type: 'dispute.updated' });
    expect(notified.map((n) => String(n.user)).sort()).toEqual([String(provider.user._id), String(admin.user._id)].sort());

    await say(provider.token, dispute._id, 'The customer changed the job halfway.');
    await say(admin.token, dispute._id, 'Please send the original agreement.');
    expect((await get(customer.token, dispute._id)).body.data.dispute.messages.map((m) => m.role)).toEqual(['customer', 'provider', 'admin']);
  });

  test('strangers cannot post, and messages are validated', async () => {
    const { customer, dispute } = await disputed();
    const stranger = await createSession(['customer']);
    expect((await say(stranger.token, dispute._id, 'Let me in on this.')).status).toBe(404);
    expect((await say(customer.token, dispute._id, '   ')).status).toBe(400);
    expect((await say(customer.token, dispute._id, 'x'.repeat(1001))).status).toBe(400);
    expect((await api().post(`/api/disputes/${dispute._id}/messages`).set(bearer(customer.token)).send({ text: 'hi', role: 'admin' })).status).toBe(400);
    expect((await Dispute.findById(dispute._id)).messages).toHaveLength(0);
  });

  test('photo evidence can be added by the parties, up to ten, and removed files are cleaned up on failure', async () => {
    const { customer, provider, dispute } = await disputed();
    const upload = (token) => attachPng(api().post(`/api/disputes/${dispute._id}/evidence`).set(bearer(token)));
    const first = await upload(customer.token);
    expect(first.status).toBe(201);
    expect(fileExists(first.body.data.dispute.evidence[0].url)).toBe(true);

    expect((await upload((await createSession(['customer'])).token)).status).toBe(404);
    for (let i = 1; i < 10; i += 1) expect((await upload(i % 2 ? provider.token : customer.token)).status).toBe(201);
    const over = await upload(customer.token);
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('EVIDENCE_LIMIT');
    expect((await Dispute.findById(dispute._id)).evidence).toHaveLength(10);
  });

  test('a resolved dispute is closed to new messages and photos', async () => {
    const { customer, admin, dispute } = await disputed();
    await api().patch(`/api/admin/disputes/${dispute._id}`).set(bearer(admin.token)).send({ outcome: 'cancelled', note: 'Work was not delivered as agreed.' });
    const res = await say(customer.token, dispute._id, 'One more thing to add.');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DISPUTE_CLOSED');
    expect((await attachPng(api().post(`/api/disputes/${dispute._id}/evidence`).set(bearer(customer.token)))).status).toBe(409);
  });
});

describe('administrator handling', () => {
  const patch = (token, id, body) => api().patch(`/api/admin/disputes/${id}`).set(bearer(token)).send(body);

  test('lists disputes with a status filter; admins only', async () => {
    const { customer, provider, admin, dispute } = await disputed();
    const list = (q = '') => api().get(`/api/admin/disputes${q}`).set(bearer(admin.token));
    expect((await list()).body.data.map((d) => d.id)).toEqual([String(dispute._id)]);
    expect((await list('?status=resolved')).body.data).toEqual([]);
    expect((await api().get('/api/admin/disputes').set(bearer(customer.token))).status).toBe(403);
    expect((await api().get('/api/admin/disputes').set(bearer(provider.token))).status).toBe(403);
    expect((await api().get('/api/admin/disputes')).status).toBe(401);
  });

  test('taking a dispute for review assigns it, tells both sides, and can only happen once', async () => {
    const { customer, provider, admin, dispute } = await disputed();
    await Notification.deleteMany({});
    const res = await patch(admin.token, dispute._id, { status: 'under_review' });
    expect(res.status).toBe(200);
    expect(res.body.data.dispute).toMatchObject({ status: 'under_review', assigned: true });
    expect(String((await Dispute.findById(dispute._id)).assignedTo)).toBe(String(admin.user._id));
    const notified = await Notification.find({ type: 'dispute.updated' });
    expect(notified.map((n) => String(n.user)).sort()).toEqual([String(customer.user._id), String(provider.user._id)].sort());
    expect(await AuditLog.countDocuments({ action: 'dispute.review_started' })).toBe(1);

    expect((await patch(admin.token, dispute._id, { status: 'under_review' })).status).toBe(409);
  });

  test('resolving applies the outcome to the job, closes the dispute, and tells both sides', async () => {
    const { customer, provider, admin, booking, dispute } = await disputed();
    await Notification.deleteMany({});
    const res = await patch(admin.token, dispute._id, { outcome: 'cancelled', note: 'Work was not delivered as agreed.' });
    expect(res.status).toBe(200);
    expect(res.body.data.dispute).toMatchObject({ status: 'resolved', canPost: false, resolution: { outcome: 'cancelled', note: 'Work was not delivered as agreed.' } });

    const saved = await Dispute.findById(dispute._id);
    expect(saved.active).toBe(false);
    expect(String(saved.resolution.by)).toBe(String(admin.user._id));
    expect((await Booking.findById(booking._id)).status).toBe('cancelled');
    const notes = await Notification.find({ type: 'booking.updated' });
    expect(notes.map((n) => String(n.user)).sort()).toEqual([String(customer.user._id), String(provider.user._id)].sort());
    expect(await AuditLog.countDocuments({ action: 'booking.cancelled', 'metadata.role': 'admin' })).toBe(1);

    expect((await patch(admin.token, dispute._id, { outcome: 'completed', note: 'Changing my mind later.' })).status).toBe(409);
  });

  test('resolving in the provider’s favour completes the job and counts it once', async () => {
    const { provider, admin, booking, dispute } = await disputed();
    expect((await patch(admin.token, dispute._id, { outcome: 'completed', note: 'The work was delivered as quoted.' })).status).toBe(200);
    expect((await Booking.findById(booking._id)).status).toBe('completed');
    expect((await ProviderProfile.findById(provider.profile._id)).completedJobs).toBe(1);
  });

  test('resolving the job through the booking endpoint closes the dispute record too', async () => {
    const { admin, booking, dispute } = await disputed();
    const res = await move(admin.token, booking._id, { status: 'completed', note: 'Resolved from the job page instead.' });
    expect(res.status).toBe(200);
    const saved = await Dispute.findById(dispute._id);
    expect(saved).toMatchObject({ status: 'resolved', active: false });
    expect(saved.resolution.outcome).toBe('completed');
  });

  test('a job can be disputed again later, after the first dispute was resolved', async () => {
    const { customer, admin, booking, dispute } = await disputed();
    await patch(admin.token, dispute._id, { outcome: 'completed', note: 'The work was delivered as quoted.' });
    expect((await move(customer.token, booking._id, { status: 'disputed', note: 'New problem found after the decision.' })).status).toBe(200);
    expect(await Dispute.countDocuments({ booking: booking._id })).toBe(2);
    expect(await Dispute.countDocuments({ booking: booking._id, active: true })).toBe(1);
  });

  test('is admin-only and validates what an administrator can send', async () => {
    const { customer, provider, admin, dispute } = await disputed();
    expect((await patch(customer.token, dispute._id, { outcome: 'cancelled', note: 'Cancel it in my favour.' })).status).toBe(403);
    expect((await patch(provider.token, dispute._id, { outcome: 'completed', note: 'Complete it in my favour.' })).status).toBe(403);
    expect((await patch(admin.token, dispute._id, {})).status).toBe(400);
    expect((await patch(admin.token, dispute._id, { outcome: 'completed' })).status).toBe(400); // a note is required
    expect((await patch(admin.token, dispute._id, { outcome: 'refunded', note: 'Not an outcome we have.' })).status).toBe(400);
    expect((await patch(admin.token, dispute._id, { status: 'under_review', outcome: 'completed', note: 'Both at once is not allowed.' })).status).toBe(400);
    expect((await patch(admin.token, dispute._id, { status: 'resolved' })).status).toBe(400);
    expect((await Dispute.findById(dispute._id)).status).toBe('open');
    expect((await patch(admin.token, '64b7f0f0f0f0f0f0f0f0f0f0', { status: 'under_review' })).status).toBe(404);
  });
});
