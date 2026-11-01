const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes');
const AppError = require('./utils/AppError');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimiters');

const app = express();

if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/api/health' },
  }),
);

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      // No Origin header = non-browser client (curl, server-to-server): CORS does not apply.
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new AppError(403, 'Origin not allowed', 'CORS_FORBIDDEN'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(
  express.json({
    limit: '10kb',
    // Webhook signatures are computed over the exact bytes the gateway sent, so keep them for those routes only.
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith('/api/payments/webhook')) req.rawBody = buf;
    },
  }),
);

if (env.STORAGE_PROVIDER === 'local') {
  // Public, read-only. Only images that passed the upload pipeline are ever written here.
  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      index: false,
      dotfiles: 'deny',
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // let the React app on another origin show them
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
}

// API responses can be personal (accounts, payments, disputes): browsers and proxies must not keep copies.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

if (env.apiDocsEnabled) {
  const swaggerUi = require('swagger-ui-express');
  const { buildSpec } = require('./docs/openapi');
  const spec = buildSpec();
  app.get('/api/openapi.json', (req, res) => res.json(spec));
  app.use('/api/docs', (req, res, next) => {
    // Helmet's default policy upgrades every request to https, which breaks the docs on a local http server.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    next();
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Imbehe API', swaggerOptions: { persistAuthorization: false } }));
}

app.get('/api/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ success: dbUp, data: { status: dbUp ? 'ok' : 'degraded', db: dbUp } });
});

app.use('/api', globalLimiter);
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
