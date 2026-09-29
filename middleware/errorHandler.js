const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  let error = { ...err };
  error.message = err.message;

  // Request body problems from body-parser / multer are the client's, not ours.
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    error.statusCode = 413;
    error.message = 'That request is too large.';
  } else if (err.type === 'entity.parse.failed') {
    error.statusCode = 400;
    error.message = 'The request body is not valid JSON.';
  } else if (err.code === 'INVALID_FILE_SIGNATURE') {
    error.statusCode = 400;
    error.message = 'That file’s contents don’t match its type. Upload a real JPG, PNG or PDF.';
  } else if (err.name === 'MulterError') {
    error.statusCode = 400;
    error.message = err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Unexpected file field.' : 'That upload could not be accepted.';
  } else if (!error.statusCode && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    error.statusCode = err.status;
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error.message = 'Resource not found';
    error.statusCode = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    error.message = 'Duplicate field value entered';
    error.statusCode = 400;
  }

  // Mongoose validation error (has `errors`) or our service ValidationError
  // (utils/errors, has statusCode but no `errors`: reading it used to throw
  // inside the handler and turn a 400 into an empty 500).
  if (err.name === 'ValidationError') {
    if (err.errors && typeof err.errors === 'object') {
      error.message = Object.values(err.errors).map(val => val.message).join(', ');
    }
    error.statusCode = 400;
  }

  const status = error.statusCode || 500;
  // Real failures are errors; refused requests (4xx) are routine and would
  // otherwise flood the admin Live logs.
  const logMeta = { error: err.message, url: req.originalUrl, method: req.method, status };
  if (status >= 500) logger.error('Unhandled middleware error', { ...logMeta, stack: err.stack });
  else logger.info('Request refused', logMeta);

  res.status(status).json({
    success: false,
    // WARNING: never send internal error text for a 500 (it can reveal code
    // paths or data). The detail is in the log above.
    message: status >= 500 ? 'Something went wrong. Please try again.' : (error.message || 'Request refused')
  });
};

module.exports = errorHandler;
