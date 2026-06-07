const logger = require('./logger');

const buildLogContext = (req, methodName, error, extraContext = {}) => ({
  requestId: req?.requestId,
  method: req?.method,
  path: req?.originalUrl || req?.url,
  responseMethod: methodName,
  error: error.message,
  ...extraContext
});

const wrapResponseMethod = (res, methodName, {
  req,
  beforeCall,
  afterCall,
  errorMessage = 'Response override failed',
  buildErrorContext
} = {}) => {
  const originalMethod = res[methodName].bind(res);

  res[methodName] = function(...args) {
    let finalArgs = args;

    try {
      if (typeof beforeCall === 'function') {
        const maybeArgs = beforeCall.call(this, finalArgs, originalMethod);
        if (Array.isArray(maybeArgs)) {
          finalArgs = maybeArgs;
        }
      }
    } catch (error) {
      logger.error(
        errorMessage,
        buildLogContext(
          req,
          methodName,
          error,
          typeof buildErrorContext === 'function' ? buildErrorContext(error, finalArgs) : {}
        )
      );
    }

    const result = originalMethod(...finalArgs);

    try {
      if (typeof afterCall === 'function') {
        afterCall.call(this, result, finalArgs, originalMethod);
      }
    } catch (error) {
      logger.error(
        errorMessage,
        buildLogContext(
          req,
          methodName,
          error,
          typeof buildErrorContext === 'function' ? buildErrorContext(error, finalArgs) : {}
        )
      );
    }

    return result;
  };

  return originalMethod;
};

module.exports = {
  wrapResponseMethod
};
