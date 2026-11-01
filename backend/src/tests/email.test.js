const base = { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com', SMTP_USER: 'mailer', SMTP_PASS: 'secret-pass', EMAIL_FROM: 'Imbehe <no-reply@example.rw>' };

// Loads a fresh copy of the config and mailer under different environment settings (nodemailer is faked: no network).
function load(overrides = {}) {
  const saved = process.env;
  jest.resetModules();
  process.env = { ...saved, ...base, ...overrides };
  const sendMail = jest.fn().mockResolvedValue({});
  const createTransport = jest.fn(() => ({ sendMail }));
  jest.doMock('nodemailer', () => ({ createTransport }), { virtual: true });
  try {
    return { svc: require('../services/emailService'), sendMail, createTransport };
  } finally {
    process.env = saved;
  }
}

afterEach(() => jest.resetModules());

describe('SMTP email provider', () => {
  test('sends through the configured server, from the configured address', async () => {
    const { svc, sendMail, createTransport } = load();
    await svc.sendVerificationEmail({ email: 'aline@example.rw', fullName: 'Aline' }, 'tok123');
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com', port: 587, secure: false, auth: { user: 'mailer', pass: 'secret-pass' } }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'Imbehe <no-reply@example.rw>', to: 'aline@example.rw', subject: expect.stringMatching(/confirm/i) }));
    expect(sendMail.mock.calls[0][0].text).toContain('/verify-email?token=tok123');
  });

  test('port 465 uses implicit TLS unless told otherwise', async () => {
    const a = load({ SMTP_PORT: '465' });
    await a.svc.sendEmail({ to: 'a@example.com', subject: 's', text: 't' });
    expect(a.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
    const b = load({ SMTP_PORT: '465', SMTP_SECURE: 'false' });
    await b.svc.sendEmail({ to: 'a@example.com', subject: 's', text: 't' });
    expect(b.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false }));
  });

  test('a mail server failure reaches the caller (which logs it and carries on)', async () => {
    const { svc, sendMail } = load();
    sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(svc.sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).rejects.toThrow(/ECONNREFUSED/);
  });

  test('the server will not start with SMTP selected but not configured', () => {
    expect(() => load({ SMTP_HOST: '' })).toThrow(/SMTP_HOST/);
    expect(() => load({ SMTP_PASS: '' })).toThrow(/SMTP_PASS/);
  });
});
