/**
 * Notification Center Component
 * Reusable notification system that can be included in any page
 */

class NotificationCenter {
    constructor(options = {}) {
        this.apiUrl = options.apiUrl || null;
        this.notifications = [];
        this.unreadCount = 0;
        this.isOpen = false;
        this.pollingInterval = null;

        this.init();
    }

    buildApiUrl(endpoint) {
        const normalizedEndpoint = endpoint.replace(/^\//, '');

        if (this.apiUrl) {
            return `${this.apiUrl.replace(/\/$/, '')}/${normalizedEndpoint}`;
        }

        if (typeof AppConfig !== 'undefined' && typeof AppConfig.api === 'function') {
            return AppConfig.api(normalizedEndpoint);
        }

        return `/api/v1/${normalizedEndpoint}`;
    }

    async fetchApi(endpoint, options = {}) {
        const normalizedEndpoint = endpoint.replace(/^\//, '');

        if (!this.apiUrl && typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function') {
            return AppConfig.fetch(normalizedEndpoint, options);
        }

        return fetch(this.buildApiUrl(normalizedEndpoint), {
            ...options,
            credentials: options.credentials || 'include',
            headers: {
                ...options.headers
            }
        });
    }

    init() {
        this.injectStyles();
        this.injectHTML();
        this.attachEventListeners();
        this.loadNotifications();
        this.startPolling();
    }

    injectStyles() {
        (function loadExtractedStylesheet() {
    var href = '/css/components/notification-center.css';
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  })();
    }

    injectHTML() {
        const container = document.createElement('div');
        container.id = 'notificationCenter';
        container.innerHTML = `
            <div class="notification-bell" id="notificationBell">
                <i class="fas fa-bell"></i>
                <span class="notification-badge is-hidden" id="notificationBadge">0</span>
            </div>
            <div class="notification-panel" id="notificationPanel">
                <div class="notification-header">
                    <div class="notification-title">Notifications</div>
                    <div class="notification-actions">
                        <button class="notification-action-btn" id="markAllReadBtn">
                            <i class="fas fa-check-double"></i> Mark all read
                        </button>
                    </div>
                </div>
                <div class="notification-list" id="notificationList">
                    <!-- Notifications will be inserted here -->
                </div>
                <div class="notification-footer">
                    <button type="button" class="notification-action-btn notification-footer-btn" id="closeNotificationsBtn">
                        Close
                    </button>
                </div>
            </div>
        `;

        // Find nav bar and append
        const navbar = document.querySelector('.navbar .nav-links') || document.querySelector('.navbar');
        if (navbar) {
            navbar.appendChild(container);
        }
    }

    attachEventListeners() {
        // Toggle panel
        const bell = document.getElementById('notificationBell');
        if (bell) {
            bell.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePanel();
            });
        }

        // Mark all as read
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => {
                this.markAllAsRead();
            });
        }

        const closeBtn = document.getElementById('closeNotificationsBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closePanel();
            });
        }

        const notificationList = document.getElementById('notificationList');
        if (notificationList) {
            notificationList.addEventListener('click', (event) => {
                const notificationItem = event.target.closest('[data-notification-id]');
                if (!notificationItem) {
                    return;
                }

                this.handleNotificationClick(notificationItem.dataset.notificationId);
            });
        }

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notificationPanel');
            const bell = document.getElementById('notificationBell');
            if (this.isOpen && panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
                this.closePanel();
            }
        });
    }

    togglePanel() {
        this.isOpen = !this.isOpen;
        const panel = document.getElementById('notificationPanel');
        panel.classList.toggle('open', this.isOpen);

        if (this.isOpen) {
            this.loadNotifications();
        }
    }

    closePanel() {
        this.isOpen = false;
        document.getElementById('notificationPanel').classList.remove('open');
    }

    async loadNotifications() {
        try {
            const response = await this.fetchApi('notifications?limit=10');

            const data = await response.json();
            if (data.success) {
                this.notifications = data.data.notifications || [];
                this.unreadCount = data.data.unreadCount || 0;
                this.updateUI();
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    updateUI() {
        // Update badge
        const badge = document.getElementById('notificationBadge');
        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.classList.remove('is-hidden');
        } else {
            badge.classList.add('is-hidden');
        }

        // Update notification list
        const list = document.getElementById('notificationList');

        if (this.notifications.length === 0) {
            list.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-bell-slash"></i>
                    <div>No notifications</div>
                </div>
            `;
            return;
        }

        list.innerHTML = this.notifications.map(notif => {
            const iconClass = this.getIconClass(notif.type);
            const timeAgo = this.getTimeAgo(notif.createdAt);

            return `
                <div class="notification-item ${!notif.read ? 'unread' : ''}"
                     data-notification-id="${notif._id}">
                    <div class="notification-icon ${iconClass}">
                        ${this.getIcon(notif.type)}
                    </div>
                    <div class="notification-content">
                        <div class="notification-content-title">${notif.title}</div>
                        <div class="notification-content-message">${notif.message}</div>
                        <div class="notification-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getIconClass(type) {
        if (type.includes('SHIFT')) return 'icon-shift';
        if (type.includes('APPLICATION')) return 'icon-application';
        if (type.includes('PAYMENT')) return 'icon-payment';
        if (type.includes('REVIEW')) return 'icon-review';
        return 'icon-system';
    }

    getIcon(type) {
        if (type.includes('SHIFT')) return '<i class="fas fa-calendar-check"></i>';
        if (type.includes('APPLICATION')) return '<i class="fas fa-file-alt"></i>';
        if (type.includes('PAYMENT')) return '<i class="fas fa-dollar-sign"></i>';
        if (type.includes('REVIEW')) return '<i class="fas fa-star"></i>';
        return '<i class="fas fa-bell"></i>';
    }

    getTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return AppFormat.date(date);
    }

    async handleNotificationClick(notificationId) {
        // Mark as read
        await this.markAsRead(notificationId);

        const notification = this.notifications.find((notif) => notif._id === notificationId);
        const actionUrl = notification && notification.actionUrl ? notification.actionUrl : '';

        // Navigate if there's an action URL
        if (actionUrl) {
            window.location.href = actionUrl;
        }

        this.closePanel();
    }

    async markAsRead(notificationId) {
        try {
            await this.fetchApi(`notifications/${notificationId}/read`, {
                method: 'PUT'
            });

            // Update local state
            const notif = this.notifications.find(n => n._id === notificationId);
            if (notif && !notif.read) {
                notif.read = true;
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                this.updateUI();
            }
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }

    async markAllAsRead() {
        try {
            await this.fetchApi('notifications/read-all', {
                method: 'PUT'
            });

            // Update local state
            this.notifications.forEach(n => n.read = true);
            this.unreadCount = 0;
            this.updateUI();
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    }

    startPolling() {
        // Poll for new notifications every 30 seconds
        this.pollingInterval = setInterval(() => {
            this.loadNotifications();
        }, 30000);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
    }
}

// Initialize notification center when DOM is ready
let notificationCenter;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        notificationCenter = new NotificationCenter();
    });
} else {
    notificationCenter = new NotificationCenter();
}
