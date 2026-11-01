const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const manual = require('./manualProvider');
const sandbox = require('./sandboxProvider');

/**
 * The payment abstraction. A gateway is a module with:
 *   name, label, online
 *   createCheckout(payment)            -> { reference?, checkoutUrl?, instructions? }
 *   verifyWebhook({ rawBody, headers }) -> { id, type, reference, amount, currency, reason? }   (online gateways)
 * To add a real mobile money gateway: write its module, add it to the registry and to GATEWAYS in models/Payment.js and
 * PAYMENT_GATEWAY in config/env.js. paymentService does not change.
 */
const registry = { manual, ...(env.PAYMENT_GATEWAY === 'sandbox' ? { sandbox } : {}) };

const enabledGateways = () => Object.keys(registry);
const defaultGateway = () => (registry[env.PAYMENT_GATEWAY] ? env.PAYMENT_GATEWAY : 'manual');

function getProvider(name) {
  const provider = registry[name];
  if (!provider) throw new AppError(400, 'That payment method is not available', 'GATEWAY_NOT_AVAILABLE');
  return provider;
}

const options = () => enabledGateways().map((name) => ({ name, label: registry[name].label, online: registry[name].online, ...(name === 'manual' ? { instructions: env.PAYMENT_MANUAL_INSTRUCTIONS } : {}) }));

module.exports = { getProvider, enabledGateways, defaultGateway, options, sandboxEnabled: () => Boolean(registry.sandbox) && env.NODE_ENV !== 'production' };
