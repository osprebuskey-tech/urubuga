import { get, post, patch } from './api';

export const quotationApi = {
  listForRequest: (requestId, signal) => get(`/requests/${requestId}/quotations`, { signal }),
  create: (requestId, body) => post(`/requests/${requestId}/quotations`, body),
  update: (id, body) => patch(`/quotations/${id}`, body),
  accept: (id) => patch(`/quotations/${id}`, { status: 'accepted' }),
  reject: (id) => patch(`/quotations/${id}`, { status: 'rejected' }),
  withdraw: (id) => patch(`/quotations/${id}`, { status: 'withdrawn' }),
};
