const CompanyProfile = require('../models/CompanyProfile');
const AppError = require('../utils/AppError');
const { toDotNotation } = require('../utils/query');

async function getOwn(userId) {
  const company = await CompanyProfile.findOne({ owner: userId });
  if (!company) throw new AppError(404, 'Company profile not found. Create it first.', 'COMPANY_NOT_FOUND');
  return company;
}

async function upsertOwn(user, data) {
  let company = await CompanyProfile.findOne({ owner: user._id });
  if (company) {
    company.set(toDotNotation(data));
  } else {
    company = new CompanyProfile({ ...data, owner: user._id });
  }
  return company.save();
}

module.exports = { getOwn, upsertOwn };
