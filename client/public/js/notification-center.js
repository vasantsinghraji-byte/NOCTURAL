/**
 * Notification Center Component
 * Reusable notification system that can be included in any page
 */

class NotificationCenter {
    constructor(options = {}) {
        this.API_URL = options.apiUrl || 'http://localhost:5000/api/v1';
        this.notifications = [];
        this.unreadCount = 0;
        this.isOpen = false;
        this.pollingInterval = null;

        this.init();
    }

    init() {
        this.injectStyles();
        this.injectHTML();
        this.attachEventListeners();
        this.loadNotifications();
        this.startPolling();
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .notification-bell {
                position: relative;
                cursor: pointer;
                padding: 0.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .notification-bell i {
                font-size: 1.3rem;
                color: #475569;
                transition: color 0.3s;
            }

            .notification-bell:hover i {
                color: #5B8DBE;
            }

            .notification-badge {
                position: absolute;
                top: 0;
                right: 0;
                background: #dc3545;
                color: white;
                font-size: 0.7rem;
                font-weight: 700;
                padding: 0.15rem 0.4rem;
                border-radius: 10px;
                min-width: 18px;
                text-align: center;
            }

            .notification-panel {
                position: absolute;
                top: 60px;
                right: 20px;
                width: 400px;
                max-height: 600px;
                background: white;
                border-radius: 15px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                z-index: 1000;
                display: none;
                flex-direction: column;
            }

            .notification-panel.open {
                display: flex;
                animation: slideDown 0.3s ease;
            }

            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .notification-header {
                padding: 1.5rem;
                border-bottom: 2px solid #f0f0f0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .notification-title {
                font-size: 1.2rem;
                font-weight: 700;
                color: #2C3E50;
            }

            .notification-actions {
                display: flex;
                gap: 0.5rem;
            }

            .notification-action-btn {
                padding: 0.4rem 0.75rem;
                background: #f8f9fa;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.85rem;
                font-weight: 600;
                color: #5B8DBE;
                transition: all 0.3s;
            }

            .notification-action-btn:hover {
                background: #e9ecef;
            }

            .notification-list {
                flex: 1;
                overflow-y: auto;
                max-height: 450px;
            }

            .notification-item {
                padding: 1rem 1.5rem;
                border-bottom: 1px solid #f0f0f0;
                cursor: pointer;
                transition: background 0.3s;
                display: flex;
                gap: 1rem;
            }

            .notification-item:hover {
                background: #f8f9fa;
            }

            .notification-item.unread {
                background: #e8f4fd;
            }

            .notification-icon {
                flex-shrink: 0;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.1rem;
            }

            .icon-shift {
                background: #e8f5e9;
                color: #28a745;
            }

            .icon-application {
                background: #e3f2fd;
                color: #2196f3;
            }

            .icon-payment {
                background: #fff3cd;
                color: #ffc107;
            }

            .icon-review {
                background: #f3e5f5;
                color: #9c27b0;
            }

            .icon-system {
                background: #f5f5f5;
                color: #666;
            }

            .notification-content {
                flex: 1;
            }

            .notification-content-title {
                font-weight: 600;
                color: #2C3E50;
                margin-bottom: 0.25rem;
                font-size: 0.95rem;
            }

            .notification-content-message {
                color: #666;
                font-size: 0.85rem;
                line-height: 1.4;
            }

            .notification-time {
                font-size: 0.75rem;
                color: #999;
                margin-top: 0.25rem;
            }

            .notification-empty {
                padding: 3rem 1.5rem;
                text-align: center;
                color: #999;
            }

            .notification-empty i {
                font-size: 3rem;
                color: #ddd;
                margin-bottom: 1rem;
            }

            .notification-footer {
                padding: 1rem 1.5rem;
                border-top: 2px solid #f0f0f0;
                text-align: center;
            }

            .notification-view-all {
                color: #5B8DBE;
                text-decoration: none;
                font-weight: 600;
                font-size: 0.9rem;
            }

            .notification-view-all:hover {
                text-decoration: underline;
            }

            @media (max-width: 768px) {
                .notification-panel {
                    right: 10px;
                    left: 10px;
                    width: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }

    injectHTML() {
        const container = document.createElement('div');
        container.id = 'notificationCenter';
        container.innerHTML = `
            <div class="notification-bell" id="notificationBell">
                <i class="fas fa-bell"></i>
                <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
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
                    <a href="notifications.html" class="notification-view-all">
                        View All Notifications
                    </a>
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
        document.getElementById('notificationBell').addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });

        // Mark all as read
        document.getElementById('markAllReadBtn').addEventListener('click', () => {
            this.markAllAsRead();
        });

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notificationPanel');
            const bell = document.getElementById('notificationBell');
            if (this.isOpen && !panel.contains(e.target) && !bell.contains(e.target)) {
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
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await fetch(`${this.API_URL}/notifications?limit=10`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

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
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
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
                     onclick="notificationCenter.handleNotificationClick('${notif._id}', '${notif.actionUrl || ''}')">
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
        return date.toLocaleDateString();
    }

    async handleNotificationClick(notificationId, actionUrl) {
        // Mark as read
        await this.markAsRead(notificationId);

        // Navigate if there's an action URL
        if (actionUrl) {
            window.location.href = actionUrl;
        }

        this.closePanel();
    }

    async markAsRead(notificationId) {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            await fetch(`${this.API_URL}/notifications/${notificationId}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
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
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            await fetch(`${this.API_URL}/notifications/read-all`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
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
