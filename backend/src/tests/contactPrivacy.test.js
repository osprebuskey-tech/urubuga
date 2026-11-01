const Booking = require('../models/Booking');
const Contract = require('../models/Contract');
const { api, bearer, createSession, createAdmin, createCategory, createProvider, createBookingDoc, createRequestDoc, createQuotationDoc, createListingDoc } = require('./helpers');

const PROVIDER_PHONE = '+250788333444';
const CUSTOMER_PHONE = '+250788111222';
const get = (t, id) => api().get(`/api/bookings/${id}`).set(bearer(t));

async function setup(contract = 'pending') {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const provider = await createProvider({ profileOverrides: { categories: [category._id], contactPreferences: { showPhone: true, showEmail: true } } });
  await customer.user.updateOne({ phone: CUSTOMER_PHONE });
  await provider.user.updateOne({ phone: PROVIDER_PHONE });
  const booking = await createBookingDoc({ customer, provider, category, contract });
  return { category, customer, provider, booking, contract: await Contract.findOne({ booking: booking._id }) };
}
const leaks = (res, user, phone) => new RegExp(`${phone.replace('+', '\\+')}|${user.email.replace('.', '\\.')}`).test(JSON.stringify(res.body));

describe('contact details before the provider accepts', () => {
  test('a provider\'s email and phone are never on public profiles or listings, even if they once opted in', async () => {
    const { category, provider } = await setup();
    await createListingDoc(provider.profile, category);
    for (const url of ['/api/providers', `/api/providers/${provider.profile._id}`, '/api/services', '/api/search?q=repair']) {
      const res = await api().get(url);
      expect(JSON.stringify(res.body)).not.toMatch(new RegExp(`${PROVIDER_PHONE.replace('+', '\\+')}|${provider.user.email.replace('.', '\\.')}`));
      expect(JSON.stringify(res.body)).not.toMatch(/"contact"/);
    }
  });

  test('neither side sees the other\'s phone or email in the job until the provider has accepted', async () => {
    const { customer, provider, booking } = await setup('pending');
    const asCustomer = await get(customer.token, booking._id);
    const asProvider = await get(provider.token, booking._id);
    expect(asCustomer.body.data.booking.contactRevealed).toBe(false);
    expect(leaks(asCustomer, provider.user, PROVIDER_PHONE)).toBe(false);
    expect(leaks(asProvider, customer.user, CUSTOMER_PHONE)).toBe(false);
    const list = await api().get('/api/bookings').set(bearer(customer.token));
    expect(leaks(list, provider.user, PROVIDER_PHONE)).toBe(false);
  });

  test('a customer accepting the contract first reveals nothing: only the provider\'s acceptance does', async () => {
    const { customer, provider, booking, contract } = await setup('pending');
    await api().post(`/api/contracts/${contract._id}/accept`).set(bearer(customer.token)).send({ version: 1 });
    expect(leaks(await get(customer.token, booking._id), provider.user, PROVIDER_PHONE)).toBe(false);
    expect(leaks(await get(provider.token, booking._id), customer.user, CUSTOMER_PHONE)).toBe(false);
  });

  test('quotations, requests and listings of the marketplace do not carry contact details either', async () => {
    const { category, customer, provider } = await setup();
    const request = await createRequestDoc(customer.user, category);
    await createQuotationDoc(request, provider.profile);
    const asCustomer = await api().get(`/api/requests/${request._id}/quotations`).set(bearer(customer.token));
    expect(leaks(asCustomer, provider.user, PROVIDER_PHONE)).toBe(false);
    const asProvider = await api().get(`/api/requests/${request._id}`).set(bearer(provider.token));
    expect(leaks(asProvider, customer.user, CUSTOMER_PHONE)).toBe(false);
  });
});

describe('contact details after the provider accepts', () => {
  test('the provider\'s explicit acceptance is recorded and then reveals the relevant details to both sides', async () => {
    const { customer, provider, booking, contract } = await setup('pending');
    const accept = await api().post(`/api/contracts/${contract._id}/accept`).set(bearer(provider.token)).send({ version: 1 });
    expect(accept.status).toBe(200);
    expect((await Booking.findById(booking._id)).providerAcceptedAt).toBeInstanceOf(Date);

    const asCustomer = (await get(customer.token, booking._id)).body.data.booking;
    const asProvider = (await get(provider.token, booking._id)).body.data.booking;
    expect(asCustomer.contactRevealed).toBe(true);
    expect(asCustomer.provider).toMatchObject({ phone: PROVIDER_PHONE, email: provider.user.email });
    expect(asCustomer.customer.phone).toBeUndefined(); // your own details are not echoed back
    expect(asProvider.customer).toMatchObject({ phone: CUSTOMER_PHONE, email: customer.user.email });
    expect(asProvider.provider.phone).toBeUndefined();
  });

  test('only the people on the job see them: outsiders and administrators do not', async () => {
    const { booking } = await setup('accepted');
    expect((await get((await createSession(['customer'])).token, booking._id)).status).toBe(404);
    const asAdmin = await get((await createAdmin()).token, booking._id);
    expect(asAdmin.body.data.booking.customer.phone).toBeUndefined();
    expect(asAdmin.body.data.booking.provider.phone).toBeUndefined();
  });

  test('details are shared only while the job is live', async () => {
    const { customer, booking } = await setup('accepted');
    expect((await get(customer.token, booking._id)).body.data.booking.provider.phone).toBe(PROVIDER_PHONE);
    await Booking.updateOne({ _id: booking._id }, { status: 'completed', completedAt: new Date() });
    const after = await get(customer.token, booking._id);
    expect(after.body.data.booking.contactRevealed).toBe(false);
    expect(after.body.data.booking.provider.phone).toBeUndefined();
  });
});
