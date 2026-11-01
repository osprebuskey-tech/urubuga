const asyncHandler = require('./asyncHandler');
const termsService = require('../services/termsService');
const documentService = require('../services/documentService');
const { STAFF_ROLES } = require('../utils/roles');

const isStaffOnly = (user) => user.roles.every((r) => STAFF_ROLES.includes(r));

/** Must run after requireAuth. Blocks requesting or offering services until the CURRENT platform terms are accepted. */
const requireTerms = asyncHandler(async (req, res, next) => {
  if (!isStaffOnly(req.user)) await termsService.assertAccepted(req.user);
  next();
});
requireTerms.docs = { termsAccepted: true };

/** Must run after requireAuth. purpose: 'hire' (customers and businesses asking for a service) or 'provide' (providers applying to be verified). */
const requireDocuments = (purpose) => {
  const middleware = asyncHandler(async (req, res, next) => {
    if (!isStaffOnly(req.user)) await documentService.assertComplete(req.user, purpose);
    next();
  });
  middleware.docs = { documentsRequired: purpose };
  return middleware;
};

module.exports = { requireTerms, requireDocuments };
