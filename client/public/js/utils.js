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
    const style = document.createElement('style');
    style.id = 'utils-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .toast-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .toast {
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            color: white;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
        }
        .toast-success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
        .toast-error { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
        .toast-warning { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
        .toast-info { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
        .toast-close {
            margin-left: auto;
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            opacity: 0.7;
            font-size: 1.2rem;
            padding: 0;
        }
        .toast-close:hover { opacity: 1; }
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.8s linear infinite;
        }
        .btn-loading {
            position: relative;
            pointer-events: none;
            opacity: 0.8;
        }
    `;
    document.head.appendChild(style);
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
        <span style="font-size:1.2rem">${icons[type] || icons.info}</span>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out forwards';
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
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,255,255,0.9);
            display: flex; align-items: center; justify-content: center;
            z-index: 9999; flex-direction: column; gap: 16px;
        `;
        overlay.innerHTML = `
            <div style="width:50px;height:50px;border:4px solid #e0e0e0;border-top-color:#667eea;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <div style="color:#666;font-size:16px;" id="page-loading-message">${message}</div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.style.display = 'flex';
        document.getElementById('page-loading-message').textContent = message;
    }
};

const hidePageLoading = () => {
    const overlay = document.getElementById('page-loading-overlay');
    if (overlay) overlay.style.display = 'none';
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
                window.location.href = 'index.html';
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
const apiFetch = async (url, options = {}) => {
    const token = localStorage.getItem('token');
    const defaultHeaders = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const mergedOptions = {
        ...options,
        headers: { ...defaultHeaders, ...options.headers }
    };

    try {
        const response = await fetch(url, mergedOptions);
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
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center;
            z-index: 10001;
        `;
        overlay.innerHTML = `
            <div style="background:white;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 12px 0;color:#333;">${title}</h3>
                <p style="margin:0 0 24px 0;color:#666;">${message}</p>
                <div style="display:flex;gap:12px;justify-content:flex-end;">
                    <button id="confirm-cancel" style="padding:10px 20px;border:1px solid #ddd;background:white;border-radius:6px;cursor:pointer;">Cancel</button>
                    <button id="confirm-ok" style="padding:10px 20px;border:none;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border-radius:6px;cursor:pointer;">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#confirm-cancel').onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('#confirm-ok').onclick = () => { overlay.remove(); resolve(true); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
};

// Format helpers
const formatDate = (dateString, options = {}) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', ...options });
};

const formatCurrency = (amount, currency = 'INR') => {
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
