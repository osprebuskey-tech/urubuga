/*
 * Creates the first account for the people who run the platform, for production (the seed script refuses to run there).
 *
 *   ADMIN_NAME="Jane Doe" ADMIN_EMAIL=jane@example.rw ADMIN_PASSWORD='a-long-passphrase-1' npm run create-super-admin
 *   ...same variables...                                                                    npm run create-admin
 *
 * Create a super admin first: they can then create administrators and payment follow-up staff from the app (they receive an
 * email to choose their own password). The password here is read from the environment, not a command-line argument,
 * which shells keep in history. Staff accounts cannot be created through the public API, by design.
 */
const bcrypt = require('bcrypt');
const { z } = require('zod');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const audit = require('../services/auditService');

const inputSchema = z.object({
  fullName: z.string().trim().min(2, 'ADMIN_NAME must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('ADMIN_EMAIL must be a valid email address').max(254),
  password: z
    .string()
    .min(12, 'ADMIN_PASSWORD must be at least 12 characters')
    .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'ADMIN_PASSWORD is too long (max 72 bytes)')
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'ADMIN_PASSWORD must contain a letter and a number'),
});

async function createAdmin(input, role = 'admin') {
  if (!['admin', 'super_admin'].includes(role)) throw new Error('Role must be admin or super_admin');
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
  const { fullName, email, password } = parsed.data;

  if (await User.exists({ email })) throw new Error(`A user with the email ${email} already exists`);

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const user = await User.create({ fullName, email, passwordHash, roles: [role], emailVerified: true });
  await audit.record({ actor: user._id, action: 'admin.created_by_script', entityType: 'User', entityId: user._id, metadata: { role }, strict: true });
  return user;
}

async function main() {
  await connectDB();
  try {
    const role = process.argv.includes('--super') ? 'super_admin' : 'admin';
    const user = await createAdmin({ fullName: process.env.ADMIN_NAME, email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }, role);
    console.log(`${role === 'super_admin' ? 'Super admin' : 'Administrator'} created: ${user.email}`);
  } finally {
    await disconnectDB();
  }
}

module.exports = { createAdmin };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
