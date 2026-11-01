const { z } = require('zod');
const { BOOKING_STATUS } = require('../models/Booking');
const { paginationQuery, optionalParam } = require('./commonValidators');

const listBookingsQuery = paginationQuery.extend({
  scope: optionalParam(z.enum(['mine', 'all'])),
  as: optionalParam(z.enum(['customer', 'provider'])),
  status: optionalParam(z.enum([...BOOKING_STATUS, 'active'])),
});

// A reason is mandatory when a job is cancelled or a problem is reported, so the other side and any admin can see why.
const updateBookingStatusBody = z
  .object({ status: z.enum(BOOKING_STATUS), note: z.string().trim().max(500).optional() })
  .strict()
  .superRefine((v, ctx) => {
    if (['cancelled', 'disputed'].includes(v.status) && (!v.note || v.note.length < 10)) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Give a reason of at least 10 characters' });
    }
  });

module.exports = { listBookingsQuery, updateBookingStatusBody };
