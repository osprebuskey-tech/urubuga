import { get, put, post, del } from './api';

export const providerApi = {
  getMe: (signal) => get('/providers/me', { signal }),
  saveMe: (body) => put('/providers/me', body),
  requestVerification: (body = {}) => post('/providers/me/verification-request', body),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('image', file);
    return post('/providers/me/avatar', form);
  },
  addPortfolio: ({ file, title, description }) => {
    const form = new FormData();
    form.append('title', title);
    if (description) form.append('description', description);
    form.append('image', file);
    return post('/providers/me/portfolio', form);
  },
  removePortfolio: (id) => del(`/providers/me/portfolio/${id}`),

  myServices: (query, signal) => get('/providers/me/services', { query, signal }),
  createService: (body) => post('/services', body),
  updateService: (id, body) => put(`/services/${id}`, body),
  archiveService: (id) => del(`/services/${id}`),
  addServiceImage: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return post(`/services/${id}/images`, form);
  },
  removeServiceImage: (id, imageId) => del(`/services/${id}/images/${imageId}`),
};
