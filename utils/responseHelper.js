/**
 * Response Helper Utility
 *
 * Provides consistent response patterns across the application
 * Reduces code duplication in controllers
 */

const { HTTP_STATUS } = require('../constants');

class ResponseHelper {
  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {Object} data - Response data
   * @param {String} message - Success message
   * @param {Number} statusCode - HTTP status code (default: 200)
   */
  sendSuccess(res, data, message = null, statusCode = HTTP_STATUS.OK) {
    const response = {
      success: true
    };

    if (message) response.message = message;

    // If data is an object with properties, spread them into response
    if (data && typeof data === 'object') {
      Object.assign(response, data);
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   * @param {Number} statusCode - HTTP status code (default: 500)
   * @param {Object} details - Additional error details
   */
  sendError(res, message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details = null) {
    const response = {
      success: false,
      message
    };

    if (details && process.env.NODE_ENV === 'development') {
      response.details = details;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Handle service layer errors in controllers
   * @param {Object} error - Error object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  handleServiceError(error, res, next) {
    if (error.statusCode) {
      return this.sendError(res, error.message, error.statusCode, error.details);
    }
    next(error);
  }

  /**
   * Send paginated response
   * @param {Object} res - Express response object
   * @param {Array} data - Array of items
   * @param {Object} pagination - Pagination metadata
   * @param {String} message - Success message
   */
  sendPaginated(res, data, pagination, message = null) {
    return this.sendSuccess(res, { data, pagination }, message);
  }

  /**
   * Send created response (201)
   * @param {Object} res - Express response object
   * @param {Object} data - Created resource data
   * @param {String} message - Success message
   */
  sendCreated(res, data, message = null) {
    return this.sendSuccess(res, data, message, HTTP_STATUS.CREATED);
  }

  /**
   * Send no content response (204)
   * @param {Object} res - Express response object
   */
  sendNoContent(res) {
    return res.status(HTTP_STATUS.NO_CONTENT).send();
  }

  /**
   * Send not found response (404)
   * @param {Object} res - Express response object
   * @param {String} message - Not found message
   */
  sendNotFound(res, message = 'Resource not found') {
    return this.sendError(res, message, HTTP_STATUS.NOT_FOUND);
  }

  /**
   * Send unauthorized response (401)
   * @param {Object} res - Express response object
   * @param {String} message - Unauthorized message
   */
  sendUnauthorized(res, message = 'Unauthorized') {
    return this.sendError(res, message, HTTP_STATUS.UNAUTHORIZED);
  }

  /**
   * Send forbidden response (403)
   * @param {Object} res - Express response object
   * @param {String} message - Forbidden message
   */
  sendForbidden(res, message = 'Forbidden') {
    return this.sendError(res, message, HTTP_STATUS.FORBIDDEN);
  }

  /**
   * Send bad request response (400)
   * @param {Object} res - Express response object
   * @param {String} message - Bad request message
   * @param {Object} details - Validation errors or details
   */
  sendBadRequest(res, message = 'Bad request', details = null) {
    return this.sendError(res, message, HTTP_STATUS.BAD_REQUEST, details);
  }
}

module.exports = new ResponseHelper();
