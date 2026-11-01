const crypto = require('crypto');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const { sign, verify } = require('./signature');

// A FAKE gateway for development and tests. It moves no money. It exists so the real webhook pipeline
// (signature check, idempotency, amount check) can be exercised end to end. The config schema refuses it in production.
module.exports = {
  name: 'sandbox',
  label: 'Test-mode payment (no real money)',
  online: true,

  async createCheckout() {
    return { reference: `sbx_${crypto.randomBytes(12).toString('hex')}` };
  },

  /** Returns a normalised event or throws. Never trust the body until the signature has been verified. */
  verifyWebhook({ rawBody, headers }) {
    const ok = verify({
      secret: env.PAYMENT_WEBHOOK_SECRET,
      timestamp: headers['x-imbehe-timestamp'],
      signature: headers['x-imbehe-signature'],
      rawBody,
    });
    if (!ok) throw new AppError(401, 'Invalid webhook signature', 'INVALID_SIGNATURE');
    let body;
    try { body = JSON.parse(rawBody.toString('utf8')); } catch { throw new AppError(400, 'Malformed webhook body', 'INVALID_WEBHOOK'); }
    if (!body?.id || !body?.type || !body?.data?.reference) throw new AppError(400, 'Malformed webhook body', 'INVALID_WEBHOOK');
    return { id: String(body.id), type: body.type, reference: String(body.data.reference), amount: body.data.amount, currency: body.data.currency, reason: body.data.reason };
  },

  /** What the fake gateway would send. Used by the dev "simulate" endpoint and by tests. */
  buildSignedEvent({ reference, amount, type = 'payment.succeeded', reason, id = `evt_${crypto.randomBytes(8).toString('hex')}`, timestamp = Math.floor(Date.now() / 1000) }) {
    const rawBody = Buffer.from(JSON.stringify({ id, type, data: { reference, amount, currency: 'RWF', ...(reason ? { reason } : {}) } }));
    return {
      rawBody,
      headers: { 'x-imbehe-timestamp': String(timestamp), 'x-imbehe-signature': sign(env.PAYMENT_WEBHOOK_SECRET, String(timestamp), rawBody) },
    };
  },
};
