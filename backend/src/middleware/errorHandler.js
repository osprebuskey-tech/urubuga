const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const logger = require('../config/logger');

/** Map known library errors to AppError. Returns null for unknown (= bug) errors. */
function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'Request body is not valid JSON', 'INVALID_JSON');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new AppError(400, 'Validation failed', 'VALIDATION_ERROR', details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, `Invalid value for ${err.path}`, 'INVALID_ID');
  }
  if (err.code === 11000) {
    const details = Object.keys(err.keyPattern || {}).map((f) => ({ field: f, message: 'Already in use' }));
    return new AppError(409, 'A record with this value already exists', 'DUPLICATE_KEY', details);
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const known = toAppError(err);
  const appError = known || new AppError(500, 'Something went wrong', 'INTERNAL_ERROR');

  if (!known) (req.log || logger).error({ err }, 'Unhandled error');

  const body = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
    requestId: req.id,
  };
  // Stack traces are only ever shown in local development.
  if (!known && env.NODE_ENV === 'development' && err.stack) body.error.stack = err.stack;

  return res.status(appError.statusCode).json(body);
};
