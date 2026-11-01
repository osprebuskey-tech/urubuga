const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceListing = require('../models/ServiceListing');
const VerificationApplication = require('../models/VerificationApplication');
const {
  api, bearer, createAdmin, createSession, createCategory, createProvider, createListingDoc, attachPng, fileExists, pngBuffer, publishFee, createApplication,
} = require('./helpers');

const profileBody = (categoryId, overrides = {}) => ({
  displayName: 'Eric Mugisha IT',
  bio: 'Computer and network repair for homes and small businesses.',
  categories: [String(categoryId)],
  skills: ['Laptop repair', 'Networking'],
  experienceYears: 5,
  location: { district: 'Huye' },
  coverage: ['Huye', 'Nyanza'],
  ...overrides,
});

describe('PUT /api/providers/me', () => {
  test('only users with the provider role can manage a provider profile', async () => {
    const category = await createCategory();
    const { token } = await createSession(['customer']);
    const res = await api().put('/api/providers/me').set(bearer(token)).send(profileBody(category.id));
    expect(res.status).toBe(403);
    expect((await api().put('/api/providers/me').send(profileBody(category.id))).status).toBe(401);
  });

  test('creates a profile, then updates only the fields sent', async () => {
    const category = await createCategory();
    const { token } = await createSession(['provider']);

    const created = await api().put('/api/providers/me').set(bearer(token)).send(profileBody(category.id));
    expect(created.status).toBe(200);
    expect(created.body.data.profile).toMatchObject({
      displayName: 'Eric Mugisha IT',
      verificationStatus: 'unverified',
      ratingAvg: 0,
      ratingCount: 0,
      completedJobs: 0,
      location: { district: 'Huye' },
      contactPreferences: { showPhone: false, showEmail: false, preferredChannel: 'in_app' },
    });
    expect(created.body.data.profile.categories[0]).toMatchObject({ name: category.name, slug: category.slug });

    const updated = await api().put('/api/providers/me').set(bearer(token)).send({ displayName: 'New Name', location: { district: 'Musanze' } });
    expect(updated.status).toBe(200);
    expect(updated.body.data.profile.displayName).toBe('New Name');
    expect(updated.body.data.profile.location.district).toBe('Musanze');
    expect(updated.body.data.profile.bio).toMatch(/Computer and network repair/); // untouched
    expect(await ProviderProfile.countDocuments()).toBe(1);

    const me = await api().get('/api/providers/me').set(bearer(token));
    expect(me.body.data.profile.displayName).toBe('New Name');
  });

  test('system-owned fields cannot be set by the client', async () => {
    const category = await createCategory();
    const { token } = await createSession(['provider']);
    for (const extra of [{ ratingAvg: 5 }, { verificationStatus: 'verified' }, { completedJobs: 99 }, { user: 'aaaaaaaaaaaaaaaaaaaaaaaa' }]) {
      const res = await api().put('/api/providers/me').set(bearer(token)).send(profileBody(category.id, extra));
      expect(res.status).toBe(400);
    }
    expect(await ProviderProfile.countDocuments()).toBe(0);
  });

  test('validates districts, numbers and categories', async () => {
    const category = await createCategory();
    const disabled = await createCategory({ status: 'disabled' });
    const { token } = await createSession(['provider']);
    const put = (body) => api().put('/api/providers/me').set(bearer(token)).send(body);

    expect((await put(profileBody(category.id, { location: { district: 'Atlantis' } }))).status).toBe(400);
    expect((await put(profileBody(category.id, { experienceYears: 1.5 }))).status).toBe(400);
    expect((await put(profileBody(category.id, { displayName: 'x' }))).status).toBe(400);

    const unknown = await put(profileBody('aaaaaaaaaaaaaaaaaaaaaaaa'));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('INVALID_CATEGORY');
    expect((await put(profileBody(disabled.id))).body.error.code).toBe('INVALID_CATEGORY');
  });

  test('GET /me returns 404 until a profile exists', async () => {
    const { token } = await createSession(['provider']);
    const res = await api().get('/api/providers/me').set(bearer(token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
  });
});

describe('public provider directory', () => {
  test('lists and shows only verified providers', async () => {
    const verified = await createProvider({ verified: true });
    const unverified = await createProvider({ verified: false });

    const list = await api().get('/api/providers');
    expect(list.status).toBe(200);
    expect(list.body.data.map((p) => p.id)).toEqual([String(verified.profile._id)]);
    expect(list.body.meta).toMatchObject({ page: 1, total: 1 });

    expect((await api().get(`/api/providers/${verified.profile._id}`)).status).toBe(200);
    expect((await api().get(`/api/providers/${unverified.profile._id}`)).status).toBe(404);
  });

  test('never exposes private fields or contact details by default', async () => {
    const { user, profile } = await createProvider({ profileOverrides: { verificationNote: 'internal note' } });
    await User.updateOne({ _id: user._id }, { phone: '+250788123456' });

    const res = await api().get(`/api/providers/${profile._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.provider.contact).toEqual({});
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/verificationNote|internal note|@example\.com|\+250788123456|passwordHash|"user"/);
  });

  test('shows only the contact details the provider opted in to share', async () => {
    const { user, profile } = await createProvider({ profileOverrides: { contactPreferences: { showPhone: true } } });
    await User.updateOne({ _id: user._id }, { phone: '+250788123456' });

    const res = await api().get(`/api/providers/${profile._id}`);
    expect(res.body.data.provider.contact).toEqual({ phone: '+250788123456' });
  });

  test('filters by category and by district (home or coverage)', async () => {
    const [c1, c2] = [await createCategory(), await createCategory()];
    const a = await createProvider({ profileOverrides: { categories: [c1._id], location: { district: 'Huye' } } });
    const b = await createProvider({ profileOverrides: { categories: [c2._id], coverage: ['Rubavu'], location: { district: 'Musanze' } } });

    const byCategory = await api().get(`/api/providers?category=${c1.id}`);
    expect(byCategory.body.data.map((p) => p.id)).toEqual([String(a.profile._id)]);

    const byCoverage = await api().get('/api/providers?district=Rubavu');
    expect(byCoverage.body.data.map((p) => p.id)).toEqual([String(b.profile._id)]);

    expect((await api().get('/api/providers?district=Atlantis')).status).toBe(400);
  });

  test('is paginated', async () => {
    for (let i = 0; i < 3; i += 1) await createProvider();
    const res = await api().get('/api/providers?limit=2&page=2');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });
});

describe('verification workflow', () => {
  beforeEach(() => publishFee());

  test('an incomplete profile cannot request verification', async () => {
    const { token } = await createProvider({ verified: false, profileOverrides: { bio: undefined, location: undefined } });
    const res = await api().post('/api/providers/me/verification-request').set(bearer(token));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PROFILE_INCOMPLETE');
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['categories', 'location.district']));
  });

  test('a complete profile moves to pending, and cannot request twice', async () => {
    const category = await createCategory();
    const { token } = await createProvider({ verified: false, profileOverrides: { categories: [category._id] } });

    const res = await api().post('/api/providers/me/verification-request').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.profile.verificationStatus).toBe('pending');

    const again = await api().post('/api/providers/me/verification-request').set(bearer(token));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_PENDING');
  });

  test('admins can list providers, but cannot approve through the older endpoint: approval is the super administrator\'s', async () => {
    const category = await createCategory();
    const provider = await createProvider({ verified: false, profileOverrides: { categories: [category._id] } });
    await api().post('/api/providers/me/verification-request').set(bearer(provider.token));
    const admin = await createAdmin();
    const boss = await createSession(['super_admin']);

    const pending = await api().get('/api/admin/providers?verificationStatus=pending').set(bearer(admin.token));
    expect(pending.status).toBe(200);
    expect(pending.body.data.map((p) => p.id)).toEqual([String(provider.profile._id)]);

    for (const who of [admin, boss]) {
      const res = await api().patch(`/api/admin/providers/${provider.profile._id}/verification`).set(bearer(who.token)).send({ status: 'verified' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USE_VERIFICATION_REVIEW');
    }
    expect((await api().get(`/api/providers/${provider.profile._id}`)).status).toBe(404);
  });

  test('rejection needs a reason, and the provider can read it', async () => {
    const provider = await createProvider({ verified: false });
    await createApplication(provider, { status: 'under_review' });
    const admin = await createAdmin();
    const url = `/api/admin/providers/${provider.profile._id}/verification`;

    expect((await api().patch(url).set(bearer(admin.token)).send({ status: 'rejected' })).status).toBe(400);
    expect((await api().patch(url).set(bearer(admin.token)).send({ status: 'pending' })).status).toBe(400);

    const res = await api().patch(url).set(bearer(admin.token)).send({ status: 'rejected', note: 'Bio does not describe your services' });
    expect(res.status).toBe(200);

    const me = await api().get('/api/providers/me').set(bearer(provider.token));
    expect(me.body.data.profile).toMatchObject({ verificationStatus: 'rejected', verificationNote: 'Bio does not describe your services' });
  });

  test('providers and other roles cannot verify anyone', async () => {
    const target = await createProvider({ verified: false });
    const other = await createProvider();
    const url = `/api/admin/providers/${target.profile._id}/verification`;

    expect((await api().patch(url).send({ status: 'verified' })).status).toBe(401);
    expect((await api().patch(url).set(bearer(target.token)).send({ status: 'verified' })).status).toBe(403);
    expect((await api().patch(url).set(bearer(other.token)).send({ status: 'verified' })).status).toBe(403);
    expect((await api().get('/api/admin/providers').set(bearer(other.token))).status).toBe(403);
    expect((await ProviderProfile.findById(target.profile._id)).verificationStatus).toBe('unverified');
  });

  test('only the super administrator can withdraw verification, and it pauses the provider\'s live listings', async () => {
    const category = await createCategory();
    const provider = await createProvider();
    const live = await createListingDoc(provider.profile, category);
    const draft = await createListingDoc(provider.profile, category, { status: 'draft' });
    const admin = await createAdmin();
    const boss = await createSession(['super_admin']);
    const url = `/api/admin/providers/${provider.profile._id}/verification`;

    expect((await api().patch(url).set(bearer(admin.token)).send({ status: 'unverified', note: 'Documents expired' })).status).toBe(403);
    const res = await api().patch(url).set(bearer(boss.token)).send({ status: 'unverified', note: 'Documents expired' });
    expect(res.status).toBe(200);

    expect((await ServiceListing.findById(live._id)).status).toBe('paused');
    expect((await ServiceListing.findById(draft._id)).status).toBe('draft');
    expect((await api().get(`/api/services/${live._id}`)).status).toBe(404);
  });
});

describe('portfolio and avatar uploads', () => {
  const upload = (token, title = 'Kitchen renovation', size) =>
    attachPng(api().post('/api/providers/me/portfolio').set(bearer(token)).field('title', title).field('description', 'Full refit'), size);

  test('uploads an image, stores it, and serves it publicly', async () => {
    const { token } = await createProvider();
    const res = await upload(token);
    expect(res.status).toBe(201);

    const [item] = res.body.data.profile.portfolio;
    expect(item).toMatchObject({ title: 'Kitchen renovation', description: 'Full refit' });
    expect(item.imageUrl).toMatch(/^http:\/\/localhost:5000\/uploads\/portfolio\/[0-9a-f-]+\.png$/);
    expect(item.imageKey).toBeUndefined();
    expect(fileExists(item.imageUrl)).toBe(true);

    const served = await api().get(new URL(item.imageUrl).pathname);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toMatch(/image\/png/);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
  });

  test('rejects files that are not real images, even with an image content type', async () => {
    const { token } = await createProvider();
    const res = await api()
      .post('/api/providers/me/portfolio')
      .set(bearer(token))
      .field('title', 'Not an image')
      .attach('image', Buffer.from('<?php echo "hi"; ?> this is plain text, not a png'), { filename: 'shell.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  test('requires a file, a title and respects the size limit', async () => {
    const { token } = await createProvider();

    const noFile = await api().post('/api/providers/me/portfolio').set(bearer(token)).field('title', 'No file');
    expect(noFile.status).toBe(400);
    expect(noFile.body.error.code).toBe('NO_FILE');

    const noTitle = await attachPng(api().post('/api/providers/me/portfolio').set(bearer(token)));
    expect(noTitle.status).toBe(400);
    expect(noTitle.body.error.code).toBe('VALIDATION_ERROR');

    const tooBig = await upload(token, 'Huge', 1.5 * 1024 * 1024);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('FILE_TOO_LARGE');
  });

  test('requires a profile and the provider role', async () => {
    const noProfile = await createProvider({ profile: false });
    expect((await upload(noProfile.token)).status).toBe(404);
    const { token } = await createSession(['customer']);
    expect((await upload(token)).status).toBe(403);
    expect((await attachPng(api().post('/api/providers/me/portfolio').field('title', 'x'))).status).toBe(401);
  });

  test('removing an item deletes the file, and only the owner can remove it', async () => {
    const owner = await createProvider();
    const intruder = await createProvider();
    const created = await upload(owner.token);
    const item = created.body.data.profile.portfolio[0];

    const denied = await api().delete(`/api/providers/me/portfolio/${item.id}`).set(bearer(intruder.token));
    expect(denied.status).toBe(404);
    expect(fileExists(item.imageUrl)).toBe(true);

    const ok = await api().delete(`/api/providers/me/portfolio/${item.id}`).set(bearer(owner.token));
    expect(ok.status).toBe(200);
    expect(fileExists(item.imageUrl)).toBe(false);
    expect((await api().get('/api/providers/me').set(bearer(owner.token))).body.data.profile.portfolio).toHaveLength(0);
  });

  test('a portfolio holds at most 20 items', async () => {
    const owner = await createProvider();
    const items = Array.from({ length: 20 }, (_, i) => ({
      imageKey: `portfolio/seed-${i}.png`,
      imageUrl: `http://localhost:5000/uploads/portfolio/seed-${i}.png`,
      title: `Item ${i}`,
    }));
    await ProviderProfile.updateOne({ _id: owner.profile._id }, { $set: { portfolio: items } });

    const res = await upload(owner.token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PORTFOLIO_LIMIT');
  });

  test('the avatar can be replaced and the old file is removed', async () => {
    const { token } = await createProvider();
    const upload1 = await attachPng(api().post('/api/providers/me/avatar').set(bearer(token)));
    expect(upload1.status).toBe(200);
    const first = upload1.body.data.profile.avatarUrl;
    expect(first).toMatch(/\/uploads\/avatars\//);
    expect(fileExists(first)).toBe(true);

    const upload2 = await attachPng(api().post('/api/providers/me/avatar').set(bearer(token)), 300);
    const second = upload2.body.data.profile.avatarUrl;
    expect(second).not.toBe(first);
    expect(fileExists(second)).toBe(true);
    expect(fileExists(first)).toBe(false);
    expect(JSON.stringify(upload2.body)).not.toMatch(/avatarKey/);
  });

  test('accepts jpeg and webp by their real signature', async () => {
    const { token } = await createProvider();
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50)]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(50)]);
    const a = await api().post('/api/providers/me/avatar').set(bearer(token)).attach('image', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(a.body.data.profile.avatarUrl).toMatch(/\.jpg$/);
    const b = await api().post('/api/providers/me/avatar').set(bearer(token)).attach('image', webp, { filename: 'a.webp', contentType: 'image/webp' });
    expect(b.body.data.profile.avatarUrl).toMatch(/\.webp$/);
    expect(pngBuffer().length).toBeGreaterThan(0);
  });
});

describe('verification decisions: ask for more information, reject, approve', () => {
  const setup = async () => {
    const category = await createCategory();
    const provider = await createProvider({ verified: false, profileOverrides: { categories: [category._id] } });
    const app = await createApplication(provider, { status: 'under_review' });
    const admin = await createAdmin();
    const url = `/api/admin/providers/${provider.profile._id}/verification`;
    return { provider, admin, url, app };
  };

  test('asking for more information needs a question and notifies the provider', async () => {
    const { provider, admin, url } = await setup();

    expect((await api().patch(url).set(bearer(admin.token)).send({ status: 'needs_info' })).status).toBe(400);
    expect((await api().patch(url).set(bearer(admin.token)).send({ status: 'needs_info', note: 'hi' })).status).toBe(400);

    const res = await api().patch(url).set(bearer(admin.token)).send({ status: 'needs_info', note: 'Please add two portfolio items.' });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.verificationStatus).toBe('needs_info');

    const me = await api().get('/api/providers/me').set(bearer(provider.token));
    expect(me.body.data.profile).toMatchObject({ verificationStatus: 'needs_info', verificationNote: 'Please add two portfolio items.' });

    const note = await Notification.findOne({ user: provider.user._id, type: 'verification.updated' });
    expect(note.title).toMatch(/more information/i);
    expect(note.body).toBe('Please add two portfolio items.');

    expect((await api().get(`/api/providers/${provider.profile._id}`)).status).toBe(404); // not public while waiting for the provider
    const audit = await AuditLog.findOne({ action: 'verification.info_requested' });
    expect(audit.actor.toString()).toBe(String(admin.user._id));
  });

  test('the provider can reply, and the question and reply stay together until a final decision', async () => {
    const { provider, admin, url } = await setup();
    const boss = await createSession(['super_admin']);
    await api().patch(url).set(bearer(admin.token)).send({ status: 'needs_info', note: 'Please add two portfolio items.' });

    const res = await api().post('/api/providers/me/verification-request').set(bearer(provider.token)).send({ message: 'Added both, see my portfolio.' });
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({ verificationStatus: 'pending', verificationNote: 'Please add two portfolio items.', verificationResponse: 'Added both, see my portfolio.' });

    const waiting = await api().get('/api/admin/providers?verificationStatus=pending').set(bearer(admin.token));
    expect(waiting.body.data[0]).toMatchObject({ verificationResponse: 'Added both, see my portfolio.' });

    const app = await VerificationApplication.findOne({ provider: provider.profile._id });
    expect((await api().post(`/api/admin/verification/${app._id}/recommend`).set(bearer(admin.token)).send({ note: 'Documents check out and the portfolio is solid.' })).status).toBe(200);
    const done = await api().post(`/api/admin/verification/${app._id}/decision`).set(bearer(boss.token)).send({ outcome: 'approved' });
    expect(done.status).toBe(200);
    const profile = await ProviderProfile.findById(provider.profile._id);
    expect(profile.verificationStatus).toBe('verified');
    expect(profile.verificationResponse).toBeUndefined();
    expect(String(profile.verifiedBy)).toBe(String(boss.user._id));
  });

  test('a provider cannot request twice while the admin is still reviewing', async () => {
    const { provider } = await setup();
    const again = await api().post('/api/providers/me/verification-request').set(bearer(provider.token)).send({ message: 'hello' });
    expect(again.status).toBe(409);
  });

  test('information can only be requested on an application that exists and is paid', async () => {
    const provider = await createProvider({ verified: false });
    const admin = await createAdmin();
    const url = `/api/admin/providers/${provider.profile._id}/verification`;
    const none = await api().patch(url).set(bearer(admin.token)).send({ status: 'needs_info', note: 'Please add details.' });
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('INVALID_TRANSITION');

    await createApplication(provider, { status: 'pending_payment', paymentStatus: 'unpaid' });
    const unpaid = await api().patch(url).set(bearer(admin.token)).send({ status: 'needs_info', note: 'Please add details.' });
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.error.code).toBe('PAYMENT_NOT_CONFIRMED');
  });

  test('rejecting notifies the provider', async () => {
    const { provider, admin, url } = await setup();
    await api().patch(url).set(bearer(admin.token)).send({ status: 'rejected', note: 'Bio is too vague to approve.' });
    const note = await Notification.findOne({ user: provider.user._id, type: 'verification.updated' });
    expect(note.title).toMatch(/not approved/i);
  });

  test('only administrators can ask for more information', async () => {
    const { provider, url } = await setup();
    const res = await api().patch(url).set(bearer(provider.token)).send({ status: 'needs_info', note: 'Please add details.' });
    expect(res.status).toBe(403);
    expect((await ProviderProfile.findById(provider.profile._id)).verificationStatus).toBe('pending');
  });
});
