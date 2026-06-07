const crypto = require('crypto');

const requestId = (req, res, next) => {
  const headerRequestId = req.headers['x-request-id'];
  const requestIdValue = (typeof headerRequestId === 'string' && headerRequestId.trim())
    ? headerRequestId.trim()
    : crypto.randomUUID();

  req.requestId = requestIdValue;
  res.locals.requestId = requestIdValue;
  res.setHeader('X-Request-Id', requestIdValue);

  next();
};

module.exports = requestId;
