const fs = require('fs');
const path = require('path');
const AuditLog = require('../models/AuditLog');
const UserDocument = require('../models/UserDocument');
const ProviderProfile = require('../models/ProviderProfile');
const env = require('../config/env');
const { api, bearer, createSession, createAdmin, createCategory, createProvider, createApplication, attachDoc, pdfBuffer, validRequest, makeReady } = require('./helpers');

const upload = (token, kind, opts) => attachDoc(api().post(`/api/documents/${kind}`).set(bearer(token)), opts);
const createRequest = (token, categoryId) => api().post('/api/requests').set(bearer(token)).send(validRequest(categoryId));

describe('uploading documents', () => {
  test('accepts PDF, JPG and PNG, judged by the file itself', async () => {
    const { token } = await createSession(['customer'], { ready: false });
    const pdf = await upload(token, 'national_id');
    expect(pdf.status).toBe(201);
    expect(pdf.body.data.document).toMatchObject({ kind: 'national_id', mime: 'application/pdf' });
    expect(pdf.body.data.document.storageKey).toBeUndefined(); // the private location never leaves the server
    expect(pdf.body.data.document.sha256).toBeUndefined();

    const provider = await createProvider({ verified: false, ready: false });
    expect((await upload(provider.token, 'cv', { type: 'image/png', name: 'cv.png' })).body.data.document.mime).toBe('image/png');
  });

  test('rejects other types, fake extensions, empty uploads and oversized files', async () => {
    const { token } = await createSession(['customer'], { ready: false });
    const text = await upload(token, 'national_id', { buffer: Buffer.from('this is just a text file pretending to be a PDF'), name: 'id.pdf' });
    expect(text.status).toBe(400);
    expect(text.body.error.code).toBe('INVALID_FILE_TYPE');
    const webp = await upload(token, 'national_id', { buffer: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(50)]), name: 'id.webp', type: 'image/webp' });
    expect(webp.body.error.code).toBe('INVALID_FILE_TYPE');
    expect((await api().post('/api/documents/national_id').set(bearer(token))).body.error.code).toBe('NO_FILE');
    const big = await upload(token, 'national_id', { buffer: pdfBuffer(Math.floor(1.2 * 1024 * 1024)) });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');
    expect(await UserDocument.countDocuments()).toBe(0);
  });

  test('only the documents that fit your account can be uploaded', async () => {
    const customer = await createSession(['customer'], { ready: false });
    expect((await upload(customer.token, 'cv')).body.error.code).toBe('DOCUMENT_NOT_NEEDED');
    expect((await upload(customer.token, 'unknown')).status).toBe(400);
    expect((await api().post('/api/documents/national_id').attach('file', pdfBuffer(), 'x.pdf')).status).toBe(401);
  });

  test('replacing a document retires the old one and keeps the record', async () => {
    const { token, user } = await createSession(['customer'], { ready: false });
    const first = (await upload(token, 'national_id')).body.data.document;
    const second = (await upload(token, 'national_id', { name: 'new.pdf' })).body.data.document;
    expect(second.id).not.toBe(first.id);
    expect(await UserDocument.countDocuments({ owner: user._id, kind: 'national_id' })).toBe(2);
    expect((await api().get('/api/documents').set(bearer(token))).body.data.documents.map((d) => d.id)).toEqual([second.id]);
  });

  test('documents cannot be swapped while they are being reviewed', async () => {
    const provider = await createProvider({ verified: false });
    await createApplication(provider, { status: 'under_review' });
    const res = await upload(provider.token, 'cv');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENTS_LOCKED');
  });
});

describe('which documents are required', () => {
  test('customers must upload a National ID before requesting a service', async () => {
    const category = await createCategory();
    const { token, user } = await createSession(['customer'], { ready: false });
    await makeReady(user); // terms accepted ...
    await UserDocument.deleteMany({ owner: user._id }); // ... but no documents yet
    const blocked = await createRequest(token, category.id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('DOCUMENTS_REQUIRED');
    expect(blocked.body.error.details.missing).toEqual(['national_id']);

    await upload(token, 'national_id');
    expect((await createRequest(token, category.id)).status).toBe(201);
  });

  test('business accounts need the RDB certificate and the representative\'s National ID', async () => {
    const business = await createSession(['business'], { ready: false });
    const status = (await api().get('/api/documents').set(bearer(business.token))).body.data;
    expect(status.requirements.hire.required.map((r) => r.kind)).toEqual(['rdb_certificate', 'representative_id']);
    expect(status.requirements.hire.complete).toBe(false);
  });

  test('providers: National ID + CV as individuals, RDB + representative ID as a business', async () => {
    const provider = await createProvider({ verified: false, ready: false });
    const kinds = async () => (await api().get('/api/documents').set(bearer(provider.token))).body.data.requirements.provide.required.map((r) => r.kind);
    expect(await kinds()).toEqual(['national_id', 'cv']);
    await ProviderProfile.updateOne({ _id: provider.profile._id }, { providerType: 'business' });
    expect(await kinds()).toEqual(['rdb_certificate', 'representative_id']);
  });
});

describe('private storage and protected access', () => {
  const stored = async () => {
    const { token, user } = await createSession(['customer'], { ready: false });
    const doc = (await upload(token, 'national_id')).body.data.document;
    return { token, user, doc };
  };

  test('the file is not under the public uploads folder and has no public URL', async () => {
    const { doc } = await stored();
    const row = await UserDocument.findById(doc.id).select('+storageKey');
    expect(fs.existsSync(path.join(env.privateUploadDir, row.storageKey))).toBe(true);
    expect(fs.existsSync(path.join(env.uploadDir, row.storageKey))).toBe(false);
    expect((await api().get(`/uploads/${row.storageKey}`)).status).toBe(404);
  });

  test('the owner can open it, with headers that stop browsers from keeping or running it', async () => {
    const { token, doc } = await stored();
    const res = await api().get(`/api/documents/${doc.id}/file`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toMatch(/sandbox/);
  });

  test('nobody else can open it: not other customers, not providers, not anonymous visitors', async () => {
    const { doc } = await stored();
    const other = await createSession(['customer']);
    const provider = await createProvider();
    expect((await api().get(`/api/documents/${doc.id}/file`)).status).toBe(401);
    expect((await api().get(`/api/documents/${doc.id}/file`).set(bearer(other.token))).status).toBe(404);
    expect((await api().get(`/api/documents/${doc.id}/file`).set(bearer(provider.token))).status).toBe(404);
  });

  test('administrators can open a document only for someone with a verification application, and it is audited', async () => {
    const admin = await createAdmin();
    const customer = await stored();
    expect((await api().get(`/api/documents/${customer.doc.id}/file`).set(bearer(admin.token))).status).toBe(404);

    const applicant = await createProvider({ verified: false, ready: false });
    const doc = (await upload(applicant.token, 'national_id')).body.data.document;
    await createApplication(applicant, { status: 'under_review' });
    const res = await api().get(`/api/documents/${doc.id}/file`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(await AuditLog.findOne({ action: 'document.viewed', actor: admin.user._id })).toBeTruthy();
    expect((await api().get(`/api/documents/${doc.id}/file`).set(bearer((await createSession(['finance'])).token))).status).toBe(404);
  });

  test('a tampered stored file fails its integrity check instead of being served', async () => {
    const { token, doc } = await stored();
    const row = await UserDocument.findById(doc.id).select('+storageKey');
    fs.writeFileSync(path.join(env.privateUploadDir, row.storageKey), Buffer.from('%PDF-1.4 tampered'));
    const res = await api().get(`/api/documents/${doc.id}/file`).set(bearer(token));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOCUMENT_CORRUPT');
  });
});
