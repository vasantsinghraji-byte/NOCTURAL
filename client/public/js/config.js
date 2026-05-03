/**
 * API Configuration - Works in Development AND Production
 * Load this BEFORE any other scripts that make API calls
 */

const isLocalDevelopmentHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1';

const getConfiguredApiOrigin = () => {
    const metaTag = document.querySelector('meta[name="nocturnal-api-origin"]');
    const runtimeOverride =
        (typeof window !== 'undefined' && window.__NOCTURNAL_API_ORIGIN__) ||
        (metaTag && metaTag.content);

    return runtimeOverride ? runtimeOverride.replace(/\/$/, '') : '';
};

// Determine the correct API base URL
const getBaseUrl = () => {
    const configuredOrigin = getConfiguredApiOrigin();
    if (configuredOrigin) {
        return configuredOrigin;
    }

    if (isLocalDevelopmentHost(window.location.hostname)) {
        return `${window.location.protocol}//${window.location.hostname}:5000`;
    }

    // In non-local environments, rely on same-origin /api rewrites so custom
    // domains and preview deployments do not need frontend code changes.
    return window.location.origin;
};

// API Configuration Object
const API_CONFIG = {
    BASE_URL: getBaseUrl(),
    API_VERSION: 'v1',
    TIMEOUT: 10000,

    // Environment detection
    isDevelopment: isLocalDevelopmentHost(window.location.hostname),
    isProduction: !isLocalDevelopmentHost(window.location.hostname)
};

// Helper to build API URLs
const getApiUrl = (endpoint) => {
    // Remove leading slash if present
    endpoint = endpoint.replace(/^\//, '');
    return `${API_CONFIG.BASE_URL}/api/${API_CONFIG.API_VERSION}/${endpoint}`;
};

// Full API URL (for backward compatibility)
const API_URL = `${API_CONFIG.BASE_URL}/api/${API_CONFIG.API_VERSION}`;
const AUTH_TOKEN_STORAGE_KEY = 'token';
const LEGACY_AUTH_TOKEN_KEYS = ['patientToken', 'providerToken'];
const ROUTE_CONFIG = Object.freeze({
    home: '/index.html',
    unifiedLanding: '/shared/register.html',
    sharedRegister: '/shared/register.html',
    authSetup: '/shared/auth-setup.html',
    offline: '/shared/offline.html',
    doctor: {
        dashboard: '/roles/doctor/doctor-dashboard.html',
        onboarding: '/roles/doctor/doctor-onboarding.html',
        browseDuties: '/roles/doctor/browse-shifts-enhanced.html',
        browseShifts: '/roles/doctor/browse-shifts-enhanced.html',
        calendar: '/roles/doctor/calendar.html',
        applications: '/roles/doctor/my-applications.html',
        earnings: '/roles/doctor/earnings.html',
        achievements: '/roles/doctor/achievements.html',
        profile: '/roles/doctor/doctor-profile-enhanced.html',
        profileEnhanced: '/roles/doctor/doctor-profile-enhanced.html',
        availability: '/roles/doctor/availability.html',
        dutyDetails: '/roles/doctor/duty-details.html'
    },
    admin: {
        dashboard: '/roles/admin/admin-dashboard.html',
        postDuty: '/roles/admin/admin-post-duty.html',
        applications: '/roles/admin/admin-applications.html',
        analytics: '/roles/admin/admin-analytics.html',
        waitlist: '/roles/admin/admin-waitlist.html',
        settings: '/roles/admin/admin-settings.html',
        profile: '/roles/admin/admin-profile.html'
    },
    patient: {
        login: '/roles/patient/patient-login.html',
        register: '/roles/patient/patient-register.html',
        dashboard: '/roles/patient/patient-dashboard.html',
        bookingForm: '/roles/patient/booking-form.html',
        bookingDetails: '/roles/patient/booking-details.html',
        healthDashboard: '/roles/patient/patient-health-dashboard.html',
        analytics: '/roles/patient/patient-analytics.html',
        healthIntakeForm: '/roles/patient/health-intake-form.html',
        clinicalHistoryForm: '/roles/patient/patient-clinical-history-form.html',
        paymentsDashboard: '/roles/patient/patient-dashboard.html',
        reportDetails: '/roles/patient/report-details.html'
    },
    provider: {
        login: '/roles/provider/provider-login.html',
        dashboard: '/roles/provider/provider-dashboard.html'
    }
});

const getRouteValue = (pathKey) => pathKey.split('.').reduce((value, key) => (
    value && value[key] !== undefined ? value[key] : undefined
), ROUTE_CONFIG);

const withQueryString = (basePath, queryParams) => {
    if (!queryParams || typeof queryParams !== 'object' || Array.isArray(queryParams)) {
        return basePath;
    }

    const searchParams = new URLSearchParams();

    Object.keys(queryParams).forEach((key) => {
        const value = queryParams[key];
        if (value === undefined || value === null || value === '') {
            return;
        }

        searchParams.set(key, String(value));
    });

    const query = searchParams.toString();
    return query ? `${basePath}?${query}` : basePath;
};

const AppRoutes = {
    config: ROUTE_CONFIG,
    page: function(pathKey, queryParams) {
        const route = getRouteValue(pathKey);

        if (!route) {
            throw new Error(`Unknown route key: ${pathKey}`);
        }

        return withQueryString(route, queryParams);
    },
    dashboardForRole: function(role) {
        switch (role) {
            case 'doctor':
            case 'nurse':
            case 'physiotherapist':
                return ROUTE_CONFIG.doctor.dashboard;
            case 'admin':
            case 'hospital':
                return ROUTE_CONFIG.admin.dashboard;
            case 'patient':
                return ROUTE_CONFIG.patient.dashboard;
            case 'provider':
                return ROUTE_CONFIG.provider.dashboard;
            default:
                return ROUTE_CONFIG.home;
        }
    },
    loginForRole: function(role) {
        switch (role) {
            case 'patient':
                return ROUTE_CONFIG.patient.login;
            case 'provider':
                return ROUTE_CONFIG.provider.login;
            default:
                return ROUTE_CONFIG.home;
        }
    }
};

const normalizeFiniteNumber = (value, fallback = 0) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
};

const formatUtcOffsetMinutes = (offsetMinutes) => {
    const numericOffsetMinutes = normalizeFiniteNumber(offsetMinutes, 0);
    const sign = numericOffsetMinutes >= 0 ? '+' : '-';
    const absoluteMinutes = Math.abs(numericOffsetMinutes);
    const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
    const minutes = String(absoluteMinutes % 60).padStart(2, '0');

    return `${sign}${hours}:${minutes}`;
};

const getDatePart = (value) => {
    if (value === undefined || value === null || value === '') {
        return '';
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return '';
        }

        return value.toISOString().split('T')[0];
    }

    return String(value).split('T')[0];
};

const buildScheduledDateTime = (dateValue, timeValue = '', offsetMinutes = 0) => {
    const datePart = getDatePart(dateValue);
    if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return null;
    }

    if (!/^\d{1,2}:\d{2}$/.test(String(timeValue || ''))) {
        return null;
    }

    const [hours, minutes] = String(timeValue).split(':').map(Number);
    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    const explicitOffsetDateTime = `${datePart}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00${formatUtcOffsetMinutes(offsetMinutes)}`;
    const scheduledDateTime = new Date(explicitOffsetDateTime);

    return Number.isNaN(scheduledDateTime.getTime()) ? null : scheduledDateTime;
};

const AppFormat = {
    decimal: function(value, decimals = 0, fallback = 0) {
        return normalizeFiniteNumber(value, fallback).toFixed(decimals);
    },

    percent: function(value, decimals = 0, fallback = 0) {
        return `${this.decimal(value, decimals, fallback)}%`;
    },

    currency: function(value, decimals = 2, symbol = '\u20B9') {
        return `${symbol}${this.decimal(value, decimals)}`;
    },

    currencyWhole: function(value, symbol = '\u20B9', locale = 'en-IN', fallback = 0) {
        return `${symbol}${normalizeFiniteNumber(value, fallback).toLocaleString(locale)}`;
    },

    currencyCode: function(value, currency = 'INR', locale = 'en-IN', fallback = 0) {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency
        }).format(normalizeFiniteNumber(value, fallback));
    },

    currencyCompactThousands: function(value, decimals = 0, symbol = '\u20B9') {
        return `${symbol}${this.decimal(normalizeFiniteNumber(value) / 1000, decimals)}k`;
    },

    megabytes: function(bytes, decimals = 2) {
        return `${this.decimal(normalizeFiniteNumber(bytes) / (1024 * 1024), decimals)} MB`;
    },

    date: function(value, locale = 'en-US', options = {}) {
        if (value === undefined || value === null || value === '') {
            return '';
        }

        const dateValue = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(dateValue.getTime())) {
            return '';
        }

        return dateValue.toLocaleDateString(locale, options);
    },

    dateTime: function(value, timeValue = '', locale = 'en-US', options = {}, separator = ' at ') {
        const formattedDate = this.date(value, locale, options);
        if (!formattedDate) {
            return '';
        }

        return timeValue ? `${formattedDate}${separator}${timeValue}` : formattedDate;
    },

    timeInZone: function(dateValue, timeValue = '', timeZone = 'UTC', offsetMinutes = 0, locale = 'en-US', options = {}) {
        const scheduledDateTime = buildScheduledDateTime(dateValue, timeValue, offsetMinutes);
        if (!scheduledDateTime) {
            return timeValue || '';
        }

        try {
            return new Intl.DateTimeFormat(locale, {
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short',
                timeZone,
                ...options
            }).format(scheduledDateTime);
        } catch (_error) {
            return timeValue || '';
        }
    },

    hours: function(value, suffix = 'h', decimals = 0, fallback = 0) {
        return `${this.decimal(value, decimals, fallback)}${suffix}`;
    }
};
const buildUploadDocumentEndpoint = function(documentType) {
    const uploadDocumentRoutes = {
        mciCert: 'uploads/mci-certificate',
        mciCertificate: 'uploads/mci-certificate',
        photoId: 'uploads/photo-id',
        mbbsDegree: 'uploads/mbbs-degree',
        profilePhoto: 'uploads/profile-photo'
    };

    const resolvedRoute = uploadDocumentRoutes[documentType];
    if (!resolvedRoute) {
        throw new Error(`Unknown upload document type: ${documentType}`);
    }

    return resolvedRoute;
};

const API_ROUTE_CONFIG = Object.freeze({
    auth: {
        login: 'auth/login',
        register: 'auth/register',
        refresh: 'auth/refresh',
        logout: 'auth/logout',
        me: 'auth/me'
    },
    analytics: {
        hospitalDashboard: 'analytics/hospital/dashboard'
    },
    duties: {
        list: 'duties',
        myDuties: 'duties/my-duties',
        detail: ({ dutyId }) => `duties/${dutyId}`
    },
    applications: {
        list: 'applications',
        stats: 'applications/stats',
        received: 'applications/received',
        updateStatus: ({ applicationId }) => `applications/${applicationId}/status`
    },
    calendar: {
        events: 'calendar/events',
        availability: 'calendar/availability',
        availabilityDetail: ({ availabilityId }) => `calendar/availability/${availabilityId}`
    },
    earnings: {
        dashboard: 'earnings/dashboard',
        optimizer: 'earnings/optimizer',
        dispute: ({ earningId }) => `earnings/${earningId}/dispute`
    },
    achievements: {
        list: 'achievements',
        leaderboard: 'achievements/leaderboard',
        claim: ({ achievementId }) => `achievements/${achievementId}/claim`,
        share: ({ achievementId }) => `achievements/${achievementId}/share`
    },
    hospitalSettings: {
        root: 'hospital-settings'
    },
    uploads: {
        profilePhoto: 'uploads/profile-photo',
        document: ({ documentType }) => buildUploadDocumentEndpoint(documentType)
    },
    patients: {
        login: 'patients/login',
        register: 'patients/register',
        stats: 'patients/me/stats'
    },
    funnelEvents: {
        create: 'funnel-events'
    },
    hospitalWaitlist: {
        create: 'hospital-waitlist'
    },
    adminFunnel: {
        dailyAnalytics: 'admin/funnel/analytics/daily',
        waitlist: 'admin/funnel/waitlist',
        waitlistExport: 'admin/funnel/waitlist/export',
        waitlistStatus: ({ leadId }) => `admin/funnel/waitlist/${leadId}/status`
    },
    bookings: {
        list: 'bookings',
        providers: 'bookings/providers/assignable',
        assign: ({ bookingId }) => `bookings/${bookingId}/assign`,
        detail: ({ bookingId }) => `bookings/${bookingId}`,
        patientMine: 'bookings/patient/me',
        providerMine: 'bookings/provider/me',
        review: ({ bookingId }) => `bookings/${bookingId}/review`,
        cancel: ({ bookingId }) => `bookings/${bookingId}/cancel`,
        confirm: ({ bookingId }) => `bookings/${bookingId}/confirm`,
        enRoute: ({ bookingId }) => `bookings/${bookingId}/en-route`,
        start: ({ bookingId }) => `bookings/${bookingId}/start`,
        complete: ({ bookingId }) => `bookings/${bookingId}/complete`
    },
    paymentsB2c: {
        createOrder: 'payments-b2c/create-order',
        verify: 'payments-b2c/verify',
        failure: 'payments-b2c/failure'
    },
    patientDashboard: {
        root: 'patient-dashboard',
        emergencyQr: 'patient-dashboard/emergency-card/qr'
    },
    doctorAccess: {
        list: 'doctor-access/who-has-access',
        revoke: ({ tokenId }) => `doctor-access/revoke/${tokenId}`
    },
    healthIntake: {
        form: 'health-intake/form',
        draft: 'health-intake/draft',
        submit: 'health-intake/submit'
    }
});

const getApiRouteValue = (pathKey) => pathKey.split('.').reduce((value, key) => (
    value && value[key] !== undefined ? value[key] : undefined
), API_ROUTE_CONFIG);

const resolveApiRoute = (pathKey, options = {}) => {
    const routeDefinition = getApiRouteValue(pathKey);
    if (!routeDefinition) {
        throw new Error(`Unknown API route key: ${pathKey}`);
    }

    const endpoint = typeof routeDefinition === 'function'
        ? routeDefinition(options.params || {})
        : routeDefinition;

    return withQueryString(endpoint, options.query);
};

const parseJsonBody = async (response) => {
    const responseText = await response.text();

    if (!responseText) {
        return null;
    }

    try {
        return JSON.parse(responseText);
    } catch (error) {
        throw new Error('Invalid JSON response');
    }
};

const parseTextBody = async (response) => {
    return response.text();
};

// AppConfig object (backward compatibility with existing code)
const AppConfig = {
    API_URL: API_URL,
    BASE_URL: API_CONFIG.BASE_URL,
    API_VERSION: API_CONFIG.API_VERSION,
    TIMEOUT: API_CONFIG.TIMEOUT,
    isDevelopment: API_CONFIG.isDevelopment,
    isProduction: API_CONFIG.isProduction,
    routes: AppRoutes,
    apiRoutes: API_ROUTE_CONFIG,

    // Helper to build full API URLs
    api: function(endpoint) {
        return getApiUrl(endpoint);
    },

    endpoint: function(pathKey, options = {}) {
        return resolveApiRoute(pathKey, options);
    },

    fetchRoute: function(pathKey, options = {}, routeOptions = {}) {
        return this.fetch(this.endpoint(pathKey, routeOptions), options);
    },

    // JWTs are stored in httpOnly cookies; remove any legacy client-side tokens.
    getToken: function(options = {}) {
        const configuredKeys = Array.isArray(options.tokenKeys) && options.tokenKeys.length > 0
            ? options.tokenKeys
            : LEGACY_AUTH_TOKEN_KEYS;
        const tokenKeys = [...new Set([AUTH_TOKEN_STORAGE_KEY, ...configuredKeys])];

        tokenKeys.forEach((key) => localStorage.removeItem(key));

        return null;
    },

    isAuthenticated: function(options = {}) {
        this.getToken(options);
        return !!(
            localStorage.getItem('user') ||
            localStorage.getItem('userType') ||
            localStorage.getItem('userId')
        );
    },

    setToken: function(token) {
        this.clearToken();
    },

    clearToken: function() {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        LEGACY_AUTH_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
    },

    // Get auth headers for API calls
    getAuthHeaders: function(options = {}) {
        this.getToken(options);
        const headers = { 'Content-Type': 'application/json' };
        return headers;
    },

    // Make authenticated API call with timeout
    fetch: async function(endpoint, options = {}) {
        const requestOptions = { ...options };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);
        const shouldParseJson = requestOptions.parseJson === true;
        const shouldParseText = requestOptions.parseText === true;
        const isFormDataBody =
            typeof FormData !== 'undefined' &&
            requestOptions.body instanceof FormData;
        const defaultHeaders = this.getAuthHeaders(requestOptions);

        delete requestOptions.skipAuth;
        delete requestOptions.parseJson;
        delete requestOptions.parseText;

        if (isFormDataBody) {
            delete defaultHeaders['Content-Type'];
        }

        try {
            const requestUrl = getApiUrl(endpoint);
            const requestInit = {
                ...requestOptions,
                credentials: requestOptions.credentials || 'include',
                headers: {
                    ...defaultHeaders,
                    ...requestOptions.headers
                },
                signal: controller.signal
            };
            let response = await fetch(requestUrl, requestInit);

            const canRefreshSession =
                response.status === 401 &&
                !options.skipAuth &&
                !endpoint.replace(/^\//, '').startsWith('auth/refresh') &&
                !endpoint.replace(/^\//, '').startsWith('auth/logout');

            if (canRefreshSession) {
                const refreshResponse = await fetch(getApiUrl('auth/refresh'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal
                });

                if (refreshResponse.ok) {
                    response = await fetch(requestUrl, requestInit);
                }
            }

            clearTimeout(timeoutId);

            if (!shouldParseJson) {
                if (!shouldParseText) {
                    return response;
                }

                const text = await parseTextBody(response);

                if (!response.ok) {
                    throw new Error(text || 'Request failed');
                }

                return text;
            }

            const data = await parseJsonBody(response);

            if (!response.ok) {
                const requestError = new Error((data && data.message) || 'Request failed');
                requestError.status = response.status;
                requestError.payload = data;
                throw requestError;
            }

            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }
};

const AppUi = {
    ensureStylesheet: function(href) {
        if (
            typeof document === 'undefined'
            || !document.querySelector
            || !document.createElement
            || !document.head
            || !document.head.appendChild
        ) {
            return;
        }

        if (!href || document.querySelector('link[href="' + href + '"]')) {
            return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    },

    setDisplay: function(element, displayMode) {
        if (!element) {
            return;
        }

        element.classList.remove(
            'is-hidden',
            'is-block',
            'is-flex',
            'is-inline',
            'is-inline-block',
            'is-grid'
        );

        if (!displayMode || displayMode === 'none') {
            element.classList.add('is-hidden');
            return;
        }

        const className = {
            block: 'is-block',
            flex: 'is-flex',
            inline: 'is-inline',
            'inline-block': 'is-inline-block',
            grid: 'is-grid'
        }[displayMode];

        if (className) {
            element.classList.add(className);
        }
    },

    percentWidthClass: function(value) {
        const numericValue = typeof value === 'string'
            ? parseFloat(value.replace('%', ''))
            : Number(value);
        const bounded = Math.max(0, Math.min(100, Math.round(Number.isFinite(numericValue) ? numericValue : 0)));
        return `w-pct-${bounded}`;
    },

    setPercentWidth: function(element, value) {
        if (!element) {
            return;
        }

        Array.from(element.classList)
            .filter((className) => /^w-pct-\d+$/.test(className))
            .forEach((className) => element.classList.remove(className));

        element.classList.add(AppUi.percentWidthClass(value));
    }
};

AppUi.ensureStylesheet('/css/components/display-helpers.css');

// Export for use globally
window.API_CONFIG = API_CONFIG;
window.getApiUrl = getApiUrl;
window.API_URL = API_URL;
window.AppConfig = AppConfig;
window.AppRoutes = AppRoutes;
window.API_ROUTE_CONFIG = API_ROUTE_CONFIG;
window.AppFormat = AppFormat;
window.AppUi = AppUi;

// Log configuration in development
if (API_CONFIG.isDevelopment) {
    console.log('API Config:', {
        environment: 'development',
        baseUrl: API_CONFIG.BASE_URL,
        apiUrl: API_URL,
        version: API_CONFIG.API_VERSION
    });
}



