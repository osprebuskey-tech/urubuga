const pkg = require('../../package.json');
const summaries = require('./summaries');
const { convert, toQueryParameters } = require('./zodToJsonSchema');

/**
 * Builds the OpenAPI 3.0 document from the real Express router and the Zod validators attached to each route, so the
 * documentation cannot drift from the behaviour. Summaries (summaries.js) are the only hand-written part.
 */

// Express 4 keeps a mount path as a regular expression; turn it back into text ("/^\/auth\/?(?=\/|$)/i" -> "/auth").
function mountPath(layer) {
  if (layer.regexp.fast_slash) return '';
  const match = layer.regexp
    .toString()
    .replace('\\/?', '')
    .replace('(?=\\/|$)', '$')
    .match(/^\/\^((?:\\[.*+?^${}()|[\]\\/]|[^.*+?^${}()|[\]\\/])*)\$\//);
  if (!match) throw new Error(`Cannot document a mount path: ${layer.regexp}`);
  return match[1].replace(/\\(.)/g, '$1');
}

const emptyCtx = () => ({ auth: null, roles: null, verifiedEmail: false, upload: false, schemas: {} });

function applyDocs(ctx, docs) {
  if (!docs) return ctx;
  const next = { ...ctx, schemas: { ...ctx.schemas } };
  if (docs.auth) next.auth = docs.auth;
  if (docs.roles) next.roles = docs.roles;
  if (docs.verifiedEmail) next.verifiedEmail = true;
  if (docs.upload) next.upload = true;
  if (docs.schemas) Object.assign(next.schemas, docs.schemas);
  return next;
}

/** Walks a router in declaration order; `router.use(requireAuth, ...)` applies to the routes declared after it. */
function collect(router, prefix, inherited, out) {
  let ctx = inherited;
  for (const layer of router.stack) {
    if (layer.route) {
      let routeCtx = ctx;
      for (const l of layer.route.stack) routeCtx = applyDocs(routeCtx, l.handle.docs);
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ method, path: `${prefix}${layer.route.path === '/' ? '' : layer.route.path}` || '/', ctx: routeCtx });
      }
    } else if (layer.name === 'router') {
      collect(layer.handle, prefix + mountPath(layer), ctx, out);
    } else {
      ctx = applyDocs(ctx, layer.handle.docs);
    }
  }
}

const toOpenApiPath = (p) => p.replace(/:([A-Za-z]+)/g, '{$1}');

function accessText(ctx) {
  const parts = [];
  if (!ctx.auth) parts.push('Public.');
  else if (ctx.auth === 'optional') parts.push('Public; signing in is optional.');
  else parts.push('Requires a signed-in user.');
  if (ctx.roles) parts.push(`Allowed roles: ${ctx.roles.join(', ')} (checked on the server).`);
  if (ctx.verifiedEmail) parts.push('The account\'s email address must be verified.');
  return parts.join(' ');
}

function buildOperation({ method, path, ctx }) {
  const key = `${method.toUpperCase()} ${path}`;
  const parameters = [];
  for (const name of [...path.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1])) {
    const fromSchema = ctx.schemas.params ? convert(ctx.schemas.params).properties?.[name] : undefined;
    parameters.push({ name, in: 'path', required: true, schema: fromSchema || { type: 'string' } });
  }
  if (ctx.schemas.query) parameters.push(...toQueryParameters(ctx.schemas.query));

  const op = {
    tags: [path.split('/')[1] || 'health'],
    summary: summaries[key],
    description: accessText(ctx),
    operationId: `${method}${path.replace(/[{}]/g, '').split('/').filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join('')}`,
    ...(parameters.length ? { parameters } : {}),
    responses: {},
  };

  if (ctx.upload) {
    const fields = ctx.schemas.body ? convert(ctx.schemas.body) : { type: 'object', properties: {} };
    op.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['image', ...(fields.required || [])],
            properties: { image: { type: 'string', format: 'binary', description: 'JPEG, PNG or WebP; type is checked from the file bytes' }, ...fields.properties },
          },
        },
      },
    };
  } else if (ctx.schemas.body) {
    op.requestBody = { required: true, content: { 'application/json': { schema: convert(ctx.schemas.body) } } };
  }

  op.responses['2XX'] = { description: 'Success. 200, or 201 when something was created.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } };
  if (ctx.schemas.body || ctx.schemas.query || ctx.schemas.params || ctx.upload) op.responses['400'] = { $ref: '#/components/responses/ValidationError' };
  if (ctx.auth === 'required') op.responses['401'] = { $ref: '#/components/responses/Unauthenticated' };
  if (ctx.roles || ctx.verifiedEmail || ctx.auth === 'required') op.responses['403'] = { $ref: '#/components/responses/Forbidden' };
  if (path.includes('{')) op.responses['404'] = { $ref: '#/components/responses/NotFound' };
  op.responses['429'] = { $ref: '#/components/responses/TooManyRequests' };

  if (ctx.auth === 'required') op.security = [{ bearerAuth: [] }];
  else if (ctx.auth === 'optional') op.security = [{}, { bearerAuth: [] }];
  else op.security = [];
  if (ctx.roles) op['x-roles'] = [...ctx.roles];

  if (path.startsWith('/payments/webhook')) {
    op.parameters = [
      ...(op.parameters || []),
      { name: 'X-Imbehe-Timestamp', in: 'header', required: true, schema: { type: 'string' }, description: 'Unix seconds when the gateway signed the body' },
      { name: 'X-Imbehe-Signature', in: 'header', required: true, schema: { type: 'string' }, description: 'hex( HMAC-SHA256( PAYMENT_WEBHOOK_SECRET, `${timestamp}.${rawBody}` ) )' },
    ];
    op.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object', description: 'Gateway event; the exact bytes sent are what is signed' } } } };
    op.responses['401'] = { $ref: '#/components/responses/Unauthenticated' };
  }
  return op;
}

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

function buildSpec() {
  const routes = [];
  collect(require('../routes'), '', emptyCtx(), routes);
  // /api/health is declared directly on the app, not on a router.
  routes.unshift({ method: 'get', path: '/health', ctx: emptyCtx() });

  const paths = {};
  for (const r of routes) {
    const path = toOpenApiPath(r.path);
    paths[path] = paths[path] || {};
    paths[path][r.method] = buildOperation({ ...r, path });
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Imbehe API',
      version: pkg.version,
      description: [
        'REST API for Imbehe, a marketplace connecting skilled service providers with customers in Rwanda.',
        '',
        '**Responses** use one envelope: `{ success: true, data, meta? }`, or `{ success: false, error: { code, message, details? }, requestId }`.',
        '**Money** is always an integer number of Rwandan francs (RWF). Commission is stored in basis points (1200 = 12.00%).',
        '**Authentication:** `Authorization: Bearer <token>` from `POST /auth/login`. Roles are always re-checked on the server.',
        '**Lists** accept `page` and `limit` and return `meta: { page, limit, total, totalPages }`.',
      ].join('\n'),
    },
    servers: [{ url: '/api', description: 'This server' }],
    tags: [...new Set(Object.values(paths).flatMap((p) => Object.values(p).flatMap((o) => o.tags)))].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Success: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { description: 'The result; its shape depends on the endpoint' },
            meta: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } },
          },
        },
        Error: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
              },
            },
            requestId: { type: 'string', format: 'uuid' },
          },
        },
      },
      responses: {
        ValidationError: errorResponse('The request was not valid. `error.details` lists each field.'),
        Unauthenticated: errorResponse('Missing, expired or revoked token.'),
        Forbidden: errorResponse('Signed in, but not allowed to do this (wrong role, suspended account or unverified email).'),
        NotFound: errorResponse('Not found, or not visible to you.'),
        TooManyRequests: errorResponse('Rate limit reached. Try again later.'),
      },
    },
  };
}

module.exports = { buildSpec };
