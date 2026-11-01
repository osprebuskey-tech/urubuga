// Must be set before the app (and therefore the limiters) is loaded.
process.env.AUTH_RATE_LIMIT_MAX = '3';

const request = require('supertest');
const app = require('../app');

test('login is rate limited per IP', async () => {
  const attempt = () => request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'Whatever123' });
  for (let i = 0; i < 3; i += 1) {
    expect((await attempt()).status).toBe(401);
  }
  const blocked = await attempt();
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe('RATE_LIMITED');
});
