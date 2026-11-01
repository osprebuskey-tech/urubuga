const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Quotation = require('../models/Quotation');
const ServiceRequest = require('../models/ServiceRequest');
const {
  api, bearer, createCategory, createSession, createProvider, validQuotation, futureDate, createRequestDoc, createQuotationDoc,
} = require('./helpers');

async function setup() {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id], displayName: 'Eric IT Services' } });
  const request = await createRequestDoc(customer.user, category);
  return { category, customer, provider, request };
}

const send = (token, requestId, body) => api().post(`/api/requests/${requestId}/quotations`).set(bearer(token)).send(body);
const patch = (token, id, body) => api().patch(`/api/quotations/${id}`).set(bearer(token)).send(body);
const listFor = (token, requestId) => api().get(`/api/requests/${requestId}/quotations`).set(bearer(token));

describe('POST /api/requests/:id/quotations', () => {
  test('a verified provider sends a quotation and the customer is notified', async () => {
    const { customer, provider, request } = await setup();
    const res = await send(provider.token, request._id, validQuotation());
    expect(res.status).toBe(201);
    expect(res.body.data.quotation).toMatchObject({
      price: 35000,
      status: 'pending',
      estimatedDuration: '2 days',
      deliverables: ['Diagnosis report', 'Working Wi-Fi'],
      provider: { displayName: 'Eric IT Services', verified: true },
    });
    expect(res.body.data.quotation.expiresAt).toContain(futureDate(7));

    const notes = await Notification.find({ type: 'quotation.received' });
    expect(notes).toHaveLength(1);
    expect(String(notes[0].user)).toBe(String(customer.user._id));
    expect(notes[0].body).toContain('35,000 RWF');
  });

  test('a provider can only quote once per request', async () => {
    const { provider, request } = await setup();
    expect((await send(provider.token, request._id, validQuotation())).status).toBe(201);
    const again = await send(provider.token, request._id, validQuotation({ price: 30000 }));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('QUOTATION_EXISTS');
  });

  test('who may quote: verified providers with a verified email, in the right category', async () => {
    const { category, customer, request } = await setup();

    expect((await send(customer.token, request._id, validQuotation())).status).toBe(403);
    expect((await api().post(`/api/requests/${request._id}/quotations`).send(validQuotation())).status).toBe(401);

    const unverified = await createProvider({ verified: false, profileOverrides: { categories: [category._id] } });
    const res = await send(unverified.token, request._id, validQuotation());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROVIDER_NOT_VERIFIED');

    const noProfile = await createProvider({ profile: false });
    expect((await send(noProfile.token, request._id, validQuotation())).body.error.code).toBe('PROFILE_REQUIRED');

    const unconfirmed = await createProvider({ emailVerified: false, profileOverrides: { categories: [category._id] } });
    expect((await send(unconfirmed.token, request._id, validQuotation())).body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const wrongCategory = await createProvider({ profileOverrides: { categories: [(await createCategory())._id] } });
    expect((await send(wrongCategory.token, request._id, validQuotation())).status).toBe(404);
  });

  test('a directed request only accepts quotations from the chosen provider', async () => {
    const { category, customer, provider } = await setup();
    const rival = await createProvider({ profileOverrides: { categories: [category._id] } });
    const directed = await createRequestDoc(customer.user, category, { provider: provider.profile._id });
    expect((await send(rival.token, directed._id, validQuotation())).status).toBe(404);
    expect((await send(provider.token, directed._id, validQuotation())).status).toBe(201);
  });

  test('you cannot quote on your own request', async () => {
    const category = await createCategory();
    const both = await createProvider({ roles: ['customer', 'provider'], profileOverrides: { categories: [category._id] } });
    const own = await createRequestDoc(both.user, category);
    const res = await send(both.token, own._id, validQuotation());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_QUOTE_OWN_REQUEST');
  });

  test('a closed request takes no new quotations', async () => {
    const { category, customer, provider } = await setup();
    const cancelled = await createRequestDoc(customer.user, category, { status: 'cancelled' });
    const res = await send(provider.token, cancelled._id, validQuotation());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_CLOSED');
  });

  test('validates price, expiry and unexpected fields', async () => {
    const { provider, request } = await setup();
    const status = async (overrides) => (await send(provider.token, request._id, validQuotation(overrides))).status;
    expect(await status({ price: 1500.5 })).toBe(400);
    expect(await status({ price: 0 })).toBe(400);
    expect(await status({ price: '35000' })).toBe(400);
    expect(await status({ expiresAt: futureDate(-1) })).toBe(400);
    expect(await status({ expiresAt: futureDate(200) })).toBe(400);
    expect(await status({ estimatedDuration: '' })).toBe(400);
    expect(await status({ description: 'short' })).toBe(400);
    expect(await status({ deliverables: Array(11).fill('item') })).toBe(400);
    expect(await status({ status: 'accepted' })).toBe(400);
    expect(await status({ provider: String(request._id) })).toBe(400);
    expect(await Quotation.countDocuments()).toBe(0);
  });
});

describe('GET /api/requests/:id/quotations', () => {
  test('the owner sees every quotation except withdrawn ones; each provider sees only their own', async () => {
    const { category, customer, provider, request } = await setup();
    const second = await createProvider({ profileOverrides: { categories: [category._id] } });
    const third = await createProvider({ profileOverrides: { categories: [category._id] } });
    await createQuotationDoc(request, provider.profile, { price: 30000 });
    await createQuotationDoc(request, second.profile, { price: 25000 });
    await createQuotationDoc(request, third.profile, { price: 20000, status: 'withdrawn' });

    const owner = await listFor(customer.token, request._id);
    expect(owner.status).toBe(200);
    expect(owner.body.data.quotations.map((q) => q.price).sort()).toEqual([25000, 30000]);

    const mine = await listFor(provider.token, request._id);
    expect(mine.body.data.quotations.map((q) => q.price)).toEqual([30000]);

    const withdrawn = await listFor(third.token, request._id);
    expect(withdrawn.body.data.quotations.map((q) => q.status)).toEqual(['withdrawn']); // providers still see their own history
  });

  test('an eligible provider who has not quoted sees an empty list; strangers get 404', async () => {
    const { category, request } = await setup();
    const fresh = await createProvider({ profileOverrides: { categories: [category._id] } });
    expect((await listFor(fresh.token, request._id)).body.data.quotations).toEqual([]);

    const stranger = await createSession(['customer']);
    expect((await listFor(stranger.token, request._id)).status).toBe(404);
    const wrong = await createProvider({ profileOverrides: { categories: [(await createCategory())._id] } });
    expect((await listFor(wrong.token, request._id)).status).toBe(404);
    expect((await api().get(`/api/requests/${request._id}/quotations`)).status).toBe(401);
  });

  test('an expired quotation is reported as expired', async () => {
    const { customer, provider, request } = await setup();
    await createQuotationDoc(request, provider.profile, { expiresAt: new Date(Date.now() - 1000) });
    const res = await listFor(customer.token, request._id);
    expect(res.body.data.quotations[0].status).toBe('expired');
  });
});

describe('accepting and rejecting (PATCH /api/quotations/:id)', () => {
  test('accepting one quotation closes the request and the competing quotations', async () => {
    const { category, customer, provider, request } = await setup();
    const rival = await createProvider({ profileOverrides: { categories: [category._id] } });
    const winner = await createQuotationDoc(request, provider.profile, { price: 30000 });
    const loser = await createQuotationDoc(request, rival.profile, { price: 28000 });

    const res = await patch(customer.token, winner._id, { status: 'accepted' });
    expect(res.status).toBe(200);
    expect(res.body.data.quotation).toMatchObject({ status: 'accepted', price: 30000 });

    const savedRequest = await ServiceRequest.findById(request._id);
    expect(savedRequest.status).toBe('accepted');
    expect(String(savedRequest.acceptedQuotation)).toBe(String(winner._id));
    expect((await Quotation.findById(loser._id)).status).toBe('rejected');

    const accepted = await Notification.find({ type: 'quotation.accepted' });
    expect(accepted.map((n) => String(n.user))).toEqual([String(provider.user._id)]);
    const rejected = await Notification.find({ type: 'quotation.rejected' });
    expect(rejected.map((n) => String(n.user))).toEqual([String(rival.user._id)]);

    const audit = await AuditLog.findOne({ action: 'quotation.accepted' });
    expect(String(audit.actor)).toBe(String(customer.user._id));
    expect(String(audit.entityId)).toBe(String(winner._id));
    expect(audit.metadata.price).toBe(30000);
  });

  test('only the customer who owns the request can accept or reject', async () => {
    const { provider, request } = await setup();
    const quote = await createQuotationDoc(request, provider.profile);

    expect((await patch(provider.token, quote._id, { status: 'accepted' })).status).toBe(403);
    expect((await patch(provider.token, quote._id, { status: 'rejected' })).status).toBe(403);
    const stranger = await createSession(['customer']);
    expect((await patch(stranger.token, quote._id, { status: 'accepted' })).status).toBe(404);
    const otherProvider = await createProvider();
    expect((await patch(otherProvider.token, quote._id, { status: 'withdrawn' })).status).toBe(404);
    expect((await api().patch(`/api/quotations/${quote._id}`).send({ status: 'accepted' })).status).toBe(401);
    expect((await Quotation.findById(quote._id)).status).toBe('pending');
  });

  test('a quotation cannot be accepted twice or after it was decided', async () => {
    const { category, customer, provider, request } = await setup();
    const rival = await createProvider({ profileOverrides: { categories: [category._id] } });
    const winner = await createQuotationDoc(request, provider.profile);
    const loser = await createQuotationDoc(request, rival.profile);

    expect((await patch(customer.token, winner._id, { status: 'accepted' })).status).toBe(200);
    const again = await patch(customer.token, winner._id, { status: 'accepted' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await patch(customer.token, loser._id, { status: 'accepted' })).body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('a pending quotation on a request that is no longer open cannot be accepted', async () => {
    const { customer, provider, request } = await setup();
    const quote = await createQuotationDoc(request, provider.profile);
    await ServiceRequest.updateOne({ _id: request._id }, { status: 'accepted' });
    const res = await patch(customer.token, quote._id, { status: 'accepted' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_CLOSED');
    expect((await Quotation.findById(quote._id)).status).toBe('pending');
  });

  test('an expired quotation cannot be accepted', async () => {
    const { customer, provider, request } = await setup();
    const quote = await createQuotationDoc(request, provider.profile, { expiresAt: new Date(Date.now() - 1000) });
    const res = await patch(customer.token, quote._id, { status: 'accepted' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUOTATION_EXPIRED');
    expect((await ServiceRequest.findById(request._id)).status).toBe('open');
  });

  test('two simultaneous accepts: exactly one wins', async () => {
    const { category, customer, provider, request } = await setup();
    const rival = await createProvider({ profileOverrides: { categories: [category._id] } });
    const a = await createQuotationDoc(request, provider.profile);
    const b = await createQuotationDoc(request, rival.profile);

    const results = await Promise.all([patch(customer.token, a._id, { status: 'accepted' }), patch(customer.token, b._id, { status: 'accepted' })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await Quotation.countDocuments({ request: request._id, status: 'accepted' })).toBe(1);
    const saved = await ServiceRequest.findById(request._id);
    const winner = await Quotation.findOne({ request: request._id, status: 'accepted' });
    expect(String(saved.acceptedQuotation)).toBe(String(winner._id));
  });

  test('the customer can reject a quotation, and the provider is told', async () => {
    const { customer, provider, request } = await setup();
    const quote = await createQuotationDoc(request, provider.profile);
    const res = await patch(customer.token, quote._id, { status: 'rejected' });
    expect(res.status).toBe(200);
    expect(res.body.data.quotation.status).toBe('rejected');
    expect((await ServiceRequest.findById(request._id)).status).toBe('open'); // other providers can still quote

    const notes = await Notification.find({ type: 'quotation.rejected' });
    expect(notes).toHaveLength(1);
    expect(String(notes[0].user)).toBe(String(provider.user._id));
    expect((await patch(customer.token, quote._id, { status: 'rejected' })).status).toBe(409);
  });
});

describe('provider changes (PATCH /api/quotations/:id)', () => {
  test('a provider can withdraw a pending quotation, and the customer is told', async () => {
    const { customer, provider, request } = await setup();
    const quote = await createQuotationDoc(request, provider.profile);

    expect((await patch(customer.token, quote._id, { status: 'withdrawn' })).status).toBe(403);
    const res = await patch(provider.token, quote._id, { status: 'withdrawn' });
    expect(res.status).toBe(200);
    expect(res.body.data.quotation.status).toBe('withdrawn');
    expect((await listFor(customer.token, request._id)).body.data.quotations).toEqual([]);
    expect(await Notification.countDocuments({ type: 'quotation.withdrawn' })).toBe(1);
    expect((await patch(provider.token, quote._id, { status: 'withdrawn' })).status).toBe(409);
  });

  test('a provider can edit a pending quotation, but not a decided one', async () => {
    const { customer, provider, request } = await setup();
    const quote = await createQuotationDoc(request, provider.profile, { price: 30000 });

    const res = await patch(provider.token, quote._id, { price: 27000, estimatedDuration: '1 day' });
    expect(res.status).toBe(200);
    expect(res.body.data.quotation).toMatchObject({ price: 27000, estimatedDuration: '1 day' });
    expect(await Notification.countDocuments({ type: 'quotation.updated' })).toBe(1);

    expect((await patch(customer.token, quote._id, { price: 1 })).status).toBe(403); // the customer cannot reprice
    expect((await patch(provider.token, quote._id, { price: 12.5 })).status).toBe(400);

    await Quotation.updateOne({ _id: quote._id }, { status: 'accepted' });
    const late = await patch(provider.token, quote._id, { price: 1000 });
    expect(late.status).toBe(409);
    expect((await Quotation.findById(quote._id)).price).toBe(27000);
  });

  test('extending an expired quotation makes it pending again', async () => {
    const { customer, provider, request } = await setup();
    const quote = await createQuotationDoc(request, provider.profile, { expiresAt: new Date(Date.now() - 1000) });
    const res = await patch(provider.token, quote._id, { expiresAt: futureDate(5) });
    expect(res.status).toBe(200);
    expect(res.body.data.quotation.status).toBe('pending');
    expect((await patch(customer.token, quote._id, { status: 'accepted' })).status).toBe(200);
  });

  test('status changes cannot be mixed with other fields, and unknown statuses are refused', async () => {
    const { provider, request } = await setup();
    const quote = await createQuotationDoc(request, provider.profile);
    expect((await patch(provider.token, quote._id, { status: 'withdrawn', price: 1000 })).status).toBe(400);
    expect((await patch(provider.token, quote._id, {})).status).toBe(400);
    expect((await patch(provider.token, quote._id, { status: 'pending' })).status).toBe(400);
    expect((await patch(provider.token, 'not-an-id', { status: 'withdrawn' })).status).toBe(400);
  });
});
