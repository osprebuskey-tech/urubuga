const router = require('express').Router();
const ctrl = require('../controllers/announcementController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/announcementValidators');

// The moving bar at the top of every page reads this without an account: only active, unexpired announcements.
router.get('/', searchLimiter, ctrl.listPublic);

// Publishing is for the super administrator alone (ordinary administrators are not admitted).
const superOnly = [requireAuth, requireRoles(ROLES.SUPER_ADMIN)];
router.get('/manage', ...superOnly, ctrl.listAll);
router.post('/', ...superOnly, validate({ body: v.createAnnouncementBody }), ctrl.create);
router.put('/:id', ...superOnly, validate({ params: idParams, body: v.updateAnnouncementBody }), ctrl.update);
router.delete('/:id', ...superOnly, validate({ params: idParams }), ctrl.remove);

module.exports = router;
