const { api, bearer, createUser, loginAs } = require('./helpers');

describe('GET /api/admin/users (admin-only)', () => {
  test('rejects unauthenticated requests with 401', async () => {
    expect((await api().get('/api/admin/users')).status).toBe(401);
  });

  test.each([['customer'], ['provider'], ['business']])('rejects a %s with 403', async (role) => {
    const user = await createUser({ roles: [role] });
    const res = await api().get('/api/admin/users').set(bearer(await loginAs(user)));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('a user who is both customer and provider is still not an admin', async () => {
    const user = await createUser({ roles: ['customer', 'provider'] });
    const res = await api().get('/api/admin/users').set(bearer(await loginAs(user)));
    expect(res.status).toBe(403);
  });

  test('admin gets a paginated list with no sensitive fields', async () => {
    const admin = await createUser({ roles: ['admin'] });
    await createUser({ roles: ['customer'] });
    await createUser({ roles: ['provider'] });
    const token = await loginAs(admin);

    const res = await api().get('/api/admin/users?limit=2&page=1').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|TokenHash|\$2[aby]\$/);

    const page2 = await api().get('/api/admin/users?limit=2&page=2').set(bearer(token));
    expect(page2.body.data).toHaveLength(1);
  });

  test('supports filtering by role and searching by name/email', async () => {
    const admin = await createUser({ roles: ['admin'] });
    await createUser({ roles: ['provider'], email: 'plumber@example.com' });
    await createUser({ roles: ['customer'], email: 'client@example.com' });
    const token = await loginAs(admin);

    const providers = await api().get('/api/admin/users?role=provider').set(bearer(token));
    expect(providers.body.data.map((u) => u.email)).toEqual(['plumber@example.com']);

    const search = await api().get('/api/admin/users?search=CLIENT@').set(bearer(token));
    expect(search.body.data.map((u) => u.email)).toEqual(['client@example.com']);
  });

  test('regex characters in search are treated literally, not as a pattern', async () => {
    const admin = await createUser({ roles: ['admin'] });
    const token = await loginAs(admin);
    const res = await api().get('/api/admin/users').query({ search: '.*' }).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test('validates query parameters', async () => {
    const admin = await createUser({ roles: ['admin'] });
    const token = await loginAs(admin);
    expect((await api().get('/api/admin/users?limit=1000').set(bearer(token))).status).toBe(400);
    expect((await api().get('/api/admin/users?role=superuser').set(bearer(token))).status).toBe(400);
    expect((await api().get('/api/admin/users?page=0').set(bearer(token))).status).toBe(400);
  });

  test('role changes take effect immediately (roles come from the DB, not the token)', async () => {
    const admin = await createUser({ roles: ['admin'] });
    const token = await loginAs(admin);
    expect((await api().get('/api/admin/users').set(bearer(token))).status).toBe(200);

    admin.roles = ['customer'];
    await admin.save();
    expect((await api().get('/api/admin/users').set(bearer(token))).status).toBe(403);
  });
});
