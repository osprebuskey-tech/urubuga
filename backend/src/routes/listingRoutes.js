const router = require('express').Router();
const { requireTerms } = require('../middleware/requirements');
const ctrl = require('../controllers/listingController');
const validate = require('../middleware/validate');
const { requireAuth, optionalAuth, requireRoles, requireVerifiedEmail } = require('../middleware/auth');
const { singleImage } = require('../middleware/upload');
const { searchLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/listingValidators');

const providerOnly = [requireAuth, requireRoles(ROLES.PROVIDER)];

router.get('/', searchLimiter, validate({ query: v.listListingsQuery }), ctrl.list);
router.post('/', ...providerOnly, requireVerifiedEmail, requireTerms, validate({ body: v.createListingBody }), ctrl.create);

router.get('/:id', optionalAuth, validate({ params: idParams }), ctrl.getOne);
router.put('/:id', ...providerOnly, validate({ params: idParams, body: v.updateListingBody }), ctrl.update);
router.delete('/:id', ...providerOnly, validate({ params: idParams }), ctrl.remove);

router.post('/:id/images', ...providerOnly, validate({ params: idParams }), singleImage, ctrl.addImage);
router.delete('/:id/images/:imageId', ...providerOnly, validate({ params: v.imageParams }), ctrl.removeImage);

module.exports = router;
