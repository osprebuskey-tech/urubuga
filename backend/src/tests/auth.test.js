const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { getOutbox } = require('../services/emailService');
const { PASSWORD, api, bearer, register, createUser, loginAs, tokenFromEmail } = require('./helpers');

describe('POST /api/auth/register', () => {
  test('creates a customer account and returns a session without sensitive fields', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      fullName: 'Aline Uwase',
      email: 'aline@example.com',
      phone: '+250788123456',
      roles: ['customer'],
      emailVerified: false,
      status: 'active',
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/passwordHash|tokenVersion|TokenHash|\$2[aby]\$/);
  });

  test('stores a bcrypt hash, never the plaintext password', async () => {
    await register();
    const stored = await User.findOne({ email: 'aline@example.com' }).select('+passwordHash');
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('normalises email case and whitespace', async () => {
    const res = await register({ email: '  ALINE@Example.COM ' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('aline@example.com');
  });

  test('allows multiple self-service roles (customer + provider)', async () => {
    const res = await register({ roles: ['customer', 'provider', 'provider'] });
    expect(res.status).toBe(201);
    expect(res.body.data.user.roles).toEqual(['customer', 'provider']);
  });

  test('sends a verification email', async () => {
    await register();
    expect(getOutbox()).toHaveLength(1);
    expect(tokenFromEmail('aline@example.com')).toMatch(/^[a-f0-9]{64}$/);
  });

  test('rejects duplicate emails (case-insensitive) with 409', async () => {
    await register();
    const res = await register({ email: 'ALINE@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('rejects weak passwords with field-level details', async () => {
    const res = await register({ password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.some((d) => d.field === 'password')).toBe(true);
  });

  test.each([
    ['letters only', 'onlyletters'],
    ['numbers only', '123456789'],
  ])('rejects password with %s', async (_label, password) => {
    expect((await register({ password })).status).toBe(400);
  });

  test('rejects invalid email and invalid Rwandan phone', async () => {
    expect((await register({ email: 'not-an-email' })).status).toBe(400);
    expect((await register({ phone: '0712345678' })).status).toBe(400);
  });

  test('cannot self-assign the admin role or inject protected fields', async () => {
    expect((await register({ roles: ['admin'] })).status).toBe(400);
    expect((await register({ role: 'admin' })).status).toBe(400);
    expect((await register({ status: 'active', emailVerified: true })).status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('POST /api/auth/login', () => {
  test('logs in with correct credentials and the token works on /me', async () => {
    await register();
    const login = await api().post('/api/auth/login').send({ email: 'ALINE@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.tokenType).toBe('Bearer');

    const me = await api().get('/api/auth/me').set(bearer(login.body.data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('aline@example.com');
  });

  test('wrong password and unknown email return the same generic 401', async () => {
    await register();
    const wrong = await api().post('/api/auth/login').send({ email: 'aline@example.com', password: 'Wrong1234' });
    const unknown = await api().post('/api/auth/login').send({ email: 'ghost@example.com', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('suspended accounts cannot log in', async () => {
    const user = await createUser({ status: 'suspended' });
    const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  test('rejects NoSQL operator injection in the body', async () => {
    await register();
    const res = await api().post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('records audit entries for successful and failed logins', async () => {
    await register();
    await api().post('/api/auth/login').send({ email: 'aline@example.com', password: 'Wrong1234' });
    await api().post('/api/auth/login').send({ email: 'aline@example.com', password: PASSWORD });
    const actions = (await AuditLog.find().sort({ createdAt: 1 })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.register', 'auth.login_failed', 'auth.login']));
  });
});

describe('token handling and protected routes', () => {
  test('GET /me without a token returns 401', async () => {
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('malformed or foreign-signed tokens return 401', async () => {
    const user = await createUser();
    expect((await api().get('/api/auth/me').set(bearer('garbage'))).status).toBe(401);
    const forged = jwt.sign({ tv: 0 }, 'another-secret-another-secret-another', {
      subject: String(user._id),
      issuer: 'imbehe',
    });
    const res = await api().get('/api/auth/me').set(bearer(forged));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('expired tokens return 401 TOKEN_EXPIRED', async () => {
    const user = await createUser();
    const expired = jwt.sign(
      { tv: user.tokenVersion, exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET,
      { subject: String(user._id), issuer: 'imbehe' },
    );
    const res = await api().get('/api/auth/me').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('a user suspended after login is blocked immediately', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    await User.updateOne({ _id: user._id }, { status: 'suspended' });
    const res = await api().get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(403);
  });

  test('logout revokes the token', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    expect((await api().post('/api/auth/logout').set(bearer(token))).status).toBe(200);
    const res = await api().get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('email verification', () => {
  test('verifies once, then the token is single-use', async () => {
    await register();
    const token = tokenFromEmail('aline@example.com');

    const first = await api().post('/api/auth/verify-email').send({ token });
    expect(first.status).toBe(200);
    expect(first.body.data.user.emailVerified).toBe(true);

    const second = await api().post('/api/auth/verify-email').send({ token });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_TOKEN');
  });

  test('rejects unknown, malformed and expired tokens', async () => {
    await register();
    expect((await api().post('/api/auth/verify-email').send({ token: 'a'.repeat(64) })).status).toBe(400);
    expect((await api().post('/api/auth/verify-email').send({ token: 'short' })).status).toBe(400);

    const token = tokenFromEmail('aline@example.com');
    await User.updateOne({ email: 'aline@example.com' }, { emailVerificationExpires: new Date(Date.now() - 1000) });
    expect((await api().post('/api/auth/verify-email').send({ token })).status).toBe(400);
  });

  test('stores only a hash of the verification token', async () => {
    await register();
    const token = tokenFromEmail('aline@example.com');
    const stored = await User.findOne().select('+emailVerificationTokenHash');
    expect(stored.emailVerificationTokenHash).not.toBe(token);
    expect(stored.emailVerificationTokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  });

  test('resend works for unverified users and is refused for verified ones', async () => {
    const reg = await register();
    const token = reg.body.data.accessToken;
    expect((await api().post('/api/auth/resend-verification').set(bearer(token))).status).toBe(200);
    expect(getOutbox()).toHaveLength(2);

    await User.updateOne({ email: 'aline@example.com' }, { emailVerified: true });
    const again = await api().post('/api/auth/resend-verification').set(bearer(token));
    expect(again.status).toBe(409);
  });
});

describe('password reset', () => {
  test('forgot-password gives the same answer for known and unknown emails', async () => {
    await register();
    getOutbox().length = 0;

    const known = await api().post('/api/auth/forgot-password').send({ email: 'aline@example.com' });
    expect(getOutbox()).toHaveLength(1);
    const unknown = await api().post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(getOutbox()).toHaveLength(1); // nothing sent for the unknown address
  });

  test('reset changes the password, is single-use, and revokes old sessions', async () => {
    const reg = await register();
    const oldToken = reg.body.data.accessToken;
    await api().post('/api/auth/forgot-password').send({ email: 'aline@example.com' });
    const resetToken = tokenFromEmail('aline@example.com');

    const reset = await api().post('/api/auth/reset-password').send({ token: resetToken, password: 'NewPassw0rd!' });
    expect(reset.status).toBe(200);

    const oldLogin = await api().post('/api/auth/login').send({ email: 'aline@example.com', password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api().post('/api/auth/login').send({ email: 'aline@example.com', password: 'NewPassw0rd!' });
    expect(newLogin.status).toBe(200);

    expect((await api().get('/api/auth/me').set(bearer(oldToken))).status).toBe(401);

    const reuse = await api().post('/api/auth/reset-password').send({ token: resetToken, password: 'Another1Pass' });
    expect(reuse.status).toBe(400);
  });

  test('stores only a hash of the reset token', async () => {
    await register();
    await api().post('/api/auth/forgot-password').send({ email: 'aline@example.com' });
    const token = tokenFromEmail('aline@example.com');
    const stored = await User.findOne().select('+passwordResetTokenHash');
    expect(stored.passwordResetTokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  });

  test('expired reset tokens and weak new passwords are rejected', async () => {
    await register();
    await api().post('/api/auth/forgot-password').send({ email: 'aline@example.com' });
    const token = tokenFromEmail('aline@example.com');

    const weak = await api().post('/api/auth/reset-password').send({ token, password: 'weak' });
    expect(weak.status).toBe(400);

    await User.updateOne({ email: 'aline@example.com' }, { passwordResetExpires: new Date(Date.now() - 1000) });
    const expired = await api().post('/api/auth/reset-password').send({ token, password: 'NewPassw0rd!' });
    expect(expired.status).toBe(400);
  });
});
