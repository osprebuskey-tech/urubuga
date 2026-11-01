const router = require('express').Router();
const ctrl = require('../controllers/searchController');
const validate = require('../middleware/validate');
const { searchLimiter } = require('../middleware/rateLimiters');
const { globalSearchQuery } = require('../validators/searchValidators');

router.get('/', searchLimiter, validate({ query: globalSearchQuery }), ctrl.search);

module.exports = router;
