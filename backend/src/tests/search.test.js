const ServiceListing = require('../models/ServiceListing');
const ProviderProfile = require('../models/ProviderProfile');
const { api, createCategory, createProvider, createListingDoc } = require('./helpers');

const titles = (res) => res.body.data.map((s) => s.title);
const names = (res) => res.body.data.map((p) => p.displayName);
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// timestamps:false lets a test back-date a document without Mongoose overwriting it
const setCreatedAt = (Model, doc, date) => Model.updateOne({ _id: doc._id }, { $set: { createdAt: date } }, { timestamps: false });

describe('GET /api/services: keyword search, filters and sorting', () => {
  let cat1; let cat2; let p1; let p2; let p3;

  beforeEach(async () => {
    cat1 = await createCategory();
    cat2 = await createCategory();
    p1 = await createProvider({ profileOverrides: { displayName: 'Top Rated', ratingAvg: 4.8, ratingCount: 20 } });
    p2 = await createProvider({ profileOverrides: { displayName: 'Mid Rated', ratingAvg: 3, ratingCount: 5 } });
    p3 = await createProvider({ profileOverrides: { displayName: 'Unrated' } });

    const a = await createListingDoc(p1.profile, cat1, { title: 'Laptop repair', description: 'Fast hardware fixes for any brand.', priceFrom: 15000, location: { district: 'Gasabo' } });
    const b = await createListingDoc(p2.profile, cat1, { title: 'Photography', description: 'Events and portraits, we also do laptop repair on weekends.', priceFrom: 50000, location: { district: 'Huye' } });
    const c = await createListingDoc(p3.profile, cat2, { title: 'Logo design', description: 'Branding for small businesses.', pricingType: 'quotation', priceFrom: undefined, location: { district: 'Gasabo' } });
    const d = await createListingDoc(p1.profile, cat2, { title: 'Website development', description: 'Business websites and web apps.', priceFrom: 300000, location: { district: 'Gasabo' } });

    // never visible: a draft, and an "active" listing whose provider is not verified
    await createListingDoc(p1.profile, cat1, { title: 'Laptop repair draft', status: 'draft' });
    const unverified = await createProvider({ verified: false });
    await createListingDoc(unverified.profile, cat1, { title: 'Laptop repair cheap', priceFrom: 1000 });

    await setCreatedAt(ServiceListing, a, daysAgo(4));
    await setCreatedAt(ServiceListing, b, daysAgo(3));
    await setCreatedAt(ServiceListing, c, daysAgo(2));
    await setCreatedAt(ServiceListing, d, daysAgo(1));
  });

  test('matches keywords in title or description, case-insensitively, and ranks title matches first', async () => {
    const res = await api().get('/api/services?q=laptop');
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Laptop repair', 'Photography']);
    expect(res.body.meta.total).toBe(2);

    expect(titles(await api().get('/api/services?q=LAPTOP'))).toEqual(['Laptop repair', 'Photography']);
  });

  test('never returns drafts or listings of unverified providers', async () => {
    const res = await api().get('/api/services?q=laptop');
    expect(titles(res)).not.toContain('Laptop repair draft');
    expect(titles(res)).not.toContain('Laptop repair cheap');
    expect((await api().get('/api/services')).body.meta.total).toBe(4);
  });

  test('no match gives an empty page, not an error', async () => {
    const res = await api().get('/api/services?q=helicopter');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ total: 0, totalPages: 1 });
  });

  test('filters by category, district and pricing type', async () => {
    expect(titles(await api().get(`/api/services?category=${cat2.id}`)).sort()).toEqual(['Logo design', 'Website development']);
    expect(titles(await api().get('/api/services?district=Huye'))).toEqual(['Photography']);
    expect(titles(await api().get('/api/services?pricingType=quotation'))).toEqual(['Logo design']);
  });

  test('filters by price range (inclusive); quotation listings have no price so they are excluded', async () => {
    const range = await api().get('/api/services?minPrice=15000&maxPrice=50000');
    expect(titles(range).sort()).toEqual(['Laptop repair', 'Photography']);
    expect(titles(await api().get('/api/services?minPrice=100000'))).toEqual(['Website development']);
    expect(titles(await api().get('/api/services?maxPrice=20000'))).toEqual(['Laptop repair']);
  });

  test("filters by the provider's minimum rating", async () => {
    expect(titles(await api().get('/api/services?minRating=4')).sort()).toEqual(['Laptop repair', 'Website development']);
    expect(titles(await api().get('/api/services?minRating=3')).sort()).toEqual(['Laptop repair', 'Photography', 'Website development']);
    expect((await api().get('/api/services?minRating=5')).body.data).toEqual([]);
  });

  test('combines keyword, filters and sorting', async () => {
    expect(titles(await api().get('/api/services?q=laptop&district=Huye'))).toEqual(['Photography']);
    expect(titles(await api().get('/api/services?q=laptop&minRating=4'))).toEqual(['Laptop repair']);
    expect(titles(await api().get(`/api/services?q=branding&category=${cat2.id}`))).toEqual(['Logo design']);
    expect((await api().get(`/api/services?q=branding&category=${cat1.id}`)).body.data).toEqual([]);
  });

  test('sorts by newest (default), price and rating', async () => {
    expect(titles(await api().get('/api/services'))).toEqual(['Website development', 'Logo design', 'Photography', 'Laptop repair']);

    // quotation-based listings have no price and always come last
    expect(titles(await api().get('/api/services?sort=price_asc'))).toEqual(['Laptop repair', 'Photography', 'Website development', 'Logo design']);
    expect(titles(await api().get('/api/services?sort=price_desc'))).toEqual(['Website development', 'Photography', 'Laptop repair', 'Logo design']);

    const byRating = titles(await api().get('/api/services?sort=rating'));
    expect(byRating.slice(0, 2).sort()).toEqual(['Laptop repair', 'Website development']); // provider rated 4.8
    expect(byRating.slice(2)).toEqual(['Photography', 'Logo design']); // 3.0, then unrated
  });

  test('relevance without a keyword falls back to newest', async () => {
    const res = await api().get('/api/services?sort=relevance');
    expect(res.status).toBe(200);
    expect(titles(res)[0]).toBe('Website development');
  });

  test('paginates the filtered result set', async () => {
    const page1 = await api().get('/api/services?limit=3&page=1');
    const page2 = await api().get('/api/services?limit=3&page=2');
    expect(page1.body.data).toHaveLength(3);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta).toEqual({ page: 2, limit: 3, total: 4, totalPages: 2 });
    const seen = [...titles(page1), ...titles(page2)];
    expect(new Set(seen).size).toBe(4); // no duplicates or gaps across pages

    const beyond = await api().get('/api/services?limit=3&page=9');
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.total).toBe(4);
  });

  test('rejects invalid parameters with 400', async () => {
    for (const query of [
      'minPrice=50000&maxPrice=1000',
      'sort=cheapest',
      'q=a',
      'limit=101',
      'minRating=6',
      'minPrice=-1',
      'minPrice=abc',
      'district=Atlantis',
      'category=not-an-id',
      'q=laptop&q=repair',
    ]) {
      const res = await api().get(`/api/services?${query}`);
      expect([query, res.status]).toEqual([query, 400]);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  test('blank parameters are ignored', async () => {
    const res = await api().get('/api/services?q=&category=&district=&sort=&minPrice=');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(4);
  });

  test('responses contain only public fields', async () => {
    const res = await api().get('/api/services?q=laptop');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/verificationStatus|verificationNote|"user"|"key"|_score|_noPrice|passwordHash/);
    expect(res.body.data[0].provider).toMatchObject({ displayName: 'Top Rated', verified: true, ratingAvg: 4.8, ratingCount: 20 });
    expect(res.body.data[0].category).toMatchObject({ id: cat1.id, name: cat1.name });
  });

  test('text search tolerates search-operator characters without erroring', async () => {
    for (const q of ['"laptop repair"', 'laptop -photography', '$where', '.*', '(laptop']) {
      expect((await api().get('/api/services').query({ q })).status).toBe(200);
    }
  });
});

describe('GET /api/providers: keyword search, filters and sorting', () => {
  test('matches name, skills and bio, with name matches ranked first, verified only', async () => {
    const byBio = await createProvider({ profileOverrides: { displayName: 'Alpha Services', bio: 'We handle plumbing jobs of every size around Kigali.' } });
    const byName = await createProvider({ profileOverrides: { displayName: 'Kigali Plumbing Pros', bio: 'Family business, thirty years of experience.' } });
    const bySkill = await createProvider({ profileOverrides: { displayName: 'Beta Works', bio: 'General contractor.', skills: ['plumbing', 'tiling'] } });
    await createProvider({ verified: false, profileOverrides: { displayName: 'Unverified Plumbing' } });
    await createProvider({ profileOverrides: { displayName: 'Gamma Electric', bio: 'Wiring only.' } });

    const res = await api().get('/api/providers?q=plumbing');
    expect(res.status).toBe(200);
    expect(names(res)[0]).toBe('Kigali Plumbing Pros'); // name weighs most
    expect(names(res).sort()).toEqual(['Alpha Services', 'Beta Works', 'Kigali Plumbing Pros']);
    expect(res.body.meta.total).toBe(3);
    expect([byBio, byName, bySkill]).toHaveLength(3);
  });

  test('filters by minimum rating, category and district', async () => {
    const cat = await createCategory();
    await createProvider({ profileOverrides: { displayName: 'High', ratingAvg: 4.9, ratingCount: 30, categories: [cat._id], location: { district: 'Huye' } } });
    await createProvider({ profileOverrides: { displayName: 'Low', ratingAvg: 2.5, ratingCount: 4, categories: [cat._id], location: { district: 'Huye' } } });
    await createProvider({ profileOverrides: { displayName: 'Elsewhere', ratingAvg: 4.9, ratingCount: 9, location: { district: 'Musanze' } } });

    expect(names(await api().get('/api/providers?minRating=4')).sort()).toEqual(['Elsewhere', 'High']);
    expect(names(await api().get(`/api/providers?category=${cat.id}&minRating=4`))).toEqual(['High']);
    expect(names(await api().get('/api/providers?district=Huye&minRating=4'))).toEqual(['High']);
  });

  test('sorts by rating (default), experience and newest', async () => {
    const mk = (displayName, rest) => createProvider({ profileOverrides: { displayName, ...rest } });
    const a = await mk('A', { ratingAvg: 3, ratingCount: 3, experienceYears: 10 });
    const b = await mk('B', { ratingAvg: 5, ratingCount: 3, experienceYears: 2 });
    const c = await mk('C', { ratingAvg: 4, ratingCount: 3, experienceYears: 6 });
    await setCreatedAt(ProviderProfile, a.profile, daysAgo(1));
    await setCreatedAt(ProviderProfile, b.profile, daysAgo(3));
    await setCreatedAt(ProviderProfile, c.profile, daysAgo(2));

    expect(names(await api().get('/api/providers'))).toEqual(['B', 'C', 'A']);
    expect(names(await api().get('/api/providers?sort=experience'))).toEqual(['A', 'C', 'B']);
    expect(names(await api().get('/api/providers?sort=newest'))).toEqual(['A', 'C', 'B']);
    expect(names(await api().get('/api/providers?sort=relevance'))).toEqual(['B', 'C', 'A']); // no keyword: falls back to rating
  });

  test('combines keyword with filters and paginates', async () => {
    for (let i = 0; i < 3; i += 1) {
      await createProvider({ profileOverrides: { displayName: `Plumber ${i}`, skills: ['plumbing'], ratingAvg: 4, ratingCount: 1 } });
    }
    const res = await api().get('/api/providers?q=plumbing&minRating=4&limit=2&page=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  test('rejects invalid parameters and never leaks private fields', async () => {
    for (const query of ['sort=cheapest', 'q=a', 'minRating=7', 'q=x&q=y']) {
      expect((await api().get(`/api/providers?${query}`)).status).toBe(400);
    }
    await createProvider({ profileOverrides: { displayName: 'Searchable Pro', verificationNote: 'internal' } });
    const res = await api().get('/api/providers?q=searchable');
    expect(res.body.data).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/verificationNote|internal|"score"|@example\.com|passwordHash/);
  });
});

describe('GET /api/search: one box, three result groups', () => {
  test('returns matching services, providers and categories with totals', async () => {
    const plumbing = await createCategory({ name: 'Home Repairs', slug: 'home-repairs', subcategories: [{ name: 'Plumbing', slug: 'plumbing' }] });
    const provider = await createProvider({ profileOverrides: { displayName: 'Kigali Plumbing Pros', skills: ['plumbing'] } });
    await createListingDoc(provider.profile, plumbing, { title: 'Emergency plumbing', description: 'Leaks, blocked drains and pipe repair.' });
    await createListingDoc(provider.profile, plumbing, { title: 'Draft plumbing', status: 'draft' });

    const res = await api().get('/api/search?q=plumbing');
    expect(res.status).toBe(200);
    const { query, services, providers, categories, totals } = res.body.data;
    expect(query).toBe('plumbing');
    expect(services.map((s) => s.title)).toEqual(['Emergency plumbing']);
    expect(providers.map((p) => p.displayName)).toEqual(['Kigali Plumbing Pros']);
    expect(categories).toEqual([
      { id: plumbing.id, name: 'Home Repairs', slug: 'home-repairs', matchingSubcategories: [{ name: 'Plumbing', slug: 'plumbing' }] },
    ]);
    expect(totals).toEqual({ services: 1, providers: 1 });
  });

  test('previews at most five results per group', async () => {
    const cat = await createCategory();
    const provider = await createProvider();
    for (let i = 0; i < 7; i += 1) await createListingDoc(provider.profile, cat, { title: `Garden care ${i}` });
    const res = await api().get('/api/search?q=garden');
    expect(res.body.data.services).toHaveLength(5);
    expect(res.body.data.totals.services).toBe(7);
  });

  test('requires a search term and treats regex characters literally', async () => {
    expect((await api().get('/api/search')).status).toBe(400);
    expect((await api().get('/api/search?q=')).status).toBe(400);
    expect((await api().get('/api/search?q=a')).status).toBe(400);

    await createCategory({ name: 'Plumbing', slug: 'plumbing' });
    const res = await api().get('/api/search').query({ q: '.*' });
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([]);
  });

  test('disabled categories are not suggested', async () => {
    await createCategory({ name: 'Secret Category', slug: 'secret-category', status: 'disabled' });
    const res = await api().get('/api/search?q=secret');
    expect(res.body.data.categories).toEqual([]);
  });
});
