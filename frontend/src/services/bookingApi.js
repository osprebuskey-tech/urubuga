import { get, patch } from './api';

export const bookingApi = {
  list: (query, signal) => get('/bookings', { query, signal }),
  get: (id, signal) => get(`/bookings/${id}`, { signal }),
  setStatus: (id, status, note) => patch(`/bookings/${id}/status`, note ? { status, note } : { status }),
};
