const ServiceListing = require('../models/ServiceListing');
const {
  api, bearer, createCategory, createProvider, createListingDoc, validListing, attachPng, fileExists, createSession,
} = require('./helpers');

describe('POST /api/services', () => {
  test('a verified provider creates a draft by default', async () => {
    const category = await createCategory();
    const { token, profile } = await createProvider();

    const res = await api().post('/api/services').set(bearer(token)).send(validListing(category.id, { subcategory: 'sub-one' }));
    expect(res.status).toBe(201);
    expect(res.body.data.service).toMatchObject({
      title: 'Laptop repair',
      status: 'draft',
      priceFrom: 15000,
      pricingType: 'fixed',
      provider: String(profile._id),
      subcategory: 'sub-one',
    });
  });

  test('only providers with a verified email can create listings', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    expect((await api().post('/api/services').set(bearer(customer.token)).send(validListing(category.id))).status).toBe(403);
    expect((await api().post('/api/services').send(validListing(category.id))).status).toBe(401);

    const unverifiedEmail = await createProvider({ emailVerified: false });
    const res = await api().post('/api/services').set(bearer(unverifiedEmail.token)).send(validListing(category.id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('a provider without a profile is told to create one', async () => {
    const category = await createCategory();
    const { token } = await createProvider({ profile: false });
    const res = await api().post('/api/services').set(bearer(token)).send(validListing(category.id));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROFILE_REQUIRED');
  });

  test('an unverified provider can save drafts but cannot publish', async () => {
    const category = await createCategory();
    const { token } = await createProvider({ verified: false });

    expect((await api().post('/api/services').set(bearer(token)).send(validListing(category.id))).status).toBe(201);
    const live = await api().post('/api/services').set(bearer(token)).send(validListing(category.id, { status: 'active' }));
    expect(live.status).toBe(403);
    expect(live.body.error.code).toBe('PROVIDER_NOT_VERIFIED');
  });

  test('pricing rules: fixed and hourly need a whole-RWF price, quotation does not', async () => {
    const category = await createCategory();
    const { token } = await createProvider();
    const post = (overrides) => api().post('/api/services').set(bearer(token)).send(validListing(category.id, overrides));

    expect((await post({ priceFrom: undefined })).status).toBe(400);
    expect((await post({ pricingType: 'hourly', priceFrom: undefined })).status).toBe(400);
    expect((await post({ priceFrom: 100.5 })).status).toBe(400);
    expect((await post({ priceFrom: -5 })).status).toBe(400);
    expect((await post({ pricingType: 'barter' })).status).toBe(400);
    expect((await post({ pricingType: 'quotation', priceFrom: undefined })).status).toBe(201);
  });

  test('rejects client-supplied ownership, unknown fields and bad references', async () => {
    const category = await createCategory();
    const disabled = await createCategory({ status: 'disabled' });
    const { token } = await createProvider();
    const post = (overrides) => api().post('/api/services').set(bearer(token)).send(validListing(category.id, overrides));

    expect((await post({ provider: 'aaaaaaaaaaaaaaaaaaaaaaaa' })).status).toBe(400);
    expect((await post({ status: 'archived' })).status).toBe(400);
    expect((await post({ location: { district: 'Atlantis' } })).status).toBe(400);

    const unknownCategory = await post({ category: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(unknownCategory.body.error.code).toBe('INVALID_CATEGORY');
    expect((await post({ category: String(disabled.id) })).body.error.code).toBe('INVALID_CATEGORY');
    expect((await post({ subcategory: 'not-in-category' })).body.error.code).toBe('INVALID_SUBCATEGORY');
    expect(await ServiceListing.countDocuments()).toBe(0);
  });
});

describe('reading listings', () => {
  test('drafts are visible only to their owner; everyone else gets 404', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const other = await createProvider();
    const draft = await createListingDoc(owner.profile, category, { status: 'draft' });
    const url = `/api/services/${draft._id}`;

    expect((await api().get(url)).status).toBe(404);
    expect((await api().get(url).set(bearer(other.token))).status).toBe(404);

    const asOwner = await api().get(url).set(bearer(owner.token));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data.service.status).toBe('draft');
  });

  test('public view of an active listing includes a provider summary and no private data', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const live = await createListingDoc(owner.profile, category);
    await ServiceListing.updateOne({ _id: live._id }, { $push: { images: { key: 'listings/x.png', url: 'http://localhost:5000/uploads/listings/x.png' } } });

    const res = await api().get(`/api/services/${live._id}`);
    expect(res.status).toBe(200);
    const { service } = res.body.data;
    expect(service.status).toBeUndefined();
    expect(service.provider).toMatchObject({ id: String(owner.profile._id), verified: true, ratingAvg: 0 });
    expect(service.category).toMatchObject({ name: category.name, slug: category.slug });
    expect(service.images).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/"key"|"user"|@example\.com/);
  });

  test('the public list shows only active listings, with filters and pagination', async () => {
    const [c1, c2] = [await createCategory(), await createCategory()];
    const owner = await createProvider();
    await createListingDoc(owner.profile, c1, { title: 'Active one' });
    await createListingDoc(owner.profile, c1, { title: 'Active two', location: { district: 'Huye' } });
    await createListingDoc(owner.profile, c2, { title: 'Other category' });
    await createListingDoc(owner.profile, c1, { title: 'A draft', status: 'draft' });
    await createListingDoc(owner.profile, c1, { title: 'Paused', status: 'paused' });
    await createListingDoc(owner.profile, c1, { title: 'Archived', status: 'archived' });

    const all = await api().get('/api/services');
    expect(all.body.meta.total).toBe(3);

    const byCategory = await api().get(`/api/services?category=${c1.id}`);
    expect(byCategory.body.data.map((s) => s.title).sort()).toEqual(['Active one', 'Active two']);

    const byDistrict = await api().get('/api/services?district=Huye');
    expect(byDistrict.body.data.map((s) => s.title)).toEqual(['Active two']);

    const page = await api().get('/api/services?limit=2&page=2');
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  test('providers list their own listings (drafts included, archived excluded)', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const other = await createProvider();
    await createListingDoc(owner.profile, category, { title: 'Live' });
    await createListingDoc(owner.profile, category, { title: 'Draft', status: 'draft' });
    await createListingDoc(owner.profile, category, { title: 'Gone', status: 'archived' });
    await createListingDoc(other.profile, category, { title: 'Not mine' });

    const res = await api().get('/api/providers/me/services').set(bearer(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((s) => s.title).sort()).toEqual(['Draft', 'Live']);

    const drafts = await api().get('/api/providers/me/services?status=draft').set(bearer(owner.token));
    expect(drafts.body.data.map((s) => s.title)).toEqual(['Draft']);
  });
});

describe('updating and archiving', () => {
  test('the owner can update; other providers get 404 and nothing changes', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const intruder = await createProvider();
    const listing = await createListingDoc(owner.profile, category);
    const url = `/api/services/${listing._id}`;

    const ok = await api().put(url).set(bearer(owner.token)).send({ title: 'Updated title', priceFrom: 20000 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.service).toMatchObject({ title: 'Updated title', priceFrom: 20000 });

    const denied = await api().put(url).set(bearer(intruder.token)).send({ title: 'Hacked' });
    expect(denied.status).toBe(404);
    expect((await api().put(url).send({ title: 'Anon' })).status).toBe(401);
    expect((await ServiceListing.findById(listing._id)).title).toBe('Updated title');
  });

  test('update validates input and keeps pricing consistent', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const quote = await createListingDoc(owner.profile, category, { pricingType: 'quotation', priceFrom: undefined });
    const url = `/api/services/${quote._id}`;

    const res = await api().put(url).set(bearer(owner.token)).send({ pricingType: 'fixed' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('priceFrom');

    expect((await api().put(url).set(bearer(owner.token)).send({ pricingType: 'fixed', priceFrom: 5000 })).status).toBe(200);
    expect((await api().put(url).set(bearer(owner.token)).send({ provider: 'aaaaaaaaaaaaaaaaaaaaaaaa' })).status).toBe(400);
    expect((await api().put(url).set(bearer(owner.token)).send({ status: 'archived' })).status).toBe(400);
  });

  test('changing the category clears the old subcategory unless a new one is given', async () => {
    const [c1, c2] = [await createCategory(), await createCategory()];
    const owner = await createProvider();
    const listing = await createListingDoc(owner.profile, c1, { subcategory: 'sub-one' });
    const url = `/api/services/${listing._id}`;

    const res = await api().put(url).set(bearer(owner.token)).send({ category: String(c2.id) });
    expect(res.status).toBe(200);
    expect(res.body.data.service.subcategory).toBeUndefined();

    const bad = await api().put(url).set(bearer(owner.token)).send({ category: String(c1.id), subcategory: 'nope' });
    expect(bad.body.error.code).toBe('INVALID_SUBCATEGORY');
  });

  test('an unverified provider cannot switch a draft to active', async () => {
    const category = await createCategory();
    const owner = await createProvider({ verified: false });
    const draft = await createListingDoc(owner.profile, category, { status: 'draft' });
    const res = await api().put(`/api/services/${draft._id}`).set(bearer(owner.token)).send({ status: 'active' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROVIDER_NOT_VERIFIED');
  });

  test('a verified provider can pause and re-activate a listing', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const listing = await createListingDoc(owner.profile, category);
    const url = `/api/services/${listing._id}`;

    await api().put(url).set(bearer(owner.token)).send({ status: 'paused' });
    expect((await api().get(url)).status).toBe(404);
    await api().put(url).set(bearer(owner.token)).send({ status: 'active' });
    expect((await api().get(url)).status).toBe(200);
  });

  test('DELETE archives the listing and hides it everywhere', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const intruder = await createProvider();
    const listing = await createListingDoc(owner.profile, category);
    const url = `/api/services/${listing._id}`;

    expect((await api().delete(url).set(bearer(intruder.token))).status).toBe(404);
    expect((await ServiceListing.findById(listing._id)).status).toBe('active');

    expect((await api().delete(url).set(bearer(owner.token))).status).toBe(200);
    expect((await ServiceListing.findById(listing._id)).status).toBe('archived'); // kept for future bookings/history
    expect((await api().get(url)).status).toBe(404);
    expect((await api().get(url).set(bearer(owner.token))).status).toBe(404);
    expect((await api().get('/api/services')).body.meta.total).toBe(0);
    expect((await api().delete(url).set(bearer(owner.token))).status).toBe(404);
  });

  test('malformed ids are rejected before touching the database', async () => {
    const owner = await createProvider();
    expect((await api().get('/api/services/not-an-id')).status).toBe(400);
    expect((await api().put('/api/services/not-an-id').set(bearer(owner.token)).send({ title: 'abc' })).status).toBe(400);
  });
});

describe('listing images', () => {
  const upload = (token, id, size) => attachPng(api().post(`/api/services/${id}/images`).set(bearer(token)), size);

  test('the owner uploads and removes images; files follow', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const listing = await createListingDoc(owner.profile, category);

    const res = await upload(owner.token, listing._id);
    expect(res.status).toBe(201);
    const [image] = res.body.data.service.images;
    expect(image.url).toMatch(/\/uploads\/listings\//);
    expect(image.key).toBeUndefined();
    expect(fileExists(image.url)).toBe(true);

    const removed = await api().delete(`/api/services/${listing._id}/images/${image.id}`).set(bearer(owner.token));
    expect(removed.status).toBe(200);
    expect(fileExists(image.url)).toBe(false);
  });

  test("other providers cannot add to or remove from someone else's listing", async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const intruder = await createProvider();
    const listing = await createListingDoc(owner.profile, category);
    const uploaded = await upload(owner.token, listing._id);
    const image = uploaded.body.data.service.images[0];

    expect((await upload(intruder.token, listing._id)).status).toBe(404);
    const del = await api().delete(`/api/services/${listing._id}/images/${image.id}`).set(bearer(intruder.token));
    expect(del.status).toBe(404);
    expect(fileExists(image.url)).toBe(true);
  });

  test('a listing holds at most 8 images, and bad files are refused', async () => {
    const category = await createCategory();
    const owner = await createProvider();
    const listing = await createListingDoc(owner.profile, category);
    const images = Array.from({ length: 8 }, (_, i) => ({ key: `listings/seed-${i}.png`, url: `http://localhost:5000/uploads/listings/seed-${i}.png` }));
    await ServiceListing.updateOne({ _id: listing._id }, { $set: { images } });

    const full = await upload(owner.token, listing._id);
    expect(full.status).toBe(400);
    expect(full.body.error.code).toBe('IMAGE_LIMIT');

    const fake = await api()
      .post(`/api/services/${listing._id}/images`)
      .set(bearer(owner.token))
      .attach('image', Buffer.from('definitely not an image at all'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_FILE_TYPE');
  });
});
