const logger = require('../utils/logger');

const HONEYPOT_FIELDS = ['website', 'companyWebsite', 'faxNumber'];

const hasHoneypotValue = (body = {}) => HONEYPOT_FIELDS.some((field) => {
  const value = body[field];
  return typeof value === 'string' && value.trim().length > 0;
});

const rejectHoneypotSubmissions = (req, res, next) => {
  if (!hasHoneypotValue(req.body)) {
    return next();
  }

  logger.warn('Honeypot submission suppressed', {
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  return res.status(204).send();
};

module.exports = {
  HONEYPOT_FIELDS,
  hasHoneypotValue,
  rejectHoneypotSubmissions
};
