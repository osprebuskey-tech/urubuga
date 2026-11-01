const Notification = require('../models/Notification');
const ServiceRequest = require('../models/ServiceRequest');
const Quotation = require('../models/Quotation');
const CompanyProfile = require('../models/CompanyProfile');
const {
  api, bearer, createCategory, createSession, createProvider, createAdmin, validRequest, futureDate,
  createRequestDoc, createQuotationDoc, attachPng, fileExists,
} = require('./helpers');

async function setup() {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
  return { category, customer, provider };
}

const post = (token, body) => api().post('/api/requests').set(bearer(token)).send(body);

describe('POST /api/requests', () => {
  test('a customer creates an open request', async () => {
    const { category, customer } = await setup();
    const res = await post(customer.token, validRequest(category.id, { preferredDate: futureDate(10) }));
    expect(res.status).toBe(201);
    expect(res.body.data.request).toMatchObject({
      title: 'Fix my office network',
      status: 'open',
      budgetMin: 20000,
      budgetMax: 50000,
      isOwner: true,
      quotationCount: 0,
      directed: false,
      category: { id: String(category._id) },
      customer: { name: customer.user.fullName },
    });
    expect(res.body.data.request.preferredDate).toContain(futureDate(10));
  });

  test('only verified providers in the category are notified, never the requester', async () => {
    const { category, customer, provider } = await setup();
    const otherCategory = await createCategory();
    await createProvider({ profileOverrides: { categories: [otherCategory._id] } });
    await createProvider({ verified: false, profileOverrides: { categories: [category._id] } });

    expect((await post(customer.token, validRequest(category.id))).status).toBe(201);

    const notes = await Notification.find({ type: 'request.new' });
    expect(notes).toHaveLength(1);
    expect(String(notes[0].user)).toBe(String(provider.user._id));
    expect(notes[0].link).toMatch(/^\/dashboard\/requests\/[a-f0-9]{24}$/);
  });

  test('only customers and businesses with a verified email can create requests', async () => {
    const { category, provider } = await setup();
    expect((await post(provider.token, validRequest(category.id))).status).toBe(403); // provider-only account
    expect((await api().post('/api/requests').send(validRequest(category.id))).status).toBe(401);

    const unverified = await createSession(['customer'], { emailVerified: false });
    const res = await post(unverified.token, validRequest(category.id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('rejects invalid input and client-supplied ownership fields', async () => {
    const { category, customer, provider } = await setup();
    const disabled = await createCategory({ status: 'disabled' });
    const bad = async (overrides) => (await post(customer.token, validRequest(category.id, overrides))).status;

    expect(await bad({ budgetMin: 90000, budgetMax: 1000 })).toBe(400);
    expect(await bad({ budgetMax: 1000.5 })).toBe(400);
    expect(await bad({ preferredDate: futureDate(-1) })).toBe(400);
    expect(await bad({ preferredDate: '2026-13-45' })).toBe(400);
    expect(await bad({ title: 'ab' })).toBe(400);
    expect(await bad({ customer: String(provider.user._id) })).toBe(400);
    expect(await bad({ status: 'accepted' })).toBe(400);
    expect(await bad({ company: String(provider.user._id) })).toBe(400);

    const res = await post(customer.token, validRequest(disabled.id));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CATEGORY');
  });

  test('a request can be directed at one verified provider', async () => {
    const { category, customer, provider } = await setup();
    await createProvider({ profileOverrides: { categories: [category._id] } }); // same category, not chosen

    const res = await post(customer.token, validRequest(category.id, { provider: String(provider.profile._id) }));
    expect(res.status).toBe(201);
    expect(res.body.data.request.directed).toBe(true);

    const notes = await Notification.find({ type: 'request.new' });
    expect(notes).toHaveLength(1);
    expect(String(notes[0].user)).toBe(String(provider.user._id));

    const unverified = await createProvider({ verified: false });
    const bad = await post(customer.token, validRequest(category.id, { provider: String(unverified.profile._id) }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('PROVIDER_NOT_FOUND');
  });

  test('you cannot direct a request at yourself', async () => {
    const category = await createCategory();
    const both = await createProvider({ roles: ['customer', 'provider'], profileOverrides: { categories: [category._id] } });
    const res = await post(both.token, validRequest(category.id, { provider: String(both.profile._id) }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_REQUEST_SELF');
  });

  test('requesting for a company needs the business role and a company profile', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const business = await createSession(['business']);

    expect((await post(customer.token, validRequest(category.id, { onBehalfOfCompany: true }))).body.error.code).toBe('COMPANY_REQUIRED');
    expect((await post(business.token, validRequest(category.id, { onBehalfOfCompany: true }))).body.error.code).toBe('COMPANY_REQUIRED');

    await CompanyProfile.create({ owner: business.user._id, companyName: 'Kigali Builders Ltd' });
    const res = await post(business.token, validRequest(category.id, { onBehalfOfCompany: true }));
    expect(res.status).toBe(201);
    expect(res.body.data.request.company.name).toBe('Kigali Builders Ltd');
  });
});

describe('GET /api/requests', () => {
  test('customers only see their own requests', async () => {
    const { category, customer } = await setup();
    const other = await createSession(['customer']);
    await createRequestDoc(customer.user, category);
    await createRequestDoc(other.user, category, { title: 'Someone else’s job' });

    const res = await api().get('/api/requests').set(bearer(customer.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 1, page: 1, scope: 'mine' });
  });

  test('a provider sees open requests in their categories, with their own quotation status', async () => {
    const { category, customer, provider } = await setup();
    const otherCategory = await createCategory();
    const mine = await createRequestDoc(customer.user, category, { title: 'In my category' });
    await createRequestDoc(customer.user, otherCategory, { title: 'Wrong category' });
    await createRequestDoc(customer.user, category, { title: 'Already cancelled', status: 'cancelled' });
    await createQuotationDoc(mine, provider.profile);

    const res = await api().get('/api/requests?scope=incoming').set(bearer(provider.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.title)).toEqual(['In my category']);
    expect(res.body.data[0].myQuotation).toBe('pending');
    expect(res.body.data[0].customer.name).toBe('Test'); // first name only
  });

  test('a directed request is only visible to the provider it was sent to', async () => {
    const { category, customer, provider } = await setup();
    const rival = await createProvider({ profileOverrides: { categories: [category._id] } });
    await createRequestDoc(customer.user, category, { provider: provider.profile._id });

    expect((await api().get('/api/requests?scope=incoming').set(bearer(provider.token))).body.data).toHaveLength(1);
    expect((await api().get('/api/requests?scope=incoming').set(bearer(rival.token))).body.data).toHaveLength(0);
  });

  test('scope rules: incoming is for verified providers, all is for admins', async () => {
    const { customer, provider } = await setup();
    expect((await api().get('/api/requests?scope=incoming').set(bearer(customer.token))).status).toBe(403);
    expect((await api().get('/api/requests?scope=all').set(bearer(customer.token))).status).toBe(403);
    expect((await api().get('/api/requests?scope=all').set(bearer(provider.token))).status).toBe(403);

    const unverified = await createProvider({ verified: false });
    const res = await api().get('/api/requests?scope=incoming').set(bearer(unverified.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROVIDER_NOT_VERIFIED');

    const noProfile = await createProvider({ profile: false });
    expect((await api().get('/api/requests?scope=incoming').set(bearer(noProfile.token))).body.error.code).toBe('PROFILE_REQUIRED');

    const admin = await createAdmin();
    expect((await api().get('/api/requests?scope=all').set(bearer(admin.token))).status).toBe(200);
    expect((await api().get('/api/requests')).status).toBe(401);
  });

  test('lists are paginated and show how many quotations each request has', async () => {
    const { category, customer, provider } = await setup();
    const first = await createRequestDoc(customer.user, category, { title: 'First job' });
    await createRequestDoc(customer.user, category, { title: 'Second job' });
    await createQuotationDoc(first, provider.profile);

    const res = await api().get('/api/requests?limit=1&page=1').set(bearer(customer.token));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 2, totalPages: 2 });

    const all = await api().get('/api/requests').set(bearer(customer.token));
    expect(all.body.data.find((r) => r.title === 'First job').quotationCount).toBe(1);
  });
});

describe('GET /api/requests/:id', () => {
  test('owner, admin and an eligible provider can read it; everyone else gets 404', async () => {
    const { category, customer, provider } = await setup();
    const request = await createRequestDoc(customer.user, category);
    const url = `/api/requests/${request._id}`;

    const owner = await api().get(url).set(bearer(customer.token));
    expect(owner.status).toBe(200);
    expect(owner.body.data.request.customer.name).toBe(customer.user.fullName);

    const eligible = await api().get(url).set(bearer(provider.token));
    expect(eligible.status).toBe(200);
    expect(eligible.body.data.request).toMatchObject({ isOwner: false, myQuotation: null, customer: { name: 'Test' } });
    expect(eligible.body.data.request.company).toBeUndefined();

    expect((await api().get(url).set(bearer((await createAdmin()).token))).status).toBe(200);

    const stranger = await createSession(['customer']);
    expect((await api().get(url).set(bearer(stranger.token))).status).toBe(404);
    const wrongCategory = await createProvider({ profileOverrides: { categories: [(await createCategory())._id] } });
    expect((await api().get(url).set(bearer(wrongCategory.token))).status).toBe(404);
    const unverified = await createProvider({ verified: false, profileOverrides: { categories: [category._id] } });
    expect((await api().get(url).set(bearer(unverified.token))).status).toBe(404);
    expect((await api().get(url)).status).toBe(401);
    expect((await api().get('/api/requests/not-an-id').set(bearer(customer.token))).status).toBe(400);
  });

  test('a provider who already quoted can still read a request after it closes', async () => {
    const { category, customer, provider } = await setup();
    const request = await createRequestDoc(customer.user, category, { status: 'cancelled' });
    const url = `/api/requests/${request._id}`;
    expect((await api().get(url).set(bearer(provider.token))).status).toBe(404);

    await createQuotationDoc(request, provider.profile);
    const res = await api().get(url).set(bearer(provider.token));
    expect(res.status).toBe(200);
    expect(res.body.data.request.myQuotation).toBe('pending');
  });
});

describe('PATCH /api/requests/:id', () => {
  const patch = (token, id, body) => api().patch(`/api/requests/${id}`).set(bearer(token)).send(body);

  test('the owner can edit an open request that has no quotations', async () => {
    const { category, customer } = await setup();
    const request = await createRequestDoc(customer.user, category, { budgetMin: 1000, budgetMax: 5000 });

    const res = await patch(customer.token, request._id, { title: 'Fix the network at my shop', location: { district: 'Kicukiro' } });
    expect(res.status).toBe(200);
    expect(res.body.data.request).toMatchObject({ title: 'Fix the network at my shop', location: { district: 'Kicukiro' } });

    expect((await patch(customer.token, request._id, { budgetMin: 9000 })).status).toBe(400); // would exceed budgetMax
    expect((await patch(customer.token, request._id, {})).status).toBe(400);
    expect((await patch(customer.token, request._id, { status: 'accepted' })).status).toBe(400);
  });

  test('other users cannot change it', async () => {
    const { category, customer, provider } = await setup();
    const request = await createRequestDoc(customer.user, category);
    const stranger = await createSession(['customer']);
    expect((await patch(stranger.token, request._id, { title: 'Hijacked title' })).status).toBe(404);
    expect((await patch(provider.token, request._id, { title: 'Hijacked title' })).status).toBe(403);
    expect((await ServiceRequest.findById(request._id)).title).toBe('Fix my office network');
  });

  test('once quotations exist the request is locked against edits', async () => {
    const { category, customer, provider } = await setup();
    const request = await createRequestDoc(customer.user, category);
    await createQuotationDoc(request, provider.profile);
    const res = await patch(customer.token, request._id, { title: 'Now something else' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_LOCKED');
  });

  test('cancelling closes pending quotations and tells the providers', async () => {
    const { category, customer, provider } = await setup();
    const request = await createRequestDoc(customer.user, category);
    const quote = await createQuotationDoc(request, provider.profile);

    const res = await patch(customer.token, request._id, { status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('cancelled');
    expect((await Quotation.findById(quote._id)).status).toBe('rejected');

    const notes = await Notification.find({ type: 'request.cancelled' });
    expect(notes).toHaveLength(1);
    expect(String(notes[0].user)).toBe(String(provider.user._id));

    expect((await patch(customer.token, request._id, { status: 'cancelled' })).status).toBe(200); // idempotent
    expect((await patch(customer.token, request._id, { title: 'Edit after cancel' })).body.error.code).toBe('REQUEST_CLOSED');
  });

  test('an accepted request cannot be cancelled here', async () => {
    const { category, customer } = await setup();
    const request = await createRequestDoc(customer.user, category, { status: 'accepted' });
    const res = await patch(customer.token, request._id, { status: 'cancelled' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await ServiceRequest.findById(request._id)).status).toBe('accepted');
  });
});

describe('request photos', () => {
  const upload = (token, id) => attachPng(api().post(`/api/requests/${id}/attachments`).set(bearer(token)));

  test('the owner adds and removes photos', async () => {
    const { category, customer } = await setup();
    const request = await createRequestDoc(customer.user, category);

    const added = await upload(customer.token, request._id);
    expect(added.status).toBe(201);
    const [photo] = added.body.data.attachments;
    expect(fileExists(photo.url)).toBe(true);

    const removed = await api().delete(`/api/requests/${request._id}/attachments/${photo.id}`).set(bearer(customer.token));
    expect(removed.status).toBe(200);
    expect(fileExists(photo.url)).toBe(false);
  });

  test('other users cannot add photos, and the limit is five', async () => {
    const { category, customer } = await setup();
    const request = await createRequestDoc(customer.user, category);
    const stranger = await createSession(['customer']);
    expect((await upload(stranger.token, request._id)).status).toBe(404);

    for (let i = 0; i < 5; i += 1) expect((await upload(customer.token, request._id)).status).toBe(201);
    const sixth = await upload(customer.token, request._id);
    expect(sixth.status).toBe(400);
    expect(sixth.body.error.code).toBe('ATTACHMENT_LIMIT');
  });
});
