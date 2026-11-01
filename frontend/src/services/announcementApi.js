import { get, post, put, del } from './api';

export const announcementApi = {
  list: (signal) => get('/announcements', { signal, auth: false }), // the top bar: active, unexpired announcements only
  manage: (signal) => get('/announcements/manage', { signal }), // super administrator: everything, hidden and expired too
  create: (body) => post('/announcements', body),
  update: (id, body) => put(`/announcements/${id}`, body),
  remove: (id) => del(`/announcements/${id}`),
};
