/**
 * Index-Unified Page JavaScript
 * Extracted from inline script for CSP compliance.
 * Handles role selection, auto-login redirect, and session helpers.
 */

// Guard: config.js must load before this script
if (typeof AppConfig === 'undefined') {
  console.error('index-unified.js: AppConfig not loaded - ensure config.js is included before this script');
}

// ============================================================================
// Event delegation - replaces inline onclick handlers
// ============================================================================

document.addEventListener('click', function (event) {
  var target = event.target.closest('[data-action]');
  if (!target) return;

  var action = target.getAttribute('data-action');

  if (action === 'select-role') {
    localStorage.setItem('selectedRole', target.getAttribute('data-role'));
    window.location.href = '/register.html';
  }
});

// ============================================================================
// Auto-login check on page load
// ============================================================================

window.addEventListener('DOMContentLoaded', async function () {
  var user = await NocturnalSession.getActiveUser();
  if (user) {
    NocturnalSession.redirectForUser(user);
    return;
  }

  if (localStorage.getItem('token')) {
    console.log('Active backend session not found');
    NocturnalSession.clearSession();
  }
});
