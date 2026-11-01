const router = require('express').Router();
const ctrl = require('../controllers/partnerController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { singleImage } = require('../middleware/upload');
const { searchLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/partnerValidators');

// The welcome page reads this without an account: only active partners and sponsors.
router.get('/', searchLimiter, ctrl.listPublic);

// Managing the line is for the super administrator alone (ordinary administrators are not admitted).
const superOnly = [requireAuth, requireRoles(ROLES.SUPER_ADMIN)];
router.get('/manage', ...superOnly, ctrl.listAll);
router.post('/', ...superOnly, singleImage, validate({ body: v.createPartnerBody }), ctrl.create);
router.put('/:id', ...superOnly, validate({ params: idParams, body: v.updatePartnerBody }), ctrl.update);
router.post('/:id/logo', ...superOnly, validate({ params: idParams }), singleImage, ctrl.replaceLogo);
router.delete('/:id', ...superOnly, validate({ params: idParams }), ctrl.remove);

module.exports = router;
