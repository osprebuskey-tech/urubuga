const router = require('express').Router();
const ctrl = require('../controllers/verificationController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles, requireVerifiedEmail } = require('../middleware/auth');
const { requireTerms } = require('../middleware/requirements');
const { writeLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const v = require('../validators/verificationValidators');

// The provider's side of paid verification. Staff review lives under /api/admin.
router.use(requireAuth);
const provider = requireRoles(ROLES.PROVIDER);

// Anyone signed in may see the fee: applicants are shown it before they submit.
router.get('/fee', ctrl.fee);
router.get('/me', provider, ctrl.mine);
router.post('/apply', provider, requireVerifiedEmail, requireTerms, writeLimiter, ctrl.apply);
router.post('/payment', provider, requireVerifiedEmail, writeLimiter, validate({ body: v.paymentBody }), ctrl.pay);
router.post('/payment/cancel', provider, ctrl.cancelPay);
router.post('/respond', provider, writeLimiter, validate({ body: v.respondBody }), ctrl.respond);
// Development only (404 unless the sandbox gateway is on and NODE_ENV is not production).
router.post('/payment/sandbox/:outcome', provider, validate({ params: v.sandboxParams }), ctrl.sandbox);

module.exports = router;
