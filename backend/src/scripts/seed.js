/*
 * Development seed: categories, test users, one verified provider with a live listing. Idempotent.
 * With --categories-only it only adds the starting service categories, which is safe (and intended) for production.
 * Everything else is refused when NODE_ENV=production.
 */
const bcrypt = require('bcrypt');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const ServiceCategory = require('../models/ServiceCategory');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceListing = require('../models/ServiceListing');
const ServiceRequest = require('../models/ServiceRequest');
const { slugify } = require('../utils/slug');

const categoriesOnly = process.argv.includes('--categories-only');
if (env.NODE_ENV === 'production' && !categoriesOnly) {
  console.error('Refusing to seed test users with NODE_ENV=production. Use "npm run seed:categories" for the starting categories and "npm run create-admin" for the first administrator.');
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD || 'ChangeMe123!';

const categories = [
  { name: 'Graphic Design', subs: ['Logo design', 'Posters and flyers', 'Branding', 'Social media graphics', 'Printing-ready designs'] },
  { name: 'IT Maintenance and Repair', subs: ['Computer repair', 'Printer maintenance and repair', 'Network installation and troubleshooting', 'Software installation', 'IT support contracts'] },
  { name: 'Software Design and Development', subs: ['Website development', 'Mobile application development', 'Business systems', 'Database development', 'API development and automation'] },
  { name: 'Electrical Services', subs: ['Electrical installation', 'Troubleshooting', 'Lighting installation', 'Electrical maintenance'] },
  { name: 'Other Services', subs: ['Plumbing', 'Carpentry', 'Photography and videography', 'Cleaning', 'Catering'] },
];

const users = [
  { fullName: 'Platform Super Admin', email: 'superadmin@imbehe.test', roles: ['super_admin'] },
  { fullName: 'Platform Admin', email: 'admin@imbehe.test', roles: ['admin'] },
  { fullName: 'Payment Follow-up Officer', email: 'finance@imbehe.test', roles: ['finance'] },
  { fullName: 'Aline Uwase', email: 'customer@imbehe.test', roles: ['customer'] },
  { fullName: 'Eric Mugisha', email: 'provider@imbehe.test', roles: ['provider'] },
  { fullName: 'Kigali Builders Ltd', email: 'business@imbehe.test', roles: ['business'] },
  { fullName: 'Grace Ingabire', email: 'both@imbehe.test', roles: ['customer', 'provider'] },
];

async function main() {
  await connectDB();

  for (const [i, c] of categories.entries()) {
    const slug = slugify(c.name);
    const res = await ServiceCategory.updateOne(
      { slug },
      { $setOnInsert: { name: c.name, slug, sortOrder: i, subcategories: c.subs.map((name) => ({ name, slug: slugify(name) })) } },
      { upsert: true },
    );
    console.log(`${res.upsertedCount ? 'created' : 'skip   '} category ${c.name}`);
  }

  if (categoriesOnly) {
    await disconnectDB();
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, env.BCRYPT_ROUNDS);
  for (const u of users) {
    if (await User.exists({ email: u.email })) {
      console.log(`skip    ${u.email} (already exists)`);
      continue;
    }
    await User.create({ ...u, passwordHash, emailVerified: true });
    console.log(`created ${u.email} [${u.roles.join(', ')}]`);
  }

  // A verified provider with one live listing, so the frontend has something to show.
  const provider = await User.findOne({ email: 'provider@imbehe.test' });
  const category = await ServiceCategory.findOne({ slug: slugify('IT Maintenance and Repair') });
  if (provider && category && !(await ProviderProfile.exists({ user: provider._id }))) {
    const profile = await ProviderProfile.create({
      user: provider._id,
      displayName: 'Eric Mugisha IT Services',
      bio: 'Computer, printer and network repair for homes and small businesses in Kigali.',
      categories: [category._id],
      skills: ['Laptop repair', 'Networking', 'Printer maintenance'],
      experienceYears: 6,
      location: { district: 'Gasabo' },
      coverage: ['Gasabo', 'Kicukiro', 'Nyarugenge'],
      verificationStatus: 'verified',
      verifiedAt: new Date(),
    });
    await ServiceListing.create({
      provider: profile._id,
      title: 'Laptop and desktop repair',
      description: 'Diagnosis and repair of hardware and software problems, with a written quote before any work starts.',
      category: category._id,
      subcategory: slugify('Computer repair'),
      priceFrom: 15000,
      pricingType: 'fixed',
      estimatedDuration: '1-2 days',
      location: { district: 'Gasabo' },
      status: 'active',
    });
    console.log('created verified provider profile and listing for provider@imbehe.test');
  }

  // An open request from the seeded customer, in the provider's category, so the quotation flow can be tried straight away.
  const customer = await User.findOne({ email: 'customer@imbehe.test' });
  if (customer && category && !(await ServiceRequest.exists({ customer: customer._id }))) {
    await ServiceRequest.create({
      customer: customer._id,
      title: 'Office Wi-Fi keeps dropping',
      description: 'Our small office in Kimihurura loses Wi-Fi every hour or so. We need someone to find the cause and fix it.',
      category: category._id,
      subcategory: slugify('Network installation and troubleshooting'),
      location: { district: 'Gasabo', sector: 'Kimihurura' },
      budgetMin: 20000,
      budgetMax: 60000,
    });
    console.log('created sample open request for customer@imbehe.test');
  }

  console.log('\nSeeded users share the password from SEED_PASSWORD (default: ChangeMe123!). Development use only.');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
