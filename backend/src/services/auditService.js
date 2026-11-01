const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

/**
 * Append an audit entry. For authentication events a logging failure must not block the user,
 * so errors are logged and swallowed. Financial/admin actions in later milestones will use
 * { strict: true } so the action fails if it cannot be audited.
 */
async function record({ actor, action, entityType, entityId, metadata, ctx = {}, strict = false, session }) {
  try {
    const entry = {
      actor,
      action,
      entityType,
      entityId,
      metadata,
      ip: ctx.ip,
      userAgent: ctx.userAgent ? String(ctx.userAgent).slice(0, 300) : undefined,
    };
    if (session) await AuditLog.create([entry], { session });
    else await AuditLog.create(entry);
  } catch (err) {
    if (strict) throw err;
    logger.error({ err, action }, 'Failed to write audit log');
  }
}

module.exports = { record };
