const router = require('express').Router();
const ctrl = require('../controllers/reviewController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const { reportReviewBody } = require('../validators/reviewValidators');

// Only the provider who was reviewed can report a review (the service also checks it is theirs).
router.post('/:id/report', requireAuth, requireRoles(ROLES.PROVIDER), writeLimiter, validate({ params: idParams, body: reportReviewBody }), ctrl.report);

module.exports = router;
