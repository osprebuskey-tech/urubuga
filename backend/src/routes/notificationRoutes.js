const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { idParams } = require('../validators/commonValidators');
const { listNotificationsQuery } = require('../validators/notificationValidators');

router.use(requireAuth);

router.get('/', validate({ query: listNotificationsQuery }), ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.post('/read-all', ctrl.markAllRead);
router.patch('/:id/read', validate({ params: idParams }), ctrl.markRead);

module.exports = router;
