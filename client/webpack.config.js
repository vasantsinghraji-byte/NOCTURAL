/**
 * Legacy compatibility wrapper.
 *
 * Production builds use build.config.js. The remaining webpack fallback path
 * uses webpack.config.simple.js for copy-only development builds.
 */

module.exports = require('./webpack.config.simple');
