const router = require('express').Router();
const ctrl = require('../controllers/disputeController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { singleImage } = require('../middleware/upload');
const { writeLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/disputeValidators');

// A dispute is opened by reporting a problem on a job (PATCH /api/bookings/:id/status), never created directly.
// Only the two parties and administrators can see or post to one; everyone else gets 404.
router.use(requireAuth);

router.get('/', validate({ query: v.listDisputesQuery }), ctrl.list);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.post('/:id/messages', writeLimiter, validate({ params: idParams, body: v.messageBody }), ctrl.addMessage);
router.post('/:id/evidence', writeLimiter, validate({ params: idParams }), singleImage, ctrl.addEvidence);

module.exports = router;
