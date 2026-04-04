/*
 * Deprecated legacy frontend entrypoint.
 *
 * Firebase auth is retired from production flows. This file intentionally
 * does not bootstrap any authentication or dashboard logic anymore.
 * Use backend JWT flows from index.html, index-unified.html, and config.js.
 */

(function quarantineLegacyFirebaseApp() {
  var message = 'Deprecated legacy app.js: Firebase frontend auth has been retired. Use backend JWT auth instead.';

  if (typeof window !== 'undefined') {
    window.__NOCTURNAL_LEGACY_FIREBASE_APP_DISABLED__ = true;
  }

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(message);
  }
})();
