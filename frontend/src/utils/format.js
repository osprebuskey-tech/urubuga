import { PRICING_TYPES } from './constants';

/** Whole Rwandan francs, e.g. 15000 -> "15,000 RWF". */
export function formatRWF(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '';
  return `${Math.round(Number(amount)).toLocaleString('en-US')} RWF`;
}

/** Human label for a listing's price. Quotation-based listings have no price. */
export function priceLabel({ pricingType, priceFrom }) {
  if (pricingType === 'quotation' || priceFrom === undefined || priceFrom === null) return 'Price on quotation';
  return `From ${formatRWF(priceFrom)}${pricingType === 'hourly' ? ' / hour' : ''}`;
}

export const pricingTypeLabel = (value) => PRICING_TYPES.find((p) => p.value === value)?.label ?? value;

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', options);
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "computer-repair" -> "Computer repair" (fallback when only a slug is known). */
export function unslug(slug = '') {
  const s = slug.replace(/-/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/** Drop empty values so optional API fields are omitted instead of sent as "". */
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));
}

/** "20,000 - 50,000 RWF", "Up to 50,000 RWF", "From 20,000 RWF" or "No budget given". */
export function budgetLabel({ budgetMin, budgetMax }) {
  const has = (v) => v !== undefined && v !== null;
  if (has(budgetMin) && has(budgetMax)) return `${Math.round(budgetMin).toLocaleString('en-US')}–${formatRWF(budgetMax)}`;
  if (has(budgetMax)) return `Up to ${formatRWF(budgetMax)}`;
  if (has(budgetMin)) return `From ${formatRWF(budgetMin)}`;
  return 'No budget given';
}

/** Today as YYYY-MM-DD (UTC, the same day the API uses), plus an optional offset in days. */
export const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** 1200 basis points -> "12%", 1250 -> "12.5%". */
export const bpsLabel = (bps) => `${(bps / 100).toString()}%`;

/** "12.5" (percent) -> 1250 basis points, or null when it is not a number from 0 to 50 with at most 2 decimals. */
export function percentToBps(text) {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(String(text).trim())) return null;
  const bps = Math.round(parseFloat(text) * 100);
  return bps >= 0 && bps <= 5000 ? bps : null;
}
