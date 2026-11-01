const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const ProviderProfile = require('../models/ProviderProfile');
const VerificationRecommendation = require('../models/VerificationRecommendation');
const { api, bearer, createSession, createAdmin, createCategory, createProvider, createBookingDoc } = require('./helpers');

const COMMENT = 'Arrived on time and fixed the problem properly.';
const review = (t, id, rating = 5) => api().post(`/api/bookings/${id}/reviews`).set(bearer(t)).send({ rating, comment: COMMENT });

/** A provider with `jobs` completed, each rated by a different customer. */
async function ratedProvider({ jobs = 3, rating = 5, verified = false, name } = {}) {
  const category = await createCategory();
  const provider = await createProvider({ verified, profileOverrides: { categories: [category._id], ...(name ? { displayName: name } : {}) } });
  for (let i = 0; i < jobs; i += 1) {
    const customer = await createSession(['customer']);
    const booking = await createBookingDoc({ customer, provider, category, status: 'completed', completedAt: new Date() });
    await ProviderProfile.updateOne({ _id: provider.profile._id }, { $inc: { completedJobs: 1 } });
    expect((await review(customer.token, booking._id, rating)).status).toBe(201);
  }
  return provider;
}

describe('who can rate a provider', () => {
  test('only the customer of a completed job: not a stranger, not the provider, not twice, not before completion', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    const done = await createBookingDoc({ customer, provider, category, status: 'completed', completedAt: new Date() });
    const live = await createBookingDoc({ customer, provider, category, status: 'in_progress' });
    const stranger = await createSession(['customer']);

    expect((await review(stranger.token, done._id)).status).toBe(404);
    expect((await review(provider.token, done._id)).status).toBe(404);
    expect((await review(customer.token, live._id)).body.error.code).toBe('BOOKING_NOT_COMPLETED');
    expect((await review(customer.token, done._id)).status).toBe(201);
    expect((await review(customer.token, done._id)).body.error.code).toBe('REVIEW_EXISTS');
    expect((await api().post(`/api/bookings/${done._id}/reviews`).set(bearer(customer.token)).send({ rating: 5, comment: 'short' })).status).toBe(400);
  });

  test('a person who is both customer and provider cannot rate themselves', async () => {
    const category = await createCategory();
    const both = await createProvider({ roles: ['customer', 'provider'], profileOverrides: { categories: [category._id] } });
    const booking = await createBookingDoc({ customer: both, provider: both, category, status: 'completed', completedAt: new Date() });
    const res = await review(both.token, booking._id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_REVIEW');
    expect((await ProviderProfile.findById(both.profile._id)).ratingCount).toBe(0);
  });
});

describe('ratings, totals and history', () => {
  test('the average, the number of reviews and the completed jobs are calculated by the server', async () => {
    const provider = await ratedProvider({ jobs: 3 });
    const p = await ProviderProfile.findById(provider.profile._id);
    expect(p).toMatchObject({ ratingAvg: 5, ratingCount: 3, completedJobs: 3 });
  });

  test('rating history: customers see what they wrote, providers see what they received with a monthly trend', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    const b = await createBookingDoc({ customer, provider, category, status: 'completed', completedAt: new Date() });
    await review(customer.token, b._id, 4);

    const mine = await api().get('/api/reviews/mine').set(bearer(customer.token));
    expect(mine.body.data.items).toHaveLength(1);
    expect(mine.body.data.items[0]).toMatchObject({ rating: 4 });
    const received = await api().get('/api/reviews/mine').set(bearer(provider.token));
    expect(received.body.data.summary).toMatchObject({ average: 4, count: 1 });
    expect(received.body.data.months).toHaveLength(1);
    expect(received.body.data.items[0].reviewer).toBeTruthy();
    expect((await api().get('/api/reviews/mine')).status).toBe(401);
  });
});

describe('admin ratings report', () => {
  const report = (t, qs = '') => api().get(`/api/admin/ratings/providers${qs}`).set(bearer(t));

  test('lists highly rated providers with their completed jobs, filtered by the thresholds; staff only', async () => {
    const admin = await createAdmin();
    await ratedProvider({ jobs: 4, rating: 5, name: 'Star Provider' });
    await ratedProvider({ jobs: 4, rating: 2, name: 'Low Provider' });
    await ratedProvider({ jobs: 1, rating: 5, name: 'New Provider' });

    const res = await report(admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => p.displayName)).toEqual(['Star Provider']);
    expect(res.body.data[0]).toMatchObject({ ratingAvg: 5, ratingCount: 4, completedJobs: 4, verificationStatus: 'unverified', recommended: false });
    expect((await report(admin.token, '?minRating=0&minReviews=1&minJobs=1')).body.data).toHaveLength(3);
    expect((await report(admin.token, '?minRating=0&minReviews=1&minJobs=1&verification=verified')).body.data).toHaveLength(0);

    expect((await report((await createSession(['customer'])).token)).status).toBe(403);
    expect((await report((await createSession(['finance'])).token)).status).toBe(403);
    expect((await api().get('/api/admin/ratings/providers')).status).toBe(401);
  });

  test('shows the evidence behind a provider: the spread, written reviews and jobs', async () => {
    const admin = await createAdmin();
    const provider = await ratedProvider({ jobs: 3 });
    const res = await api().get(`/api/admin/ratings/providers/${provider.profile._id}`).set(bearer(admin.token));
    expect(res.body.data.provider).toMatchObject({ ratingCount: 3, distribution: { 5: 3 } });
    expect(res.body.data.provider.reviews).toHaveLength(3);
    expect(res.body.data.provider.completedJobList).toHaveLength(3);
  });
});

describe('recommending a provider for verification', () => {
  const recommend = (t, id, note = 'Consistently excellent ratings and many completed jobs.') => api().post(`/api/admin/ratings/providers/${id}/recommend`).set(bearer(t)).send({ note });

  test('an administrator\'s recommendation goes to the super administrator and verifies nobody', async () => {
    const admin = await createAdmin();
    const boss = await createSession(['super_admin']);
    const provider = await ratedProvider({ jobs: 5 });

    const res = await recommend(admin.token, provider.profile._id);
    expect(res.status).toBe(201);
    expect(res.body.data.recommendation).toMatchObject({ status: 'open', ratings: { average: 5, count: 5, completedJobs: 5 } });
    expect(await Notification.findOne({ user: boss.user._id, type: 'verification.recommendation' })).toBeTruthy();
    expect(await Notification.findOne({ user: provider.user._id, title: /recommended/i })).toBeTruthy();
    expect(await AuditLog.findOne({ action: 'verification.recommendation_created' })).toBeTruthy();

    const p = await ProviderProfile.findById(provider.profile._id);
    expect(p.verificationStatus).toBe('unverified'); // ratings never grant verified status
    expect((await api().get(`/api/providers/${provider.profile._id}`)).status).toBe(404);

    const list = await api().get('/api/admin/verification-recommendations').set(bearer(boss.token));
    expect(list.body.data[0]).toMatchObject({ status: 'open', provider: { displayName: provider.profile.displayName } });
  });

  test('needs a note, real ratings, an unverified provider, and only one open recommendation', async () => {
    const admin = await createAdmin();
    const provider = await ratedProvider({ jobs: 3 });
    expect((await api().post(`/api/admin/ratings/providers/${provider.profile._id}/recommend`).set(bearer(admin.token)).send({ note: 'ok' })).status).toBe(400);
    expect((await recommend(admin.token, (await createProvider({ verified: false })).profile._id)).body.error.code).toBe('NO_RATINGS');
    expect((await recommend(admin.token, (await ratedProvider({ jobs: 3, verified: true })).profile._id)).body.error.code).toBe('ALREADY_VERIFIED');
    expect((await recommend(admin.token, provider.profile._id)).status).toBe(201);
    expect((await recommend(admin.token, provider.profile._id)).body.error.code).toBe('ALREADY_RECOMMENDED');
  });

  test('only administrators recommend; only the super administrator sees and resolves recommendations', async () => {
    const admin = await createAdmin();
    const boss = await createSession(['super_admin']);
    const provider = await ratedProvider({ jobs: 3 });
    expect((await recommend((await createSession(['customer'])).token, provider.profile._id)).status).toBe(403);
    expect((await recommend(provider.token, provider.profile._id)).status).toBe(403);
    await recommend(admin.token, provider.profile._id);
    const rec = await VerificationRecommendation.findOne();

    expect((await api().get('/api/admin/verification-recommendations').set(bearer(admin.token))).status).toBe(403);
    expect((await api().patch(`/api/admin/verification-recommendations/${rec._id}`).set(bearer(admin.token)).send({ status: 'dismissed' })).status).toBe(403);
    const done = await api().patch(`/api/admin/verification-recommendations/${rec._id}`).set(bearer(boss.token)).send({ status: 'dismissed', note: 'Not now' });
    expect(done.body.data.recommendation).toMatchObject({ status: 'dismissed' });
    expect((await ProviderProfile.findById(provider.profile._id)).verificationStatus).toBe('unverified');
  });
});
