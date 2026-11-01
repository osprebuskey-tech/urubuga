import { describe, expect, it } from 'vitest';
import { budgetLabel, compact, formatRWF, initials, isoDay, plural, priceLabel, unslug } from './format';
import { errorFor, fieldErrors } from './errors';

describe('formatRWF', () => {
  it('formats whole francs with separators', () => {
    expect(formatRWF(15000)).toBe('15,000 RWF');
    expect(formatRWF(0)).toBe('0 RWF');
  });
  it('returns an empty string for missing values', () => {
    expect(formatRWF(undefined)).toBe('');
    expect(formatRWF(null)).toBe('');
  });
});

describe('priceLabel', () => {
  it('shows "From" for fixed prices', () => expect(priceLabel({ pricingType: 'fixed', priceFrom: 20000 })).toBe('From 20,000 RWF'));
  it('adds the unit for hourly prices', () => expect(priceLabel({ pricingType: 'hourly', priceFrom: 5000 })).toBe('From 5,000 RWF / hour'));
  it('never shows a price for quotation-based listings', () => {
    expect(priceLabel({ pricingType: 'quotation' })).toBe('Price on quotation');
    expect(priceLabel({ pricingType: 'quotation', priceFrom: 1000 })).toBe('Price on quotation');
  });
});

describe('small helpers', () => {
  it('initials', () => {
    expect(initials('Eric Mugisha')).toBe('EM');
    expect(initials('')).toBe('?');
  });
  it('plural', () => {
    expect(plural(1, 'job')).toBe('1 job');
    expect(plural(3, 'job')).toBe('3 jobs');
  });
  it('unslug', () => expect(unslug('computer-repair')).toBe('Computer repair'));
  it('compact drops empty values but keeps false and 0', () => {
    expect(compact({ a: '', b: undefined, c: null, d: 0, e: false, f: 'x' })).toEqual({ d: 0, e: false, f: 'x' });
  });
});

describe('field errors', () => {
  const err = { code: 'VALIDATION_ERROR', details: [{ field: 'location.district', message: 'Required' }, { field: 'skills.2', message: 'Too long' }] };
  it('maps API validation details to fields', () => expect(fieldErrors(err)).toEqual({ 'location.district': 'Required', 'skills.2': 'Too long' }));
  it('ignores other errors', () => expect(fieldErrors({ code: 'FORBIDDEN' })).toEqual({}));
  it('errorFor matches array items', () => expect(errorFor(fieldErrors(err), 'skills')).toBe('Too long'));
});

describe('budgetLabel', () => {
  it('describes ranges and one-sided budgets', () => {
    expect(budgetLabel({ budgetMin: 20000, budgetMax: 50000 })).toBe('20,000–50,000 RWF');
    expect(budgetLabel({ budgetMax: 50000 })).toBe('Up to 50,000 RWF');
    expect(budgetLabel({ budgetMin: 20000 })).toBe('From 20,000 RWF');
    expect(budgetLabel({})).toBe('No budget given');
  });
  it('treats a zero budget as a real value', () => expect(budgetLabel({ budgetMin: 0, budgetMax: 0 })).toBe('0–0 RWF'));
});

describe('isoDay', () => {
  it('returns a YYYY-MM-DD string, offset by days', () => {
    expect(isoDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isoDay(1) > isoDay(0)).toBe(true);
  });
});
