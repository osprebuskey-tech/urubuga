import { get, post, patch } from './api';

export const reviewApi = {
  create: (bookingId, body) => post(`/bookings/${bookingId}/reviews`, body),
  forProvider: (providerId, query, signal) => get(`/providers/${providerId}/reviews`, { query, signal, auth: false }),
  report: (reviewId, body) => post(`/reviews/${reviewId}/report`, body),
  adminList: (query, signal) => get('/admin/reviews', { query, signal }),
  moderate: (reviewId, body) => patch(`/admin/reviews/${reviewId}`, body),
};
