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

    // Get auth token from localStorage
    getToken: function(options = {}) {
        const configuredKeys = Array.isArray(options.tokenKeys) && options.tokenKeys.length > 0
            ? options.tokenKeys
            : LEGACY_AUTH_TOKEN_KEYS;
        const tokenKeys = [...new Set([AUTH_TOKEN_STORAGE_KEY, ...configuredKeys])];

        for (const key of tokenKeys) {
            const token = localStorage.getItem(key);
            if (!token) {
                continue;
            }

            if (key !== AUTH_TOKEN_STORAGE_KEY) {
                localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
                localStorage.removeItem(key);
            }

            return token;
        }

        return null;
    },

    isAuthenticated: function(options = {}) {
        return !!this.getToken(options);
    },

    setToken: function(token) {
        if (!token) {
            return;
        }

        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
        LEGACY_AUTH_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
    },

    clearToken: function() {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        LEGACY_AUTH_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
    },

    // Get auth headers for API calls
    getAuthHeaders: function(options = {}) {
        const token = this.getToken(options);
        const headers = { 'Content-Type': 'application/json' };
        if (token && !options.skipAuth) {
            headers['Authorization'] = `Bearer ${token}`;
        }
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
            const response = await fetch(getApiUrl(endpoint), {
                ...requestOptions,
                headers: {
                    ...defaultHeaders,
                    ...requestOptions.headers
                },
                signal: controller.signal
            });
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
                throw new Error((data && data.message) || 'Request failed');
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

// Export for use globally
window.API_CONFIG = API_CONFIG;
window.getApiUrl = getApiUrl;
window.API_URL = API_URL;
window.AppConfig = AppConfig;
window.AppRoutes = AppRoutes;
window.API_ROUTE_CONFIG = API_ROUTE_CONFIG;

// Log configuration in development
if (API_CONFIG.isDevelopment) {
    console.log('API Config:', {
        environment: 'development',
        baseUrl: API_CONFIG.BASE_URL,
        apiUrl: API_URL,
        version: API_CONFIG.API_VERSION
    });
}
