import { get, put } from './api';

export const companyApi = {
  getMe: (signal) => get('/companies/me', { signal }),
  saveMe: (body) => put('/companies/me', body),
};
