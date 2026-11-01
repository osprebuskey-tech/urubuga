import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE, ApiError, request, setUnauthorizedHandler } from './api';
import { setToken } from './session';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  globalThis.fetch = vi.fn();
  setUnauthorizedHandler(null);
});

describe('request', () => {
  it('unwraps data and meta and skips empty query values', async () => {
    fetch.mockResolvedValue(reply(200, { success: true, data: [1], meta: { page: 1 } }));
    const result = await request('/services', { query: { q: 'laptop', district: '', page: 2 } });
    expect(result).toEqual({ data: [1], meta: { page: 1 } });
    expect(fetch.mock.calls[0][0]).toBe(`${API_BASE}/api/services?q=laptop&page=2`);
  });

  it('sends the bearer token unless auth is disabled', async () => {
    setToken('abc.def.ghi');
    fetch.mockResolvedValue(reply(200, { success: true, data: {} }));
    await request('/auth/me');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc.def.ghi');
    await request('/services', { auth: false });
    expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  it('sends JSON bodies with a content type, but lets the browser set it for FormData', async () => {
    fetch.mockResolvedValue(reply(200, { success: true, data: {} }));
    await request('/auth/login', { method: 'POST', body: { email: 'a@b.rw' } });
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
    expect(fetch.mock.calls[0][1].body).toBe('{"email":"a@b.rw"}');

    await request('/providers/me/avatar', { method: 'POST', body: new FormData() });
    expect(fetch.mock.calls[1][1].headers['Content-Type']).toBeUndefined();
  });

  it('throws an ApiError carrying the API error code and field details', async () => {
    const details = [{ field: 'email', message: 'Invalid' }];
    fetch.mockResolvedValue(reply(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details }, requestId: 'r1' }));
    await expect(request('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({
      name: 'ApiError', status: 400, code: 'VALIDATION_ERROR', details, requestId: 'r1',
    });
  });

  it('turns network failures into a friendly ApiError', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await request('/services').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toMatch(/cannot reach the server/i);
  });

  it('calls the unauthorized handler for an expired session, but not for a failed login', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    fetch.mockResolvedValue(reply(401, { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }));
    await request('/auth/login', { method: 'POST', body: {}, auth: false }).catch(() => {});
    expect(handler).not.toHaveBeenCalled();

    setToken('abc.def.ghi');
    fetch.mockResolvedValue(reply(401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'Your session has expired. Please log in again.' } }));
    await request('/auth/me').catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
