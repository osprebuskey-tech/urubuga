const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const ProviderProfile = require('../models/ProviderProfile');
const Review = require('../models/Review');
const { api, bearer, createCategory, createSession, createProvider, createAdmin, createBookingDoc } = require('./helpers');

const COMMENT = 'Arrived on time and fixed the problem properly.';

async function setup(bookingStatus = 'completed') {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
  const done = (overrides = {}) => createBookingDoc({ customer, provider, category, status: 'completed', completedAt: new Date(), ...overrides });
  const booking = await createBookingDoc({ customer, provider, category, status: bookingStatus, ...(bookingStatus === 'completed' ? { completedAt: new Date() } : {}) });
  return { category, customer, provider, booking, done };
}

const review = (token, bookingId, body) => api().post(`/api/bookings/${bookingId}/reviews`).set(bearer(token)).send(body);
const profileOf = (provider) => ProviderProfile.findById(provider.profile._id);

describe('POST /api/bookings/:id/reviews', () => {
  test('the customer reviews a completed job; the provider’s rating updates and they are notified', async () => {
    const { customer, provider, booking } = await setup();
    const res = await review(customer.token, booking._id, { rating: 5, comment: COMMENT });
    expect(res.status).toBe(201);
    expect(res.body.data.review).toMatchObject({ rating: 5, comment: COMMENT, status: 'published' });

    const saved = await profileOf(provider);
    expect(saved.ratingAvg).toBe(5);
    expect(saved.ratingCount).toBe(1);

    const note = await Notification.findOne({ type: 'review.received' });
    expect(String(note.user)).toBe(String(provider.user._id));
    expect(note.link).toBe(`/dashboard/bookings/${booking._id}`);
  });

  test('only for completed jobs', async () => {
    for (const status of ['accepted', 'in_progress', 'cancelled', 'disputed']) {
      const { customer, booking } = await setup(status);
      const res = await review(customer.token, booking._id, { rating: 4, comment: COMMENT });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BOOKING_NOT_COMPLETED');
    }
    expect(await Review.countDocuments()).toBe(0);
  });

  test('only the customer who hired the provider can review', async () => {
    const { provider, booking } = await setup();
    const stranger = await createSession(['customer']);
    expect((await review(stranger.token, booking._id, { rating: 5, comment: COMMENT })).status).toBe(404);
    expect((await review(provider.token, booking._id, { rating: 5, comment: COMMENT })).status).toBe(404); // providers cannot review themselves
    expect((await review((await createAdmin()).token, booking._id, { rating: 5, comment: COMMENT })).status).toBe(404);
    expect((await api().post(`/api/bookings/${booking._id}/reviews`).send({ rating: 5, comment: COMMENT })).status).toBe(401);
    expect(await Review.countDocuments()).toBe(0);
  });

  test('a job can only be reviewed once, even with simultaneous requests', async () => {
    const { customer, provider, booking } = await setup();
    expect((await review(customer.token, booking._id, { rating: 5, comment: COMMENT })).status).toBe(201);
    const again = await review(customer.token, booking._id, { rating: 1, comment: 'Changed my mind about this one.' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REVIEW_EXISTS');

    const second = await createBookingDoc({ customer, provider, category: await createCategory(), status: 'completed', completedAt: new Date() });
    const both = await Promise.all([1, 2].map((n) => review(customer.token, second._id, { rating: 3, comment: `Parallel review number ${n}.` })));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Review.countDocuments({ booking: second._id })).toBe(1);
    expect((await profileOf(provider)).ratingCount).toBe(2);
  });

  test('validates the rating and comment, and refuses extra fields', async () => {
    const { customer, booking } = await setup();
    const status = async (body) => (await review(customer.token, booking._id, body)).status;
    expect(await status({ rating: 0, comment: COMMENT })).toBe(400);
    expect(await status({ rating: 6, comment: COMMENT })).toBe(400);
    expect(await status({ rating: 4.5, comment: COMMENT })).toBe(400);
    expect(await status({ rating: '5', comment: COMMENT })).toBe(400);
    expect(await status({ rating: 5, comment: 'short' })).toBe(400);
    expect(await status({ rating: 5, comment: 'x'.repeat(1001) })).toBe(400);
    expect(await status({ rating: 5 })).toBe(400);
    expect(await status({ rating: 5, comment: COMMENT, provider: String(booking.provider) })).toBe(400);
    expect(await status({ rating: 5, comment: COMMENT, status: 'hidden' })).toBe(400);
    expect(await Review.countDocuments()).toBe(0);
  });
});

describe('rating average', () => {
  test('is calculated from published reviews only', async () => {
    const { customer, provider, done } = await setup();
    const reviews = [];
    for (const rating of [5, 4, 3]) {
      const b = await done();
      reviews.push((await review(customer.token, b._id, { rating, comment: COMMENT })).body.data.review);
    }
    let saved = await profileOf(provider);
    expect(saved.ratingAvg).toBe(4);
    expect(saved.ratingCount).toBe(3);

    const admin = await createAdmin();
    const hide = await api().patch(`/api/admin/reviews/${reviews[0].id}`).set(bearer(admin.token)).send({ status: 'hidden', reason: 'Contains personal details' });
    expect(hide.status).toBe(200);
    saved = await profileOf(provider);
    expect(saved.ratingAvg).toBe(3.5); // (4 + 3) / 2
    expect(saved.ratingCount).toBe(2);

    await api().patch(`/api/admin/reviews/${reviews[0].id}`).set(bearer(admin.token)).send({ status: 'published' });
    saved = await profileOf(provider);
    expect(saved.ratingAvg).toBe(4);
    expect(saved.ratingCount).toBe(3);
  });

  test('is rounded to two decimals', async () => {
    const { customer, provider, done } = await setup();
    for (const rating of [5, 5, 4]) await review(customer.token, (await done())._id, { rating, comment: COMMENT });
    expect((await profileOf(provider)).ratingAvg).toBe(4.67);
  });
});

describe('GET /api/providers/:id/reviews', () => {
  test('is public, lists only published reviews with first names, and summarises ratings', async () => {
    const { customer, provider, done } = await setup();
    await review(customer.token, (await done())._id, { rating: 5, comment: 'Excellent work from start to finish.' });
    const hidden = (await review(customer.token, (await done())._id, { rating: 1, comment: 'Something rude about this person.' })).body.data.review;
    await review(customer.token, (await done())._id, { rating: 4, comment: 'Good job, a little late though.' });
    await Review.updateOne({ _id: hidden.id }, { status: 'hidden' });

    const res = await api().get(`/api/providers/${provider.profile._id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((r) => r.comment)).not.toContain('Something rude about this person.');
    expect(res.body.data[0].reviewer).toEqual({ name: 'Test' });
    expect(JSON.stringify(res.body)).not.toContain(String(customer.user._id));
    expect(JSON.stringify(res.body)).not.toContain(customer.user.email);
    expect(res.body.meta.summary).toEqual({ average: 4.5, count: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } });
  });

  test('paginates, filters by rating, and hides unverified providers', async () => {
    const { customer, provider, done } = await setup();
    for (const rating of [5, 4, 4]) await review(customer.token, (await done())._id, { rating, comment: COMMENT });

    const url = `/api/providers/${provider.profile._id}/reviews`;
    const paged = await api().get(`${url}?limit=2&page=2`);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta).toMatchObject({ total: 3, totalPages: 2 });
    expect((await api().get(`${url}?rating=4`)).body.data).toHaveLength(2);
    expect((await api().get(`${url}?rating=9`)).status).toBe(400);

    const unverified = await createProvider({ verified: false });
    expect((await api().get(`/api/providers/${unverified.profile._id}/reviews`)).status).toBe(404);
    expect((await api().get('/api/providers/not-an-id/reviews')).status).toBe(400);
  });
});

describe('booking details include review state', () => {
  const view = (token, id) => api().get(`/api/bookings/${id}`).set(bearer(token));

  test('the customer can review a completed job until they have', async () => {
    const { customer, provider, booking } = await setup();
    let b = (await view(customer.token, booking._id)).body.data.booking;
    expect(b).toMatchObject({ canReview: true, review: null });
    expect((await view(provider.token, booking._id)).body.data.booking.canReview).toBe(false);

    await review(customer.token, booking._id, { rating: 4, comment: COMMENT });
    b = (await view(customer.token, booking._id)).body.data.booking;
    expect(b.canReview).toBe(false);
    expect(b.review).toMatchObject({ rating: 4, comment: COMMENT });
    const asProvider = (await view(provider.token, booking._id)).body.data.booking;
    expect(asProvider.review).toMatchObject({ rating: 4, reported: false });
  });

  test('a job that is not completed cannot be reviewed', async () => {
    const { customer, booking } = await setup('in_progress');
    expect((await view(customer.token, booking._id)).body.data.booking.canReview).toBe(false);
  });

  test('the provider never sees a hidden review; the author sees why it was removed', async () => {
    const { customer, provider, booking } = await setup();
    const created = (await review(customer.token, booking._id, { rating: 1, comment: COMMENT })).body.data.review;
    await api().patch(`/api/admin/reviews/${created.id}`).set(bearer((await createAdmin()).token)).send({ status: 'hidden', reason: 'Breaks the review rules' });

    expect((await view(provider.token, booking._id)).body.data.booking.review).toBeNull();
    const asAuthor = (await view(customer.token, booking._id)).body.data.booking;
    expect(asAuthor.review).toMatchObject({ status: 'hidden', hiddenReason: 'Breaks the review rules' });
    expect(asAuthor.canReview).toBe(false); // a removed review cannot simply be replaced
  });
});

describe('POST /api/reviews/:id/report', () => {
  async function reviewed() {
    const ctx = await setup();
    const created = (await review(ctx.customer.token, ctx.booking._id, { rating: 1, comment: 'Completely made-up complaint here.' })).body.data.review;
    return { ...ctx, reviewId: created.id };
  }
  const report = (token, id, body = { reason: 'fake' }) => api().post(`/api/reviews/${id}/report`).set(bearer(token)).send(body);

  test('the reviewed provider can report it, once', async () => {
    const { provider, reviewId } = await reviewed();
    const res = await report(provider.token, reviewId, { reason: 'fake', note: 'I never worked for this customer.' });
    expect(res.status).toBe(200);
    expect(res.body.data.review.reported).toBe(true);
    expect((await Review.findById(reviewId)).reportCount).toBe(1);
    expect((await Review.findById(reviewId)).status).toBe('published'); // reporting alone never hides a review

    const again = await report(provider.token, reviewId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REPORTED');
    expect((await Review.findById(reviewId)).reportCount).toBe(1);
  });

  test('nobody else can report it', async () => {
    const { customer, reviewId } = await reviewed();
    const otherProvider = await createProvider();
    expect((await report(otherProvider.token, reviewId)).status).toBe(404);
    expect((await report(customer.token, reviewId)).status).toBe(403); // not a provider account
    expect((await api().post(`/api/reviews/${reviewId}/report`).send({ reason: 'fake' })).status).toBe(401);
  });

  test('validates the reason', async () => {
    const { provider, reviewId } = await reviewed();
    expect((await report(provider.token, reviewId, { reason: 'because' })).status).toBe(400);
    expect((await report(provider.token, reviewId, {})).status).toBe(400);
    expect((await report(provider.token, reviewId, { reason: 'fake', reportCount: 99 })).status).toBe(400);
  });
});

describe('admin moderation', () => {
  async function reportedReview() {
    const ctx = await setup();
    const created = (await review(ctx.customer.token, ctx.booking._id, { rating: 1, comment: 'Completely made-up complaint here.' })).body.data.review;
    await api().post(`/api/reviews/${created.id}/report`).set(bearer(ctx.provider.token)).send({ reason: 'fake', note: 'Never my customer' });
    return { ...ctx, reviewId: created.id, admin: await createAdmin() };
  }

  test('lists reviews with filters; only admins can', async () => {
    const { customer, admin, done, reviewId } = await reportedReview();
    await review(customer.token, (await done())._id, { rating: 5, comment: 'Wonderful service, thank you.' });

    const all = await api().get('/api/admin/reviews').set(bearer(admin.token));
    expect(all.body.data).toHaveLength(2);
    const reported = await api().get('/api/admin/reviews?reported=true').set(bearer(admin.token));
    expect(reported.body.data).toHaveLength(1);
    expect(reported.body.data[0]).toMatchObject({ id: reviewId, reportCount: 1, reports: [{ reason: 'fake', note: 'Never my customer' }] });
    expect((await api().get('/api/admin/reviews?status=hidden').set(bearer(admin.token))).body.data).toHaveLength(0);

    expect((await api().get('/api/admin/reviews').set(bearer(customer.token))).status).toBe(403);
    expect((await api().get('/api/admin/reviews')).status).toBe(401);
  });

  test('hiding needs a reason, removes it from public view, tells the author and is audited', async () => {
    const { customer, provider, admin, reviewId } = await reportedReview();
    const patch = (body) => api().patch(`/api/admin/reviews/${reviewId}`).set(bearer(admin.token)).send(body);

    expect((await patch({ status: 'hidden' })).status).toBe(400);
    expect((await patch({ status: 'hidden', reason: 'no' })).status).toBe(400);
    expect((await patch({ status: 'deleted', reason: 'Breaks the rules' })).status).toBe(400);

    expect((await patch({ status: 'hidden', reason: 'Not a genuine customer review' })).status).toBe(200);
    const saved = await Review.findById(reviewId);
    expect(saved.status).toBe('hidden');
    expect(String(saved.moderatedBy)).toBe(String(admin.user._id));

    expect((await api().get(`/api/providers/${provider.profile._id}/reviews`)).body.data).toHaveLength(0);
    const after = await profileOf(provider);
    expect(after.ratingAvg).toBe(0);
    expect(after.ratingCount).toBe(0);

    const note = await Notification.findOne({ type: 'review.moderated' });
    expect(String(note.user)).toBe(String(customer.user._id));
    expect(note.body).toBe('Not a genuine customer review');
    expect(await AuditLog.countDocuments({ action: 'review.hidden' })).toBe(1);

    expect((await patch({ status: 'hidden', reason: 'Not a genuine customer review' })).status).toBe(200); // idempotent
    expect(await AuditLog.countDocuments({ action: 'review.hidden' })).toBe(1);
  });

  test('a hidden review can be restored', async () => {
    const { provider, admin, reviewId } = await reportedReview();
    const patch = (body) => api().patch(`/api/admin/reviews/${reviewId}`).set(bearer(admin.token)).send(body);
    await patch({ status: 'hidden', reason: 'Under investigation' });
    expect((await patch({ status: 'published' })).status).toBe(200);
    expect((await Review.findById(reviewId)).hiddenReason).toBeUndefined();
    expect((await profileOf(provider)).ratingCount).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'review.restored' })).toBe(1);
  });

  test('non-admins cannot moderate', async () => {
    const { customer, provider, reviewId } = await reportedReview();
    for (const who of [customer, provider]) {
      expect((await api().patch(`/api/admin/reviews/${reviewId}`).set(bearer(who.token)).send({ status: 'hidden', reason: 'I do not like it' })).status).toBe(403);
    }
    expect((await Review.findById(reviewId)).status).toBe('published');
  });

  test('unknown review ids are 404', async () => {
    const admin = await createAdmin();
    const res = await api().patch('/api/admin/reviews/64b7f0f0f0f0f0f0f0f0f0f0').set(bearer(admin.token)).send({ status: 'hidden', reason: 'No such review' });
    expect(res.status).toBe(404);
  });
});
