const { api } = require('./helpers');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { createAdmin } = require('../scripts/createAdmin');

const input = (overrides = {}) => ({ fullName: 'Jane Doe', email: 'Jane@Example.rw', password: 'a-long-passphrase-1', ...overrides });

describe('create-admin script', () => {
  test('creates an administrator who can log in, and records it in the audit log', async () => {
    const user = await createAdmin(input());
    expect(user.roles).toEqual(['admin']);
    expect(user.email).toBe('jane@example.rw');

    const login = await api().post('/api/auth/login').send({ email: 'jane@example.rw', password: 'a-long-passphrase-1' });
    expect(login.status).toBe(200);
    expect(await AuditLog.findOne({ action: 'admin.created_by_script' })).toBeTruthy();
  });

  test('stores only a hash of the password', async () => {
    await createAdmin(input());
    const stored = await User.findOne({ email: 'jane@example.rw' }).select('+passwordHash');
    expect(stored.passwordHash).not.toContain('a-long-passphrase-1');
  });

  test('refuses weak passwords, bad emails and duplicates', async () => {
    await expect(createAdmin(input({ password: 'short1' }))).rejects.toThrow(/12 characters/);
    await expect(createAdmin(input({ password: 'onlyletterspassphrase' }))).rejects.toThrow(/letter and a number/);
    await expect(createAdmin(input({ email: 'not-an-email' }))).rejects.toThrow(/valid email/);
    await createAdmin(input());
    await expect(createAdmin(input())).rejects.toThrow(/already exists/);
    expect(await User.countDocuments({ roles: 'admin' })).toBe(1);
  });

  test('administrators still cannot be created through the public API', async () => {
    const res = await api().post('/api/auth/register').send({ fullName: 'Mallory', email: 'm@example.com', password: 'Passw0rd!x', roles: ['admin'] });
    expect(res.status).toBe(400);
  });
});
