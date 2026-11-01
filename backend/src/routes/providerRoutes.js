const router = require('express').Router();
const { requireTerms } = require('../middleware/requirements');
const ctrl = require('../controllers/providerController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { singleImage } = require('../middleware/upload');
const { searchLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const { myListingsQuery } = require('../validators/listingValidators');
const v = require('../validators/providerValidators');
const reviewCtrl = require('../controllers/reviewController');
const { listProviderReviewsQuery } = require('../validators/reviewValidators');

router.get('/', searchLimiter, validate({ query: v.listProvidersQuery }), ctrl.list);

// /me routes come before /:id so "me" is never parsed as an id.
const providerOnly = [requireAuth, requireRoles(ROLES.PROVIDER)];
router.get('/me', ...providerOnly, ctrl.getMe);
router.put('/me', ...providerOnly, validate({ body: v.upsertProfileBody }), ctrl.upsertMe);
router.post('/me/verification-request', ...providerOnly, requireTerms, validate({ body: v.verificationRequestBody }), ctrl.requestVerification);
router.post('/me/avatar', ...providerOnly, singleImage, ctrl.uploadAvatar);
router.post('/me/portfolio', ...providerOnly, singleImage, validate({ body: v.portfolioItemBody }), ctrl.addPortfolio);
router.delete('/me/portfolio/:id', ...providerOnly, validate({ params: v.portfolioItemParams }), ctrl.removePortfolio);
router.get('/me/services', ...providerOnly, validate({ query: myListingsQuery }), ctrl.listMyServices);

router.get('/:id/reviews', searchLimiter, validate({ params: idParams, query: listProviderReviewsQuery }), reviewCtrl.listForProvider);
router.get('/:id', validate({ params: idParams }), ctrl.getPublic);

module.exports = router;
