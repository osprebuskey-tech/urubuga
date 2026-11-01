const crypto = require('crypto');

/**
 * Webhook signature scheme used by the sandbox gateway, and a good template for a real one:
 *   X-Imbehe-Timestamp: unix seconds
 *   X-Imbehe-Signature: hex( HMAC-SHA256( secret, `${timestamp}.${rawBody}` ) )
 * The timestamp is inside the signed text, so a captured request cannot be replayed later.
 * A real gateway documents its own scheme; put it in that gateway's provider module.
 */
function sign(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

function verify({ secret, timestamp, signature, rawBody, toleranceSec = 300, now = Date.now() }) {
  if (!secret || !timestamp || !signature || !Buffer.isBuffer(rawBody)) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > toleranceSec) return false;
  const expected = Buffer.from(sign(secret, timestamp, rawBody), 'hex');
  let given;
  try { given = Buffer.from(String(signature), 'hex'); } catch { return false; }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected); // constant-time compare
}

module.exports = { sign, verify };
