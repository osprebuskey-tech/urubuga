import { get, post, patch } from './api';

export const disputeApi = {
  list: (query, signal) => get('/disputes', { query, signal }),
  get: (id, signal) => get(`/disputes/${id}`, { signal }),
  addMessage: (id, text) => post(`/disputes/${id}/messages`, { text }),
  addEvidence: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return post(`/disputes/${id}/evidence`, form);
  },
  adminList: (query, signal) => get('/admin/disputes', { query, signal }),
  startReview: (id) => patch(`/admin/disputes/${id}`, { status: 'under_review' }),
  resolve: (id, outcome, note) => patch(`/admin/disputes/${id}`, { outcome, note }),
};
