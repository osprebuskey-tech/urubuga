const asyncHandler = require('../middleware/asyncHandler');
const dashboardService = require('../services/dashboardService');
const moderationService = require('../services/moderationService');
const activityReport = require('../services/activityReportService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.dashboard = asyncHandler(async (req, res) => {
  ok(res, { dashboard: await dashboardService.dashboard() });
});

exports.reports = asyncHandler(async (req, res) => {
  ok(res, { report: await dashboardService.report(req.validated.query) });
});

exports.setUserStatus = asyncHandler(async (req, res) => {
  ok(res, { user: await moderationService.setStatus(req.user, req.validated.params.id, req.validated.body, ctxOf(req)) });
});
exports.activityReport = asyncHandler(async (req, res) => {
  ok(res, { report: await activityReport.report(req.validated.query) });
});
