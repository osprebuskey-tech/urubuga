const { z } = require('zod');

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');
const idParams = z.object({ id: objectId });
const unique = (arr) => [...new Set(arr)];

// Query-string helper: "?q=" (blank) counts as "not provided" instead of failing validation.
const optionalParam = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const searchText = z.string().trim().min(2, 'Search text must be at least 2 characters').max(100);

// "YYYY-MM-DD" calendar dates (no time zones to get wrong). Converted to UTC Date objects by the schemas that use them.
const todayUtc = () => new Date().toISOString().slice(0, 10);
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`); // "2026-13-45" is an Invalid Date; toISOString() would throw on it
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Enter a real date');
const futureOrTodayDay = isoDay.refine((s) => s >= todayUtc(), 'The date cannot be in the past');

module.exports = { paginationQuery, objectId, idParams, unique, optionalParam, searchText, isoDay, futureOrTodayDay, todayUtc };
