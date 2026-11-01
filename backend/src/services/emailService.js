const env = require('../config/env');
const logger = require('../config/logger');

// "memory" provider (tests) keeps sent messages here so tests can read verification/reset links.
const outbox = [];
const getOutbox = () => outbox;
const clearOutbox = () => { outbox.length = 0; };

let transporter;
function getTransporter() {
  if (!transporter) {
    const nodemailer = require('nodemailer'); // loaded only when SMTP is actually used
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      // A slow mail server must not hang the request that triggered the email.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, text }) {
  if (env.EMAIL_PROVIDER === 'memory') {
    outbox.push({ to, subject, text });
    return;
  }
  if (env.EMAIL_PROVIDER === 'smtp') {
    await getTransporter().sendMail({ from: env.EMAIL_FROM, to, subject, text });
    logger.info({ to, subject }, 'email sent'); // the body holds a secret link, so it is never logged
    return;
  }
  // "console" provider. Bodies contain secret links, so they are only logged outside production.
  if (env.NODE_ENV === 'production') {
    logger.warn({ to, subject }, 'EMAIL_PROVIDER=console in production: email not delivered');
  } else {
    logger.info({ to, subject, body: text }, 'email (console provider)');
  }
}

async function sendVerificationEmail(user, token) {
  const link = `${env.CLIENT_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Confirm your Imbehe email',
    text: `Hello ${user.fullName},\n\nConfirm your email address:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, ignore this message.`,
  });
}

async function sendPasswordResetEmail(user, token) {
  const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your Imbehe password',
    text: `Hello ${user.fullName},\n\nReset your password:\n${link}\n\nThis link expires in 30 minutes. If you did not request this, ignore this message.`,
  });
}

const ROLE_NAMES = { super_admin: 'super administrator', admin: 'administrator', finance: 'payment follow-up officer', provider: 'service provider', customer: 'customer', business: 'business customer' };

/** Sent when a super admin creates an account for someone. They choose their own password through the link. */
async function sendInviteEmail(user, token, invitedByName) {
  const link = `${env.CLIENT_URL}/reset-password?token=${token}&invite=1`;
  const roles = user.roles.map((r) => ROLE_NAMES[r] || r).join(' and ');
  await sendEmail({
    to: user.email,
    subject: 'You have been invited to Imbehe',
    text: `Hello ${user.fullName},\n\n${invitedByName} created an Imbehe account for you (${roles}).\n\nChoose your password to get started:\n${link}\n\nThis link expires in 72 hours. If you were not expecting this, ignore this message.`,
  });
}

module.exports = { sendInviteEmail, sendEmail, sendVerificationEmail, sendPasswordResetEmail, getOutbox, clearOutbox };
