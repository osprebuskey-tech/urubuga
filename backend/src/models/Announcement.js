const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const ANNOUNCEMENT_STATUS = ['active', 'hidden'];

// A short line the super administrator publishes. Active ones scroll in the bar at the top of every page.
const announcementSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    linkUrl: { type: String, trim: true, maxlength: 300 }, // optional: where "read more" goes
    status: { type: String, enum: ANNOUNCEMENT_STATUS, default: 'active' },
    expiresAt: { type: Date }, // optional: it stops showing by itself after this moment
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: toJSONOptions(['createdBy']) },
);

announcementSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
module.exports.ANNOUNCEMENT_STATUS = ANNOUNCEMENT_STATUS;
