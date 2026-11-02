const asyncHandler = require('../middleware/asyncHandler');
const verification = require('../services/verificationService');
const settings = require('../services/settingsService');
const documents = require('../services/documentService');
const terms = require('../services/termsService');
const contracts = require('../services/contractService');
const ratings = require('../services/ratingsAdminService');
const reviews = require('../services/reviewService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const v = (req) => req.validated;
const paged = (res, { items, total }, q) => ok(res, items, { meta: buildMeta({ page: q.page, limit: q.limit, total }) });

// ---- Applicant ----
exports.fee = asyncHandler(async (req, res) => ok(res, { fee: await settings.getVerificationFee() }));
exports.mine = asyncHandler(async (req, res) => ok(res, await verification.getMine(req.user)));
exports.apply = asyncHandler(async (req, res) => ok(res, { application: await verification.apply(req.user, ctxOf(req)) }, { status: 201 }));
exports.pay = asyncHandler(async (req, res) => ok(res, { payment: await verification.startPayment(req.user, v(req).body, ctxOf(req)) }, { status: 201 }));
exports.cancelPay = asyncHandler(async (req, res) => ok(res, { payment: await verification.cancelPayment(req.user) }));
exports.respond = asyncHandler(async (req, res) => ok(res, { application: await verification.respond(req.user, v(req).body) }));
exports.mineAccount = asyncHandler(async (req, res) => ok(res, await verification.getMineAccount(req.user)));
exports.applyAccount = asyncHandler(async (req, res) => ok(res, { application: await verification.applyAccount(req.user, ctxOf(req)) }, { status: 201 }));
exports.respondAccount = asyncHandler(async (req, res) => ok(res, { application: await verification.respond(req.user, v(req).body, 'account') }));
exports.sandbox = asyncHandler(async (req, res) => ok(res, await verification.simulateSandbox(req.user, v(req).params.outcome)));

// ---- Staff ----
exports.list = asyncHandler(async (req, res) => paged(res, await verification.listForStaff(v(req).query), v(req).query));
exports.get = asyncHandler(async (req, res) => ok(res, { application: await verification.getForStaff(v(req).params.id, req.user, ctxOf(req)) }));
const action = (name) => asyncHandler(async (req, res) => ok(res, { application: await verification[name](req.user, v(req).params.id, v(req).body, ctxOf(req)) }));
exports.startReview = action('startReview');
exports.requestInfo = action('requestInfo');
exports.recommend = action('recommend');
exports.reject = action('reject');
exports.decide = action('decide');
exports.reopen = action('reopen');
exports.payments = asyncHandler(async (req, res) => paged(res, await verification.listPayments(v(req).query, req.user), v(req).query));
exports.confirmPayment = asyncHandler(async (req, res) => ok(res, { payment: await verification.confirmManual(req.user, v(req).params.id, v(req).body, ctxOf(req)) }));
exports.setFee = asyncHandler(async (req, res) => ok(res, { fee: await settings.setVerificationFee(req.user, v(req).body, ctxOf(req)) }));

// ---- Documents ----
exports.myDocuments = asyncHandler(async (req, res) => ok(res, await documents.status(req.user)));
exports.uploadDocument = asyncHandler(async (req, res) => ok(res, { document: await documents.upload(req.user, v(req).params.kind, req.document, ctxOf(req)) }, { status: 201 }));
exports.documentFile = asyncHandler(async (req, res) => {
  const file = await documents.readForViewer(req.user, v(req).params.id, ctxOf(req));
  res.set({
    'Content-Type': file.mime,
    'Content-Disposition': `inline; filename="${file.name.replace(/"/g, '')}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-site',
  });
  res.send(file.buffer);
});

// ---- Terms ----
exports.termsPublic = asyncHandler(async (req, res) => ok(res, { terms: (await terms.current()).toJSON() }));
exports.termsStatus = asyncHandler(async (req, res) => ok(res, await terms.statusFor(req.user)));
exports.acceptTerms = asyncHandler(async (req, res) => ok(res, await terms.accept(req.user, v(req).body.version, ctxOf(req))));
exports.publishTerms = asyncHandler(async (req, res) => ok(res, { terms: (await terms.publish(req.user, v(req).body, ctxOf(req))).toJSON() }, { status: 201 }));
exports.termsVersions = asyncHandler(async (req, res) => ok(res, await terms.listVersions()));

// ---- Contracts ----
exports.contractByBooking = asyncHandler(async (req, res) => ok(res, { contract: await contracts.getForBooking(req.user, v(req).params.id) }));
exports.contract = asyncHandler(async (req, res) => ok(res, { contract: await contracts.getOne(req.user, v(req).params.id) }));
exports.acceptContract = asyncHandler(async (req, res) => ok(res, { contract: await contracts.accept(req.user, v(req).params.id, v(req).body, ctxOf(req)) }));
exports.proposeContract = asyncHandler(async (req, res) => ok(res, { contract: await contracts.propose(req.user, v(req).params.id, v(req).body, ctxOf(req)) }));
exports.adminContracts = asyncHandler(async (req, res) => paged(res, await contracts.listForAdmin(v(req).query), v(req).query));

// ---- Ratings ----
exports.ratingsReport = asyncHandler(async (req, res) => paged(res, await ratings.providerReport(v(req).query), v(req).query));
exports.ratingsEvidence = asyncHandler(async (req, res) => ok(res, { provider: await ratings.providerEvidence(v(req).params.id) }));
exports.recommendProvider = asyncHandler(async (req, res) => ok(res, { recommendation: await ratings.recommend(req.user, v(req).params.id, v(req).body, ctxOf(req)) }, { status: 201 }));
exports.recommendations = asyncHandler(async (req, res) => paged(res, await ratings.listRecommendations(v(req).query), v(req).query));
exports.resolveRecommendation = asyncHandler(async (req, res) => ok(res, { recommendation: await ratings.resolveRecommendation(req.user, v(req).params.id, v(req).body, ctxOf(req)) }));
exports.ratingHistory = asyncHandler(async (req, res) => {
  const q = v(req).query;
  const as = q.as || (req.user.roles.includes('provider') ? 'provider' : 'customer');
  const out = await reviews.history(req.user, { as, page: q.page, limit: q.limit });
  ok(res, { items: out.items, summary: out.summary, months: out.months }, { meta: buildMeta({ page: q.page, limit: q.limit, total: out.total }) });
});
