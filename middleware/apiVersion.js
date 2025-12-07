/**
 * API Version Middleware
 * Handles API version negotiation and routing
 */

const logger = require('../utils/logger');

/**
 * Supported API versions
 */
const SUPPORTED_VERSIONS = ['v1'];
const DEFAULT_VERSION = 'v1';
const LATEST_VERSION = 'v1';

/**
 * Version deprecation information
 */
const VERSION_INFO = {
  v1: {
    status: 'stable',
    releaseDate: '2024-10-29',
    deprecated: false,
    deprecationDate: null,
    sunsetDate: null
  }
};

/**
 * Extract version from request
 * Supports multiple version specification methods:
 * 1. URL path: /api/v1/users
 * 2. Accept header: Accept: application/vnd.nocturnal.v1+json
 * 3. Custom header: X-API-Version: v1
 * 4. Query parameter: ?version=v1
 */
function extractVersion(req) {
  // Method 1: URL path (already handled by routing)
  // This function is for other methods

  // Method 2: Accept header
  const acceptHeader = req.get('Accept');
  if (acceptHeader) {
    const match = acceptHeader.match(/application\/vnd\.nocturnal\.(v\d+)\+json/);
    if (match) {
      return match[1];
    }
  }

  // Method 3: Custom header
  const versionHeader = req.get('X-API-Version');
  if (versionHeader) {
    return versionHeader.toLowerCase();
  }

  // Method 4: Query parameter
  if (req.query.version) {
    return req.query.version.toLowerCase();
  }

  // Default version
  return DEFAULT_VERSION;
}

/**
 * Validate version
 */
function isValidVersion(version) {
  return SUPPORTED_VERSIONS.includes(version);
}

/**
 * Get version info
 */
function getVersionInfo(version) {
  return VERSION_INFO[version] || null;
}

/**
 * Middleware to validate and set API version
 */
function apiVersionMiddleware(req, res, next) {
  // Extract version from various sources
  const requestedVersion = extractVersion(req);

  // Validate version
  if (!isValidVersion(requestedVersion)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid API version',
      message: `Version '${requestedVersion}' is not supported`,
      supportedVersions: SUPPORTED_VERSIONS,
      latestVersion: LATEST_VERSION
    });
  }

  // Get version info
  const versionInfo = getVersionInfo(requestedVersion);

  // Check if version is deprecated
  if (versionInfo.deprecated) {
    // Add deprecation warning headers
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Date', versionInfo.deprecationDate);

    if (versionInfo.sunsetDate) {
      res.setHeader('X-API-Sunset-Date', versionInfo.sunsetDate);
      res.setHeader(
        'Warning',
        `299 - "API version ${requestedVersion} is deprecated and will be sunset on ${versionInfo.sunsetDate}"`
      );
    }

    // Log deprecation usage
    logger.warn('Deprecated API version used', {
      version: requestedVersion,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  }

  // Set version info on request
  req.apiVersion = requestedVersion;
  req.apiVersionInfo = versionInfo;

  // Add version headers to response
  res.setHeader('X-API-Version', requestedVersion);
  res.setHeader('X-API-Latest-Version', LATEST_VERSION);

  next();
}

/**
 * Middleware to redirect unversioned requests to latest version
 */
function redirectToLatestVersion(req, res, next) {
  // Check if this is an unversioned API request
  if (req.path.startsWith('/api/') && !req.path.match(/\/api\/v\d+\//)) {
    // Redirect to latest version
    const newPath = req.path.replace('/api/', `/api/${LATEST_VERSION}/`);

    logger.info('Redirecting unversioned API request', {
      originalPath: req.path,
      newPath: newPath,
      ip: req.ip
    });

    return res.redirect(307, newPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''));
  }

  next();
}

/**
 * Get available versions endpoint
 */
function getVersions(req, res) {
  const versions = SUPPORTED_VERSIONS.map(version => ({
    version,
    ...VERSION_INFO[version],
    url: `/api/${version}`,
    documentation: `/docs/${version}`
  }));

  res.json({
    success: true,
    defaultVersion: DEFAULT_VERSION,
    latestVersion: LATEST_VERSION,
    versions
  });
}

module.exports = {
  apiVersionMiddleware,
  redirectToLatestVersion,
  getVersions,
  extractVersion,
  isValidVersion,
  getVersionInfo,
  SUPPORTED_VERSIONS,
  DEFAULT_VERSION,
  LATEST_VERSION,
  VERSION_INFO
};
