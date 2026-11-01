const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const User = require('../models/User');
const ServiceCategory = require('../models/ServiceCategory');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceListing = require('../models/ServiceListing');
const ServiceRequest = require('../models/ServiceRequest');
const Quotation = require('../models/Quotation');
const Booking = require('../models/Booking');
const Contract = require('../models/Contract');
const UserDocument = require('../models/UserDocument');
const TermsAcceptance = require('../models/TermsAcceptance');
const PlatformSetting = require('../models/PlatformSetting');
const VerificationApplication = require('../models/VerificationApplication');
const termsService = require('../services/termsService');
const contractService = require('../services/contractService');
const { buildContent } = require('../services/contractTemplate');
const { getOutbox } = require('../services/emailService');

const PASSWORD = 'Passw0rd!x';

const api = () => request(app);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const validRegistration = (overrides = {}) => ({
  fullName: 'Aline Uwase',
  email: 'aline@example.com',
  phone: '0788123456',
  password: PASSWORD,
  ...overrides,
});

const register = (overrides) => api().post('/api/auth/register').send(validRegistration(overrides));

let counter = 0;
/** Creates a user directly in the DB (so privileged roles can be set up in tests). */
async function createUser({ roles = ['customer'], status = 'active', emailVerified = true, email, ready = true } = {}) {
  counter += 1;
  const user = await User.create({
    fullName: `Test User ${counter}`,
    email: email || `user${counter}@example.com`,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    roles,
    status,
    emailVerified,
  });
  // Most tests are about something else, so people start "ready": current terms accepted and identity documents on file.
  // Pass ready: false to test the requirements themselves.
  if (ready && roles.some((r) => ['customer', 'provider', 'business'].includes(r))) await makeReady(user);
  return user;
}

/** Terms accepted and every kind of document on file (the files themselves are not needed for these tests). */
async function makeReady(user) {
  const terms = await termsService.current();
  await TermsAcceptance.updateOne({ user: user._id, termsVersion: terms.version }, { $setOnInsert: { acceptedAt: new Date() } }, { upsert: true });
  for (const kind of ['national_id', 'cv', 'rdb_certificate', 'representative_id']) {
    await UserDocument.updateOne({ owner: user._id, kind, status: 'active' }, { $setOnInsert: { storageKey: `documents/${user._id}/${kind}.pdf`, mime: 'application/pdf', size: 100, sha256: 'x' } }, { upsert: true });
  }
}

async function loginAs(user) {
  const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  return res.body.data.accessToken;
}

/** Reads the one-time token out of the most recent email sent to an address. */
function tokenFromEmail(to) {
  const mail = [...getOutbox()].reverse().find((m) => m.to === to);
  const match = mail && mail.text.match(/token=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

/** A user with the given roles, already logged in. */
async function createSession(roles, options = {}) {
  const user = await createUser({ roles, ...options });
  return { user, token: await loginAs(user) };
}

const createAdmin = () => createSession(['admin']);

async function createCategory(overrides = {}) {
  counter += 1;
  return ServiceCategory.create({
    name: `Category ${counter}`,
    slug: `category-${counter}`,
    subcategories: [{ name: 'Sub One', slug: 'sub-one' }],
    ...overrides,
  });
}

/** A provider user (+ optional profile). `verified` controls the profile's verification status. */
async function createProvider({ verified = true, profile = true, emailVerified = true, roles = ['provider'], profileOverrides = {}, ready = true } = {}) {
  const { user, token } = await createSession(roles, { emailVerified, ready });
  let profileDoc = null;
  if (profile) {
    profileDoc = await ProviderProfile.create({
      user: user._id,
      displayName: `Provider ${user.fullName}`,
      bio: 'Experienced professional serving clients across Kigali.',
      location: { district: 'Gasabo' },
      verificationStatus: verified ? 'verified' : 'unverified',
      ...profileOverrides,
    });
  }
  return { user, token, profile: profileDoc };
}

const validListing = (categoryId, overrides = {}) => ({
  title: 'Laptop repair',
  description: 'Hardware and software repair with a written quote first.',
  category: String(categoryId),
  pricingType: 'fixed',
  priceFrom: 15000,
  location: { district: 'Gasabo' },
  ...overrides,
});

async function createListingDoc(profile, category, overrides = {}) {
  return ServiceListing.create({ ...validListing(category._id), provider: profile._id, status: 'active', ...overrides });
}

// ---- service requests and quotations ----
const futureDate = (days = 7) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const validRequest = (categoryId, overrides = {}) => ({
  title: 'Fix my office network',
  description: 'Our office Wi-Fi drops every hour and needs diagnosing.',
  category: String(categoryId),
  location: { district: 'Gasabo' },
  budgetMin: 20000,
  budgetMax: 50000,
  ...overrides,
});

const validQuotation = (overrides = {}) => ({
  price: 35000,
  description: 'I will diagnose the problem, fix it and document the setup.',
  deliverables: ['Diagnosis report', 'Working Wi-Fi'],
  estimatedDuration: '2 days',
  expiresAt: futureDate(7),
  ...overrides,
});

async function createRequestDoc(customer, category, overrides = {}) {
  return ServiceRequest.create({
    customer: customer._id,
    title: 'Fix my office network',
    description: 'Our office Wi-Fi drops every hour and needs diagnosing.',
    category: category._id,
    location: { district: 'Gasabo' },
    ...overrides,
  });
}

async function createQuotationDoc(request, profile, overrides = {}) {
  return Quotation.create({
    request: request._id,
    provider: profile._id,
    price: 30000,
    description: 'I will diagnose the problem, fix it and document the setup.',
    estimatedDuration: '2 days',
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    ...overrides,
  });
}

/** A booking in any status, built directly (the accept endpoint is tested separately). */
async function createBookingDoc({ customer, provider, category, status = 'accepted', contract = 'accepted', ...overrides }) {
  const request = await createRequestDoc(customer.user, category, { status: 'accepted' });
  const quotation = await createQuotationDoc(request, provider.profile, { status: 'accepted', price: 40000 });
  const booking = await Booking.create({
    request: request._id,
    quotation: quotation._id,
    customer: customer.user._id,
    provider: provider.profile._id,
    providerUser: provider.user._id,
    title: request.title,
    category: category._id,
    location: { district: 'Gasabo' },
    agreedPrice: 40000,
    status,
    history: [{ to: 'accepted', by: customer.user._id, role: 'customer', at: new Date() }],
    ...overrides,
  });
  // Every job has a contract. 'accepted' = both sides signed (and the provider's acceptance is recorded); 'pending' = nobody has yet; 'none' = no contract.
  if (contract !== 'none') {
    const terms = await termsService.current();
    const content = buildContent({ request, quotation, termsVersion: terms.version });
    const signed = contract === 'accepted';
    const at = new Date();
    await Contract.create({
      booking: booking._id, customer: customer.user._id, providerUser: provider.user._id, provider: provider.profile._id, currentVersion: 1,
      status: signed ? 'accepted' : 'pending', acceptedAt: signed ? at : undefined,
      versions: [{ number: 1, content, contentHash: contractService.hashOf(content), createdAt: at, acceptances: signed ? [{ role: 'customer', user: customer.user._id, acceptedAt: at }, { role: 'provider', user: provider.user._id, acceptedAt: at }] : [] }],
    });
    if (signed && !booking.providerAcceptedAt) await Booking.updateOne({ _id: booking._id }, { $set: { providerAcceptedAt: at } });
  }
  return Booking.findById(booking._id);
}

/** Publishes a verification fee directly (the API route for it is tested separately). */
const publishFee = (overrides = {}) =>
  PlatformSetting.updateOne({ key: 'verification_fee' }, { $set: { value: { amount: 5000, currency: 'RWF', instructions: 'Send the fee by MTN MoMo to 0788 000 000, then wait for confirmation.', version: 1, publishedAt: new Date(), ...overrides } } }, { upsert: true });

/** A verification application in any state, for review tests. */
async function createApplication(provider, { status = 'payment_confirmed', paymentStatus = 'confirmed', ...overrides } = {}) {
  const docs = await UserDocument.find({ owner: provider.user._id, status: 'active' }).select('_id');
  await ProviderProfile.updateOne({ _id: provider.profile._id }, { $set: { verificationStatus: 'pending' } });
  return VerificationApplication.create({ provider: provider.profile._id, user: provider.user._id, status, paymentStatus, fee: { amount: 5000, currency: 'RWF', version: 1 }, documents: docs.map((d) => d._id), history: [], ...overrides });
}

// ---- uploads ----
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBuffer = (size = 200) => Buffer.concat([PNG_HEADER, Buffer.alloc(size)]);
const pdfBuffer = (size = 200) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(size, 0x20)]);
const attachDoc = (req, { size, name = 'document.pdf', type = 'application/pdf', buffer } = {}) => req.attach('file', buffer || (type === 'application/pdf' ? pdfBuffer(size) : pngBuffer(size)), { filename: name, contentType: type });
const attachPng = (req, size) => req.attach('image', pngBuffer(size), { filename: 'photo.png', contentType: 'image/png' });

/** Where an uploaded file lives on disk, given the URL the API returned. */
const filePathFromUrl = (url) =>
  path.join(process.env.UPLOAD_DIR, new URL(url).pathname.replace(/^\/uploads\//, ''));
const fileExists = (url) => fs.existsSync(filePathFromUrl(url));

module.exports = {
  PASSWORD,
  api,
  bearer,
  register,
  validRegistration,
  createUser,
  loginAs,
  tokenFromEmail,
  createSession,
  createAdmin,
  createCategory,
  createProvider,
  validListing,
  createListingDoc,
  futureDate,
  validRequest,
  validQuotation,
  createRequestDoc,
  createQuotationDoc,
  createBookingDoc,
  pngBuffer,
  pdfBuffer,
  attachDoc,
  attachPng,
  makeReady,
  publishFee,
  createApplication,
  filePathFromUrl,
  fileExists,
};
