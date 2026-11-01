const AuditLog = require('../models/AuditLog');
const { api, bearer, createSession, createAdmin, attachPng, fileExists } = require('./helpers');

const superAdmin = () => createSession(['super_admin']);
const add = (token, fields = {}) => {
  let req = attachPng(api().post('/api/partners').set(bearer(token)));
  for (const [k, v] of Object.entries({ name: 'RISA', ...fields })) req = req.field(k, v);
  return req;
};

describe('GET /api/partners (public)', () => {
  test('lists only active partners, sponsors first, without internal fields', async () => {
    const boss = await superAdmin();
    await add(boss.token, { name: 'B Partner', sortOrder: '2' });
    await add(boss.token, { name: 'A Partner', sortOrder: '1' });
    await add(boss.token, { name: 'Big Sponsor', kind: 'sponsor' });
    const hidden = (await add(boss.token, { name: 'Hidden one' })).body.data.partner;
    await api().put(`/api/partners/${hidden.id}`).set(bearer(boss.token)).send({ status: 'hidden' });

    const res = await api().get('/api/partners');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => p.name)).toEqual(['Big Sponsor', 'A Partner', 'B Partner']);
    expect(res.body.data[0]).toMatchObject({ kind: 'sponsor' });
    expect(res.body.data[0].logoUrl).toBeTruthy();
    expect(res.body.data[0]).not.toHaveProperty('logoKey');
  });
});

describe('managing partners', () => {
  test('only the super administrator may add, change or remove them', async () => {
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    expect((await add(admin.token)).status).toBe(403);
    expect((await add(customer.token)).status).toBe(403);
    expect((await api().post('/api/partners')).status).toBe(401);
    expect((await api().get('/api/partners/manage').set(bearer(admin.token))).status).toBe(403);
  });

  test('super administrator adds a partner with a logo, and it is audited', async () => {
    const boss = await superAdmin();
    const res = await add(boss.token, { name: 'MINICT', websiteUrl: 'https://www.minict.gov.rw', sortOrder: '3' });
    expect(res.status).toBe(201);
    expect(res.body.data.partner).toMatchObject({ name: 'MINICT', kind: 'partner', status: 'active', sortOrder: 3 });
    expect(fileExists(res.body.data.partner.logoUrl)).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'partner.create' })).toBe(1);

    const all = await api().get('/api/partners/manage').set(bearer(boss.token));
    expect(all.body.data).toHaveLength(1);
  });

  test('rejects a missing logo, a non-image, a bad link and an unknown kind', async () => {
    const boss = await superAdmin();
    const noLogo = await api().post('/api/partners').set(bearer(boss.token)).field('name', 'RISA');
    expect(noLogo.status).toBe(400);
    const notImage = await api().post('/api/partners').set(bearer(boss.token)).field('name', 'RISA').attach('image', Buffer.from('not an image at all, just text'), { filename: 'x.png', contentType: 'image/png' });
    expect(notImage.status).toBe(400);
    expect((await add(boss.token, { websiteUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await add(boss.token, { kind: 'friend' })).status).toBe(400);
  });

  test('edits fields, clears the website, replaces the logo and removes the old file', async () => {
    const boss = await superAdmin();
    const created = (await add(boss.token, { websiteUrl: 'https://risa.gov.rw' })).body.data.partner;

    const edited = await api().put(`/api/partners/${created.id}`).set(bearer(boss.token)).send({ name: 'RISA Rwanda', kind: 'sponsor', websiteUrl: '' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.partner).toMatchObject({ name: 'RISA Rwanda', kind: 'sponsor' });
    expect(edited.body.data.partner.websiteUrl).toBeUndefined();

    const swapped = await attachPng(api().post(`/api/partners/${created.id}/logo`).set(bearer(boss.token)), 300);
    expect(swapped.status).toBe(200);
    expect(swapped.body.data.partner.logoUrl).not.toBe(created.logoUrl);
    expect(fileExists(swapped.body.data.partner.logoUrl)).toBe(true);
    expect(fileExists(created.logoUrl)).toBe(false);
  });

  test('deleting a partner deletes its logo file', async () => {
    const boss = await superAdmin();
    const created = (await add(boss.token)).body.data.partner;
    expect((await api().delete(`/api/partners/${created.id}`).set(bearer(boss.token))).status).toBe(200);
    expect(fileExists(created.logoUrl)).toBe(false);
    expect((await api().get('/api/partners')).body.data).toHaveLength(0);
    expect((await api().delete(`/api/partners/${created.id}`).set(bearer(boss.token))).status).toBe(404);
  });
});
