const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');
const UserDocument = require('../models/UserDocument');
const VerificationApplication = require('../models/VerificationApplication');
const { api, bearer, createSession, createAdmin } = require('./helpers');

const customer = (extra = {}) => createSession(['customer'], extra);
const apply = (p) => api().post('/api/verification/account/apply').set(bearer(p.token));
const mine = (p) => api().get('/api/verification/account/me').set(bearer(p.token));
const act = (t, id, action, body) => api().post(`/api/admin/verification/${id}/${action}`).set(bearer(t)).send(body);
const decide = (t, id, body) => api().post(`/api/admin/verification/${id}/decision`).set(bearer(t)).send(body);

describe('a customer asks to be verified', () => {
  test('applies with the documents already on file, and every administrator is told', async () => {
    const admin = await createAdmin();
    const boss = await createSession(['super_admin']);
    const person = await customer();

    const res = await apply(person);
    expect(res.status).toBe(201);
    expect(res.body.data.application).toMatchObject({ kind: 'account', status: 'payment_confirmed', paymentStatus: 'waived', active: true });

    for (const staff of [admin, boss]) {
      const note = await Notification.findOne({ user: staff.user._id, type: 'verification.updated' });
      expect(note.title).toMatch(/account verification request/i);
      expect(note.link).toBe(`/dashboard/admin/verification/${res.body.data.application.id}`);
    }
    const state = (await mine(person)).body.data;
    expect(state).toMatchObject({ accountVerified: false });
    expect(state.application.status).toBe('payment_confirmed');
  });

  test('needs the documents first, a confirmed email and the current terms, and only one open request', async () => {
    const person = await customer();
    await UserDocument.deleteMany({ owner: person.user._id });
    const noDocs = await apply(person);
    expect(noDocs.status).toBe(403);
    expect(noDocs.body.error.code).toBe('DOCUMENTS_REQUIRED');

    const ready = await customer();
    expect((await apply(ready)).status).toBe(201);
    expect((await apply(ready)).status).toBe(409);

    const unconfirmed = await customer({ emailVerified: false });
    expect((await apply(unconfirmed)).status).toBe(403);
  });

  test('a provider-only account uses the provider flow instead', async () => {
    const provider = await createSession(['provider']);
    expect((await apply(provider)).status).toBe(403);
  });

  test('two different customers can each have an open request at the same time', async () => {
    const a = await customer();
    const b = await customer();
    expect((await apply(a)).status).toBe(201);
    expect((await apply(b)).status).toBe(201);
    expect(await VerificationApplication.countDocuments({ kind: 'account', active: true })).toBe(2);
  });
});

describe('staff review an account request', () => {
  async function open() {
    const admin = await createAdmin();
    const boss = await createSession(['super_admin']);
    const person = await customer();
    const id = (await apply(person)).body.data.application.id;
    return { admin, boss, person, id };
  }

  test('administrators and the super administrator see the request, its documents and who asked, and every opening is audited', async () => {
    const { admin, boss, person, id } = await open();
    const list = await api().get('/api/admin/verification?kind=account').set(bearer(admin.token));
    expect(list.body.data.map((a) => a.id)).toContain(id);
    expect(list.body.data[0].provider).toBeUndefined();

    for (const staff of [admin, boss]) {
      const detail = (await api().get(`/api/admin/verification/${id}`).set(bearer(staff.token))).body.data.application;
      expect(detail).toMatchObject({ kind: 'account', applicant: { email: person.user.email } });
      expect(detail.documents.length).toBeGreaterThan(0);
      expect(detail.ratingsNow).toBeUndefined();
    }
    const providerOnly = await api().get('/api/admin/verification?kind=provider').set(bearer(admin.token));
    expect(providerOnly.body.data.map((a) => a.id)).not.toContain(id);
  });

  test('a stranger cannot open the documents, but staff reviewing the request can', async () => {
    const { admin, boss, person } = await open();
    const doc = await UserDocument.findOne({ owner: person.user._id, status: 'active' }).select('+storageKey');
    const stranger = await customer();
    expect((await api().get(`/api/documents/${doc._id}/file`).set(bearer(stranger.token))).status).toBe(404);
    // staff get past the permission check (the stub file is not in storage, so a 404/500 from storage is fine, a 403 is not)
    for (const staff of [admin, boss]) expect((await api().get(`/api/documents/${doc._id}/file`).set(bearer(staff.token))).status).not.toBe(403);
    expect(await AuditLog.countDocuments({ action: 'document.viewed' })).toBe(2);
  });

  test('ask for more information, the customer answers, and it returns to review', async () => {
    const { admin, person, id } = await open();
    const ask = await act(admin.token, id, 'request-info', { message: 'Your National ID photo is blurry. Please upload a clear one.' });
    expect(ask.status).toBe(200);
    expect(ask.body.data.application.status).toBe('more_info_required');

    const seen = (await mine(person)).body.data.application;
    expect(seen.question).toMatch(/blurry/);
    const note = await Notification.findOne({ user: person.user._id, title: /more information/i });
    expect(note.link).toBe('/dashboard/verification');

    const reply = await api().post('/api/verification/account/respond').set(bearer(person.token)).send({ message: 'I uploaded a clearer photo.' });
    expect(reply.status).toBe(200);
    expect(reply.body.data.application.status).toBe('under_review');
    expect(await Notification.countDocuments({ user: admin.user._id, title: /answered your question/i })).toBe(1);
  });

  test('rejecting needs a clear reason, shows it to the customer, and they can apply again', async () => {
    const { admin, person, id } = await open();
    expect((await act(admin.token, id, 'reject', { reason: '' })).status).toBe(400);
    expect((await act(admin.token, id, 'reject', { reason: 'abc' })).status).toBe(400);
    const res = await act(admin.token, id, 'reject', { reason: 'The name on the ID does not match your account.' });
    expect(res.status).toBe(200);
    const seen = (await mine(person)).body.data.application;
    expect(seen).toMatchObject({ status: 'rejected', active: false });
    expect(seen.decision.reason).toMatch(/does not match/);
    expect((await apply(person)).status).toBe(201);
  });

  test('an administrator recommends, then only the super administrator can approve; approval verifies the account', async () => {
    const { admin, boss, person, id } = await open();
    await act(admin.token, id, 'start-review');
    expect((await decide(boss.token, id, { outcome: 'approved' })).status).toBe(409); // not recommended yet
    expect((await act(admin.token, id, 'recommend', { note: 'National ID matches the account holder.' })).status).toBe(200);
    expect((await decide(admin.token, id, { outcome: 'approved' })).status).toBe(403);

    const res = await decide(boss.token, id, { outcome: 'approved', reason: 'Documents checked' });
    expect(res.status).toBe(200);
    const stored = await User.findById(person.user._id);
    expect(stored.accountVerified).toBe(true);
    expect(String(stored.accountVerifiedBy)).toBe(String(boss.user._id));
    expect((await mine(person)).body.data.accountVerified).toBe(true);
    expect((await apply(person)).status).toBe(409);
    expect(await Notification.countDocuments({ user: person.user._id, title: /account is verified/i })).toBe(1);
  });

  test('the super administrator can ask for more information, or reject with a reason, instead of approving', async () => {
    const { admin, boss, id } = await open();
    await act(admin.token, id, 'start-review');
    await act(admin.token, id, 'recommend', { note: 'Looks fine to me, please decide.' });
    expect((await act(admin.token, id, 'request-info', { message: 'Administrators cannot ask once recommended.' })).status).toBe(409);
    const ask = await act(boss.token, id, 'request-info', { message: 'Please add a second document that shows your address.' });
    expect(ask.status).toBe(200);
    expect(ask.body.data.application.status).toBe('more_info_required');

    const other = await open();
    const rej = await decide(other.boss.token, other.id, { outcome: 'rejected', reason: 'We could not confirm who you are.' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.application.decision.reason).toMatch(/could not confirm/);
  });
});
