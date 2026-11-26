/**
 * Transactional email over SMTP (Amazon SES SMTP, Gmail/Workspace, Zoho, …).
 *
 *   SMTP_HOST, SMTP_PORT (587 STARTTLS | 465 TLS), SMTP_USER, SMTP_PASSWORD, EMAIL_FROM
 *
 * Not configured:
 *   - development: the message (incl. links) is written to the log so flows can be tested locally
 *   - production:  nothing is sent and a warning is logged (never the message body: it may hold a reset link)
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;
let testSender = null;

const isConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // implicit TLS on 465, STARTTLS otherwise
      requireTLS: port !== 465, // never send credentials in clear text
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return transporter;
}

const maskEmail = (email) => String(email || '').replace(/^(.).*(@.*)$/, '$1***$2');

/** @returns {Promise<{ sent: boolean, reason?: string }>} */
async function sendMail({ to, subject, text, html }) {
  if (testSender) {
    await testSender({ to, subject, text, html });
    return { sent: true };
  }
  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('SMTP not configured; email not sent', { to: maskEmail(to), subject });
      return { sent: false, reason: 'smtp_not_configured' };
    }
    if (process.env.NODE_ENV !== 'test') {
      // Local development only: lets you complete email flows without SMTP.
      logger.info('DEV email (SMTP not configured)', { to, subject, text });
    }
    return { sent: false, reason: 'dev_log_only' };
  }
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || `Nabz <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });
  logger.info('Email sent', { to: maskEmail(to), subject });
  return { sent: true };
}

/** Tests: capture outgoing mail instead of sending. */
function setTestSender(fn) {
  testSender = fn || null;
}

module.exports = { sendMail, isConfigured, setTestSender };
