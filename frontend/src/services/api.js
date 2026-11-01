import { getToken } from './session';

export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

/** Error shape from the API: { code, message, details: [{field, message}], status, requestId }. */
export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

const SESSION_ERRORS = ['TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHENTICATED'];
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };

function buildUrl(path, query) {
  const url = new URL(`${API_BASE}/api${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Calls the API and unwraps its envelope. Resolves { data, meta } or throws ApiError.
 * - auth: attach the Bearer token if there is one (set false for public endpoints).
 * - body: a plain object is sent as JSON; FormData is sent as multipart (the browser sets the boundary).
 */
export async function request(path, { method = 'GET', body, query, signal, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: payload, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check your connection and try again.' });
  }

  let json = null;
  try { json = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok || json?.success === false) {
    const e = json?.error || {};
    const error = new ApiError({
      status: res.status,
      code: e.code || `HTTP_${res.status}`,
      message: e.message || 'Something went wrong. Please try again.',
      details: e.details,
      requestId: json?.requestId,
    });
    if (res.status === 401 && token && SESSION_ERRORS.includes(error.code)) unauthorizedHandler?.(error);
    throw error;
  }
  return { data: json?.data, meta: json?.meta };
}

export const get = (path, opts) => request(path, { ...opts, method: 'GET' });
export const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body });
export const put = (path, body, opts) => request(path, { ...opts, method: 'PUT', body });
export const patch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body });
export const del = (path, opts) => request(path, { ...opts, method: 'DELETE' });
