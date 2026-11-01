import { get, post, patch, del } from './api';

export const requestApi = {
  create: (body) => post('/requests', body),
  list: (query, signal) => get('/requests', { query, signal }),
  get: (id, signal) => get(`/requests/${id}`, { signal }),
  update: (id, body) => patch(`/requests/${id}`, body),
  cancel: (id) => patch(`/requests/${id}`, { status: 'cancelled' }),
  addAttachment: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return post(`/requests/${id}/attachments`, form);
  },
  removeAttachment: (id, attachmentId) => del(`/requests/${id}/attachments/${attachmentId}`),
};
