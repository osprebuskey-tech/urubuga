import { API_BASE, ApiError, get, post, put, patch } from './api';
import { getToken } from './session';

export const verificationApi = {
  // the applicant
  fee: (signal) => get('/verification/fee', { signal }),
  mine: (signal) => get('/verification/me', { signal }),
  apply: () => post('/verification/apply'),
  pay: (body) => post('/verification/payment', body),
  cancelPayment: () => post('/verification/payment/cancel'),
  respond: (message) => post('/verification/respond', { message }),
  // customers and businesses (free, same review)
  mineAccount: (signal) => get('/verification/account/me', { signal }),
  applyAccount: () => post('/verification/account/apply'),
  respondAccount: (message) => post('/verification/account/respond', { message }),
  sandbox: (outcome) => post(`/verification/payment/sandbox/${outcome}`),
  // staff
  list: (query, signal) => get('/admin/verification', { query, signal }),
  get: (id, signal) => get(`/admin/verification/${id}`, { signal }),
  startReview: (id) => post(`/admin/verification/${id}/start-review`),
  requestInfo: (id, message) => post(`/admin/verification/${id}/request-info`, { message }),
  recommend: (id, note) => post(`/admin/verification/${id}/recommend`, { note }),
  reject: (id, reason) => post(`/admin/verification/${id}/reject`, { reason }),
  decide: (id, body) => post(`/admin/verification/${id}/decision`, body),
  reopen: (id, reason) => post(`/admin/verification/${id}/reopen`, { reason }),
  payments: (query, signal) => get('/admin/verification-payments', { query, signal }),
  confirmPayment: (id, body) => post(`/admin/verification-payments/${id}/confirm`, body),
  setFee: (body) => put('/admin/settings/verification-fee', body),
  // ratings and recommendations
  ratings: (query, signal) => get('/admin/ratings/providers', { query, signal }),
  evidence: (id, signal) => get(`/admin/ratings/providers/${id}`, { signal }),
  recommendProvider: (id, note) => post(`/admin/ratings/providers/${id}/recommend`, { note }),
  recommendations: (query, signal) => get('/admin/verification-recommendations', { query, signal }),
  resolveRecommendation: (id, body) => patch(`/admin/verification-recommendations/${id}`, body),
  history: (query, signal) => get('/reviews/mine', { query, signal }),
};

export const documentApi = {
  list: (signal) => get('/documents', { signal }),
  upload: (kind, file) => { const f = new FormData(); f.append('file', file); return post(`/documents/${kind}`, f); },
  /** The file is private: it is fetched with the person's token and shown from memory, never from a public URL. */
  async blob(id) {
    const res = await fetch(`${API_BASE}/api/documents/${id}/file`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new ApiError({ status: res.status, code: `HTTP_${res.status}`, message: 'This document could not be opened.' });
    return res.blob();
  },
};

export const termsApi = {
  current: (signal) => get('/terms', { signal, auth: false }),
  status: (signal) => get('/terms/status', { signal }),
  accept: (version) => post('/terms/accept', { version }),
  versions: (signal) => get('/admin/terms', { signal }),
  publish: (body) => post('/admin/terms', body),
};

export const contractApi = {
  forBooking: (bookingId, signal) => get(`/contracts/by-booking/${bookingId}`, { signal }),
  accept: (id, version) => post(`/contracts/${id}/accept`, { version }),
  propose: (id, body) => post(`/contracts/${id}/propose`, body),
  adminList: (query, signal) => get('/admin/contracts', { query, signal }),
};
