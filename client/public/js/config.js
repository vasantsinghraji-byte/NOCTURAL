/**
 * API Configuration - Works in Development AND Production
 * Load this BEFORE any other scripts that make API calls
 */

// API Configuration Object
const API_CONFIG = {
    BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'   // Development
        : window.location.origin,   // Production (same domain)
    API_VERSION: 'v1',
    TIMEOUT: 10000,

    // Environment detection
    isDevelopment: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    isProduction: !(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
};

// Helper to build API URLs
const getApiUrl = (endpoint) => {
    // Remove leading slash if present
    endpoint = endpoint.replace(/^\//, '');
    return `${API_CONFIG.BASE_URL}/api/${API_CONFIG.API_VERSION}/${endpoint}`;
};

// Full API URL (for backward compatibility)
const API_URL = `${API_CONFIG.BASE_URL}/api/${API_CONFIG.API_VERSION}`;

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
    getAuthHeaders: function() {
        const token = this.getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    // Make authenticated API call with timeout
    fetch: async function(endpoint, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

        try {
            const response = await fetch(getApiUrl(endpoint), {
                ...options,
                headers: {
                    ...this.getAuthHeaders(),
                    ...options.headers
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
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
