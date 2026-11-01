import { get, post, patch } from './api';

export const authApi = {
  register: (body) => post('/auth/register', body, { auth: false }),
  login: (body) => post('/auth/login', body, { auth: false }),
  logout: () => post('/auth/logout'),
  me: (opts) => get('/auth/me', opts),
  updateMe: (body) => patch('/auth/me', body),
  changePassword: (body) => post('/auth/change-password', body),
  verifyEmail: (token) => post('/auth/verify-email', { token }, { auth: false }),
  resendVerification: () => post('/auth/resend-verification'),
  forgotPassword: (email) => post('/auth/forgot-password', { email }, { auth: false }),
  resetPassword: (body) => post('/auth/reset-password', body, { auth: false }),
};
