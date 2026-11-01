const router = require('express').Router();
const ctrl = require('../controllers/bookingController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const reviewCtrl = require('../controllers/reviewController');
const { writeLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');
const { createReviewBody } = require('../validators/reviewValidators');
const { listBookingsQuery, updateBookingStatusBody } = require('../validators/bookingValidators');

// There is deliberately no POST /api/bookings: a booking is created by accepting a quotation, so the price
// and the two parties always come from the server's own records, never from a request body.
router.use(requireAuth);

router.get('/', validate({ query: listBookingsQuery }), ctrl.list);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.post('/:id/reviews', writeLimiter, validate({ params: idParams, body: createReviewBody }), reviewCtrl.create);
router.patch('/:id/status', validate({ params: idParams, body: updateBookingStatusBody }), ctrl.updateStatus);

module.exports = router;
