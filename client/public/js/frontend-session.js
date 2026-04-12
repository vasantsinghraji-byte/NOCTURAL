/**
 * Shared frontend session and role redirect helpers.
 * Load after config.js and before landing/index-unified page scripts.
 */

if (typeof AppConfig === 'undefined') {
  console.error('frontend-session.js: AppConfig not loaded - ensure config.js is included before this script');
}

(function initFrontendSession(window) {
  var appRoutes = typeof AppConfig !== 'undefined' && AppConfig.routes ? AppConfig.routes : null;
  var DEFAULT_ROUTES = {
    doctorDashboard: appRoutes ? appRoutes.page('doctor.dashboard') : '/roles/doctor/doctor-dashboard.html',
    doctorOnboarding: appRoutes ? appRoutes.page('doctor.onboarding') : '/roles/doctor/doctor-onboarding.html',
    adminDashboard: appRoutes ? appRoutes.page('admin.dashboard') : '/roles/admin/admin-dashboard.html',
    patientDashboard: appRoutes ? appRoutes.page('patient.dashboard') : '/roles/patient/patient-dashboard.html'
  };
  var ROLE_LOGOUT_KEYS = {
    patient: ['patient'],
    provider: ['provider'],
    admin: [],
    doctor: []
  };

  function persistSession(user, userType) {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userType', userType);
    localStorage.setItem('userName', user.name || '');
    localStorage.setItem('userId', user.id || user._id || '');
  }

  function clearSession() {
    if (typeof AppConfig !== 'undefined' && typeof AppConfig.clearToken === 'function') {
      AppConfig.clearToken();
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('patientToken');
    }
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
  }

  function logout(options) {
    var config = Object.assign({
      clearAll: false,
      clearKeys: null,
      redirectUrl: appRoutes ? appRoutes.page('home') : '/index.html'
    }, options || {});

    if (config.clearAll) {
      localStorage.clear();
    } else if (Array.isArray(config.clearKeys) && config.clearKeys.length > 0) {
      config.clearKeys.forEach(function (key) {
        localStorage.removeItem(key);
      });
    } else {
      clearSession();
    }

    if (config.redirectUrl) {
      window.location.href = config.redirectUrl;
    }
  }

  function getRoleLogoutKeys(role, extraKeys) {
    var roleKeys = ROLE_LOGOUT_KEYS[role] || [];
    var extras = Array.isArray(extraKeys) ? extraKeys : [];
    var baseKeys = ['token', 'patientToken', 'providerToken', 'user', 'userType', 'userName', 'userId'];

    return Array.from(new Set(baseKeys.concat(roleKeys, extras)));
  }

  function logoutForRole(role, options) {
    var config = Object.assign({
      redirectUrl: appRoutes ? appRoutes.page('home') : '/index.html',
      extraKeys: null,
      clearAll: false
    }, options || {});

    if (config.clearAll) {
      logout({
        clearAll: true,
        redirectUrl: config.redirectUrl
      });
      return;
    }

    logout({
      clearKeys: getRoleLogoutKeys(role, config.extraKeys),
      redirectUrl: config.redirectUrl
    });
  }

  function getStoredToken(options) {
    var config = Object.assign({
      tokenKeys: ['token']
    }, options || {});

    if (typeof AppConfig !== 'undefined' && typeof AppConfig.getToken === 'function') {
      var sharedToken = AppConfig.getToken({
        tokenKeys: config.tokenKeys
      });
      if (sharedToken) {
        return sharedToken;
      }
    }

    for (var i = 0; i < config.tokenKeys.length; i += 1) {
      var token = localStorage.getItem(config.tokenKeys[i]);
      if (token) {
        return token;
      }
    }

    return null;
  }

  function requireAuthToken(options) {
    var config = Object.assign({
      tokenKeys: ['token'],
      redirectUrl: appRoutes ? appRoutes.page('home') : '/index.html',
      userType: null,
      userTypeKey: 'userType',
      onUnauthorized: null
    }, options || {});

    var token = getStoredToken(config);
    var hasExpectedUserType = !config.userType || localStorage.getItem(config.userTypeKey) === config.userType;

    if (token && hasExpectedUserType) {
      return token;
    }

    if (typeof config.onUnauthorized === 'function') {
      config.onUnauthorized(config);
    } else if (config.redirectUrl) {
      window.location.href = config.redirectUrl;
    }

    return null;
  }

  function requireAuthenticatedPage(options) {
    var config = Object.assign({}, options || {});
    var token = requireAuthToken(config);

    if (!token) {
      return null;
    }

    if (typeof config.onAuthorized === 'function') {
      config.onAuthorized(token, config);
    }

    return token;
  }

  function createRoleSession(options) {
    var config = Object.assign({
      role: null,
      storageKeys: [],
      tokenKeys: ['token'],
      legacyTokenKeys: null,
      redirectUrl: appRoutes ? appRoutes.page('home') : '/index.html',
      userType: null,
      userTypeKey: 'userType',
      fallbackName: '',
      fallbackRole: '',
      nameStorageKey: 'userName',
      getName: null,
      getRoleLabel: null,
      extendSession: null
    }, options || {});

    function getStoredRole() {
      for (var index = 0; index < config.storageKeys.length; index += 1) {
        try {
          var storedValue = localStorage.getItem(config.storageKeys[index]);
          if (storedValue) {
            return JSON.parse(storedValue);
          }
        } catch (error) {
          return {};
        }
      }

      return {};
    }

    function getAuthTokenKeys() {
      return Array.isArray(config.legacyTokenKeys) && config.legacyTokenKeys.length > 0
        ? config.legacyTokenKeys
        : config.tokenKeys;
    }

    function requireRolePage(optionsOverride) {
      return requireAuthenticatedPage(Object.assign({
        tokenKeys: config.tokenKeys,
        redirectUrl: config.redirectUrl,
        userType: config.userType,
        userTypeKey: config.userTypeKey
      }, optionsOverride || {}));
    }

    function isRoleAuthenticated() {
      return AppConfig.isAuthenticated({
        tokenKeys: getAuthTokenKeys()
      });
    }

    function getRoleToken() {
      return AppConfig.getToken({
        tokenKeys: getAuthTokenKeys()
      });
    }

    function logoutRole(optionsOverride) {
      logoutForRole(config.role, Object.assign({
        redirectUrl: config.redirectUrl
      }, optionsOverride || {}));
    }

    function populateIdentity(optionsOverride) {
      var identityConfig = Object.assign({
        nameElementId: null,
        welcomeElementId: null,
        avatarElementId: null,
        roleElementId: null,
        extraNameElementIds: [],
        extraAvatarElementIds: [],
        welcomeFormatter: null
      }, optionsOverride || {});
      var entity = getStoredRole();
      var resolvedName = localStorage.getItem(config.nameStorageKey);

      if (!resolvedName && typeof config.getName === 'function') {
        resolvedName = config.getName(entity, identityConfig);
      }

      resolvedName = resolvedName || config.fallbackName;

      var resolvedRoleLabel = typeof config.getRoleLabel === 'function'
        ? config.getRoleLabel(entity, identityConfig)
        : config.fallbackRole;
      var avatarText = resolvedName ? resolvedName.charAt(0).toUpperCase() : '';

      if (identityConfig.nameElementId) {
        var nameElement = document.getElementById(identityConfig.nameElementId);
        if (nameElement) {
          nameElement.textContent = resolvedName;
        }
      }

      if (identityConfig.welcomeElementId) {
        var welcomeElement = document.getElementById(identityConfig.welcomeElementId);
        if (welcomeElement) {
          welcomeElement.textContent = typeof identityConfig.welcomeFormatter === 'function'
            ? identityConfig.welcomeFormatter(entity, resolvedName)
            : resolvedName;
        }
      }

      if (identityConfig.avatarElementId) {
        var avatarElement = document.getElementById(identityConfig.avatarElementId);
        if (avatarElement) {
          avatarElement.textContent = avatarText;
        }
      }

      if (identityConfig.roleElementId) {
        var roleElement = document.getElementById(identityConfig.roleElementId);
        if (roleElement) {
          roleElement.textContent = resolvedRoleLabel;
        }
      }

      identityConfig.extraNameElementIds.forEach(function (id) {
        var element = document.getElementById(id);
        if (element) {
          element.textContent = resolvedName;
        }
      });

      identityConfig.extraAvatarElementIds.forEach(function (id) {
        var element = document.getElementById(id);
        if (element) {
          element.textContent = avatarText;
        }
      });

      return {
        entity: entity,
        name: resolvedName,
        roleLabel: resolvedRoleLabel,
        avatarText: avatarText
      };
    }

    var session = {
      getStoredRole: getStoredRole,
      requireAuthenticatedPage: requireRolePage,
      isAuthenticated: isRoleAuthenticated,
      getToken: getRoleToken,
      logout: logoutRole,
      populateIdentity: populateIdentity
    };

    if (typeof config.extendSession === 'function') {
      return config.extendSession(session, config) || session;
    }

    return session;
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
    var token = typeof AppConfig !== 'undefined' && typeof AppConfig.getToken === 'function'
      ? AppConfig.getToken()
      : localStorage.getItem('token');
    if (!token) {
      return null;
    }

    try {
      var data = await AppConfig.fetchRoute('auth.me', {
        parseJson: true
      });
      return expectJsonSuccess(data, 'Failed to load active user', {
        isSuccess: function (payload) {
          return !!(payload && payload.success && payload.user);
        }
      }).user;
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

  function clearFormMessage(container) {
    if (container) {
      container.innerHTML = '';
    }
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

    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.classList.add('loading');
    button.disabled = true;

    if (config.loadingHtml) {
      button.innerHTML = config.loadingHtml;
    } else if (config.clearText) {
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

    if (config.htmlContent) {
      button.innerHTML = config.htmlContent;
      return;
    }

    if (config.textContent !== undefined && config.textContent !== null) {
      button.textContent = config.textContent;
      return;
    }

    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      return;
    }

    button.textContent = button.dataset.originalText || button.textContent;
  }

  function handleValidationFailure(container, message, config) {
    if (typeof config.onInvalid === 'function') {
      config.onInvalid(message, config);
      return false;
    }

    renderFormMessage(container, message, config);
    return false;
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

  function expectJsonSuccess(data, fallbackMessage, options) {
    var config = Object.assign({
      isSuccess: function (payload) {
        return !!(payload && payload.success);
      }
    }, options || {});

    if (config.isSuccess(data)) {
      return data;
    }

    throw new Error((data && data.message) || fallbackMessage || 'Request failed');
  }

  async function loadOptionalDraft(routeKey, options) {
    var config = Object.assign({
      requestOptions: {},
      selectDraft: function (payload) {
        return payload && payload.draft ? payload.draft : null;
      }
    }, options || {});

    try {
      var data = await AppConfig.fetchRoute(routeKey, Object.assign({}, config.requestOptions, {
        parseJson: true
      }));
      return config.selectDraft(data);
    } catch (error) {
      return null;
    }
  }

  function normalizeApplicationStatus(status) {
    return String(status || 'PENDING').toUpperCase();
  }

  function getApplicationStatusClass(status) {
    return normalizeApplicationStatus(status).toLowerCase();
  }

  function getApplicationDutyId(application) {
    if (application && application.duty && application.duty._id) {
      return application.duty._id;
    }

    if (application && typeof application.duty === 'string') {
      return application.duty;
    }

    return application ? (application.dutyId || null) : null;
  }

  function getResponseCollection(payload, collectionKey) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!payload || typeof payload !== 'object') {
      return [];
    }

    if (collectionKey && Array.isArray(payload[collectionKey])) {
      return payload[collectionKey];
    }

    if (Array.isArray(payload.data)) {
      return payload.data;
    }

    if (payload.data && typeof payload.data === 'object') {
      if (collectionKey && Array.isArray(payload.data[collectionKey])) {
        return payload.data[collectionKey];
      }
    }

    return [];
  }

  function getDutyCompensationAmount(duty) {
    if (!duty || typeof duty !== 'object') {
      return 0;
    }

    if (duty.compensation && typeof duty.compensation.totalAmount === 'number') {
      return duty.compensation.totalAmount;
    }

    return duty.totalCompensation || duty.netPayment || duty.pay || 0;
  }

  function getDutyLocationText(duty) {
    if (!duty || !duty.location) {
      return 'Location';
    }

    if (typeof duty.location === 'string') {
      return duty.location;
    }

    var parts = [
      duty.location.address,
      duty.location.city,
      duty.location.state
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : 'Location';
  }

  function getDutyShiftText(duty) {
    if (!duty || typeof duty !== 'object') {
      return 'TBD';
    }

    if (duty.shift) {
      return duty.shift;
    }

    if (duty.startTime && duty.endTime) {
      return duty.startTime + ' - ' + duty.endTime;
    }

    return duty.startTime || 'TBD';
  }

  function normalizeApplicationRecord(application) {
    if (!application || !application.duty || typeof application.duty !== 'object') {
      return application;
    }

    var duty = application.duty;
    var compensationAmount = getDutyCompensationAmount(duty);
    var normalizedCompensation = Object.assign({}, duty.compensation || {});

    if (typeof normalizedCompensation.totalAmount !== 'number') {
      normalizedCompensation.totalAmount = compensationAmount;
    }

    return Object.assign({}, application, {
      duty: Object.assign({}, duty, {
        compensation: normalizedCompensation,
        pay: duty.pay || compensationAmount,
        shift: duty.shift || getDutyShiftText(duty),
        location: typeof duty.location === 'string' ? duty.location : getDutyLocationText(duty)
      })
    });
  }

  async function fetchMyApplications(options) {
    var config = Object.assign({
      page: 1,
      limit: 100,
      allPages: true,
      maxPages: 50,
      status: null,
      fallbackMessage: 'Failed to load applications',
      requestOptions: {}
    }, options || {});

    var page = Math.max(1, parseInt(config.page, 10) || 1);
    var pagesFetched = 0;
    var applications = [];
    var pagination = null;
    var hasNextPage = true;

    while (hasNextPage && pagesFetched < config.maxPages) {
      var query = new URLSearchParams();
      query.set('page', String(page));
      query.set('limit', String(config.limit));
      if (config.status) {
        query.set('status', normalizeApplicationStatus(config.status));
      }

      var payload = expectJsonSuccess(
        await AppConfig.fetchRoute('applications.list', Object.assign({}, config.requestOptions, {
          parseJson: true
        }), {
          query: Object.fromEntries(query.entries())
        }),
        config.fallbackMessage
      );

      applications = applications.concat(
        getResponseCollection(payload, 'applications').map(normalizeApplicationRecord)
      );
      pagination = payload && payload.pagination ? payload.pagination : null;
      pagesFetched += 1;

      hasNextPage = !!(
        config.allPages &&
        pagination &&
        pagination.hasNext &&
        pagination.nextPage
      );

      if (hasNextPage) {
        page = pagination.nextPage;
      }
    }

    return {
      applications: applications,
      pagination: pagination
    };
  }

  async function fetchApplicationStats(options) {
    var config = Object.assign({
      fallbackMessage: 'Failed to load application stats',
      requestOptions: {}
    }, options || {});

    var payload = expectJsonSuccess(
      await AppConfig.fetchRoute('applications.stats', Object.assign({}, config.requestOptions, {
        parseJson: true
      })),
      config.fallbackMessage,
      {
        isSuccess: function (data) {
          return !!(data && data.success && data.stats);
        }
      }
    );

    return payload.stats;
  }

  async function applyForDuty(dutyId, options) {
    var config = Object.assign({
      coverLetter: 'I am interested in this duty and available to support the required shift.',
      fallbackMessage: 'Failed to submit application. Please try again.',
      requestOptions: {}
    }, options || {});

    return expectJsonSuccess(await AppConfig.fetchRoute('applications.list', Object.assign({}, config.requestOptions, {
      method: 'POST',
      parseJson: true,
      body: JSON.stringify({
        duty: dutyId,
        coverLetter: config.coverLetter
      })
    })), config.fallbackMessage);
  }

  function resolveActionButton(event, buttonId) {
    if (buttonId && typeof document !== 'undefined') {
      return document.getElementById(buttonId);
    }

    if (!event || !event.target) {
      return null;
    }

    if (typeof event.target.closest === 'function') {
      return event.target.closest('button');
    }

    return null;
  }

  async function handleDutyApplication(event, dutyId, options) {
    var config = Object.assign({
      stopPropagation: true,
      loadingText: null,
      loadingHtml: null,
      successText: null,
      successHtml: null,
      resetText: null,
      resetHtml: null,
      successMessage: null,
      errorMessage: 'Error submitting application. Please try again.',
      redirectUrl: null,
      redirectDelayMs: 0,
      successEventName: null,
      successEventDetail: null
    }, options || {});

    if (event && config.stopPropagation && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }

    var button = resolveActionButton(event, config.buttonId);

    if (button) {
      setButtonLoading(button, {
        loadingHtml: config.loadingHtml
      });

      if (config.loadingText) {
        button.textContent = config.loadingText;
      }
    }

    try {
      await applyForDuty(dutyId, config);

      if (button) {
        button.classList.remove('loading');
        button.disabled = true;

        if (config.successHtml) {
          button.innerHTML = config.successHtml;
        } else if (config.successText) {
          button.textContent = config.successText;
        }
      }

      if (config.successEventName && typeof document !== 'undefined' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent(config.successEventName, {
          detail: Object.assign({ dutyId: dutyId }, config.successEventDetail || {})
        }));
      }

      if (config.successMessage) {
        window.alert(config.successMessage);
      }

      if (config.redirectUrl) {
        window.setTimeout(function() {
          window.location.href = config.redirectUrl;
        }, config.redirectDelayMs);
      }

      return true;
    } catch (error) {
      console.error('Error applying for duty:', error);

      if (button) {
        resetButtonState(button, {
          textContent: config.resetText,
          htmlContent: config.resetHtml
        });
      }

      if (config.errorMessage) {
        window.alert(config.errorMessage);
      }

      return false;
    }
  }

  function validateRequiredValue(value, container, message, options) {
    if (value) {
      return true;
    }

    return handleValidationFailure(container, message, options || {});
  }

  function validatePasswordMatch(password, confirmPassword, container, options) {
    var config = Object.assign({
      message: 'Passwords do not match',
      onInvalid: null
    }, options || {});

    if (password === confirmPassword) {
      return true;
    }

    return handleValidationFailure(container, config.message, config);
  }

  function validatePhoneNumber(phone, container, options) {
    var config = Object.assign({
      pattern: /^[6-9][0-9]{9}$/,
      message: 'Please enter a valid 10-digit mobile number',
      onInvalid: null
    }, options || {});

    if (config.pattern.test(phone)) {
      return true;
    }

    return handleValidationFailure(container, config.message, config);
  }

  function getPasswordStrengthState(password) {
    var value = password || '';

    return {
      length: value.length >= 8,
      uppercase: /[A-Z]/.test(value),
      lowercase: /[a-z]/.test(value),
      number: /\d/.test(value),
      special: /[@$!%*?&]/.test(value),
      isValid: false
    };
  }

  function validatePasswordStrength(password, container, options) {
    var config = Object.assign({
      message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character.',
      onInvalid: null
    }, options || {});

    var state = getPasswordStrengthState(password);
    state.isValid = state.length && state.uppercase && state.lowercase && state.number && state.special;

    if (state.isValid) {
      return true;
    }

    return handleValidationFailure(container, config.message, config);
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
      if (typeof AppConfig !== 'undefined' && typeof AppConfig.setToken === 'function' &&
          (config.tokenKey === 'token' || config.tokenKey === 'patientToken' || config.tokenKey === 'providerToken')) {
        AppConfig.setToken(authData.token);
      } else {
        localStorage.setItem(config.tokenKey, authData.token);
      }
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
      logout: logout,
      getRoleLogoutKeys: getRoleLogoutKeys,
      logoutForRole: logoutForRole,
      getStoredToken: getStoredToken,
      requireAuthToken: requireAuthToken,
      requireAuthenticatedPage: requireAuthenticatedPage,
      createRoleSession: createRoleSession,
      redirectForUser: redirectForUser,
    getActiveUser: getActiveUser,
    renderFormMessage: renderFormMessage,
    renderSuccessMessage: renderSuccessMessage,
    clearFormMessage: clearFormMessage,
    setButtonLoading: setButtonLoading,
    resetButtonState: resetButtonState,
    getLoginErrorMessage: getLoginErrorMessage,
    getRegistrationErrorMessage: getRegistrationErrorMessage,
    expectJsonSuccess: expectJsonSuccess,
      loadOptionalDraft: loadOptionalDraft,
      normalizeApplicationStatus: normalizeApplicationStatus,
      getApplicationStatusClass: getApplicationStatusClass,
      getApplicationDutyId: getApplicationDutyId,
      getResponseCollection: getResponseCollection,
      getDutyCompensationAmount: getDutyCompensationAmount,
      getDutyLocationText: getDutyLocationText,
      getDutyShiftText: getDutyShiftText,
      normalizeApplicationRecord: normalizeApplicationRecord,
      fetchMyApplications: fetchMyApplications,
      fetchApplicationStats: fetchApplicationStats,
      applyForDuty: applyForDuty,
      handleDutyApplication: handleDutyApplication,
      validateRequiredValue: validateRequiredValue,
    validatePasswordMatch: validatePasswordMatch,
    validatePhoneNumber: validatePhoneNumber,
    getPasswordStrengthState: getPasswordStrengthState,
    validatePasswordStrength: validatePasswordStrength,
    completeAuthSuccess: completeAuthSuccess,
    routes: Object.assign({}, DEFAULT_ROUTES)
  };
})(window);
