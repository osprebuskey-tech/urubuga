const { api, bearer, createSession, PASSWORD } = require('./helpers');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

describe('PATCH /api/auth/me', () => {
  test('changes name and phone, normalising the number, and audits it', async () => {
    const { token, user } = await createSession(['customer']);
    const res = await api().patch('/api/auth/me').set(bearer(token)).send({ fullName: '  Aline U. ', phone: '0788123456' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ fullName: 'Aline U.', phone: '+250788123456' });
    expect(await AuditLog.findOne({ action: 'auth.profile_updated', actor: user._id })).toBeTruthy();
  });

  test('null removes the phone number', async () => {
    const { token } = await createSession(['customer']);
    await api().patch('/api/auth/me').set(bearer(token)).send({ phone: '0788123456' });
    const res = await api().patch('/api/auth/me').set(bearer(token)).send({ phone: null });
    expect(res.status).toBe(200);
    expect(res.body.data.user.phone).toBeUndefined();
  });

  test('cannot change roles, status or email, and needs something to change', async () => {
    const { token, user } = await createSession(['customer']);
    for (const body of [{ roles: ['admin'] }, { status: 'active' }, { email: 'x@example.com' }, {}, { phone: 'abc' }]) {
      expect((await api().patch('/api/auth/me').set(bearer(token)).send(body)).status).toBe(400);
    }
    const stored = await User.findById(user._id);
    expect(stored.roles).toEqual(['customer']);
  });

  test('needs a signed-in user', async () => {
    expect((await api().patch('/api/auth/me').send({ fullName: 'Anyone' })).status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  const NEW = 'Another1Passw0rd';

  test('changes the password, signs out other devices and keeps this one signed in', async () => {
    const { token: oldToken, user } = await createSession(['customer']);
    const res = await api().post('/api/auth/change-password').set(bearer(oldToken)).send({ currentPassword: PASSWORD, newPassword: NEW });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();

    expect((await api().get('/api/auth/me').set(bearer(oldToken))).status).toBe(401); // other sessions are revoked
    expect((await api().get('/api/auth/me').set(bearer(res.body.data.accessToken))).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: user.email, password: NEW })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(401);
    expect(await AuditLog.findOne({ action: 'auth.password_changed', actor: user._id })).toBeTruthy();
  });

  test('refuses a wrong current password and leaves the password alone', async () => {
    const { token, user } = await createSession(['customer']);
    const res = await api().post('/api/auth/change-password').set(bearer(token)).send({ currentPassword: 'Wrong1Password', newPassword: NEW });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WRONG_PASSWORD');
    expect((await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(200);
  });

  test('enforces the password rules and a different new password', async () => {
    const { token } = await createSession(['customer']);
    for (const newPassword of ['short1', 'onlyletterspassword', PASSWORD]) {
      expect((await api().post('/api/auth/change-password').set(bearer(token)).send({ currentPassword: PASSWORD, newPassword })).status).toBe(400);
    }
  });

  test('needs a signed-in user', async () => {
    expect((await api().post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW })).status).toBe(401);
  });
});
