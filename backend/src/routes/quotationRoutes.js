const router = require('express').Router();
const ctrl = require('../controllers/quotationController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { idParams } = require('../validators/commonValidators');
const { updateQuotationBody } = require('../validators/quotationValidators');

// No role gate here: the service checks whether the caller owns the request (accept / reject)
// or sent the quotation (edit / withdraw), and returns 404 to everyone else.
router.patch('/:id', requireAuth, validate({ params: idParams, body: updateQuotationBody }), ctrl.update);

module.exports = router;
