const { api, createCategory, createProvider, createListingDoc } = require('./helpers');
const { rankScore } = require('../utils/ranking');

const rated = (name, ratingAvg, ratingCount, extra = {}) => createProvider({ profileOverrides: { displayName: name, ratingAvg, ratingCount, ...extra } });

describe('rankScore', () => {
  test('a long, good record beats a single perfect rating, and no reviews sits in the middle', () => {
    expect(rankScore(4.8, 40)).toBeGreaterThan(rankScore(5, 1));
    expect(rankScore(0, 0)).toBeCloseTo(3.5);
    expect(rankScore(5, 1)).toBeGreaterThan(rankScore(0, 0));
  });
});

describe('sort=top', () => {
  test('providers: unverified are never shown; verified are ordered by weighted customer rating', async () => {
    await rated('One perfect review', 5, 1);
    await rated('Forty good reviews', 4.8, 40);
    await rated('New, no reviews', 0, 0);
    await createProvider({ verified: false, profileOverrides: { displayName: 'Not verified', ratingAvg: 5, ratingCount: 500 } });

    const res = await api().get('/api/providers?sort=top');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => p.displayName)).toEqual(['Forty good reviews', 'One perfect review', 'New, no reviews']);
    expect(res.body.meta.total).toBe(3);
  });

  test('providers: paging and category filter keep the ranking', async () => {
    const plumbing = await createCategory();
    const other = await createCategory();
    await rated('Best plumber', 4.9, 30, { categories: [plumbing._id] });
    await rated('Okay plumber', 4.0, 10, { categories: [plumbing._id] });
    await rated('Great but elsewhere', 5, 100, { categories: [other._id] });

    const page1 = await api().get(`/api/providers?sort=top&category=${plumbing._id}&limit=1&page=1`);
    const page2 = await api().get(`/api/providers?sort=top&category=${plumbing._id}&limit=1&page=2`);
    expect(page1.body.data.map((p) => p.displayName)).toEqual(['Best plumber']);
    expect(page2.body.data.map((p) => p.displayName)).toEqual(['Okay plumber']);
    expect(page1.body.meta.total).toBe(2);
  });

  test('services: ranked by the provider’s weighted rating, and only verified providers’ listings appear', async () => {
    const category = await createCategory();
    const solid = await rated('Solid', 4.8, 40);
    const lucky = await rated('Lucky', 5, 1);
    const unverified = await createProvider({ verified: false, profileOverrides: { ratingAvg: 5, ratingCount: 900 } });
    await createListingDoc(lucky.profile, category, { title: 'Lucky listing' });
    await createListingDoc(solid.profile, category, { title: 'Solid listing' });
    await createListingDoc(unverified.profile, category, { title: 'Hidden listing' });

    const res = await api().get('/api/services?sort=top');
    expect(res.status).toBe(200);
    expect(res.body.data.map((l) => l.title)).toEqual(['Solid listing', 'Lucky listing']);
  });
});
