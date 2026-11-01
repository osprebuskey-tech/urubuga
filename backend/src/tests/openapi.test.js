const { api } = require('./helpers');
const { buildSpec } = require('../docs/openapi');
const summaries = require('../docs/summaries');

const spec = buildSpec();
const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, op]) => ({ key: `${method.toUpperCase()} ${path}`, method, path, op })));

describe('OpenAPI document', () => {
  test('describes the real API: a document with many operations, all with tags and responses', () => {
    expect(spec.openapi).toBe('3.0.3');
    expect(operations.length).toBeGreaterThanOrEqual(75);
    for (const { key, op } of operations) {
      expect(op.tags?.length).toBeGreaterThan(0);
      expect(Object.keys(op.responses).length).toBeGreaterThan(0);
      expect(typeof key).toBe('string');
    }
  });

  test('every route has a hand-written summary, and no summary is left over for a route that no longer exists', () => {
    const documented = new Set(operations.map((o) => o.key));
    const missing = operations.filter((o) => !summaries[o.key]).map((o) => o.key);
    const stale = Object.keys(summaries).filter((k) => !documented.has(k));
    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
  });

  test('operation ids are unique', () => {
    const ids = operations.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every $ref points at something that exists', () => {
    const refs = [...JSON.stringify(spec).matchAll(/"\$ref":"#\/components\/(\w+)\/(\w+)"/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const [, group, name] of refs) expect(spec.components[group][name]).toBeDefined();
  });

  test('request bodies come from the real validators', () => {
    const register = spec.paths['/auth/register'].post.requestBody.content['application/json'].schema;
    expect(register.required).toEqual(expect.arrayContaining(['email', 'password']));
    expect(register.properties.email.format).toBe('email');

    const verification = spec.paths['/admin/providers/{id}/verification'].patch.requestBody.content['application/json'].schema;
    expect(verification.properties.status.enum).toEqual(expect.arrayContaining(['verified', 'rejected', 'needs_info']));
  });

  test('access rules are generated from the middleware, not written by hand', () => {
    const adminRoutes = operations.filter((o) => o.path.startsWith('/admin'));
    expect(adminRoutes.length).toBeGreaterThan(10);
    for (const { op } of adminRoutes) {
      expect(op.security).toEqual([{ bearerAuth: [] }]);
      expect(op['x-roles'].length).toBeGreaterThan(0); // never "any signed-in user"
      expect(op['x-roles']).toContain(op['x-roles'].includes('super_admin') ? 'super_admin' : 'admin');
    }
    // who gets which part of /admin: payments also admit the follow-up role, creating users and the activity report are super admin only
    expect(spec.paths['/admin/payments'].get['x-roles']).toEqual(expect.arrayContaining(['admin', 'super_admin', 'finance']));
    expect(spec.paths['/admin/dashboard'].get['x-roles']).toEqual(['admin', 'super_admin']);
    expect(spec.paths['/admin/users'].post['x-roles']).toEqual(['super_admin']);
    expect(spec.paths['/admin/reports/activity'].get['x-roles']).toEqual(['super_admin']);
    expect(spec.paths['/auth/login'].post.security).toEqual([]);
    expect(spec.paths['/auth/me'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths['/providers/me'].get['x-roles']).toEqual(['provider']);
    expect(spec.paths['/categories'].get.security).toEqual([{}, { bearerAuth: [] }]); // sign-in optional
  });

  test('uploads are documented as multipart, and the webhook documents its signature headers', () => {
    const avatar = spec.paths['/providers/me/avatar'].post.requestBody.content['multipart/form-data'].schema;
    expect(avatar.properties.image.format).toBe('binary');
    const hook = spec.paths['/payments/webhook'].post;
    expect(hook.parameters.map((p) => p.name)).toEqual(['X-Imbehe-Timestamp', 'X-Imbehe-Signature']);
    expect(hook.security).toEqual([]);
  });

  test('list endpoints document their query parameters', () => {
    const names = spec.paths['/providers'].get.parameters.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['page', 'limit', 'q', 'category']));
  });
});

describe('docs endpoints', () => {
  test('GET /api/openapi.json serves the document', async () => {
    const res = await api().get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe('Imbehe API');
    expect(res.body.paths['/auth/login']).toBeDefined();
  });

  test('GET /api/docs serves the interactive page, with a policy that works over plain http', async () => {
    const res = await api().get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/);
  });
});
