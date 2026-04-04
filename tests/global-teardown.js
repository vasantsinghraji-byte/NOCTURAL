/**
 * Jest Global Teardown
 *
 * Runs once after all test suites complete.
 * Closes any lingering database connections and cleans up resources
 * to prevent open-handle warnings and process hangs.
 */

module.exports = async function globalTeardown() {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } catch (_err) {
    // Ignore — mongoose may not have been imported in this worker
  }
};
