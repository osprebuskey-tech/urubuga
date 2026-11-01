const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const NOTIFICATION_TYPES = [
  'request.new',
  'request.cancelled',
  'quotation.received',
  'quotation.updated',
  'quotation.withdrawn',
  'quotation.accepted',
  'quotation.rejected',
  'booking.updated',
  'review.received',
  'review.moderated',
  'payment.updated',
  'dispute.opened',
  'dispute.updated',
  'provider.verification',
  'verification.updated',
  'verification.recommendation',
  'contract.updated',
  'terms.updated',
  'account.verification',
];

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, trim: true, maxlength: 400 },
    link: { type: String, trim: true, maxlength: 200 }, // an in-app path such as /dashboard/requests/<id>
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions(['user']) },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
