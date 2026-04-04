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

  window.NocturnalSession = {
    persistSession: persistSession,
    clearSession: clearSession,
    redirectForUser: redirectForUser,
    getActiveUser: getActiveUser,
    renderFormMessage: renderFormMessage,
    getLoginErrorMessage: getLoginErrorMessage,
    getRegistrationErrorMessage: getRegistrationErrorMessage,
    routes: Object.assign({}, DEFAULT_ROUTES)
  };
})(window);
