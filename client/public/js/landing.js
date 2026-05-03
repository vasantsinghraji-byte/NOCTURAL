/**
 * Landing Page JavaScript
 * Extracted from inline scripts in index.html for CSP compliance.
 * Handles auth flows, modals, and navigation via event delegation.
 */

// Guard: config.js must load before this script
if (typeof AppConfig === 'undefined') {
  console.error('landing.js: AppConfig not loaded - ensure config.js is included before this script');
}

var ROUTE_MAP = {
  doctorDashboard: AppConfig.routes.page('doctor.dashboard'),
  doctorOnboarding: AppConfig.routes.page('doctor.onboarding'),
  adminDashboard: AppConfig.routes.page('admin.dashboard'),
  patientDashboard: AppConfig.routes.page('patient.dashboard'),
  unifiedRegister: AppConfig.routes.page('sharedRegister')
};

function trackFunnelEvent(eventName, target) {
  if (!eventName) {
    return;
  }

  AppConfig.fetchRoute('funnelEvents.create', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      event: eventName,
      path: window.location.pathname,
      target: target || ''
    })
  }).catch(function () {
    // Analytics must never block public navigation.
  });
}

// ============================================================================
// Event Delegation - replaces all inline onclick handlers
// ============================================================================

document.addEventListener('click', function (event) {
  var actionTarget = event.target.closest('[data-action]');

  // Don't trigger parent button's toggle when clicking on dropdown menu links
  if (actionTarget &&
      actionTarget.getAttribute('data-action') === 'toggle-login-dropdown' &&
      event.target.closest('#loginDropdown')) {
    actionTarget = null;
  }

  if (actionTarget) {
    var action = actionTarget.getAttribute('data-action');

    switch (action) {
      case 'toggle-login-dropdown':
        showLoginOptions();
        return; // skip the close-dropdown logic below
      case 'open-staff-login':
        event.preventDefault();
        openLoginModal();
        hideLoginOptions();
        break;
      case 'navigate':
        trackFunnelEvent(actionTarget.getAttribute('data-event'), actionTarget.getAttribute('data-href'));
        window.location.href = actionTarget.getAttribute('data-href');
        break;
      case 'open-register':
        openRegisterModal();
        break;
      case 'close-login-modal':
        closeLoginModal();
        break;
      case 'close-register-modal':
        closeRegisterModal();
        break;
      case 'switch-to-register':
        closeLoginModal();
        openRegisterModal();
        break;
      case 'switch-to-login':
        closeRegisterModal();
        openLoginModal();
        break;
      case 'coming-soon':
        event.preventDefault();
        alert(actionTarget.getAttribute('data-message') || 'Coming soon');
        break;
    }
  }

  // Close login dropdown when clicking outside of it
  if (!event.target.closest('[data-action="toggle-login-dropdown"]') &&
      !event.target.closest('#loginDropdown')) {
    var dropdown = document.getElementById('loginDropdown');
    if (dropdown) {
      AppUi.setDisplay(dropdown, 'none');
    }
  }
});

// Close modals when clicking on the backdrop
window.addEventListener('click', function (event) {
  var loginModal = document.getElementById('loginModal');
  var registerModal = document.getElementById('registerModal');
  if (event.target === loginModal) closeLoginModal();
  if (event.target === registerModal) closeRegisterModal();
});

// ============================================================================
// Login Dropdown
// ============================================================================

function showLoginOptions() {
  var dropdown = document.getElementById('loginDropdown');
  if (dropdown) {
    dropdown.classList.toggle('is-open');
  }
}

function hideLoginOptions() {
  AppUi.setDisplay(document.getElementById('loginDropdown'), 'none');
}

// ============================================================================
// Modal Functions
// ============================================================================

function openLoginModal() {
  AppUi.setDisplay(document.getElementById('loginModal'), 'block');
  document.body.classList.add('modal-open');
}

function closeLoginModal() {
  AppUi.setDisplay(document.getElementById('loginModal'), 'none');
  document.body.classList.remove('modal-open');
  document.getElementById('loginError').innerHTML = '';
}

function openRegisterModal() {
  // Redirect to unified landing page for registration
  window.location.href = ROUTE_MAP.unifiedRegister;
}

function closeRegisterModal() {
  AppUi.setDisplay(document.getElementById('registerModal'), 'none');
  document.body.classList.remove('modal-open');
  document.getElementById('registerError').innerHTML = '';
}

// ============================================================================
// Auto-login Check
// ============================================================================

window.addEventListener('DOMContentLoaded', async function () {
  var user = await NocturnalSession.getActiveUser();
  if (user) {
    NocturnalSession.redirectForUser(user, ROUTE_MAP);
  }
});

// ============================================================================
// Login Form Handler
// ============================================================================

document.addEventListener('DOMContentLoaded', function () {
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type="submit"]');
      var errorDiv = document.getElementById('loginError');
      errorDiv.innerHTML = '';
      NocturnalSession.setButtonLoading(btn);

      var email = document.getElementById('loginEmail').value;
      var password = document.getElementById('loginPassword').value;

      try {
        var data = await AppConfig.fetchRoute('auth.login', {
          method: 'POST',
          skipAuth: true,
          parseJson: true,
          body: JSON.stringify({ email: email, password: password })
        });
        NocturnalSession.completeAuthSuccess(
          NocturnalSession.expectJsonSuccess(data, 'Login failed', {
            isSuccess: function (payload) {
              return !!(payload && payload.success && payload.user);
            }
          }),
          {
            useRoleRedirect: true,
            routeOverrides: ROUTE_MAP
          }
        );
      } catch (error) {
        console.error('Login error:', error);
        NocturnalSession.renderFormMessage(
          errorDiv,
          NocturnalSession.getLoginErrorMessage(error)
        );
      } finally {
        NocturnalSession.resetButtonState(btn);
      }
    });
  }

  // ============================================================================
  // Register Form Handler
  // ============================================================================

  var registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type="submit"]');
      var errorDiv = document.getElementById('registerError');
      NocturnalSession.clearFormMessage(errorDiv);

      var name = document.getElementById('registerName').value;
      var email = document.getElementById('registerEmail').value;
      var password = document.getElementById('registerPassword').value;
      var confirmPassword = document.getElementById('registerConfirmPassword').value;
      var role = document.getElementById('registerRole').value;
      var agreeToTerms = document.getElementById('registerAgreeTerms').checked;

      NocturnalSession.setButtonLoading(btn);

      if (!NocturnalSession.validatePasswordStrength(password, errorDiv)) {
        NocturnalSession.resetButtonState(btn);
        return;
      }

      if (!NocturnalSession.validatePasswordMatch(password, confirmPassword, errorDiv, {
        message: 'Passwords do not match.'
      })) {
        NocturnalSession.resetButtonState(btn);
        return;
      }

      try {
        var data = await AppConfig.fetchRoute('auth.register', {
          method: 'POST',
          skipAuth: true,
          parseJson: true,
          body: JSON.stringify({
            name: name,
            email: email,
            password: password,
            confirmPassword: confirmPassword,
            agreeToTerms: agreeToTerms,
            role: role
          })
        });
        NocturnalSession.completeAuthSuccess(
          NocturnalSession.expectJsonSuccess(data, 'Registration failed', {
            isSuccess: function (payload) {
              return !!(payload && payload.success && payload.user);
            }
          }),
          {
            useRoleRedirect: true,
            routeOverrides: ROUTE_MAP
          }
        );
      } catch (error) {
        console.error('Registration error:', error);
        NocturnalSession.renderFormMessage(
          errorDiv,
          NocturnalSession.getRegistrationErrorMessage(error, {
            duplicateMessage: 'This email is already registered. Please login instead.'
          })
        );
      } finally {
        NocturnalSession.resetButtonState(btn);
      }
    });
  }
});
