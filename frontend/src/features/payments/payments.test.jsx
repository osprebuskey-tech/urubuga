import { describe, expect, it } from 'vitest';
import { validateManual, validatePayout, validateRefund } from './AdminPaymentActions';
import { bpsLabel, percentToBps } from '../../utils/format';

describe('commission helpers', () => {
  it('shows basis points as a percentage', () => {
    expect(bpsLabel(1200)).toBe('12%');
    expect(bpsLabel(1250)).toBe('12.5%');
    expect(bpsLabel(0)).toBe('0%');
  });
  it('turns a typed percentage into whole basis points, rejecting anything out of range', () => {
    expect(percentToBps('12')).toBe(1200);
    expect(percentToBps('12.5')).toBe(1250);
    expect(percentToBps('0')).toBe(0);
    expect(percentToBps('50')).toBe(5000);
    for (const bad of ['', '51', '-1', '12.555', 'abc', '1e2', '12%']) expect(percentToBps(bad)).toBeNull();
  });
});

describe('admin money form validation', () => {
  it('needs a transaction reference to record a payment', () => {
    expect(validateManual({ reference: 'ab' }).reference).toBeTruthy();
    expect(validateManual({ reference: 'MTN-884213' })).toEqual({});
  });
  it('limits a refund to what is still refundable, in whole francs, with a reason', () => {
    expect(validateRefund({ amount: '10000', reason: 'Work not done' }, 40000)).toEqual({});
    expect(validateRefund({ amount: '50000', reason: 'Work not done' }, 40000).amount).toBeTruthy();
    expect(validateRefund({ amount: '10.5', reason: 'Work not done' }, 40000).amount).toBeTruthy();
    expect(validateRefund({ amount: '0', reason: 'Work not done' }, 40000).amount).toBeTruthy();
    expect(validateRefund({ amount: '100', reason: 'no' }, 40000).reason).toBeTruthy();
  });
  it('limits a payout to what is due; an empty amount means everything due', () => {
    expect(validatePayout({ amount: '', reference: 'MOMO-1' }, 35200)).toEqual({});
    expect(validatePayout({ amount: '36000', reference: 'MOMO-1' }, 35200).amount).toBeTruthy();
    expect(validatePayout({ amount: '1000', reference: '' }, 35200).reference).toBeTruthy();
  });
});
