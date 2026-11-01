const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { getOutbox } = require('../services/emailService');
const { buildSpec } = require('../docs/openapi');
const { api, bearer, createSession, tokenFromEmail, PASSWORD } = require('./helpers');

const SOME_ID = '507f1f77bcf86cd799439011';
const create = (token, body) => api().post('/api/admin/users').set(bearer(token)).send(body);
const newUser = (overrides = {}) => ({ fullName: 'Claudine Mukamana', email: 'claudine@example.rw', roles: ['finance'], ...overrides });

describe('super admin creates users', () => {
  test('creates a staff account, who then chooses their own password from the email', async () => {
    const sa = await createSession(['super_admin']);
    const res = await create(sa.token, newUser({ phone: '0788123456' }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ inviteSent: true, user: { fullName: 'Claudine Mukamana', email: 'claudine@example.rw', roles: ['finance'], emailVerified: true, phone: '+250788123456' } });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|passwordResetToken/);
    expect(res.body.data.user.invitePending).toBe(true);

    // Nobody can sign in with a password until the person has chosen one.
    expect((await api().post('/api/auth/login').send({ email: 'claudine@example.rw', password: PASSWORD })).status).toBe(401);

    const mail = getOutbox().find((m) => m.to === 'claudine@example.rw');
    expect(mail.subject).toMatch(/invited/i);
    expect(mail.text).toMatch(/payment follow-up officer/);
    expect(mail.text).toContain('invite=1');

    const token = tokenFromEmail('claudine@example.rw');
    expect((await api().post('/api/auth/reset-password').send({ token, password: 'MyOwn1Passphrase' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: 'claudine@example.rw', password: 'MyOwn1Passphrase' })).status).toBe(200);
    expect((await User.findOne({ email: 'claudine@example.rw' })).invitePending).toBe(false);
    expect((await api().post('/api/auth/reset-password').send({ token, password: 'Another1Passphrase' })).status).toBe(400); // single use

    const entry = await AuditLog.findOne({ action: 'user.created_by_admin', actor: sa.user._id });
    expect(entry.metadata.roles).toEqual(['finance']);
  });

  test('can create administrators, providers and other super admins', async () => {
    const sa = await createSession(['super_admin']);
    for (const [i, roles] of [['admin'], ['super_admin'], ['provider'], ['customer', 'provider']].entries()) {
      const res = await create(sa.token, newUser({ email: `person${i}@example.rw`, roles }));
      expect(res.status).toBe(201);
      expect(res.body.data.user.roles).toEqual(roles);
    }
  });

  test('only a super admin may create users', async () => {
    const admin = await createSession(['admin']);
    const finance = await createSession(['finance']);
    const customer = await createSession(['customer']);
    expect((await create(admin.token, newUser())).status).toBe(403);
    expect((await create(finance.token, newUser())).status).toBe(403);
    expect((await create(customer.token, newUser())).status).toBe(403);
    expect((await api().post('/api/admin/users').send(newUser())).status).toBe(401);
    expect(await User.countDocuments({ email: 'claudine@example.rw' })).toBe(0);
  });

  test('refuses staff roles mixed with marketplace roles, duplicates and bad input', async () => {
    const sa = await createSession(['super_admin']);
    expect((await create(sa.token, newUser({ roles: ['admin', 'provider'] }))).status).toBe(400);
    expect((await create(sa.token, newUser({ roles: [] }))).status).toBe(400);
    expect((await create(sa.token, newUser({ roles: ['root'] }))).status).toBe(400);
    expect((await create(sa.token, newUser({ email: 'not-an-email' }))).status).toBe(400);
    expect((await create(sa.token, newUser({ password: 'Chosen1ByMe' }))).status).toBe(400); // passwords are never set by someone else
    expect((await create(sa.token, newUser())).status).toBe(201);
    const again = await create(sa.token, newUser());
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('an invitation can be sent again until the person has signed in', async () => {
    const sa = await createSession(['super_admin']);
    const { body } = await create(sa.token, newUser());
    const id = body.data.user.id;
    const first = tokenFromEmail('claudine@example.rw');

    expect((await api().post(`/api/admin/users/${id}/resend-invite`).set(bearer(sa.token))).status).toBe(200);
    const second = tokenFromEmail('claudine@example.rw');
    expect(second).not.toBe(first);
    expect((await api().post('/api/auth/reset-password').send({ token: first, password: 'MyOwn1Passphrase' })).status).toBe(400); // the old link stopped working

    await api().post('/api/auth/reset-password').send({ token: second, password: 'MyOwn1Passphrase' });
    await api().post('/api/auth/login').send({ email: 'claudine@example.rw', password: 'MyOwn1Passphrase' });
    const late = await api().post(`/api/admin/users/${id}/resend-invite`).set(bearer(sa.token));
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('ALREADY_ACTIVE');
  });

  test('staff cannot register themselves', async () => {
    const res = await api().post('/api/auth/register').send({ fullName: 'Mallory', email: 'm@example.com', password: 'Passw0rd!x', roles: ['super_admin'] });
    expect(res.status).toBe(400);
  });
});

describe('what each staff role can reach', () => {
  test('a super admin can do everything an administrator can', async () => {
    const sa = await createSession(['super_admin']);
    for (const path of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/providers', '/api/admin/disputes', '/api/admin/payments', '/api/admin/settings', '/api/admin/reports']) {
      expect((await api().get(path).set(bearer(sa.token))).status).toBe(200);
    }
  });

  test('the payment follow-up role reaches payments and nothing else', async () => {
    const finance = await createSession(['finance']);
    for (const path of ['/api/admin/payments', '/api/admin/payments/summary', '/api/admin/payments/follow-up']) {
      expect((await api().get(path).set(bearer(finance.token))).status).toBe(200);
    }
    for (const path of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/providers', '/api/admin/disputes', '/api/admin/reviews', '/api/admin/settings', '/api/admin/reports', '/api/admin/reports/activity']) {
      expect((await api().get(path).set(bearer(finance.token))).status).toBe(403);
    }
    // not a marketplace participant either
    expect((await api().get('/api/bookings').set(bearer(finance.token))).status).toBe(403);
  });

  test('an administrator cannot reach the super admin routes', async () => {
    const admin = await createSession(['admin']);
    expect((await api().get('/api/admin/reports/activity').set(bearer(admin.token))).status).toBe(403);
    expect((await api().get('/api/admin/users').set(bearer(admin.token))).status).toBe(200);
  });

  // The safety net: it is generated from the real routes, so a route added later without the right guard fails here.
  test('every /admin route refuses people it should refuse', async () => {
    const spec = buildSpec();
    const sessions = {
      none: null,
      customer: (await createSession(['customer'])).token,
      provider: (await createSession(['provider'])).token,
      finance: (await createSession(['finance'])).token,
      admin: (await createSession(['admin'])).token,
    };
    const ops = Object.entries(spec.paths).filter(([p]) => p.startsWith('/admin')).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method, roles: op['x-roles'] })));
    expect(ops.length).toBeGreaterThan(20);

    for (const { path, method, roles } of ops) {
      expect(roles).toBeDefined(); // no /admin route may be reachable by "any signed-in user"
      const url = `/api${path.replace('{bucket}', 'unpaid_jobs').replace(/\{\w+\}/g, SOME_ID)}`;
      for (const [who, token] of Object.entries(sessions)) {
        const req = api()[method](url);
        if (token) req.set(bearer(token));
        const res = await req.send({});
        const allowed = who !== 'none' && roles.includes(who);
        if (!allowed) expect({ who, method, path, status: res.status }).toEqual({ who, method, path, status: who === 'none' ? 401 : 403 });
      }
    }
  });
});

describe('suspending staff accounts', () => {
  test('only a super admin may suspend an administrator or the follow-up officer', async () => {
    const admin = await createSession(['admin']);
    const sa = await createSession(['super_admin']);
    const finance = await createSession(['finance']);
    const url = `/api/admin/users/${finance.user._id}/status`;

    const refused = await api().patch(url).set(bearer(admin.token)).send({ status: 'suspended', reason: 'Left the team' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('CANNOT_MODERATE_ADMIN');

    const done = await api().patch(url).set(bearer(sa.token)).send({ status: 'suspended', reason: 'Left the team' });
    expect(done.status).toBe(200);
    expect((await api().get('/api/admin/payments').set(bearer(finance.token))).status).toBe(401); // their session was revoked at once
  });

  test('nobody can suspend themselves', async () => {
    const sa = await createSession(['super_admin']);
    const res = await api().patch(`/api/admin/users/${sa.user._id}/status`).set(bearer(sa.token)).send({ status: 'suspended', reason: 'Oops, a mistake' });
    expect(res.status).toBe(409);
  });
});
