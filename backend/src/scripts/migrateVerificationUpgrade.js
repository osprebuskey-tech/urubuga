/*
 * One-time, idempotent migration for the paid-verification / contracts / contact-privacy upgrade. Safe to run more than once.
 *   npm run migrate:verification-upgrade
 * What it does (nothing is deleted):
 *   1. Every provider profile that is "pending" or "needs_info" gets a VerificationApplication with payment WAIVED, so people who
 *      applied before fees existed are not blocked. Their status is mapped to under_review / more_info_required.
 *   2. Every booking without a contract gets one built from its quotation, marked legacy. If the job had already started or finished,
 *      the contract is marked accepted (it was running before contracts existed) and the provider's acceptance is backfilled so contact
 *      details stay visible. Jobs still waiting to start get a PENDING contract that both sides must accept.
 *   3. Providers get providerType "individual" where it was missing.
 *   4. Nobody is made verified or unverified by this script. Existing verified providers stay verified.
 */
const { connectDB, disconnectDB } = require('../config/db');
const ProviderProfile = require('../models/ProviderProfile');
const VerificationApplication = require('../models/VerificationApplication');
const Booking = require('../models/Booking');
const Contract = require('../models/Contract');
const Quotation = require('../models/Quotation');
const ServiceRequest = require('../models/ServiceRequest');
const termsService = require('../services/termsService');
const contractService = require('../services/contractService');
const { buildContent } = require('../services/contractTemplate');

async function main() {
  await connectDB();
  const out = { applications: 0, contracts: 0, providerTypes: 0 };

  const types = await ProviderProfile.updateMany({ providerType: { $exists: false } }, { $set: { providerType: 'individual' } });
  out.providerTypes = types.modifiedCount;

  const open = await ProviderProfile.find({ verificationStatus: { $in: ['pending', 'needs_info'] } });
  for (const p of open) {
    if (await VerificationApplication.exists({ provider: p._id, active: true })) continue;
    const asking = p.verificationStatus === 'needs_info';
    await VerificationApplication.create({
      provider: p._id, user: p.user, fee: { amount: 0, currency: 'RWF' }, status: asking ? 'more_info_required' : 'under_review', paymentStatus: 'waived',
      infoRequests: asking && p.verificationNote ? [{ by: p.user, message: p.verificationNote, at: new Date() }] : [],
      history: [{ at: new Date(), role: 'system', action: 'migrated', to: asking ? 'more_info_required' : 'under_review', note: 'Applied before verification fees existed; fee waived' }],
    });
    out.applications += 1;
  }

  const termsVersion = (await termsService.current()).version;
  const bookings = await Booking.find({}).select('_id status request quotation customer providerUser provider startedAt createdAt');
  const have = new Set((await Contract.find({}).select('booking')).map((c) => String(c.booking)));
  for (const b of bookings) {
    if (have.has(String(b._id))) continue;
    const [request, quotation] = await Promise.all([ServiceRequest.findById(b.request), Quotation.findById(b.quotation)]);
    if (!request || !quotation) continue;
    const content = buildContent({ request, quotation, termsVersion });
    const started = ['in_progress', 'completed', 'disputed'].includes(b.status) || Boolean(b.startedAt);
    const at = b.startedAt || b.createdAt || new Date();
    const acceptances = started ? [{ role: 'customer', user: b.customer, acceptedAt: at }, { role: 'provider', user: b.providerUser, acceptedAt: at }] : [];
    await Contract.create({
      booking: b._id, customer: b.customer, providerUser: b.providerUser, provider: b.provider, legacy: true, currentVersion: 1,
      status: started ? 'accepted' : 'pending', acceptedAt: started ? at : undefined,
      versions: [{ number: 1, content, contentHash: contractService.hashOf(content), createdAt: new Date(), note: 'Created by the migration from the accepted quotation', acceptances }],
    });
    if (started) await Booking.updateOne({ _id: b._id, providerAcceptedAt: { $exists: false } }, { $set: { providerAcceptedAt: at } });
    out.contracts += 1;
  }

  console.log('Migration done:', out);
  await disconnectDB();
}

main().catch(async (err) => { console.error(err); try { await disconnectDB(); } catch { /* ignore */ } process.exit(1); });
