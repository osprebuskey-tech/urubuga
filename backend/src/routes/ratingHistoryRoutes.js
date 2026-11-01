const router = require('express').Router();
const ctrl = require('../controllers/verificationController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const v = require('../validators/verificationValidators');

// "My rating history": reviews you wrote (customers) or received (providers). Mounted under /api/reviews next to the report route.
router.get('/mine', requireAuth, validate({ query: v.historyQuery }), ctrl.ratingHistory);

module.exports = router;
