const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { api, bearer, createUser, PASSWORD } = require('./helpers');

const lifetime = (token) => { const p = jwt.decode(token); return p.exp - p.iat; };
const login = (user, extra = {}) => api().post('/api/auth/login').send({ email: user.email, password: PASSWORD, ...extra });
const parse = (s) => ({ h: 3600, d: 86400 }[s.slice(-1)] * parseInt(s, 10));

describe('"keep me signed in"', () => {
  test('is a normal short session unless asked for', async () => {
    const user = await createUser({ roles: ['customer'] });
    const res = await login(user);
    expect(lifetime(res.body.data.accessToken)).toBe(parse(env.JWT_EXPIRES_IN));
    expect(res.body.data.expiresIn).toBe(env.JWT_EXPIRES_IN);
    expect(res.body.data.remembered).toBe(false);
  });

  test('gives an ordinary account a longer session when asked', async () => {
    const user = await createUser({ roles: ['provider'] });
    const res = await login(user, { remember: true });
    expect(lifetime(res.body.data.accessToken)).toBe(parse(env.JWT_REMEMBER_EXPIRES_IN));
    expect(res.body.data.expiresIn).toBe(env.JWT_REMEMBER_EXPIRES_IN);
    expect(res.body.data.remembered).toBe(true);
    expect((await api().get('/api/auth/me').set(bearer(res.body.data.accessToken))).status).toBe(200);
  });

  test('never gives one to staff, however it is asked', async () => {
    for (const roles of [['admin'], ['super_admin'], ['finance']]) {
      const user = await createUser({ roles });
      const res = await login(user, { remember: true });
      expect(res.status).toBe(200);
      expect(lifetime(res.body.data.accessToken)).toBe(parse(env.JWT_EXPIRES_IN));
      expect(res.body.data.remembered).toBe(false); // so the browser does not keep it either
    }
  });

  test('can be given at sign-up too', async () => {
    const res = await api().post('/api/auth/register').send({ fullName: 'New Person', email: 'new@example.rw', password: 'Passw0rd!x', remember: true });
    expect(res.status).toBe(201);
    expect(lifetime(res.body.data.accessToken)).toBe(parse(env.JWT_REMEMBER_EXPIRES_IN));
  });

  test('stays long after a password change, and logging out ends it at once', async () => {
    const user = await createUser({ roles: ['customer'] });
    const first = (await login(user, { remember: true })).body.data.accessToken;
    const changed = await api().post('/api/auth/change-password').set(bearer(first)).send({ currentPassword: PASSWORD, newPassword: 'Another1Passw0rd' });
    expect(lifetime(changed.body.data.accessToken)).toBe(parse(env.JWT_REMEMBER_EXPIRES_IN));

    const token = changed.body.data.accessToken;
    expect((await api().post('/api/auth/logout').set(bearer(token))).status).toBe(200);
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401); // a long session is not a way around logging out
  });

  test('only a true/false answer is accepted', async () => {
    const user = await createUser({ roles: ['customer'] });
    expect((await login(user, { remember: 'yes' })).status).toBe(400);
  });
});
