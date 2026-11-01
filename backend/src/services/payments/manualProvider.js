const env = require('../../config/env');

// "Manual" payments happen outside the app (mobile money, bank transfer). The platform never claims they succeeded:
// an administrator confirms them after seeing the money, entering the transaction reference.
module.exports = {
  name: 'manual',
  label: 'Pay outside the app (mobile money or bank), confirmed by an administrator',
  online: false,
  async createCheckout() {
    return { reference: undefined, instructions: env.PAYMENT_MANUAL_INSTRUCTIONS };
  },
};
