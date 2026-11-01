import { get, post, put } from './api';

export const paymentApi = {
  options: (signal) => get('/payments/options', { signal }),
  checkout: (body) => post('/payments/checkout', body),
  list: (query, signal) => get('/payments', { query, signal }),
  cancel: (id) => post(`/payments/${id}/cancel`),
  simulate: (id, outcome) => post(`/payments/${id}/sandbox/${outcome}`), // test-mode gateway only

  adminList: (query, signal) => get('/admin/payments', { query, signal }),
  adminSummary: (signal) => get('/admin/payments/summary', { signal }),
  recordManual: (body) => post('/admin/payments', body),
  refund: (id, body) => post(`/admin/payments/${id}/refund`, body),
  payout: (id, body) => post(`/admin/payments/${id}/payout`, body),
  getSettings: (signal) => get('/admin/settings', { signal }),
  setCommission: (rateBps) => put('/admin/settings/commission', { rateBps }),
};
