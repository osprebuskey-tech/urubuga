const router = require('express').Router();
const ctrl = require('../controllers/verificationController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiters');
const v = require('../validators/verificationValidators');

router.get('/', searchLimiter, ctrl.termsPublic); // the text itself is public: people can read it before signing up
router.get('/status', requireAuth, ctrl.termsStatus);
router.post('/accept', requireAuth, validate({ body: v.acceptTermsBody }), ctrl.acceptTerms);

module.exports = router;
