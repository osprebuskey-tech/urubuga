const asyncHandler = require('../middleware/asyncHandler');
const searchService = require('../services/searchService');
const { ok } = require('../utils/response');

exports.search = asyncHandler(async (req, res) => {
  ok(res, await searchService.searchAll(req.validated.query));
});
