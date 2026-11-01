const Dispute = require('../models/Dispute');
const User = require('../models/User');
const { ADMIN_ROLES, USER_STATUS } = require('../utils/roles');
const notifications = require('./notificationService');

// Kept apart from disputeService so the booking state machine can create and close disputes without a circular import.

/** Called when a booking moves to "disputed". Opens the dispute record and tells the administrators. */
async function open({ booking, user, role, reason }) {
  let dispute;
  try {
    dispute = await Dispute.create({ booking: booking._id, customer: booking.customer, providerUser: booking.providerUser, opener: user._id, openerRole: role, reason });
  } catch (err) {
    if (err.code === 11000) return Dispute.findOne({ booking: booking._id, active: true }); // already open
    throw err;
  }
  const admins = await User.find({ roles: { $in: ADMIN_ROLES }, status: USER_STATUS.ACTIVE }).select('_id').limit(50);
  await notifications.notifyMany(admins.map((a) => a._id), {
    type: 'dispute.opened',
    title: `Dispute opened: ${booking.title}`,
    body: reason.length > 120 ? `${reason.slice(0, 117)}...` : reason,
    link: `/dashboard/disputes/${dispute._id}`,
  });
  return dispute;
}

/** Called when an administrator moves a disputed booking to completed or cancelled. */
async function markResolved({ bookingId, admin, outcome, note }) {
  return Dispute.findOneAndUpdate(
    { booking: bookingId, active: true },
    { $set: { status: 'resolved', active: false, assignedTo: admin._id, resolution: { outcome, note, by: admin._id, at: new Date() } } },
    { new: true },
  );
}

module.exports = { open, markResolved };
