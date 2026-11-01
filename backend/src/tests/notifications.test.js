const Notification = require('../models/Notification');
const { api, bearer, createSession } = require('./helpers');

const note = (user, overrides = {}) =>
  Notification.create({ user: user._id, type: 'request.new', title: 'New request: Fix my network', body: 'Networking in Gasabo', link: '/dashboard/requests/abc', ...overrides });

describe('GET /api/notifications', () => {
  test('lists only your own notifications, newest first, with the unread count', async () => {
    const me = await createSession(['customer']);
    const other = await createSession(['customer']);
    await note(me.user, { title: 'older' });
    await note(me.user, { title: 'newer' });
    await note(other.user, { title: 'not mine' });

    const res = await api().get('/api/notifications').set(bearer(me.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((n) => n.title)).toEqual(['newer', 'older']);
    expect(res.body.meta).toMatchObject({ total: 2, unreadCount: 2, page: 1 });
    expect(res.body.data[0].user).toBeUndefined();
    expect(res.body.data[0].id).toBeDefined();
  });

  test('can show only unread notifications, with pagination', async () => {
    const me = await createSession(['customer']);
    await note(me.user, { title: 'read', readAt: new Date() });
    await note(me.user, { title: 'unread one' });
    await note(me.user, { title: 'unread two' });

    const unread = await api().get('/api/notifications?unread=true').set(bearer(me.token));
    expect(unread.body.data).toHaveLength(2);

    const paged = await api().get('/api/notifications?limit=2&page=2').set(bearer(me.token));
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.totalPages).toBe(2);
  });

  test('requires login', async () => {
    expect((await api().get('/api/notifications')).status).toBe(401);
    expect((await api().get('/api/notifications/unread-count')).status).toBe(401);
  });
});

describe('unread count and marking as read', () => {
  test('unread-count reflects what has not been read', async () => {
    const me = await createSession(['provider']);
    await note(me.user);
    await note(me.user, { readAt: new Date() });
    const res = await api().get('/api/notifications/unread-count').set(bearer(me.token));
    expect(res.body.data.unreadCount).toBe(1);
  });

  test('you can mark your own notification read, but nobody else’s', async () => {
    const me = await createSession(['customer']);
    const other = await createSession(['customer']);
    const mine = await note(me.user);

    expect((await api().patch(`/api/notifications/${mine._id}/read`).set(bearer(other.token))).status).toBe(404);
    expect((await Notification.findById(mine._id)).readAt).toBeUndefined();

    const res = await api().patch(`/api/notifications/${mine._id}/read`).set(bearer(me.token));
    expect(res.status).toBe(200);
    expect(res.body.data.notification.readAt).toBeTruthy();
    expect((await api().patch('/api/notifications/not-an-id/read').set(bearer(me.token))).status).toBe(400);
  });

  test('read-all only touches your own notifications', async () => {
    const me = await createSession(['customer']);
    const other = await createSession(['customer']);
    await note(me.user);
    await note(me.user);
    const theirs = await note(other.user);

    const res = await api().post('/api/notifications/read-all').set(bearer(me.token));
    expect(res.body.data.updated).toBe(2);
    expect(await Notification.countDocuments({ user: me.user._id, readAt: { $exists: false } })).toBe(0);
    expect((await Notification.findById(theirs._id)).readAt).toBeUndefined();
  });
});
