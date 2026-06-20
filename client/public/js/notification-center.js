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
        AppUi.setSafeHtml(container, `
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
        `);

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
            const empty = document.createElement('div');
            empty.className = 'notification-empty';

            const emptyIcon = document.createElement('i');
            emptyIcon.className = 'fas fa-bell-slash';

            const emptyText = document.createElement('div');
            emptyText.textContent = 'No notifications';

            empty.append(emptyIcon, emptyText);
            list.replaceChildren(empty);
            return;
        }

        // Render with DOM APIs (textContent) so notification content cannot inject markup
        const items = this.notifications.map(notif => this.createNotificationItem(notif));
        list.replaceChildren(...items);
    }

    createNotificationItem(notif) {
        const item = document.createElement('div');
        item.className = `notification-item ${!notif.read ? 'unread' : ''}`.trim();
        item.dataset.notificationId = notif._id;

        const icon = document.createElement('div');
        icon.className = `notification-icon ${this.getIconClass(notif.type)}`;
        const iconGlyph = document.createElement('i');
        iconGlyph.className = this.getIconClassName(notif.type);
        icon.appendChild(iconGlyph);

        const content = document.createElement('div');
        content.className = 'notification-content';

        const title = document.createElement('div');
        title.className = 'notification-content-title';
        title.textContent = notif.title || '';

        const message = document.createElement('div');
        message.className = 'notification-content-message';
        message.textContent = notif.message || '';

        const time = document.createElement('div');
        time.className = 'notification-time';
        time.textContent = this.getTimeAgo(notif.createdAt);

        content.append(title, message, time);
        item.append(icon, content);
        return item;
    }

    getIconClass(type) {
        if (type.includes('SHIFT')) return 'icon-shift';
        if (type.includes('APPLICATION')) return 'icon-application';
        if (type.includes('PAYMENT')) return 'icon-payment';
        if (type.includes('REVIEW')) return 'icon-review';
        return 'icon-system';
    }

    getIconClassName(type) {
        if (type.includes('SHIFT')) return 'fas fa-calendar-check';
        if (type.includes('APPLICATION')) return 'fas fa-file-alt';
        if (type.includes('PAYMENT')) return 'fas fa-dollar-sign';
        if (type.includes('REVIEW')) return 'fas fa-star';
        return 'fas fa-bell';
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
        const safeUrl = this.getSafeActionUrl(actionUrl);

        // Navigate only to allowlisted internal paths (blocks open-redirect / javascript: URIs)
        if (safeUrl) {
            window.location.href = safeUrl;
        }

        this.closePanel();
    }

    getSafeActionUrl(actionUrl) {
        if (typeof actionUrl !== 'string' || actionUrl === '') {
            return '';
        }

        const internalBase = 'https://internal.invalid';
        const allowedPathPrefixes = ['/roles/', '/patient/', '/doctor/', '/admin/'];

        try {
            const parsed = new URL(actionUrl, internalBase);
            const decodedPath = decodeURIComponent(parsed.pathname);
            const allowedPath = allowedPathPrefixes.some(prefix => parsed.pathname.startsWith(prefix));

            if (
                parsed.origin !== internalBase ||
                decodedPath.startsWith('//') ||
                decodedPath.includes('\\') ||
                !allowedPath
            ) {
                return '';
            }

            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch (_error) {
            return '';
        }
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
