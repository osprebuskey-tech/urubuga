const { z } = require('zod');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');

const phone = z
  .string()
  .trim()
  .regex(/^(\+250|250|0)?7[2389]\d{7}$/, 'Enter a valid Rwandan mobile number')
  .transform((v) => `+250${v.replace(/^(\+250|250|0)/, '')}`);

const upsertCompanyBody = z
  .object({
    companyName: z.string().trim().min(2).max(150),
    registrationNumber: z.string().trim().regex(/^[A-Za-z0-9-]{5,30}$/, 'Invalid registration number').optional(),
    industry: z.string().trim().max(80).optional(),
    description: z.string().trim().max(1000).optional(),
    website: z.string().trim().url().max(200).optional(),
    address: z
      .object({
        district: z.enum([...RWANDA_DISTRICTS]).optional(),
        sector: z.string().trim().max(60).optional(),
        street: z.string().trim().max(120).optional(),
      })
      .strict()
      .optional(),
    contactPerson: z
      .object({ name: z.string().trim().max(100).optional(), phone: phone.optional() })
      .strict()
      .optional(),
  })
  .strict();

module.exports = { upsertCompanyBody };
