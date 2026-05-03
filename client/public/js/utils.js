// Error handling and validation
class ValidationUtils {
    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    static validatePassword(password) {
        // Minimum 8 characters, at least one uppercase, one lowercase, one number, one special
        const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return re.test(password);
    }
}

// Rate limiting
class RateLimiter {
    static attempts = new Map();

    static checkLimit(key, maxAttempts = 5, timeWindow = 300000) { // 5 minutes window
        const now = Date.now();
        const attempts = this.attempts.get(key) || [];
        const recentAttempts = attempts.filter(time => now - time < timeWindow);
        
        this.attempts.set(key, [...recentAttempts, now]);
        
        return recentAttempts.length < maxAttempts;
    }
}

// Error logging
class Logger {
    static log(type, message, data = {}) {
        console.log(`[${type.toUpperCase()}] ${message}`, data);
        // In production, send to logging service
    }

    static error(error, context = {}) {
        console.error(`[ERROR] ${error.message}`, {
            stack: error.stack,
            context
        });
        // In production, send to error tracking service
    }
}

// ============================================
// Toast Notifications & UI Utilities
// ============================================

// Add CSS animations
(function() {
    if (document.getElementById('utils-styles')) return;
    (function loadExtractedStylesheet() {
    var href = '/css/components/utils.css';
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  })();
})();

// Toast container
function getToastContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

// Show toast notification
const showToast = (message, type = 'info', duration = 4000) => {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '\u2713', error: '\u2717', warning: '\u26A0', info: '\u2139' };

    toast.innerHTML = `
        <span class="toast-symbol">${icons[type] || icons.info}</span>
        <span>${message}</span>
        <button type="button" class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    const closeButton = toast.querySelector('.toast-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            toast.remove();
        });
    }

    setTimeout(() => {
        toast.classList.add('toast-is-exiting');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
};

// Shorthand toast methods
const toast = {
    success: (msg, duration) => showToast(msg, 'success', duration),
    error: (msg, duration) => showToast(msg, 'error', duration),
    warning: (msg, duration) => showToast(msg, 'warning', duration),
    info: (msg, duration) => showToast(msg, 'info', duration)
};

// Loading indicator for buttons
const showLoading = (element, loadingText = 'Loading...') => {
    if (!element) return;
    element.disabled = true;
    element.dataset.originalText = element.innerHTML;
    element.classList.add('btn-loading');
    element.innerHTML = `<span class="spinner"></span> ${loadingText}`;
};

const hideLoading = (element) => {
    if (!element) return;
    element.disabled = false;
    element.classList.remove('btn-loading');
    if (element.dataset.originalText) {
        element.innerHTML = element.dataset.originalText;
    }
};

// Full page loading overlay
const showPageLoading = (message = 'Loading...') => {
    let overlay = document.getElementById('page-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'page-loading-overlay';
        overlay.className = 'page-loading-overlay';
        overlay.innerHTML = `
            <div class="page-loading-spinner"></div>
            <div class="page-loading-message" id="page-loading-message">${message}</div>
        `;
        document.body.appendChild(overlay);
    } else {
        AppUi.setDisplay(overlay, 'flex');
        document.getElementById('page-loading-message').textContent = message;
    }
};

const hidePageLoading = () => {
    const overlay = document.getElementById('page-loading-overlay');
    if (overlay) AppUi.setDisplay(overlay, 'none');
};

// API error handler
const handleApiError = (error, showNotification = true) => {
    console.error('API Error:', error);
    let message = 'An unexpected error occurred';

    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
            message = 'Session expired. Please login again.';
            setTimeout(() => {
                localStorage.removeItem('token');
                window.location.href = AppConfig.routes.page('home');
            }, 2000);
        } else if (status === 403) {
            message = 'You do not have permission to perform this action.';
        } else if (status === 404) {
            message = 'The requested resource was not found.';
        } else if (status === 422 || status === 400) {
            message = data?.message || data?.error || 'Invalid data provided.';
        } else if (status >= 500) {
            message = 'Server error. Please try again later.';
        } else {
            message = data?.message || data?.error || message;
        }
    } else if (error.message) {
        if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
            message = 'Cannot connect to server. Please check your connection.';
        } else {
            message = error.message;
        }
    }

    if (showNotification) toast.error(message);
    return message;
};

// Fetch wrapper with automatic error handling
const isAbsoluteApiUrl = (url) => /^https?:\/\//i.test(url) || url.startsWith('//');

const toStandardApiEndpoint = (url) => {
    if (url.startsWith('/api/')) {
        return url.replace(/^\/api\/(?:v\d+\/)?/, '');
    }

    return url.replace(/^\//, '');
};

const apiFetch = async (url, options = {}) => {
    const defaultHeaders = {
        'Content-Type': 'application/json'
    };

    const mergedOptions = {
        ...options,
        credentials: options.credentials || 'include',
        headers: { ...defaultHeaders, ...options.headers }
    };

    try {
        const response =
            !isAbsoluteApiUrl(url) && typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function'
                ? await AppConfig.fetch(toStandardApiEndpoint(url), mergedOptions)
                : await fetch(url, mergedOptions);
        const data = await response.json();

        if (!response.ok) {
            const error = new Error(data.message || 'Request failed');
            error.response = { status: response.status, data };
            throw error;
        }
        return data;
    } catch (error) {
        handleApiError(error);
        throw error;
    }
};

// Confirmation dialog
const confirmDialog = (message, title = 'Confirm') => {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <h3 class="confirm-title">${title}</h3>
                <p class="confirm-message">${message}</p>
                <div class="confirm-actions">
                    <button id="confirm-cancel" class="confirm-button confirm-button-cancel">Cancel</button>
                    <button id="confirm-ok" class="confirm-button confirm-button-ok">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const cancelButton = overlay.querySelector('#confirm-cancel');
        const confirmButton = overlay.querySelector('#confirm-ok');

        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });
        }

        if (confirmButton) {
            confirmButton.addEventListener('click', () => {
                overlay.remove();
                resolve(true);
            });
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
    });
};

// Format helpers
const formatDate = (dateString, options = {}) => {
    if (typeof AppFormat !== 'undefined' && AppFormat && typeof AppFormat.date === 'function') {
        return AppFormat.date(dateString, 'en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            ...options
        });
    }

    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', ...options });
};

const formatCurrency = (amount, currency = 'INR') => {
    if (typeof AppFormat !== 'undefined' && AppFormat && typeof AppFormat.currencyCode === 'function') {
        return AppFormat.currencyCode(amount, currency, 'en-IN');
    }

    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
};

const debounce = (func, wait = 300) => {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

// Export to global scope
window.showToast = showToast;
window.toast = toast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showPageLoading = showPageLoading;
window.hidePageLoading = hidePageLoading;
window.handleApiError = handleApiError;
window.apiFetch = apiFetch;
window.confirmDialog = confirmDialog;
window.formatDate = formatDate;
window.formatCurrency = formatCurrency;
window.debounce = debounce;
