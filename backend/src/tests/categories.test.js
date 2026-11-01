const AuditLog = require('../models/AuditLog');
const { api, bearer, createAdmin, createSession, createCategory, createProvider, createListingDoc } = require('./helpers');

describe('GET /api/categories', () => {
  test('is public and lists only active categories in order', async () => {
    await createCategory({ name: 'B Second', slug: 'b-second', sortOrder: 2 });
    await createCategory({ name: 'A First', slug: 'a-first', sortOrder: 1 });
    await createCategory({ name: 'Hidden', slug: 'hidden', status: 'disabled' });

    const res = await api().get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.slug)).toEqual(['a-first', 'b-second']);
  });

  test('disabled categories are visible only to admins who ask for them', async () => {
    await createCategory({ name: 'Hidden', slug: 'hidden', status: 'disabled' });
    const admin = await createAdmin();
    const customer = await createSession(['customer']);

    const asAdmin = await api().get('/api/categories?includeDisabled=true').set(bearer(admin.token));
    expect(asAdmin.body.data).toHaveLength(1);

    const asCustomer = await api().get('/api/categories?includeDisabled=true').set(bearer(customer.token));
    expect(asCustomer.body.data).toHaveLength(0);
    const anon = await api().get('/api/categories?includeDisabled=true');
    expect(anon.body.data).toHaveLength(0);
  });

  test('a bad token is rejected even on a public route', async () => {
    expect((await api().get('/api/categories').set(bearer('garbage'))).status).toBe(401);
  });
});

describe('admin category management', () => {
  const body = { name: 'Graphic Design', subcategories: ['Logo design', 'Posters and flyers', 'Logo design'] };

  test('admin creates a category with generated slugs and de-duplicated subcategories', async () => {
    const admin = await createAdmin();
    const res = await api().post('/api/categories').set(bearer(admin.token)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.category).toMatchObject({ name: 'Graphic Design', slug: 'graphic-design', status: 'active' });
    expect(res.body.data.category.subcategories).toEqual([
      { name: 'Logo design', slug: 'logo-design' },
      { name: 'Posters and flyers', slug: 'posters-and-flyers' },
    ]);
  });

  test('anonymous gets 401 and non-admins get 403', async () => {
    expect((await api().post('/api/categories').send(body)).status).toBe(401);
    for (const roles of [['customer'], ['provider'], ['business']]) {
      const { token } = await createSession(roles);
      expect((await api().post('/api/categories').set(bearer(token)).send(body)).status).toBe(403);
    }
  });

  test('duplicate names are rejected even with different casing or spacing', async () => {
    const admin = await createAdmin();
    await api().post('/api/categories').set(bearer(admin.token)).send(body);
    const res = await api().post('/api/categories').set(bearer(admin.token)).send({ name: 'graphic   DESIGN' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_EXISTS');
  });

  test('validates the body and rejects unknown fields', async () => {
    const admin = await createAdmin();
    expect((await api().post('/api/categories').set(bearer(admin.token)).send({ name: 'x' })).status).toBe(400);
    expect((await api().post('/api/categories').set(bearer(admin.token)).send({ name: 'Valid Name', slug: 'custom' })).status).toBe(400);
  });

  test('update renames, replaces subcategories and can disable', async () => {
    const admin = await createAdmin();
    const created = await api().post('/api/categories').set(bearer(admin.token)).send(body);
    const id = created.body.data.category.id;

    const res = await api()
      .put(`/api/categories/${id}`)
      .set(bearer(admin.token))
      .send({ name: 'Design and Branding', subcategories: ['Brand kits'], status: 'disabled' });
    expect(res.status).toBe(200);
    expect(res.body.data.category).toMatchObject({ slug: 'design-and-branding', status: 'disabled' });
    expect(res.body.data.category.subcategories).toEqual([{ name: 'Brand kits', slug: 'brand-kits' }]);

    expect((await api().get('/api/categories')).body.data).toHaveLength(0);
  });

  test('renaming into an existing name is a conflict', async () => {
    const admin = await createAdmin();
    await createCategory({ name: 'Taken', slug: 'taken' });
    const other = await createCategory({ name: 'Other', slug: 'other' });
    const res = await api().put(`/api/categories/${other.id}`).set(bearer(admin.token)).send({ name: 'Taken' });
    expect(res.status).toBe(409);
  });

  test('invalid and unknown ids give 400 and 404', async () => {
    const admin = await createAdmin();
    expect((await api().put('/api/categories/not-an-id').set(bearer(admin.token)).send({ status: 'active' })).status).toBe(400);
    expect((await api().put('/api/categories/aaaaaaaaaaaaaaaaaaaaaaaa').set(bearer(admin.token)).send({ status: 'active' })).status).toBe(404);
    expect((await api().delete('/api/categories/aaaaaaaaaaaaaaaaaaaaaaaa').set(bearer(admin.token))).status).toBe(404);
  });

  test('a category in use cannot be deleted; an unused one can', async () => {
    const admin = await createAdmin();
    const used = await createCategory();
    const unused = await createCategory();
    const provider = await createProvider();
    await createListingDoc(provider.profile, used);

    const blocked = await api().delete(`/api/categories/${used.id}`).set(bearer(admin.token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CATEGORY_IN_USE');

    expect((await api().delete(`/api/categories/${unused.id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await api().get('/api/categories')).body.data.map((c) => c.id)).toEqual([used.id]);
  });

  test('admin actions are written to the audit log', async () => {
    const admin = await createAdmin();
    const created = await api().post('/api/categories').set(bearer(admin.token)).send(body);
    const id = created.body.data.category.id;
    await api().put(`/api/categories/${id}`).set(bearer(admin.token)).send({ description: 'Updated' });
    await api().delete(`/api/categories/${id}`).set(bearer(admin.token));

    const actions = (await AuditLog.find({ actor: admin.user._id })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['category.create', 'category.update', 'category.delete']));
  });
});
