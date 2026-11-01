const { calculateCommission, splitGross, splitRefund } = require('../utils/money');

describe('commission', () => {
  test('the spec example: 100,000 RWF at 12% is 12,000 commission and 88,000 for the provider', () => {
    expect(splitGross(100000, 1200)).toEqual({ commission: 12000, provider: 88000 });
  });

  test('is a whole number of francs, rounded to the nearest, and always adds back up', () => {
    expect(calculateCommission(12345, 1200)).toBe(1481); // 1481.4
    expect(calculateCommission(12349, 1200)).toBe(1482); // 1481.88
    expect(calculateCommission(1, 1200)).toBe(0);
    for (const gross of [1, 99, 1234, 99999, 123456789]) {
      const { commission, provider } = splitGross(gross, 1250);
      expect(Number.isInteger(commission) && Number.isInteger(provider)).toBe(true);
      expect(commission + provider).toBe(gross);
    }
  });

  test('0% and 100% are the extremes', () => {
    expect(splitGross(50000, 0)).toEqual({ commission: 0, provider: 50000 });
    expect(splitGross(50000, 10000)).toEqual({ commission: 50000, provider: 0 });
  });

  test('rejects amounts and rates that are not whole numbers in range', () => {
    expect(() => calculateCommission(100.5, 1200)).toThrow(RangeError);
    expect(() => calculateCommission(-1, 1200)).toThrow(RangeError);
    expect(() => calculateCommission(1000, 12.5)).toThrow(RangeError);
    expect(() => calculateCommission(1000, 10001)).toThrow(RangeError);
  });
});

describe('refund split', () => {
  const base = { amount: 40000, commissionAmount: 4800, refundedSoFar: 0, commissionRefundedSoFar: 0 };

  test('a partial refund is split in proportion to the original 12 / 88', () => {
    expect(splitRefund({ ...base, refund: 10000 })).toEqual({ commissionPart: 1200, providerPart: 8800 });
  });

  test('refunds in several steps always add up exactly to the original split', () => {
    let refundedSoFar = 0;
    let commissionRefundedSoFar = 0;
    let providerRefunded = 0;
    for (const refund of [13337, 1, 9999, 16663]) {
      const { commissionPart, providerPart } = splitRefund({ ...base, refundedSoFar, commissionRefundedSoFar, refund });
      expect(commissionPart + providerPart).toBe(refund);
      refundedSoFar += refund;
      commissionRefundedSoFar += commissionPart;
      providerRefunded += providerPart;
    }
    expect(refundedSoFar).toBe(40000);
    expect(commissionRefundedSoFar).toBe(4800);
    expect(providerRefunded).toBe(35200);
  });

  test('is safe for very large payments', () => {
    const r = splitRefund({ amount: 1_000_000_000, commissionAmount: 500_000_000, refundedSoFar: 0, commissionRefundedSoFar: 0, refund: 999_999_999 });
    expect(r.commissionPart + r.providerPart).toBe(999_999_999);
    expect(r).toEqual({ commissionPart: 500_000_000, providerPart: 499_999_999 });
  });
});
