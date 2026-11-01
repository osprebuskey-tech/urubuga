const { api, bearer, createSession } = require('./helpers');

const companyBody = (overrides = {}) => ({
  companyName: 'Kigali Builders Ltd',
  registrationNumber: '123456789',
  industry: 'Construction',
  address: { district: 'Gasabo', street: 'KG 11 Ave' },
  contactPerson: { name: 'Jean Claude', phone: '0788123456' },
  ...overrides,
});

describe('/api/companies/me', () => {
  test('only business accounts can manage a company profile', async () => {
    expect((await api().get('/api/companies/me')).status).toBe(401);
    for (const roles of [['customer'], ['provider'], ['admin']]) {
      const { token } = await createSession(roles);
      expect((await api().put('/api/companies/me').set(bearer(token)).send(companyBody())).status).toBe(403);
    }
  });

  test('creates, reads and merges updates, normalising the phone number', async () => {
    const { token } = await createSession(['business']);
    expect((await api().get('/api/companies/me').set(bearer(token))).status).toBe(404);

    const created = await api().put('/api/companies/me').set(bearer(token)).send(companyBody());
    expect(created.status).toBe(200);
    expect(created.body.data.company).toMatchObject({
      companyName: 'Kigali Builders Ltd',
      contactPerson: { name: 'Jean Claude', phone: '+250788123456' },
      address: { district: 'Gasabo', street: 'KG 11 Ave' },
    });

    const updated = await api().put('/api/companies/me').set(bearer(token)).send({ companyName: 'Kigali Builders Group', address: { sector: 'Remera' } });
    expect(updated.body.data.company.address).toMatchObject({ district: 'Gasabo', sector: 'Remera' });

    const read = await api().get('/api/companies/me').set(bearer(token));
    expect(read.body.data.company.companyName).toBe('Kigali Builders Group');
  });

  test('each business sees only its own company', async () => {
    const a = await createSession(['business']);
    const b = await createSession(['business']);
    await api().put('/api/companies/me').set(bearer(a.token)).send(companyBody());
    expect((await api().get('/api/companies/me').set(bearer(b.token))).status).toBe(404);
  });

  test('validates input and rejects unknown or ownership fields', async () => {
    const { token } = await createSession(['business']);
    const put = (body) => api().put('/api/companies/me').set(bearer(token)).send(body);
    expect((await put(companyBody({ registrationNumber: '12' }))).status).toBe(400);
    expect((await put(companyBody({ website: 'not a url' }))).status).toBe(400);
    expect((await put(companyBody({ contactPerson: { phone: '0712345678' } }))).status).toBe(400);
    expect((await put(companyBody({ owner: 'aaaaaaaaaaaaaaaaaaaaaaaa' }))).status).toBe(400);
  });
});
