const router = require('express').Router();
const ctrl = require('../controllers/verificationController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { singleDocument } = require('../middleware/upload');
const { writeLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/verificationValidators');

// Identity and registration documents. Stored privately; the file is only ever streamed to its owner or to staff reviewing an application.
router.use(requireAuth);
router.get('/', ctrl.myDocuments);
router.post('/:kind', writeLimiter, validate({ params: v.documentKindParams }), singleDocument, ctrl.uploadDocument);
router.get('/:id/file', validate({ params: idParams }), ctrl.documentFile);

module.exports = router;
