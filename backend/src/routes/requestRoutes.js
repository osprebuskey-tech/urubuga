const router = require('express').Router();
const ctrl = require('../controllers/requestController');
const quotations = require('../controllers/quotationController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles, requireVerifiedEmail } = require('../middleware/auth');
const { singleImage } = require('../middleware/upload');
const { requireTerms, requireDocuments } = require('../middleware/requirements');
const { writeLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/requestValidators');
const qv = require('../validators/quotationValidators');

router.use(requireAuth);

// Who may do what is decided here and again in the services (ownership). Customers and businesses hire; providers quote.
const hiring = requireRoles(ROLES.CUSTOMER, ROLES.BUSINESS);

// Asking for a service needs the current terms accepted and the customer's identity documents uploaded.
router.post('/', hiring, requireVerifiedEmail, requireTerms, requireDocuments('hire'), writeLimiter, validate({ body: v.createRequestBody }), ctrl.create);
router.get('/', validate({ query: v.listRequestsQuery }), ctrl.list);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);
router.patch('/:id', hiring, validate({ params: idParams, body: v.updateRequestBody }), ctrl.update);

router.post('/:id/attachments', hiring, validate({ params: idParams }), singleImage, ctrl.addAttachment);
router.delete('/:id/attachments/:attachmentId', hiring, validate({ params: v.attachmentParams }), ctrl.removeAttachment);

router.post('/:id/quotations', requireRoles(ROLES.PROVIDER), requireVerifiedEmail, requireTerms, writeLimiter, validate({ params: idParams, body: qv.createQuotationBody }), quotations.create);
router.get('/:id/quotations', validate({ params: idParams }), quotations.list);

module.exports = router;
