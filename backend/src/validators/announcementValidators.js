const { z } = require('zod');
const { ANNOUNCEMENT_STATUS } = require('../models/Announcement');

const link = z.string().trim().max(300).url().refine((u) => /^https?:\/\//i.test(u), 'Use a link that starts with http:// or https://');
const fields = {
  message: z.string().trim().min(3, 'Write at least a few words').max(200, 'Keep it short: 200 characters at most'),
  linkUrl: link,
  status: z.enum(ANNOUNCEMENT_STATUS),
  expiresAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), 'The end time must be in the future'),
};

// Empty strings clear the optional link and end time.
const createAnnouncementBody = z
  .object({
    message: fields.message,
    linkUrl: fields.linkUrl.or(z.literal('')).optional(),
    status: fields.status.optional(),
    expiresAt: fields.expiresAt.or(z.literal('')).optional(),
  })
  .strict();

const updateAnnouncementBody = z
  .object({
    message: fields.message,
    linkUrl: fields.linkUrl.or(z.literal('')),
    status: fields.status,
    expiresAt: fields.expiresAt.or(z.literal('')).or(z.null()),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Send at least one field to change', path: ['message'] });

module.exports = { createAnnouncementBody, updateAnnouncementBody };
