import { get, post, put, del } from './api';

const withImage = (file, fields = {}) => {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null) form.append(k, v); });
  form.append('image', file);
  return form;
};

export const partnerApi = {
  list: (signal) => get('/partners', { signal, auth: false }), // the welcome page: active partners and sponsors only
  manage: (signal) => get('/partners/manage', { signal }), // super administrator: everything, hidden ones too
  create: (fields, file) => post('/partners', withImage(file, fields)),
  update: (id, body) => put(`/partners/${id}`, body),
  replaceLogo: (id, file) => post(`/partners/${id}/logo`, withImage(file)),
  remove: (id) => del(`/partners/${id}`),
};
