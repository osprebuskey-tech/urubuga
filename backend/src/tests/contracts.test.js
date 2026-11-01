const AuditLog = require('../models/AuditLog');
const Booking = require('../models/Booking');
const Contract = require('../models/Contract');
const Notification = require('../models/Notification');
const TermsAcceptance = require('../models/TermsAcceptance');
const { api, bearer, createSession, createAdmin, createCategory, createProvider, createBookingDoc, createRequestDoc, createQuotationDoc } = require('./helpers');

const asBooking = (t, id) => api().get(`/api/bookings/${id}`).set(bearer(t));
const move = (t, id, status) => api().patch(`/api/bookings/${id}/status`).set(bearer(t)).send({ status });
const forBooking = (t, id) => api().get(`/api/contracts/by-booking/${id}`).set(bearer(t));
const accept = (t, id, version = 1) => api().post(`/api/contracts/${id}/accept`).set(bearer(t)).send({ version });
const propose = (t, id, body) => api().post(`/api/contracts/${id}/propose`).set(bearer(t)).send(body);

async function setup(contract = 'pending') {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
  const booking = await createBookingDoc({ customer, provider, category, contract });
  const doc = await Contract.findOne({ booking: booking._id });
  return { category, customer, provider, booking, contract: doc };
}

describe('a contract is created for every accepted job', () => {
  test('accepting a quotation creates the booking and its contract from the quotation', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    const request = await createRequestDoc(customer.user, category, { preferredDate: new Date(Date.now() + 5 * 86_400_000) });
    const quotation = await createQuotationDoc(request, provider.profile, { price: 55000, deliverables: ['Network audit report', 'Router replacement'], estimatedDuration: '3 days' });

    const res = await api().patch(`/api/quotations/${quotation._id}`).set(bearer(customer.token)).send({ status: 'accepted' });
    expect(res.status).toBe(200);
    const booking = await Booking.findOne({ quotation: quotation._id });
    const contract = await Contract.findOne({ booking: booking._id });
    expect(contract).toMatchObject({ status: 'pending', currentVersion: 1 });
    const v = contract.versions[0];
    expect(v.content.agreedPrice).toBe(55000);
    expect(v.content.deliverables).toEqual(['Network audit report', 'Router replacement']);
    expect(v.content.deadline).toBeTruthy();
    expect(v.acceptances).toHaveLength(0);
    expect(booking.providerAcceptedAt).toBeUndefined();
  });

  test('it states everything a contract must: service, price, deliverables, deadline, duties, payment, cancellation, disputes', async () => {
    const { customer, booking } = await setup();
    const { contract } = (await forBooking(customer.token, booking._id)).body.data;
    expect(contract).toMatchObject({ status: 'pending', version: 1, intact: true, myRole: 'customer', waitingFor: ['customer', 'provider'] });
    const c = contract.content;
    expect(c.serviceDescription).toBeTruthy();
    expect(c.agreedPrice).toBe(40000);
    expect(c.currency).toBe('RWF');
    expect(Array.isArray(c.deliverables)).toBe(true);
    expect(c.customerResponsibilities.length).toBeGreaterThan(0);
    expect(c.providerResponsibilities.length).toBeGreaterThan(0);
    expect(c.paymentTerms).toMatch(/40,000 RWF/);
    expect(c.cancellationTerms).toMatch(/cancel/i);
    expect(c.disputeResolution).toMatch(/administrator/i);
    expect(c.platformTermsVersion).toBe(1);
  });
});

describe('who can read a contract', () => {
  test('the customer, the provider and administrators; nobody else, and not without signing in', async () => {
    const { customer, provider, booking, contract } = await setup();
    const admin = await createAdmin();
    for (const t of [customer.token, provider.token, admin.token]) expect((await forBooking(t, booking._id)).status).toBe(200);
    expect((await forBooking(admin.token, booking._id)).body.data.contract.myRole).toBe('admin');
    const stranger = await createSession(['customer']);
    const other = await createProvider();
    for (const t of [stranger.token, other.token]) {
      expect((await forBooking(t, booking._id)).status).toBe(404);
      expect((await api().get(`/api/contracts/${contract._id}`).set(bearer(t))).status).toBe(404);
    }
    expect((await api().get(`/api/contracts/${contract._id}`)).status).toBe(401);
    expect((await api().get('/api/admin/contracts').set(bearer(customer.token))).status).toBe(403);
    expect((await api().get('/api/admin/contracts').set(bearer(admin.token))).body.data).toHaveLength(1);
  });
});

describe('accepting a contract', () => {
  test('both sides must accept; each acceptance records who, which version and when', async () => {
    const { customer, provider, booking, contract } = await setup();
    const first = await accept(provider.token, contract._id);
    expect(first.status).toBe(200);
    expect(first.body.data.contract).toMatchObject({ status: 'pending', iHaveAccepted: true, waitingFor: ['customer'] });
    expect(await Notification.findOne({ user: customer.user._id, type: 'contract.updated' })).toBeTruthy();

    const second = await accept(customer.token, contract._id);
    expect(second.body.data.contract).toMatchObject({ status: 'accepted', waitingFor: [] });
    const saved = await Contract.findById(contract._id);
    const acc = saved.versions[0].acceptances;
    expect(acc.map((a) => a.role).sort()).toEqual(['customer', 'provider']);
    expect(acc.find((a) => a.role === 'customer').user.toString()).toBe(String(customer.user._id));
    expect(acc.every((a) => a.acceptedAt instanceof Date)).toBe(true);
    expect(saved.acceptedAt).toBeInstanceOf(Date);
    expect(await AuditLog.countDocuments({ action: 'contract.accepted' })).toBe(2);
    expect((await Booking.findById(booking._id)).providerAcceptedAt).toBeInstanceOf(Date);
  });

  test('accepting twice records nothing new', async () => {
    const { provider, contract } = await setup();
    await accept(provider.token, contract._id);
    expect((await accept(provider.token, contract._id)).status).toBe(200);
    expect((await Contract.findById(contract._id)).versions[0].acceptances).toHaveLength(1);
  });

  test('only the two parties can accept; administrators and outsiders cannot', async () => {
    const { contract } = await setup();
    expect((await accept((await createAdmin()).token, contract._id)).status).toBe(403);
    expect((await accept((await createSession(['customer'])).token, contract._id)).status).toBe(404);
    expect((await Contract.findById(contract._id)).versions[0].acceptances).toHaveLength(0);
  });

  test('you must accept the version you were shown', async () => {
    const { customer, provider, contract } = await setup();
    await propose(provider.token, contract._id, { deliverables: ['Extra deliverable'] });
    const stale = await accept(customer.token, contract._id, 1);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'STALE_CONTRACT', details: { version: 2 } });
  });

  test('the platform terms must be accepted first', async () => {
    const { customer, contract } = await setup();
    await TermsAcceptance.deleteMany({ user: customer.user._id });
    const res = await accept(customer.token, contract._id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TERMS_NOT_ACCEPTED');
  });

  test('a cancelled job cannot be signed', async () => {
    const { provider, booking, contract } = await setup();
    await Booking.updateOne({ _id: booking._id }, { status: 'cancelled' });
    expect((await accept(provider.token, contract._id)).body.error.code).toBe('BOOKING_NOT_WAITING');
  });
});

describe('work cannot start without a signed contract', () => {
  test('the provider cannot start until both have accepted, and the button is not offered', async () => {
    const { customer, provider, booking, contract } = await setup();
    expect((await asBooking(provider.token, booking._id)).body.data.booking.allowedActions).toEqual(['cancelled']);
    const blocked = await move(provider.token, booking._id, 'in_progress');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CONTRACT_NOT_ACCEPTED');

    await accept(provider.token, contract._id);
    expect((await move(provider.token, booking._id, 'in_progress')).status).toBe(409); // the customer has not accepted yet
    await accept(customer.token, contract._id);
    expect((await asBooking(provider.token, booking._id)).body.data.booking.allowedActions).toContain('in_progress');
    const started = await move(provider.token, booking._id, 'in_progress');
    expect(started.status).toBe(200);
    expect(started.body.data.booking.status).toBe('in_progress');
  });

  test('a job with no contract at all cannot start either', async () => {
    const { provider, booking } = await setup('none');
    expect((await move(provider.token, booking._id, 'in_progress')).body.error.code).toBe('CONTRACT_NOT_ACCEPTED');
  });
});

describe('contract versions', () => {
  test('a change makes a new version, restarts the acceptances and keeps the old version', async () => {
    const { customer, provider, booking, contract } = await setup();
    await accept(provider.token, contract._id);
    const res = await propose(customer.token, contract._id, { deliverables: ['Written report', 'Site visit'], deadline: '2099-01-31', note: 'Added a site visit' });
    expect(res.status).toBe(200);
    expect(res.body.data.contract).toMatchObject({ version: 2, status: 'pending', iHaveAccepted: false });
    expect(res.body.data.contract.content.deliverables).toEqual(['Written report', 'Site visit']);
    expect(res.body.data.contract.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(res.body.data.contract.versions[0].acceptedBy).toEqual(['provider']);
    expect(res.body.data.contract.versions[0].contentHash).not.toBe(res.body.data.contract.versions[1].contentHash);
    expect(await Notification.findOne({ user: provider.user._id, title: /Contract changed/ })).toBeTruthy();

    await accept(provider.token, contract._id, 2);
    await accept(customer.token, contract._id, 2);
    expect((await Contract.findById(contract._id)).status).toBe('accepted');
    expect((await move(provider.token, booking._id, 'in_progress')).status).toBe(200);
  });

  test('the price and the standard clauses cannot be changed, and nothing can change once work has started', async () => {
    const { customer, provider, booking, contract } = await setup('accepted');
    expect((await propose(customer.token, contract._id, { agreedPrice: 1 })).status).toBe(400);
    expect((await propose(customer.token, contract._id, { cancellationTerms: 'no refunds' })).status).toBe(400);
    expect((await propose(customer.token, contract._id, {})).status).toBe(400);
    await Booking.updateOne({ _id: booking._id }, { status: 'in_progress' });
    expect((await propose(provider.token, contract._id, { deliverables: ['More'] })).body.error.code).toBe('BOOKING_NOT_WAITING');
    expect((await propose((await createAdmin()).token, contract._id, { deliverables: ['More'] })).status).toBe(403);
  });

  test('a stored version that was tampered with is reported as not intact', async () => {
    const { customer, contract } = await setup();
    await Contract.updateOne({ _id: contract._id }, { $set: { 'versions.0.content.agreedPrice': 1 } });
    expect((await forBooking(customer.token, contract.booking)).body.data.contract.intact).toBe(false);
  });
});
