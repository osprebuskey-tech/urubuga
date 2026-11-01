const { z } = require('zod');
const { objectId } = require('./commonValidators');

const fields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  subcategories: z.array(z.string().trim().min(2).max(80)).max(30).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
};

const createCategoryBody = z.object(fields).strict();
const updateCategoryBody = z.object(fields).partial().strict();
const listCategoriesQuery = z.object({ includeDisabled: z.enum(['true', 'false']).optional() });

module.exports = { createCategoryBody, updateCategoryBody, listCategoriesQuery, objectId };
