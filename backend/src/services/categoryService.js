const ServiceCategory = require('../models/ServiceCategory');
const ServiceListing = require('../models/ServiceListing');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const { slugify } = require('../utils/slug');
const audit = require('./auditService');

const toSubcategories = (names = []) => {
  const seen = new Set();
  return names
    .map((name) => ({ name, slug: slugify(name) }))
    .filter((s) => s.slug && !seen.has(s.slug) && seen.add(s.slug));
};

const notFound = () => new AppError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
const exists = () => new AppError(409, 'A category with this name already exists', 'CATEGORY_EXISTS');

function list({ includeDisabled = false } = {}) {
  const filter = includeDisabled ? {} : { status: 'active' };
  return ServiceCategory.find(filter).sort({ sortOrder: 1, name: 1 });
}

async function create(data, admin, ctx) {
  const slug = slugify(data.name);
  if (!slug) throw new AppError(400, 'Category name is not valid', 'VALIDATION_ERROR');
  if (await ServiceCategory.exists({ slug })) throw exists();

  const category = await ServiceCategory.create({
    name: data.name,
    slug,
    description: data.description,
    subcategories: toSubcategories(data.subcategories),
    status: data.status,
    sortOrder: data.sortOrder,
  });
  await audit.record({ actor: admin._id, action: 'category.create', entityType: 'ServiceCategory', entityId: category._id, metadata: { name: category.name }, ctx, strict: true });
  return category;
}

async function update(id, data, admin, ctx) {
  const category = await ServiceCategory.findById(id);
  if (!category) throw notFound();

  if (data.name !== undefined && data.name !== category.name) {
    const slug = slugify(data.name);
    if (!slug) throw new AppError(400, 'Category name is not valid', 'VALIDATION_ERROR');
    if (await ServiceCategory.exists({ slug, _id: { $ne: category._id } })) throw exists();
    category.name = data.name;
    category.slug = slug;
  }
  if (data.description !== undefined) category.description = data.description;
  if (data.status !== undefined) category.status = data.status;
  if (data.sortOrder !== undefined) category.sortOrder = data.sortOrder;
  if (data.subcategories !== undefined) category.subcategories = toSubcategories(data.subcategories);

  await category.save();
  await audit.record({ actor: admin._id, action: 'category.update', entityType: 'ServiceCategory', entityId: category._id, metadata: { fields: Object.keys(data) }, ctx, strict: true });
  return category;
}

async function remove(id, admin, ctx) {
  const category = await ServiceCategory.findById(id);
  if (!category) throw notFound();

  const [listings, providers] = await Promise.all([
    ServiceListing.exists({ category: category._id }),
    ProviderProfile.exists({ categories: category._id }),
  ]);
  if (listings || providers) {
    throw new AppError(409, 'This category is in use. Disable it instead of deleting it.', 'CATEGORY_IN_USE');
  }

  await category.deleteOne();
  await audit.record({ actor: admin._id, action: 'category.delete', entityType: 'ServiceCategory', entityId: category._id, metadata: { name: category.name }, ctx, strict: true });
}

module.exports = { list, create, update, remove };
