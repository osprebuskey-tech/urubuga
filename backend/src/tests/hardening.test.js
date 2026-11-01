const { api, createSession, bearer } = require('./helpers');

describe('response hardening', () => {
  test('API responses are never cached', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['cache-control']).toBe('no-store');
    const { token } = await createSession(['customer']);
    const me = await api().get('/api/auth/me').set(bearer(token));
    expect(me.headers['cache-control']).toBe('no-store');
  });

  test('errors never include stack traces, file paths or database details', async () => {
    const res = await api().get('/api/providers/not-an-id');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|at \w+ \(|mongoose|MongoServerError/i);
  });

  test('an oversized JSON body is refused with a safe message', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'a@example.com', password: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('user input cannot be smuggled in as a MongoDB operator', async () => {
    const res = await api().post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('private routes reject a missing or garbage token', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', 'Bearer not.a.token')).status).toBe(401);
    expect((await api().get('/api/admin/dashboard').set('Authorization', 'Basic abc')).status).toBe(401);
  });
});

describe('production configuration guards', () => {
  const base = {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/imbehe',
    JWT_SECRET: 'a-long-random-production-secret-0123456789abcdef',
    CLIENT_URL: 'https://app.example.rw',
    CORS_ORIGINS: 'https://app.example.rw',
    PUBLIC_API_URL: 'https://api.example.rw',
    EMAIL_PROVIDER: 'console',
    PAYMENT_GATEWAY: 'manual',
    STORAGE_PROVIDER: 'local',
  };

  const load = (overrides = {}) => {
    const saved = process.env;
    jest.resetModules();
    process.env = { ...base, ...overrides };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      return require('../config/env');
    } finally {
      process.env = saved;
      jest.resetModules();
    }
  };

  test('a correct production configuration loads, with docs off by default', () => {
    const env = load();
    expect(env.NODE_ENV).toBe('production');
    expect(env.apiDocsEnabled).toBe(false);
  });

  test('docs can be switched on explicitly', () => {
    expect(load({ API_DOCS_ENABLED: 'true' }).apiDocsEnabled).toBe(true);
  });

  test.each([
    ['a wildcard CORS origin', { CORS_ORIGINS: '*' }, /CORS_ORIGINS/],
    ['a plain-http CORS origin', { CORS_ORIGINS: 'http://app.example.rw' }, /https/],
    ['a plain-http client url', { CLIENT_URL: 'http://app.example.rw' }, /CLIENT_URL/],
    ['the in-memory mailbox', { EMAIL_PROVIDER: 'memory' }, /EMAIL_PROVIDER/],
    ['the sandbox payment gateway', { PAYMENT_GATEWAY: 'sandbox', PAYMENT_WEBHOOK_SECRET: 'x'.repeat(20) }, /sandbox/],
    ['the example JWT secret', { JWT_SECRET: 'replace-with-a-long-random-secret-of-at-least-32-characters' }, /JWT_SECRET/],
    ['local uploads without a public API url', { PUBLIC_API_URL: '' }, /PUBLIC_API_URL/],
  ])('refuses to start with %s', (name, overrides, message) => {
    expect(() => load(overrides)).toThrow(message);
  });
});
