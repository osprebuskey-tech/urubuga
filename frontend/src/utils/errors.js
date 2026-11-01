/** { "location.district": "Required" } from a VALIDATION_ERROR response, so forms can show errors beside fields. */
export function fieldErrors(err) {
  const out = {};
  if (err?.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
    for (const d of err.details) if (d.field && !out[d.field]) out[d.field] = d.message;
  }
  return out;
}

/** A message that is always safe to show. */
export const errorMessage = (err) => err?.message || 'Something went wrong. Please try again.';

/** First server-side error for a field or any of its array items ("skills" also matches "skills.2"). */
export function errorFor(errors, name) {
  if (errors[name]) return errors[name];
  const key = Object.keys(errors).find((k) => k.startsWith(`${name}.`));
  return key ? errors[key] : undefined;
}
