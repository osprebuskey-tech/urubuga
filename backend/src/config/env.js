const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { z } = require('zod');

// Treat blank values (e.g. "S3_BUCKET=") as "not set".
const optional = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Interactive API docs at /api/docs. On by default everywhere except production.
    API_DOCS_ENABLED: optional(z.enum(['true', 'false'])),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('1h'),
    // Lifetime of a session when the person chose "keep me signed in". Staff accounts never get it: they always use JWT_EXPIRES_IN.
    JWT_REMEMBER_EXPIRES_IN: z.string().default('14d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    CLIENT_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    SENSITIVE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    SEARCH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    WRITE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    DISPUTE_WINDOW_DAYS: z.coerce.number().int().min(0).max(90).default(7),
    // Payments. "manual" (pay outside the app, an admin confirms) is always available; "sandbox" is a fake gateway for development.
    PAYMENT_GATEWAY: z.enum(['manual', 'sandbox']).default('manual'),
    PAYMENT_WEBHOOK_SECRET: optional(z.string().min(16, 'must be at least 16 characters')),
    PAYMENT_MANUAL_INSTRUCTIONS: z.string().default('Pay as instructed by Imbehe support, then wait for an administrator to confirm your payment.'),
    DEFAULT_COMMISSION_BPS: z.coerce.number().int().min(0).max(5000).default(1200), // 1200 = 12.00%
    // "smtp" delivers real email (any SMTP service: your host, Brevo, Mailgun, Amazon SES, Gmail app password...).
    EMAIL_PROVIDER: z.enum(['console', 'memory', 'smtp']).default('console'),
    SMTP_HOST: optional(z.string()),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: optional(z.enum(['true', 'false'])), // default: true for port 465, otherwise STARTTLS
    SMTP_USER: optional(z.string()),
    SMTP_PASS: optional(z.string()),
    EMAIL_FROM: z.string().default('Imbehe <no-reply@imbehe.test>'),

    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: z.string().default('uploads'),
    MAX_UPLOAD_MB: z.coerce.number().positive().max(20).default(5),
    // Identity and registration documents (PDF, JPG, PNG). Kept in PRIVATE storage and only ever streamed to authorised people.
    MAX_DOCUMENT_MB: z.coerce.number().positive().max(20).default(8),
    PRIVATE_UPLOAD_DIR: z.string().default('private-uploads'),
    S3_PRIVATE_BUCKET: optional(z.string()),
    PUBLIC_API_URL: optional(z.string().url()),
    S3_BUCKET: optional(z.string()),
    S3_REGION: optional(z.string()),
    S3_ENDPOINT: optional(z.string().url()),
    S3_ACCESS_KEY_ID: optional(z.string()),
    S3_SECRET_ACCESS_KEY: optional(z.string()),
    S3_PUBLIC_BASE_URL: optional(z.string().url()),
  })
  .superRefine((v, ctx) => {
    if (v.EMAIL_PROVIDER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
        if (!v[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when EMAIL_PROVIDER=smtp' });
      }
    }
    if (v.PAYMENT_GATEWAY === 'sandbox') {
      if (v.NODE_ENV === 'production') ctx.addIssue({ code: 'custom', path: ['PAYMENT_GATEWAY'], message: 'the sandbox gateway pretends payments succeed and must never run in production' });
      if (!v.PAYMENT_WEBHOOK_SECRET) ctx.addIssue({ code: 'custom', path: ['PAYMENT_WEBHOOK_SECRET'], message: 'required when PAYMENT_GATEWAY=sandbox' });
    }
    if (v.NODE_ENV === 'production') {
      const origins = v.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
      if (origins.some((o) => o === '*')) ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'a wildcard is not allowed in production; list the exact origins' });
      if (origins.some((o) => !o.startsWith('https://'))) ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'production origins must use https://' });
      if (!v.CLIENT_URL.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['CLIENT_URL'], message: 'must use https:// in production' });
      if (v.EMAIL_PROVIDER === 'memory') ctx.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'the in-memory mailbox is for tests only' });
      if (v.STORAGE_PROVIDER === 'local' && !v.PUBLIC_API_URL) ctx.addIssue({ code: 'custom', path: ['PUBLIC_API_URL'], message: 'required in production so image URLs point at your public API address' });
      if (v.PAYMENT_WEBHOOK_SECRET && /replace-with|changeme/i.test(v.PAYMENT_WEBHOOK_SECRET)) ctx.addIssue({ code: 'custom', path: ['PAYMENT_WEBHOOK_SECRET'], message: 'still set to the example placeholder' });
    }
    if (v.STORAGE_PROVIDER === 's3' && v.NODE_ENV === 'production' && !v.S3_PRIVATE_BUCKET) {
      ctx.addIssue({ code: 'custom', path: ['S3_PRIVATE_BUCKET'], message: 'required in production: identity documents must live in a bucket that is NOT publicly readable' });
    }
    if (v.STORAGE_PROVIDER !== 's3') return;
    for (const key of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL']) {
      if (!v[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_PROVIDER=s3' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Only variable names and messages are printed, never values.
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}`);
}

if (parsed.data.NODE_ENV === 'production' && /replace-with|changeme/i.test(parsed.data.JWT_SECRET)) {
  throw new Error('Invalid environment configuration:\n  - JWT_SECRET: still set to the example placeholder');
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.EMAIL_PROVIDER === 'console') {
  // Password-reset and verification links would be written to the logs. Fine for a first deployment check, not for real users.
  console.warn('[imbehe] EMAIL_PROVIDER=console: emails are only logged, not delivered. Add a real email provider before inviting users.');
}

module.exports = Object.freeze({
  ...parsed.data,
  apiDocsEnabled: parsed.data.API_DOCS_ENABLED ? parsed.data.API_DOCS_ENABLED === 'true' : parsed.data.NODE_ENV !== 'production',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  uploadDir: path.resolve(parsed.data.UPLOAD_DIR),
  privateUploadDir: path.resolve(parsed.data.PRIVATE_UPLOAD_DIR), // never served by express.static
  publicApiUrl: (parsed.data.PUBLIC_API_URL || `http://localhost:${parsed.data.PORT}`).replace(/\/$/, ''),
});
