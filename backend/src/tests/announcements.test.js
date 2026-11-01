const Announcement = require('../models/Announcement');
const AuditLog = require('../models/AuditLog');
const { api, bearer, createSession, createAdmin } = require('./helpers');

const superAdmin = () => createSession(['super_admin']);
const publish = (token, body = {}) => api().post('/api/announcements').set(bearer(token)).send({ message: 'Platform maintenance on Saturday', ...body });

describe('GET /api/announcements (public)', () => {
  test('lists only active, unexpired announcements, newest first, without internal fields', async () => {
    const boss = await superAdmin();
    await publish(boss.token, { message: 'First one' });
    await publish(boss.token, { message: 'Second one', linkUrl: 'https://example.rw/news' });
    const hidden = (await publish(boss.token, { message: 'Hidden one' })).body.data.announcement;
    await api().put(`/api/announcements/${hidden.id}`).set(bearer(boss.token)).send({ status: 'hidden' });
    await Announcement.create({ message: 'Already expired', expiresAt: new Date(Date.now() - 60 * 1000) });

    const res = await api().get('/api/announcements');
    expect(res.status).toBe(200);
    expect(res.body.data.map((a) => a.message)).toEqual(['Second one', 'First one']);
    expect(res.body.data[0].linkUrl).toBe('https://example.rw/news');
    expect(res.body.data[0]).not.toHaveProperty('createdBy');
  });
});

describe('publishing announcements', () => {
  test('only the super administrator may publish, change, list or remove them', async () => {
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    expect((await publish(admin.token)).status).toBe(403);
    expect((await publish(customer.token)).status).toBe(403);
    expect((await api().post('/api/announcements').send({ message: 'Anonymous' })).status).toBe(401);
    expect((await api().get('/api/announcements/manage').set(bearer(admin.token))).status).toBe(403);
  });

  test('super administrator publishes, edits and removes one, and each step is audited', async () => {
    const boss = await superAdmin();
    const created = await publish(boss.token, { message: 'Welcome to Imbehe' });
    expect(created.status).toBe(201);
    expect(created.body.data.announcement).toMatchObject({ message: 'Welcome to Imbehe', status: 'active' });
    const id = created.body.data.announcement.id;

    const edited = await api().put(`/api/announcements/${id}`).set(bearer(boss.token)).send({ message: 'Welcome back', linkUrl: 'https://example.rw' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.announcement).toMatchObject({ message: 'Welcome back', linkUrl: 'https://example.rw' });

    const cleared = await api().put(`/api/announcements/${id}`).set(bearer(boss.token)).send({ linkUrl: '' });
    expect(cleared.body.data.announcement.linkUrl).toBeUndefined();

    const all = await api().get('/api/announcements/manage').set(bearer(boss.token));
    expect(all.body.data).toHaveLength(1);

    expect((await api().delete(`/api/announcements/${id}`).set(bearer(boss.token))).status).toBe(200);
    expect(await Announcement.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: { $in: ['announcement.create', 'announcement.update', 'announcement.delete'] } })).toBe(4);
  });

  test('rejects a missing or over-long message, an unsafe link and an end time in the past', async () => {
    const boss = await superAdmin();
    expect((await publish(boss.token, { message: '' })).status).toBe(400);
    expect((await publish(boss.token, { message: 'x'.repeat(201) })).status).toBe(400);
    expect((await publish(boss.token, { linkUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await publish(boss.token, { expiresAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    expect((await publish(boss.token, { status: 'draft' })).status).toBe(400);
    const none = await api().put('/api/announcements/507f1f77bcf86cd799439011').set(bearer(boss.token)).send({});
    expect(none.status).toBe(400);
  });

  test('an unknown id is a 404', async () => {
    const boss = await superAdmin();
    const res = await api().put('/api/announcements/507f1f77bcf86cd799439011').set(bearer(boss.token)).send({ status: 'hidden' });
    expect(res.status).toBe(404);
    expect((await api().delete('/api/announcements/507f1f77bcf86cd799439011').set(bearer(boss.token))).status).toBe(404);
  });
});
