const router = require('express').Router();
const ctrl = require('../controllers/companyController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { ROLES } = require('../utils/roles');
const { upsertCompanyBody } = require('../validators/companyValidators');

router.use(requireAuth, requireRoles(ROLES.BUSINESS));

router.get('/me', ctrl.getMe);
router.put('/me', validate({ body: upsertCompanyBody }), ctrl.upsertMe);

module.exports = router;
