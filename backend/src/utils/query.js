function buildMeta({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escape user input before using it inside a RegExp. */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** { location: { district: 'Huye' } } -> { 'location.district': 'Huye' } so $set merges nested objects. */
function toDotNotation(data) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value)) out[`${key}.${inner}`] = innerValue;
    } else {
      out[key] = value;
    }
  }
  return out;
}

module.exports = { buildMeta, escapeRegex, toDotNotation };
