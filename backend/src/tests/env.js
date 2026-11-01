// Runs before every test file (jest setupFiles): configuration for the test environment only.
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused-replaced-by-memory-server';
process.env.JWT_SECRET = 'test-jwt-signing-key-for-automated-tests-0123456789';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '4';
process.env.EMAIL_PROVIDER = 'memory';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.GLOBAL_RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.SENSITIVE_RATE_LIMIT_MAX = '100000';
process.env.SEARCH_RATE_LIMIT_MAX = '100000';
process.env.WRITE_RATE_LIMIT_MAX = '100000';
process.env.PAYMENT_GATEWAY = 'sandbox';
process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret-0123456789';
process.env.STORAGE_PROVIDER = 'local';
process.env.PRIVATE_UPLOAD_DIR = path.join(os.tmpdir(), `imbehe-test-private-${process.pid}`);
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `imbehe-test-uploads-${process.pid}`);
process.env.PUBLIC_API_URL = 'http://localhost:5000';
process.env.MAX_UPLOAD_MB = '1';
process.env.MAX_DOCUMENT_MB = '1';
