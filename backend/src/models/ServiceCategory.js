const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  },
  { _id: false },
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    subcategories: { type: [subcategorySchema], default: [] },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

categorySchema.index({ status: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.model('ServiceCategory', categorySchema);
