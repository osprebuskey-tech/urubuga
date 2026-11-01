/** Consistent success envelope: { success: true, data, meta? } */
function ok(res, data, { status = 200, meta } = {}) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

module.exports = { ok };
