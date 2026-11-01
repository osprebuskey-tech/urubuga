const router = require('express').Router();
const ctrl = require('../controllers/categoryController');
const validate = require('../middleware/validate');
const { requireAuth, optionalAuth, requireRoles } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/categoryValidators');

router.get('/', optionalAuth, validate({ query: v.listCategoriesQuery }), ctrl.list);

const adminOnly = [requireAuth, requireRoles(ROLES.ADMIN)];
router.post('/', ...adminOnly, validate({ body: v.createCategoryBody }), ctrl.create);
router.put('/:id', ...adminOnly, validate({ params: idParams, body: v.updateCategoryBody }), ctrl.update);
router.delete('/:id', ...adminOnly, validate({ params: idParams }), ctrl.remove);

module.exports = router;
