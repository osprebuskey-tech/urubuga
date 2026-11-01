import { get, post, put, patch, del } from './api';

export const adminApi = {
  dashboard: (signal) => get('/admin/dashboard', { signal }),
  reports: (query, signal) => get('/admin/reports', { query, signal }),
  setUserStatus: (id, body) => patch(`/admin/users/${id}/status`, body),
  users: (query, signal) => get('/admin/users', { query, signal }),
  providers: (query, signal) => get('/admin/providers', { query, signal }),
  setVerification: (id, body) => patch(`/admin/providers/${id}/verification`, body),
  createUser: (body) => post('/admin/users', body),
  resendInvite: (id) => post(`/admin/users/${id}/resend-invite`),
  setUserVerification: (id, body) => patch(`/admin/users/${id}/verification`, body),
  confirmUserEmail: (id) => post(`/admin/users/${id}/confirm-email`),
  activityReport: (query, signal) => get('/admin/reports/activity', { query, signal }),
  followUpSummary: (signal) => get('/admin/payments/follow-up', { signal }),
  followUpList: (bucket, query, signal) => get(`/admin/payments/follow-up/${bucket}`, { query, signal }),
  createFollowUp: (body) => post('/admin/payments/follow-ups', body),
  createCategory: (body) => post('/categories', body),
  updateCategory: (id, body) => put(`/categories/${id}`, body),
  deleteCategory: (id) => del(`/categories/${id}`),
};
