const AppError = require('../utils/AppError');

module.exports = (req, res, next) => next(new AppError(404, 'Route not found', 'NOT_FOUND'));
