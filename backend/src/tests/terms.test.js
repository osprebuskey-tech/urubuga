const AuditLog = require('../models/AuditLog');
const TermsAcceptance = require('../models/TermsAcceptance');
const TermsDocument = require('../models/TermsDocument');
const { api, bearer, createSession, createAdmin, createCategory, createProvider, createRequestDoc, makeReady, validRequest, validQuotation } = require('./helpers');

const status = (t) => api().get('/api/terms/status').set(bearer(t));
const accept = (t, version) => api().post('/api/terms/accept').set(bearer(t)).send({ version });
const withoutTerms = async (roles) => {
  const s = await createSession(roles, { ready: false });
  await makeReady(s.user);
  await TermsAcceptance.deleteMany({ user: s.user._id });
  return s;
};

describe('platform Terms and Conditions', () => {
  test('anyone can read the current terms, even before signing up', async () => {
    const res = await api().get('/api/terms');
    expect(res.status).toBe(200);
    expect(res.body.data.terms).toMatchObject({ version: 1 });
    expect(res.body.data.terms.body).toMatch(/Contact details/);
    expect(res.body.data.terms.publishedBy).toBeUndefined();
  });

  test('a customer cannot request a service until they accept, and then can', async () => {
    const category = await createCategory();
    const customer = await withoutTerms(['customer']);
    const blocked = await api().post('/api/requests').set(bearer(customer.token)).send(validRequest(category.id));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatchObject({ code: 'TERMS_NOT_ACCEPTED', details: { version: 1 } });

    expect((await status(customer.token)).body.data).toMatchObject({ accepted: false, terms: { version: 1 } });
    expect((await accept(customer.token, 1)).status).toBe(200);
    expect((await api().post('/api/requests').set(bearer(customer.token)).send(validRequest(category.id))).status).toBe(201);
  });

  test('acceptance records the user, the version and the time (and only once)', async () => {
    const customer = await withoutTerms(['customer']);
    const before = Date.now();
    await accept(customer.token, 1);
    await accept(customer.token, 1);
    const rows = await TermsAcceptance.find({ user: customer.user._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].termsVersion).toBe(1);
    expect(rows[0].acceptedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await AuditLog.findOne({ action: 'terms.accepted', actor: customer.user._id })).toBeTruthy();
  });

  test('a provider cannot send a quotation or publish a listing until they accept', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const request = await createRequestDoc(customer.user, category);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] }, ready: false });
    await makeReady(provider.user);
    await TermsAcceptance.deleteMany({ user: provider.user._id });

    const quote = await api().post(`/api/requests/${request._id}/quotations`).set(bearer(provider.token)).send(validQuotation());
    expect(quote.status).toBe(403);
    expect(quote.body.error.code).toBe('TERMS_NOT_ACCEPTED');
    const listing = await api().post('/api/services').set(bearer(provider.token)).send({ title: 'Laptop repair', description: 'Hardware and software repair.', category: String(category._id), pricingType: 'fixed', priceFrom: 15000, location: { district: 'Gasabo' } });
    expect(listing.body.error.code).toBe('TERMS_NOT_ACCEPTED');

    await accept(provider.token, 1);
    expect((await api().post(`/api/requests/${request._id}/quotations`).set(bearer(provider.token)).send(validQuotation())).status).toBe(201);
  });

  test('only the super administrator publishes a new version, and everyone must accept it again', async () => {
    const boss = await createSession(['super_admin']);
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    const body = { title: 'Imbehe Terms and Conditions (2027)', body: 'x'.repeat(250) };
    expect((await api().post('/api/admin/terms').set(bearer(admin.token)).send(body)).status).toBe(403);
    expect((await api().post('/api/admin/terms').set(bearer(customer.token)).send(body)).status).toBe(403);
    expect((await api().post('/api/admin/terms').set(bearer(boss.token)).send({ title: 'x', body: 'too short' })).status).toBe(400);

    const res = await api().post('/api/admin/terms').set(bearer(boss.token)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.terms.version).toBe(2);
    expect(await TermsDocument.countDocuments()).toBe(2); // version 1 is kept

    expect((await status(customer.token)).body.data).toMatchObject({ accepted: false, previouslyAcceptedVersion: 1 });
    const category = await createCategory();
    expect((await api().post('/api/requests').set(bearer(customer.token)).send(validRequest(category.id))).body.error.code).toBe('TERMS_NOT_ACCEPTED');
    expect((await accept(customer.token, 1)).body.error.code).toBe('STALE_TERMS'); // must accept the version they were shown
    expect((await accept(customer.token, 2)).status).toBe(200);

    const versions = (await api().get('/api/admin/terms').set(bearer(boss.token))).body.data;
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions.find((v) => v.version === 1).acceptedBy).toBeGreaterThanOrEqual(1);
  });
});
