const router = require('express').Router();
const ctrl = require('../controllers/paymentController');
const validate = require('../middleware/validate');
const { requireAuth, requireVerifiedEmail } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/paymentValidators');

// Gateway webhooks. No login: the request is authenticated by its signature, checked inside the service.
router.post('/webhook', ctrl.webhook);
router.post('/webhook/:gateway', validate({ params: v.webhookParams }), ctrl.webhook);

router.use(requireAuth);

router.get('/options', ctrl.options);
router.get('/', validate({ query: v.listPaymentsQuery }), ctrl.list);
router.post('/checkout', requireVerifiedEmail, writeLimiter, validate({ body: v.checkoutBody }), ctrl.checkout);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.post('/:id/cancel', validate({ params: idParams }), ctrl.cancel);
// Development only (404 unless the sandbox gateway is on and NODE_ENV is not production).
router.post('/:id/sandbox/:outcome', validate({ params: v.sandboxParams }), ctrl.simulate);

module.exports = router;
