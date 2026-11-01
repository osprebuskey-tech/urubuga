const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { api, bearer, createSession, createAdmin } = require('./helpers');

const verify = (token, id, body) => api().patch(`/api/admin/users/${id}/verification`).set(bearer(token)).send(body);

describe('PATCH /api/admin/users/:id/verification', () => {
  test('only the super administrator may verify an account', async () => {
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    expect((await verify(admin.token, customer.user._id, { verified: true })).status).toBe(403);
    expect((await verify(customer.token, customer.user._id, { verified: true })).status).toBe(403);
    expect((await api().patch(`/api/admin/users/${customer.user._id}/verification`).send({ verified: true })).status).toBe(401);
  });

  test('verifies an account, records who and when, notifies the person and audits it', async () => {
    const boss = await createSession(['super_admin']);
    const customer = await createSession(['customer']);
    const res = await verify(boss.token, customer.user._id, { verified: true, note: 'National ID checked in person' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ accountVerified: true, accountVerificationNote: 'National ID checked in person' });
    expect(res.body.data.user.accountVerifiedAt).toBeTruthy();
    expect(res.body.data.user).not.toHaveProperty('accountVerifiedBy');

    const stored = await User.findById(customer.user._id);
    expect(String(stored.accountVerifiedBy)).toBe(String(boss.user._id));
    expect(await Notification.countDocuments({ user: customer.user._id, type: 'account.verification' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'user.verified' })).toBe(1);
    expect((await verify(boss.token, customer.user._id, { verified: true })).status).toBe(409);
  });

  test('withdrawing a verification needs a reason and clears the record', async () => {
    const boss = await createSession(['super_admin']);
    const customer = await createSession(['customer']);
    await verify(boss.token, customer.user._id, { verified: true });
    expect((await verify(boss.token, customer.user._id, { verified: false })).status).toBe(400);
    const res = await verify(boss.token, customer.user._id, { verified: false, note: 'Documents did not match' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.accountVerified).toBe(false);
    expect(res.body.data.user.accountVerifiedAt).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'user.unverified' })).toBe(1);
  });

  test('refuses your own account, a suspended account and an unknown user', async () => {
    const boss = await createSession(['super_admin']);
    const customer = await createSession(['customer']);
    expect((await verify(boss.token, boss.user._id, { verified: true })).status).toBe(409);
    await User.updateOne({ _id: customer.user._id }, { status: 'suspended' });
    expect((await verify(boss.token, customer.user._id, { verified: true })).status).toBe(409);
    expect((await verify(boss.token, '507f1f77bcf86cd799439011', { verified: true })).status).toBe(404);
  });

  test('the users list can be filtered by verified or not', async () => {
    const boss = await createSession(['super_admin']);
    const customer = await createSession(['customer']);
    await verify(boss.token, customer.user._id, { verified: true });
    const yes = await api().get('/api/admin/users?verified=yes').set(bearer(boss.token));
    expect(yes.body.data.map((u) => u.id)).toEqual([String(customer.user._id)]);
    const no = await api().get('/api/admin/users?verified=no').set(bearer(boss.token));
    expect(no.body.data.map((u) => u.id)).not.toContain(String(customer.user._id));
  });
});

describe('POST /api/admin/users/:id/confirm-email', () => {
  test('super administrator confirms an email by hand, once, and it is audited', async () => {
    const boss = await createSession(['super_admin']);
    const admin = await createAdmin();
    const person = await createSession(['customer'], { emailVerified: false });
    expect((await api().post(`/api/admin/users/${person.user._id}/confirm-email`).set(bearer(admin.token))).status).toBe(403);
    const res = await api().post(`/api/admin/users/${person.user._id}/confirm-email`).set(bearer(boss.token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.emailVerified).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'user.email_confirmed_by_admin' })).toBe(1);
    expect((await api().post(`/api/admin/users/${person.user._id}/confirm-email`).set(bearer(boss.token))).status).toBe(409);
  });
});
