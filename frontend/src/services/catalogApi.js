import { get } from './api';

// Public endpoints. They skip the token so an expired session never breaks browsing.
export const catalogApi = {
  categories: ({ includeDisabled = false, signal } = {}) =>
    get('/categories', { signal, auth: includeDisabled, query: includeDisabled ? { includeDisabled: 'true' } : undefined }),
  search: (q, signal) => get('/search', { query: { q }, signal, auth: false }),
  listServices: (query, signal) => get('/services', { query, signal, auth: false }),
  listProviders: (query, signal) => get('/providers', { query, signal, auth: false }),
  getProvider: (id, signal) => get(`/providers/${id}`, { signal, auth: false }),
  // Sends the token (if any): the owner of a draft or paused listing can still open it.
  getService: (id, signal) => get(`/services/${id}`, { signal }),
};
