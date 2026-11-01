const AuditLog = require('../models/AuditLog');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceRequest = require('../models/ServiceRequest');
const { api, bearer, createCategory, createSession, createProvider, createAdmin, createRequestDoc, createQuotationDoc, createBookingDoc } = require('./helpers');

async function setup(bookingStatus = 'accepted', overrides = {}) {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
  const booking = await createBookingDoc({ customer, provider, category, status: bookingStatus, ...overrides });
  return { category, customer, provider, booking };
}

const move = (token, id, body) => api().patch(`/api/bookings/${id}/status`).set(bearer(token)).send(body);
const get = (token, id) => api().get(`/api/bookings/${id}`).set(bearer(token));
const REASON = 'The agreed work could not go ahead as planned.';

describe('booking is created when a quotation is accepted', () => {
  test('accepting copies the price and parties onto a new booking, and notifies the provider with a link to it', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    const request = await createRequestDoc(customer.user, category, { title: 'Repair the shop network' });
    const quote = await createQuotationDoc(request, provider.profile, { price: 42000 });

    const res = await api().patch(`/api/quotations/${quote._id}`).set(bearer(customer.token)).send({ status: 'accepted' });
    expect(res.status).toBe(200);

    const bookings = await Booking.find();
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ title: 'Repair the shop network', agreedPrice: 42000, status: 'accepted' });
    expect(String(bookings[0].customer)).toBe(String(customer.user._id));
    expect(String(bookings[0].providerUser)).toBe(String(provider.user._id));
    expect(bookings[0].history).toHaveLength(1);
    expect(bookings[0].history[0]).toMatchObject({ to: 'accepted', role: 'customer' });

    const note = await Notification.findOne({ type: 'quotation.accepted' });
    expect(note.link).toBe(`/dashboard/bookings/${bookings[0]._id}`);

    const req = await api().get(`/api/requests/${request._id}`).set(bearer(customer.token));
    expect(req.body.data.request.bookingId).toBe(String(bookings[0]._id));
    const asProvider = await api().get(`/api/requests/${request._id}`).set(bearer(provider.token));
    expect(asProvider.body.data.request.bookingId).toBe(String(bookings[0]._id));
  });

  test('a rival provider does not learn the booking id, and two simultaneous accepts still make one booking', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const a = await createProvider({ profileOverrides: { categories: [category._id] } });
    const b = await createProvider({ profileOverrides: { categories: [category._id] } });
    const request = await createRequestDoc(customer.user, category);
    const qa = await createQuotationDoc(request, a.profile);
    const qb = await createQuotationDoc(request, b.profile);

    const results = await Promise.all([
      api().patch(`/api/quotations/${qa._id}`).set(bearer(customer.token)).send({ status: 'accepted' }),
      api().patch(`/api/quotations/${qb._id}`).set(bearer(customer.token)).send({ status: 'accepted' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await Booking.countDocuments()).toBe(1);

    const booking = await Booking.findOne();
    const loser = String(booking.providerUser) === String(a.user._id) ? b : a;
    const res = await api().get(`/api/requests/${request._id}`).set(bearer(loser.token));
    expect(res.body.data.request.bookingId).toBeUndefined();
  });
});

describe('GET /api/bookings', () => {
  test('each side sees their own jobs; strangers see none; admins can list everything', async () => {
    const { customer, provider } = await setup();
    const stranger = await createSession(['customer']);

    const c = await api().get('/api/bookings').set(bearer(customer.token));
    expect(c.status).toBe(200);
    expect(c.body.data).toHaveLength(1);
    expect(c.body.data[0]).toMatchObject({ myRole: 'customer', agreedPrice: 40000 });
    expect((await api().get('/api/bookings').set(bearer(provider.token))).body.data[0].myRole).toBe('provider');
    expect((await api().get('/api/bookings').set(bearer(stranger.token))).body.data).toEqual([]);

    expect((await api().get('/api/bookings?scope=all').set(bearer(customer.token))).status).toBe(403);
    const admin = await createAdmin();
    const all = await api().get('/api/bookings').set(bearer(admin.token)); // admin-only accounts default to everything
    expect(all.body.data).toHaveLength(1);
    expect(all.body.meta.scope).toBe('all');
    expect((await api().get('/api/bookings')).status).toBe(401);
  });

  test('filters by role and status (including "active"), and paginates', async () => {
    const { category, customer, provider } = await setup('accepted');
    await createBookingDoc({ customer, provider, category, status: 'in_progress' });
    await createBookingDoc({ customer, provider, category, status: 'completed', completedAt: new Date() });

    const list = (q) => api().get(`/api/bookings?${q}`).set(bearer(customer.token));
    expect((await list('status=active')).body.data).toHaveLength(2);
    expect((await list('status=completed')).body.data).toHaveLength(1);
    expect((await list('as=provider')).body.data).toHaveLength(0);
    expect((await list('as=customer')).body.data).toHaveLength(3);
    const paged = await list('limit=2&page=2');
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta).toMatchObject({ total: 3, totalPages: 2 });
    expect((await list('status=nonsense')).status).toBe(400);
  });
});

describe('GET /api/bookings/:id', () => {
  test('parties and admins can read it; everyone else gets 404', async () => {
    const { customer, provider, booking } = await setup();
    expect((await get(customer.token, booking._id)).status).toBe(200);
    expect((await get(provider.token, booking._id)).status).toBe(200);
    expect((await get((await createAdmin()).token, booking._id)).body.data.booking.myRole).toBe('admin');

    const stranger = await createSession(['customer']);
    const otherProvider = await createProvider();
    expect((await get(stranger.token, booking._id)).status).toBe(404);
    expect((await get(otherProvider.token, booking._id)).status).toBe(404);
    expect((await get(customer.token, 'not-an-id')).status).toBe(400);
  });

  test('phone numbers are shared with the other side only while the job is live', async () => {
    const { customer, provider, booking } = await setup();
    await customer.user.updateOne({ phone: '+250788111222' });
    await provider.user.updateOne({ phone: '+250788333444' });

    const asProvider = (await get(provider.token, booking._id)).body.data.booking;
    expect(asProvider.customer.phone).toBe('+250788111222');
    expect(asProvider.provider.phone).toBeUndefined(); // your own number is not echoed back as "theirs"
    const asCustomer = (await get(customer.token, booking._id)).body.data.booking;
    expect(asCustomer.provider.phone).toBe('+250788333444');
    expect(asCustomer.customer.phone).toBeUndefined();
    expect((await get((await createAdmin()).token, booking._id)).body.data.booking.customer.phone).toBeUndefined();

    await Booking.updateOne({ _id: booking._id }, { status: 'completed', completedAt: new Date() });
    expect((await get(provider.token, booking._id)).body.data.booking.customer.phone).toBeUndefined();
  });

  test('tells each viewer which moves they can make', async () => {
    const { customer, provider, booking } = await setup();
    expect((await get(provider.token, booking._id)).body.data.booking.allowedActions.sort()).toEqual(['cancelled', 'in_progress']);
    expect((await get(customer.token, booking._id)).body.data.booking.allowedActions).toEqual(['cancelled']);
    expect((await get((await createAdmin()).token, booking._id)).body.data.booking.allowedActions).toEqual([]);
  });
});

describe('PATCH /api/bookings/:id/status', () => {
  test('the provider starts and completes the job, with history, timestamps and notifications', async () => {
    const { customer, provider, booking } = await setup();

    const started = await move(provider.token, booking._id, { status: 'in_progress' });
    expect(started.status).toBe(200);
    expect(started.body.data.booking.status).toBe('in_progress');
    expect(started.body.data.booking.startedAt).toBeTruthy();

    const done = await move(provider.token, booking._id, { status: 'completed' });
    expect(done.status).toBe(200);
    expect(done.body.data.booking.status).toBe('completed');
    expect(done.body.data.booking.completedAt).toBeTruthy();
    expect(done.body.data.booking.disputeWindowEndsAt).toBeTruthy();
    expect(done.body.data.booking.history.map((h) => `${h.from || '-'}>${h.to}:${h.role}`)).toEqual(['->accepted:customer', 'accepted>in_progress:provider', 'in_progress>completed:provider']);

    expect((await ProviderProfile.findById(provider.profile._id)).completedJobs).toBe(1);
    const notes = await Notification.find({ type: 'booking.updated' });
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => String(n.user) === String(customer.user._id))).toBe(true); // the actor is never notified of their own move
    expect(notes[0].link).toBe(`/dashboard/bookings/${booking._id}`);
  });

  test('only the right person can make each move', async () => {
    const { customer, provider, booking } = await setup();
    expect((await move(customer.token, booking._id, { status: 'in_progress' })).status).toBe(403);
    const stranger = await createSession(['customer']);
    expect((await move(stranger.token, booking._id, { status: 'in_progress' })).status).toBe(404);
    expect((await move((await createAdmin()).token, booking._id, { status: 'in_progress' })).status).toBe(403);
    expect((await api().patch(`/api/bookings/${booking._id}/status`).send({ status: 'in_progress' })).status).toBe(401);

    await Booking.updateOne({ _id: booking._id }, { status: 'in_progress' });
    expect((await move(customer.token, booking._id, { status: 'completed' })).status).toBe(403); // the customer cannot mark it done
    expect((await Booking.findById(booking._id)).status).toBe('in_progress');
    expect(provider).toBeDefined();
  });

  test('rejects moves the lifecycle does not allow', async () => {
    const { provider, booking } = await setup();
    const code = async (status) => (await move(provider.token, booking._id, { status })).body.error?.code;
    expect(await code('completed')).toBe('INVALID_STATUS_TRANSITION'); // cannot skip in_progress
    expect(await code('accepted')).toBe('INVALID_STATUS_TRANSITION');
    expect(await code('disputed')).toBe('INVALID_STATUS_TRANSITION');

    await move(provider.token, booking._id, { status: 'in_progress' });
    expect(await code('in_progress')).toBe('INVALID_STATUS_TRANSITION');
    expect(await code('cancelled')).toBe('INVALID_STATUS_TRANSITION'); // work in progress cannot just be cancelled

    await Booking.updateOne({ _id: booking._id }, { status: 'cancelled' });
    expect(await code('in_progress')).toBe('INVALID_STATUS_TRANSITION'); // cancelled is final
  });

  test('cancelling before work starts needs a reason, and tells the other side', async () => {
    const { customer, provider, booking } = await setup();
    expect((await move(customer.token, booking._id, { status: 'cancelled' })).status).toBe(400);
    expect((await move(customer.token, booking._id, { status: 'cancelled', note: 'too short' })).status).toBe(400);

    const res = await move(customer.token, booking._id, { status: 'cancelled', note: REASON });
    expect(res.status).toBe(200);
    expect(res.body.data.booking).toMatchObject({ status: 'cancelled' });
    expect(res.body.data.booking.history.at(-1)).toMatchObject({ to: 'cancelled', role: 'customer', note: REASON });

    const note = await Notification.findOne({ type: 'booking.updated' });
    expect(String(note.user)).toBe(String(provider.user._id));
    expect(note.body).toBe(REASON);
    expect(await AuditLog.countDocuments({ action: 'booking.cancelled' })).toBe(1);
    expect((await ServiceRequest.findById(booking.request)).status).toBe('accepted'); // the request stays closed; post a new one to rehire
  });

  test('a provider can cancel too, before starting', async () => {
    const { customer, provider, booking } = await setup();
    expect((await move(provider.token, booking._id, { status: 'cancelled', note: REASON })).status).toBe(200);
    expect(String((await Notification.findOne({ type: 'booking.updated' })).user)).toBe(String(customer.user._id));
  });

  test('either side can report a problem while work is in progress, with a mandatory reason', async () => {
    const { customer, provider, booking } = await setup('in_progress');
    expect((await move(customer.token, booking._id, { status: 'disputed' })).status).toBe(400);
    const res = await move(customer.token, booking._id, { status: 'disputed', note: 'The provider stopped answering my calls.' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('disputed');
    expect(res.body.data.booking.disputedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'booking.disputed' })).toBe(1);
    expect(String((await Notification.findOne({ type: 'booking.updated' })).user)).toBe(String(provider.user._id));
  });

  test('a completed job can be disputed only inside the window', async () => {
    const inside = await setup('completed', { completedAt: new Date(Date.now() - 2 * 86_400_000) });
    expect((await move(inside.customer.token, inside.booking._id, { status: 'disputed', note: REASON })).status).toBe(200);

    const outside = await setup('completed', { completedAt: new Date(Date.now() - 30 * 86_400_000) });
    const late = await move(outside.customer.token, outside.booking._id, { status: 'disputed', note: REASON });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('DISPUTE_WINDOW_CLOSED');
    expect((await get(outside.customer.token, outside.booking._id)).body.data.booking.allowedActions).toEqual([]);
  });

  test('only an administrator resolves a dispute, and completedJobs is counted once', async () => {
    const { customer, provider, booking } = await setup('in_progress');
    await move(customer.token, booking._id, { status: 'disputed', note: 'The work was never finished properly.' });
    expect((await move(customer.token, booking._id, { status: 'completed' })).status).toBe(403);
    expect((await move(provider.token, booking._id, { status: 'cancelled', note: REASON })).status).toBe(403);

    const admin = await createAdmin();
    expect((await move(admin.token, booking._id, { status: 'cancelled' })).status).toBe(400); // admins need a note too
    const res = await move(admin.token, booking._id, { status: 'completed', note: 'Evidence shows the work was delivered.' });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.history.at(-1)).toMatchObject({ to: 'completed', role: 'admin' });
    expect((await ProviderProfile.findById(provider.profile._id)).completedJobs).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'booking.completed' })).toBe(1);

    const both = await Notification.find({ type: 'booking.updated', title: /Dispute resolved/ });
    expect(both.map((n) => String(n.user)).sort()).toEqual([String(customer.user._id), String(provider.user._id)].sort());
  });

  test('cancelling a completed-then-disputed job takes the completed job back off the provider', async () => {
    const { customer, provider, booking } = await setup('in_progress');
    await move(provider.token, booking._id, { status: 'completed' });
    expect((await ProviderProfile.findById(provider.profile._id)).completedJobs).toBe(1);

    await move(customer.token, booking._id, { status: 'disputed', note: 'The work did not match the quotation.' });
    const admin = await createAdmin();
    expect((await move(admin.token, booking._id, { status: 'cancelled', note: 'Work was not delivered as quoted.' })).status).toBe(200);
    expect((await ProviderProfile.findById(provider.profile._id)).completedJobs).toBe(0);
  });

  test('a move based on stale state loses: two simultaneous moves, exactly one wins', async () => {
    const { customer, provider, booking } = await setup();
    const results = await Promise.all([
      move(provider.token, booking._id, { status: 'in_progress' }),
      move(customer.token, booking._id, { status: 'cancelled', note: REASON }),
    ]);
    expect(results.map((r) => r.status).filter((s) => s === 200)).toHaveLength(1);
    const saved = await Booking.findById(booking._id);
    expect(saved.history).toHaveLength(2); // creation + exactly one move
    expect(['in_progress', 'cancelled']).toContain(saved.status);
  });

  test('rejects unknown statuses and extra fields', async () => {
    const { provider, booking } = await setup();
    expect((await move(provider.token, booking._id, { status: 'paid' })).status).toBe(400);
    expect((await move(provider.token, booking._id, { status: 'in_progress', agreedPrice: 1 })).status).toBe(400);
    expect((await move(provider.token, booking._id, {})).status).toBe(400);
    expect((await Booking.findById(booking._id)).agreedPrice).toBe(40000);
  });
});
