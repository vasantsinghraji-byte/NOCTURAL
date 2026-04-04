/**
 * Shared frontend session and role redirect helpers.
 * Load after config.js and before landing/index-unified page scripts.
 */

if (typeof AppConfig === 'undefined') {
  console.error('frontend-session.js: AppConfig not loaded - ensure config.js is included before this script');
}

(function initFrontendSession(window) {
  var DEFAULT_ROUTES = {
    doctorDashboard: '/roles/doctor/doctor-dashboard.html',
    doctorOnboarding: '/roles/doctor/doctor-onboarding.html',
    adminDashboard: '/roles/admin/admin-dashboard.html',
    patientDashboard: '/roles/patient/patient-dashboard.html'
  };

  function persistSession(user, userType) {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userType', userType);
    localStorage.setItem('userName', user.name || '');
    localStorage.setItem('userId', user.id || user._id || '');
  }

  function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
  }

  function redirectForUser(user, routeOverrides) {
    var routes = Object.assign({}, DEFAULT_ROUTES, routeOverrides || {});

    if (user.role === 'doctor' || user.role === 'nurse' || user.role === 'physiotherapist') {
      persistSession(user, 'doctor');
      window.location.href = user.onboardingCompleted
        ? routes.doctorDashboard
        : routes.doctorOnboarding;
      return true;
    }

    if (user.role === 'admin') {
      persistSession(user, 'hospital');
      window.location.href = routes.adminDashboard;
      return true;
    }

    if (user.role === 'patient') {
      persistSession(user, 'patient');
      window.location.href = routes.patientDashboard;
      return true;
    }

    return false;
  }

  async function getActiveUser() {
    var token = localStorage.getItem('token');
    if (!token) {
      return null;
    }

    try {
      var response = await AppConfig.fetch('auth/me');
      var data = await response.json();

      if (data.success && data.user) {
        return data.user;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function renderFormMessage(container, message, options) {
    if (!container) {
      return;
    }

    var config = Object.assign({
      className: 'error-message'
    }, options || {});

    container.innerHTML = '<div class="' + config.className + '">' + message + '</div>';
  }

  function renderSuccessMessage(container, message, options) {
    var config = Object.assign({
      className: 'success-message'
    }, options || {});

    renderFormMessage(container, message, config);
  }

  function setButtonLoading(button, options) {
    if (!button) {
      return;
    }

    var config = Object.assign({
      clearText: false
    }, options || {});

    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }

    button.classList.add('loading');
    button.disabled = true;

    if (config.clearText) {
      button.textContent = '';
    }
  }

  function resetButtonState(button, options) {
    if (!button) {
      return;
    }

    var config = Object.assign({
      textContent: button.dataset.originalText || button.textContent
    }, options || {});

    button.classList.remove('loading');
    button.disabled = false;
    button.textContent = config.textContent;
  }

  function getLoginErrorMessage(error, overrides) {
    var config = Object.assign({
      defaultMessage: 'Login failed. Please try again.',
      invalidCredentialsMessage: 'Invalid email or password. Please try again.',
      notFoundMessage: 'Account not found.'
    }, overrides || {});

    var message = (error && error.message) ? error.message : '';
    if (!message) {
      return config.defaultMessage;
    }

    if (message.includes('Invalid credentials')) {
      return config.invalidCredentialsMessage;
    }

    if (message.includes('not found')) {
      return config.notFoundMessage;
    }

    return message;
  }

  function getRegistrationErrorMessage(error, overrides) {
    var config = Object.assign({
      defaultMessage: 'Registration failed. Please try again.',
      duplicateMessage: 'This account is already registered.',
      passwordMessage: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character.'
    }, overrides || {});

    var message = (error && error.message) ? error.message : '';
    if (!message) {
      return config.defaultMessage;
    }

    if (message.includes('already registered') || message.includes('already exists')) {
      return config.duplicateMessage;
    }

    if (message.includes('password')) {
      return config.passwordMessage;
    }

    return message;
  }

  function getAuthUser(authData) {
    return authData.user || authData.patient || null;
  }

  function completeAuthSuccess(authData, options) {
    var config = Object.assign({
      tokenKey: 'token',
      userKey: 'user',
      userTypeKey: null,
      userType: null,
      successContainer: null,
      successMessage: '',
      successClassName: 'success-message',
      redirectUrl: '',
      redirectDelayMs: 0,
      useRoleRedirect: false,
      routeOverrides: null
    }, options || {});

    var user = getAuthUser(authData);

    if (authData.token && config.tokenKey) {
      localStorage.setItem(config.tokenKey, authData.token);
    }

    if (config.useRoleRedirect && user) {
      var doRoleRedirect = function () {
        redirectForUser(user, config.routeOverrides);
      };

      if (config.successContainer && config.successMessage) {
        renderSuccessMessage(config.successContainer, config.successMessage, {
          className: config.successClassName
        });
      }

      if (config.redirectDelayMs > 0) {
        setTimeout(doRoleRedirect, config.redirectDelayMs);
      } else {
        doRoleRedirect();
      }

      return;
    }

    if (user && config.userKey) {
      localStorage.setItem(config.userKey, JSON.stringify(user));
    }

    if (config.userTypeKey && config.userType) {
      localStorage.setItem(config.userTypeKey, config.userType);
    }

    if (config.successContainer && config.successMessage) {
      renderSuccessMessage(config.successContainer, config.successMessage, {
        className: config.successClassName
      });
    }

    if (config.redirectUrl) {
      setTimeout(function () {
        window.location.href = config.redirectUrl;
      }, config.redirectDelayMs);
    }
  }

  window.NocturnalSession = {
    persistSession: persistSession,
    clearSession: clearSession,
    redirectForUser: redirectForUser,
    getActiveUser: getActiveUser,
    renderFormMessage: renderFormMessage,
    renderSuccessMessage: renderSuccessMessage,
    setButtonLoading: setButtonLoading,
    resetButtonState: resetButtonState,
    getLoginErrorMessage: getLoginErrorMessage,
    getRegistrationErrorMessage: getRegistrationErrorMessage,
    completeAuthSuccess: completeAuthSuccess,
    routes: Object.assign({}, DEFAULT_ROUTES)
  };
})(window);
