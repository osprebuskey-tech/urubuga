const AppError = require('../utils/AppError');

/**
 * validate({ body, query, params }) with Zod schemas.
 * Parsed (typed, trimmed, defaulted) values land in req.validated.{body,query,params};
 * controllers must read from there, never from raw req.body.
 */
module.exports = (schemas) => {
  const middleware = (req, res, next) => {
    req.validated = req.validated || {};
    for (const key of ['params', 'query', 'body']) {
      if (!schemas[key]) continue;
      const result = schemas[key].safeParse(req[key]);
      if (!result.success) {
        const details = result.error.issues.map((i) => ({
          field: i.path.join('.') || key,
          message: i.message,
        }));
        return next(new AppError(400, 'Validation failed', 'VALIDATION_ERROR', details));
      }
      req.validated[key] = result.data;
    }
    return next();
  };
  middleware.docs = { schemas }; // read by src/docs/openapi.js, which documents the API from the real validators
  return middleware;
};
