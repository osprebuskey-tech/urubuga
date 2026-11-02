/*
 * One-time, idempotent migration for account verification (customers and business accounts can now ask to be verified).
 *   npm run migrate:account-verification
 * What it does (nothing is deleted, nobody's verified status changes):
 *   1. Drops the older unique index on VerificationApplication.provider. It treated every application without a provider (the new
 *      account applications) as the same provider, so a second one would have been refused.
 *   2. Builds the replacement indexes: one open application per provider, and one open account application per person.
 */
const { connectDB, disconnectDB } = require('../config/db');
const VerificationApplication = require('../models/VerificationApplication');

async function main() {
  await connectDB();
  const indexes = await VerificationApplication.collection.indexes();
  const old = indexes.find((i) => i.name === 'provider_1');
  if (old) {
    await VerificationApplication.collection.dropIndex('provider_1');
    console.log('Dropped the old provider_1 index');
  }
  await VerificationApplication.createIndexes();
  console.log('Account verification indexes are in place');
  await disconnectDB();
}

main().catch(async (err) => { console.error(err); try { await disconnectDB(); } catch { /* ignore */ } process.exit(1); });
