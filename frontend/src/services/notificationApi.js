import { get, post, patch } from './api';

export const notificationApi = {
  list: (query, signal) => get('/notifications', { query, signal }),
  unreadCount: (signal) => get('/notifications/unread-count', { signal }),
  markRead: (id) => patch(`/notifications/${id}/read`),
  markAllRead: () => post('/notifications/read-all'),
};
