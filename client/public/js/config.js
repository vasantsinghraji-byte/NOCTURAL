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
        return 'http://localhost:5000';
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

    // Helper to build full API URLs
    api: function(endpoint) {
        return getApiUrl(endpoint);
    },

    // Get auth token from localStorage
    getToken: function() {
        return localStorage.getItem('token');
    },

    // Get auth headers for API calls
    getAuthHeaders: function(options = {}) {
        const token = this.getToken();
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

// Log configuration in development
if (API_CONFIG.isDevelopment) {
    console.log('API Config:', {
        environment: 'development',
        baseUrl: API_CONFIG.BASE_URL,
        apiUrl: API_URL,
        version: API_CONFIG.API_VERSION
    });
}
