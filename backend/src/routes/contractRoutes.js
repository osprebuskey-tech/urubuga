const router = require('express').Router();
const ctrl = require('../controllers/verificationController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/verificationValidators');

// Only the customer, the provider and administrators can open a contract (the service answers 404 to everyone else).
router.use(requireAuth);
router.get('/by-booking/:id', validate({ params: idParams }), ctrl.contractByBooking);
router.get('/:id', validate({ params: idParams }), ctrl.contract);
router.post('/:id/accept', writeLimiter, validate({ params: idParams, body: v.acceptContractBody }), ctrl.acceptContract);
router.post('/:id/propose', writeLimiter, validate({ params: idParams, body: v.proposeContractBody }), ctrl.proposeContract);

module.exports = router;
