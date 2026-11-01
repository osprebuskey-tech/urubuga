/**
 * Operational error: safe to show to API clients.
 * Anything that is not an AppError is treated as a bug and reported as a generic 500.
 */
class AppError extends Error {
  constructor(statusCode, message, code = 'ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = AppError;
