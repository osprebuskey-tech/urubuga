// All money is a whole number of Rwandan francs. Rates are basis points (1200 = 12.00%).
// Nothing here uses floating point for anything that could round wrongly.

/** Commission on a gross amount, rounded to the nearest franc (halves round up). 100000 at 1200 bps = 12000. */
function calculateCommission(gross, rateBps) {
  if (!Number.isInteger(gross) || gross < 0) throw new RangeError('gross must be a whole number of RWF');
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new RangeError('rateBps must be a whole number from 0 to 10000');
  return Math.round((gross * rateBps) / 10000); // gross <= ~1e9 and rateBps <= 1e4, so the product stays far below 2^53
}

/** Splits a gross amount into the platform's commission and the provider's share. */
function splitGross(gross, rateBps) {
  const commission = calculateCommission(gross, rateBps);
  return { commission, provider: gross - commission };
}

/**
 * How much of a refund comes out of the platform's commission versus the provider's share: proportional to the original
 * split, and exact in total (the final refund takes whatever is left, so rounding never leaves a franc behind).
 */
function splitRefund({ amount, commissionAmount, refundedSoFar, commissionRefundedSoFar, refund }) {
  const isFinal = refundedSoFar + refund === amount;
  // BigInt: refund * commission can exceed 2^53 for large payments.
  const proportional = Number((BigInt(refund) * BigInt(commissionAmount) + BigInt(amount) / 2n) / BigInt(amount));
  const commissionPart = isFinal ? commissionAmount - commissionRefundedSoFar : Math.min(proportional, commissionAmount - commissionRefundedSoFar);
  return { commissionPart, providerPart: refund - commissionPart };
}

module.exports = { calculateCommission, splitGross, splitRefund };
