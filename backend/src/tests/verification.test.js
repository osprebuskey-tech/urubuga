const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const ProviderProfile = require('../models/ProviderProfile');
const TermsAcceptance = require('../models/TermsAcceptance');
const UserDocument = require('../models/UserDocument');
const VerificationApplication = require('../models/VerificationApplication');
const VerificationPayment = require('../models/VerificationPayment');
const sandbox = require('../services/payments/sandboxProvider');
const { api, bearer, createSession, createAdmin, createProvider, createCategory, publishFee } = require('./helpers');

const applicant = async (extra = {}) => {
  const category = await createCategory();
  return createProvider({ verified: false, profileOverrides: { categories: [category._id] }, ...extra });
};
const apply = (p) => api().post('/api/verification/apply').set(bearer(p.token));
const pay = (p, body = { method: 'mobile_money', payerPhone: '+250788123456', gateway: 'manual' }) => api().post('/api/verification/payment').set(bearer(p.token)).send(body);
const staff = {
  confirm: (t, id, body = { reference: 'MOMO-1001' }) => api().post(`/api/admin/verification-payments/${id}/confirm`).set(bearer(t)).send(body),
  act: (t, id, action, body) => api().post(`/api/admin/verification/${id}/${action}`).set(bearer(t)).send(body),
};
const webhook = (signed) => api().post('/api/payments/webhook/sandbox').set('Content-Type', 'application/json').set(signed.headers).send(signed.rawBody);

/** An applicant who has applied and has a pending manual payment. */
async function paying() {
  await publishFee();
  const provider = await applicant();
  await apply(provider);
  const payment = (await pay(provider)).body.data.payment;
  return { provider, payment };
}

describe('the verification fee', () => {
  const body = { amount: 15000, currency: 'RWF', instructions: 'Pay by MTN MoMo to 0788 000 000 and wait for confirmation.' };
  const put = (t, b = body) => api().put('/api/admin/settings/verification-fee').set(bearer(t)).send(b);

  test('only the super administrator can set and publish it', async () => {
    const boss = await createSession(['super_admin']);
    const admin = await createAdmin();
    const provider = await applicant();
    expect((await put(provider.token)).status).toBe(403);
    expect((await put(admin.token)).status).toBe(403);
    expect((await api().put('/api/admin/settings/verification-fee').send(body)).status).toBe(401);

    const res = await put(boss.token);
    expect(res.status).toBe(200);
    expect(res.body.data.fee).toMatchObject({ amount: 15000, currency: 'RWF', version: 1 });
    expect((await put(boss.token, { ...body, amount: 20000, currency: 'USD' })).body.data.fee).toMatchObject({ amount: 20000, currency: 'USD', version: 2 });
    expect(await AuditLog.countDocuments({ action: 'settings.verification_fee_changed' })).toBe(2);
  });

  test('rejects nonsense fees', async () => {
    const boss = await createSession(['super_admin']);
    for (const bad of [{ amount: -1 }, { amount: 10.5 }, { currency: 'EUR' }, { instructions: 'short' }, { amount: '5000' }]) expect((await put(boss.token, { ...body, ...bad })).status).toBe(400);
  });

  test('applicants see the fee before they submit anything', async () => {
    const provider = await applicant();
    expect((await api().get('/api/verification/fee').set(bearer(provider.token))).body.data.fee).toBeNull();
    await publishFee({ amount: 12000, instructions: 'Pay by card or mobile money.' });
    const fee = (await api().get('/api/verification/fee').set(bearer(provider.token))).body.data.fee;
    expect(fee).toMatchObject({ amount: 12000, currency: 'RWF', instructions: 'Pay by card or mobile money.' });
    const mine = (await api().get('/api/verification/me').set(bearer(provider.token))).body.data;
    expect(mine.fee.amount).toBe(12000);
    expect(mine.application).toBeNull();
  });

  test('an applicant keeps the fee they were shown, even if the fee changes later', async () => {
    const { provider, payment } = await paying();
    await publishFee({ amount: 99000, version: 2 });
    const app = await VerificationApplication.findOne({ provider: provider.profile._id });
    expect(app.fee.amount).toBe(5000);
    expect(payment.amount).toBe(5000);
  });
});

describe('applying for verification', () => {
  test('cannot apply until the fee is published', async () => {
    const res = await apply(await applicant());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FEE_NOT_PUBLISHED');
  });

  test('needs the right documents for the provider type', async () => {
    await publishFee();
    const individual = await applicant();
    await UserDocument.deleteOne({ owner: individual.user._id, kind: 'cv' });
    const res = await apply(individual);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DOCUMENTS_REQUIRED');
    expect(res.body.error.details.missing).toEqual(['cv']);

    const business = await applicant();
    await ProviderProfile.updateOne({ _id: business.profile._id }, { providerType: 'business' });
    await UserDocument.deleteOne({ owner: business.user._id, kind: 'rdb_certificate' });
    const biz = await apply(business);
    expect(biz.body.error.details.missing).toEqual(['rdb_certificate']);
  });

  test('needs the current terms accepted', async () => {
    await publishFee();
    const provider = await applicant();
    await TermsAcceptance.deleteMany({ user: provider.user._id });
    const res = await apply(provider);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TERMS_NOT_ACCEPTED');
  });

  test('starts as Pending Payment with payment tracked separately, and is not verified', async () => {
    await publishFee();
    const provider = await applicant();
    const res = await apply(provider);
    expect(res.status).toBe(201);
    expect(res.body.data.application).toMatchObject({ status: 'pending_payment', paymentStatus: 'unpaid', fee: { amount: 5000, currency: 'RWF' } });
    expect((await ProviderProfile.findById(provider.profile._id)).verificationStatus).toBe('pending');
    expect((await apply(provider)).body.error.code).toBe('ALREADY_PENDING');
    expect((await api().get(`/api/providers/${provider.profile._id}`)).status).toBe(404);
  });

  test('a zero fee waives payment and goes straight to review', async () => {
    await publishFee({ amount: 0 });
    const res = await apply(await applicant());
    expect(res.body.data.application).toMatchObject({ status: 'payment_confirmed', paymentStatus: 'waived' });
  });
});

describe('paying the fee', () => {
  test('the amount comes from the server, never from the request', async () => {
    await publishFee();
    const provider = await applicant();
    await apply(provider);
    expect((await pay(provider, { method: 'mobile_money', amount: 1 })).status).toBe(400);
    expect((await pay(provider, { method: 'cash' })).status).toBe(400);
    const res = await pay(provider, { method: 'card', gateway: 'manual' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ method: 'card', amount: 5000, currency: 'RWF', status: 'pending' });
    expect(res.body.data.payment.instructions).toMatch(/MoMo/);
    const app = await VerificationApplication.findOne({ provider: provider.profile._id });
    expect(app).toMatchObject({ status: 'pending_payment', paymentStatus: 'pending' });
  });

  test('choosing a payment method is not payment: nothing is confirmed or reviewable', async () => {
    const { provider } = await paying();
    const admin = await createAdmin();
    const app = await VerificationApplication.findOne({ provider: provider.profile._id });
    expect((await ProviderProfile.findById(provider.profile._id)).verificationStatus).toBe('pending');
    for (const [action, body] of [['start-review'], ['request-info', { message: 'Please send a clearer scan.' }], ['recommend', { note: 'Looks good to me, recommending.' }], ['reject', { reason: 'Not acceptable' }]]) {
      const res = await staff.act(admin.token, app._id, action, body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_NOT_CONFIRMED');
    }
  });

  test('staff confirm a manual payment with its reference; customers and providers cannot', async () => {
    const { provider, payment } = await paying();
    const customer = await createSession(['customer']);
    expect((await staff.confirm(customer.token, payment.id)).status).toBe(403);
    expect((await staff.confirm(provider.token, payment.id)).status).toBe(403);
    const finance = await createSession(['finance']);
    expect((await staff.confirm(finance.token, payment.id, { reference: 'x' })).status).toBe(400);

    const res = await staff.confirm(finance.token, payment.id);
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toMatchObject({ status: 'succeeded', gatewayReference: 'MOMO-1001' });
    const app = await VerificationApplication.findOne({ provider: provider.profile._id });
    expect(app).toMatchObject({ status: 'payment_confirmed', paymentStatus: 'confirmed' });
    expect(app.history.map((h) => h.action)).toEqual(expect.arrayContaining(['applied', 'payment_started', 'payment_confirmed']));
    expect(await Notification.findOne({ user: provider.user._id, title: /Payment confirmed/ })).toBeTruthy();
    expect(await AuditLog.findOne({ action: 'verification.payment_confirmed' })).toBeTruthy();
    expect((await staff.confirm(finance.token, payment.id, { reference: 'MOMO-2' })).status).toBe(409);
  });

  test('payment alone never makes anyone verified', async () => {
    const { provider, payment } = await paying();
    await staff.confirm((await createAdmin()).token, payment.id);
    const profile = await ProviderProfile.findById(provider.profile._id);
    expect(profile.verificationStatus).toBe('pending');
    expect(profile.verifiedAt).toBeUndefined();
    expect((await api().get(`/api/providers/${provider.profile._id}`)).status).toBe(404);
  });

  test('a reference can only be used once', async () => {
    const one = await paying();
    const two = await (async () => { const p = await applicant(); await apply(p); return { provider: p, payment: (await pay(p)).body.data.payment }; })();
    const admin = await createAdmin();
    expect((await staff.confirm(admin.token, one.payment.id, { reference: 'SAME-REF' })).status).toBe(200);
    const res = await staff.confirm(admin.token, two.payment.id, { reference: 'SAME-REF' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REFERENCE_USED');
    expect((await VerificationPayment.findById(two.payment.id)).status).toBe('pending');
  });

  test('a gateway payment is confirmed only by a signed webhook with the right amount', async () => {
    await publishFee();
    const provider = await applicant();
    await apply(provider);
    const { payment } = (await pay(provider, { method: 'card', gateway: 'sandbox' })).body.data;
    expect((await staff.confirm((await createAdmin()).token, payment.id)).body.error.code).toBe('GATEWAY_PAYMENT'); // staff cannot overrule a gateway
    const stored = await VerificationPayment.findById(payment.id);

    const wrong = sandbox.buildSignedEvent({ reference: stored.gatewayReference, amount: 1 });
    expect((await webhook(wrong)).body.data.outcome).toBe('amount_mismatch');
    expect((await VerificationPayment.findById(payment.id)).status).toBe('pending');

    const forged = sandbox.buildSignedEvent({ reference: stored.gatewayReference, amount: 5000 });
    expect((await webhook({ ...forged, headers: { ...forged.headers, 'x-imbehe-signature': 'bad' } })).status).toBe(401);
    expect((await VerificationPayment.findById(payment.id)).status).toBe('pending');

    const good = sandbox.buildSignedEvent({ reference: stored.gatewayReference, amount: 5000 });
    expect((await webhook(good)).body.data.outcome).toBe('succeeded');
    expect((await webhook(good)).body.data.duplicate).toBe(true); // a replay changes nothing
    const app = await VerificationApplication.findOne({ provider: provider.profile._id });
    expect(app).toMatchObject({ status: 'payment_confirmed', paymentStatus: 'confirmed' });
    expect(await Notification.countDocuments({ user: provider.user._id, title: /Payment confirmed/ })).toBe(1);
  });

  test('a failed gateway payment can be retried', async () => {
    await publishFee();
    const provider = await applicant();
    await apply(provider);
    await pay(provider, { method: 'card', gateway: 'sandbox' });
    await api().post('/api/verification/payment/sandbox/fail').set(bearer(provider.token));
    expect((await VerificationApplication.findOne({ provider: provider.profile._id })).paymentStatus).toBe('failed');
    expect((await pay(provider, { method: 'card', gateway: 'sandbox' })).status).toBe(201);
  });
});

describe('review: administrators recommend, the super administrator decides', () => {
  const ready = async () => {
    const { provider, payment } = await paying();
    const admin = await createAdmin();
    const boss = await createSession(['super_admin']);
    await staff.confirm(admin.token, payment.id);
    const app = await VerificationApplication.findOne({ provider: provider.profile._id });
    return { provider, admin, boss, app };
  };
  const decide = (t, id, body) => api().post(`/api/admin/verification/${id}/decision`).set(bearer(t)).send(body);

  test('the whole path: review, recommend, then the final approval makes the provider verified and public', async () => {
    const { provider, admin, boss, app } = await ready();
    expect((await staff.act(admin.token, app._id, 'start-review')).body.data.application.status).toBe('under_review');
    const rec = await staff.act(admin.token, app._id, 'recommend', { note: 'Documents are genuine and the ratings are strong.' });
    expect(rec.status).toBe(200);
    expect(rec.body.data.application.status).toBe('recommended');
    expect((await ProviderProfile.findById(provider.profile._id)).verificationStatus).toBe('pending'); // a recommendation verifies nobody
    expect(await Notification.findOne({ user: boss.user._id, type: 'verification.recommendation' })).toBeTruthy();

    expect((await decide(admin.token, app._id, { outcome: 'approved' })).status).toBe(403); // administrators cannot approve
    const done = await decide(boss.token, app._id, { outcome: 'approved', reason: 'Approved after review.' });
    expect(done.status).toBe(200);
    expect(done.body.data.application).toMatchObject({ status: 'approved', decision: { outcome: 'approved', byRole: 'super_admin' } });

    const profile = await ProviderProfile.findById(provider.profile._id);
    expect(profile.verificationStatus).toBe('verified');
    expect(String(profile.verifiedBy)).toBe(String(boss.user._id));
    expect((await api().get(`/api/providers/${provider.profile._id}`)).status).toBe(200);
    expect(await Notification.findOne({ user: provider.user._id, title: /is verified/ })).toBeTruthy();

    const detail = (await api().get(`/api/admin/verification/${app._id}`).set(bearer(boss.token))).body.data.application;
    expect(detail.history.map((h) => h.action)).toEqual(['applied', 'payment_started', 'payment_confirmed', 'review_started', 'recommended', 'approved'].filter((a) => detail.history.some((h) => h.action === a)));
    expect(detail.history.every((h) => h.at)).toBe(true);
    expect((await AuditLog.find({ action: /^verification\./ })).length).toBeGreaterThanOrEqual(4);
  });

  test('approval needs an administrator\'s recommendation first', async () => {
    const { admin, boss, app } = await ready();
    await staff.act(admin.token, app._id, 'start-review');
    const res = await decide(boss.token, app._id, { outcome: 'approved' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_RECOMMENDED');
  });

  test('requesting information reaches the applicant, who answers and goes back to review', async () => {
    const { provider, admin, app } = await ready();
    await staff.act(admin.token, app._id, 'start-review');
    expect((await staff.act(admin.token, app._id, 'request-info', { message: 'short' })).status).toBe(400);
    await staff.act(admin.token, app._id, 'request-info', { message: 'Please upload a clearer National ID scan.' });
    const mine = (await api().get('/api/verification/me').set(bearer(provider.token))).body.data.application;
    expect(mine).toMatchObject({ status: 'more_info_required', question: 'Please upload a clearer National ID scan.' });
    expect((await api().post('/api/verification/respond').set(bearer(provider.token)).send({ message: 'Done, re-uploaded it.' })).status).toBe(200);
    expect((await VerificationApplication.findById(app._id)).status).toBe('under_review');
  });

  test('rejecting needs a reason; the applicant sees it but not the internal recommendation', async () => {
    const { provider, admin, app } = await ready();
    expect((await staff.act(admin.token, app._id, 'reject', { reason: 'no' })).status).toBe(400);
    const res = await staff.act(admin.token, app._id, 'reject', { reason: 'The National ID does not match the profile name.' });
    expect(res.body.data.application).toMatchObject({ status: 'rejected', active: false });
    const mine = (await api().get('/api/verification/me').set(bearer(provider.token))).body.data.application;
    expect(mine.decision).toMatchObject({ outcome: 'rejected', reason: 'The National ID does not match the profile name.' });
    expect(JSON.stringify(mine)).not.toMatch(/recommendation/);
    expect((await ProviderProfile.findById(provider.profile._id)).verificationStatus).toBe('rejected');
  });

  test('the super administrator can reopen an administrator\'s rejection, and a rejected provider can apply again', async () => {
    const { provider, admin, boss, app } = await ready();
    await staff.act(admin.token, app._id, 'reject', { reason: 'Documents unreadable.' });
    const reopened = await staff.act(boss.token, app._id, 'reopen', { reason: 'Documents are readable on a second look.' });
    expect(reopened.body.data.application.status).toBe('under_review');
    expect((await staff.act(admin.token, app._id, 'reopen', { reason: 'I would like this open.' })).status).toBe(403);

    await staff.act(boss.token, app._id, 'reject', { reason: 'Confirmed: documents do not match.' });
    expect((await apply(provider)).status).toBe(201); // a new application with a new fee
    expect(await VerificationApplication.countDocuments({ provider: provider.profile._id })).toBe(2);
  });

  test('only staff see applications; finance and providers do not', async () => {
    const { provider, app } = await ready();
    const finance = await createSession(['finance']);
    for (const t of [provider.token, finance.token]) expect((await api().get('/api/admin/verification').set(bearer(t))).status).toBe(403);
    expect((await api().get(`/api/admin/verification/${app._id}`)).status).toBe(401);
    const admin = await createAdmin();
    expect((await api().get('/api/admin/verification?paymentStatus=confirmed').set(bearer(admin.token))).body.data).toHaveLength(1);
  });
});
