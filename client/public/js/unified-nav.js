/**
 * Unified Navigation Component
 * Provides consistent navigation across all pages based on user role
 */

class UnifiedNavigation {
    constructor() {
        this.currentUser = null;
        this.routes =
            typeof AppConfig !== 'undefined' && AppConfig.routes
                ? AppConfig.routes
                : null;
        this.init();
    }

    getPageRoute(pathKey, fallbackPath, queryParams) {
        if (this.routes && typeof this.routes.page === 'function') {
            return this.routes.page(pathKey, queryParams);
        }

        return fallbackPath;
    }

    buildApiUrl(endpoint) {
        const normalizedEndpoint = endpoint.replace(/^\//, '');

        if (typeof AppConfig !== 'undefined' && typeof AppConfig.api === 'function') {
            return AppConfig.api(normalizedEndpoint);
        }

        return `/api/v1/${normalizedEndpoint}`;
    }

    request(endpoint, options = {}) {
        const normalizedEndpoint = endpoint.replace(/^\//, '');

        if (typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function') {
            return AppConfig.fetch(normalizedEndpoint, options);
        }

        return fetch(this.buildApiUrl(normalizedEndpoint), options);
    }

    async init() {
        await this.loadUser();
        this.injectStyles();
        this.createNavigation();
        this.setActiveLink();
    }

    async loadUser() {
        const hasSessionProfile = !!(
            localStorage.getItem('user') ||
            localStorage.getItem('userType') ||
            localStorage.getItem('userId')
        );
        if (!hasSessionProfile) return;

        try {
            const response = await this.request('auth/me');
            const data = await response.json();
            if (data.success) {
                this.currentUser = data.user;
            }
        } catch (error) {
            console.error('Error loading user:', error);
        }
    }

    injectStyles() {
        (function loadExtractedStylesheet() {
    var href = '/css/components/unified-nav.css';
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  })();
    }

    createNavigation() {
        const existingNav = document.querySelector('.navbar') || document.querySelector('nav');
        if (!existingNav) return;

        const role = this.currentUser?.role;
        let menuItems = [];

        if (role === 'doctor') {
            menuItems = [
                { icon: 'fa-home', text: 'Dashboard', href: this.getPageRoute('doctor.dashboard', '/roles/doctor/doctor-dashboard.html') },
                { icon: 'fa-search', text: 'Browse Shifts', href: this.getPageRoute('doctor.browseShifts', '/roles/doctor/browse-shifts-enhanced.html') },
                { icon: 'fa-calendar', text: 'My Calendar', href: this.getPageRoute('doctor.calendar', '/roles/doctor/calendar.html') },
                { icon: 'fa-file-alt', text: 'Applications', href: this.getPageRoute('doctor.applications', '/roles/doctor/my-applications.html') },
                { icon: 'fa-wallet', text: 'Earnings', href: this.getPageRoute('doctor.earnings', '/roles/doctor/earnings.html') },
                {
                    icon: 'fa-ellipsis-h',
                    text: 'More',
                    dropdown: [
                        { icon: 'fa-user', text: 'My Profile', href: this.getPageRoute('doctor.profileEnhanced', '/roles/doctor/doctor-profile-enhanced.html') },
                        { icon: 'fa-trophy', text: 'Achievements', href: this.getPageRoute('doctor.achievements', '/roles/doctor/achievements.html') },
                        { icon: 'fa-clock', text: 'Availability', href: this.getPageRoute('doctor.availability', '/roles/doctor/availability.html') },
                        { divider: true },
                        { icon: 'fa-cog', text: 'Settings', href: '#' },
                        { icon: 'fa-question-circle', text: 'Help', href: '#' }
                    ]
                }
            ];
        } else if (role === 'admin' || role === 'nurse') {
            menuItems = [
                { icon: 'fa-home', text: 'Dashboard', href: this.getPageRoute('admin.dashboard', '/roles/admin/admin-dashboard.html') },
                { icon: 'fa-plus-circle', text: 'Post Shift', href: this.getPageRoute('admin.postDuty', '/roles/admin/admin-post-duty.html') },
                { icon: 'fa-users', text: 'Applications', href: this.getPageRoute('admin.applications', '/roles/admin/admin-applications.html') },
                { icon: 'fa-chart-bar', text: 'Analytics', href: this.getPageRoute('admin.analytics', '/roles/admin/admin-analytics.html') },
                { icon: 'fa-envelope-open-text', text: 'Waitlist', href: this.getPageRoute('admin.waitlist', '/roles/admin/admin-waitlist.html') },
                {
                    icon: 'fa-ellipsis-h',
                    text: 'More',
                    dropdown: [
                        { icon: 'fa-user', text: 'Profile', href: this.getPageRoute('admin.profile', '/roles/admin/admin-profile.html') },
                        { icon: 'fa-cog', text: 'Settings', href: this.getPageRoute('admin.settings', '/roles/admin/admin-settings.html') },
                        { icon: 'fa-wallet', text: 'Payments', href: '#' },
                        { divider: true },
                        { icon: 'fa-question-circle', text: 'Help', href: '#' }
                    ]
                }
            ];
        } else if (role === 'patient') {
            menuItems = [
                { icon: 'fa-home', text: 'Dashboard', href: this.getPageRoute('patient.dashboard', '/roles/patient/patient-dashboard.html') },
                { icon: 'fa-calendar-plus', text: 'Book Service', href: this.getPageRoute('patient.bookingForm', '/roles/patient/booking-form.html') },
                { icon: 'fa-list-alt', text: 'My Bookings', href: this.getPageRoute('patient.bookingDetails', '/roles/patient/booking-details.html') },
                { icon: 'fa-heartbeat', text: 'Health', href: this.getPageRoute('patient.healthDashboard', '/roles/patient/patient-health-dashboard.html') },
                { icon: 'fa-chart-line', text: 'Analytics', href: this.getPageRoute('patient.analytics', '/roles/patient/patient-analytics.html') },
                {
                    icon: 'fa-ellipsis-h',
                    text: 'More',
                    dropdown: [
                        { icon: 'fa-user', text: 'My Profile', href: '#' },
                        { icon: 'fa-history', text: 'History', href: '#' },
                        { icon: 'fa-cog', text: 'Settings', href: '#' },
                        { divider: true },
                        { icon: 'fa-question-circle', text: 'Help', href: '#' }
                    ]
                }
            ];
        }

        // Determine dashboard URL based on role
        const dashboardUrl = role === 'doctor' ? this.getPageRoute('doctor.dashboard', '/roles/doctor/doctor-dashboard.html')
            : role === 'patient' ? this.getPageRoute('patient.dashboard', '/roles/patient/patient-dashboard.html')
            : role === 'admin' || role === 'nurse' ? this.getPageRoute('admin.dashboard', '/roles/admin/admin-dashboard.html')
            : this.getPageRoute('home', '/index.html');

        const nav = document.createElement('nav');
        nav.className = 'unified-navbar';
        nav.innerHTML = `
            <div class="nav-container">
                <a href="${dashboardUrl}" class="nav-brand">
                    <div class="nav-logo">
                        <span>🌙</span>
                        <span>Nocturnal</span>
                    </div>
                    ${role ? `<span class="nav-role-badge">${role.charAt(0).toUpperCase() + role.slice(1)}</span>` : ''}
                </a>

                <button class="mobile-menu-toggle" type="button" data-nav-action="toggle-mobile-menu">
                    <i class="fas fa-bars"></i>
                </button>

                <ul class="nav-menu" id="navMenu">
                    ${menuItems.map(item => {
                        if (item.dropdown) {
                            return `
                                <li class="nav-item nav-dropdown">
                                    <button class="nav-dropdown-toggle" type="button" data-nav-action="toggle-dropdown">
                                        <i class="fas ${item.icon}"></i>
                                        <span>${item.text}</span>
                                        <i class="fas fa-chevron-down nav-chevron"></i>
                                    </button>
                                    <div class="nav-dropdown-menu">
                                        ${item.dropdown.map(subItem => {
                                            if (subItem.divider) {
                                                return '<div class="nav-dropdown-divider"></div>';
                                            }
                                            return `
                                                <a href="${subItem.href}" class="nav-dropdown-item">
                                                    <i class="fas ${subItem.icon}"></i>
                                                    <span>${subItem.text}</span>
                                                </a>
                                            `;
                                        }).join('')}
                                    </div>
                                </li>
                            `;
                        }
                        return `
                            <li class="nav-item">
                                <a href="${item.href}" class="nav-link">
                                    <i class="fas ${item.icon}"></i>
                                    <span>${item.text}</span>
                                </a>
                            </li>
                        `;
                    }).join('')}

                    <li class="nav-item nav-item-spaced">
                        <div id="notificationCenter"></div>
                    </li>

                    <li class="nav-item nav-dropdown">
                        <button class="nav-dropdown-toggle" type="button" data-nav-action="toggle-dropdown">
                            <div class="nav-user">
                                ${this.getUserAvatar()}
                                <div class="nav-user-info">
                                    <div class="nav-user-name">${this.currentUser?.name || 'User'}</div>
                                    <div class="nav-user-role">${this.formatRole(role)}</div>
                                </div>
                            </div>
                            <i class="fas fa-chevron-down nav-chevron"></i>
                        </button>
                        <div class="nav-dropdown-menu">
                            <a href="${role === 'doctor' ? this.getPageRoute('doctor.profileEnhanced', '/roles/doctor/doctor-profile-enhanced.html') : role === 'patient' ? this.getPageRoute('patient.dashboard', '/roles/patient/patient-dashboard.html') : this.getPageRoute('admin.profile', '/roles/admin/admin-profile.html')}" class="nav-dropdown-item">
                                <i class="fas fa-user"></i>
                                <span>My Profile</span>
                            </a>
                            <a href="${role === 'patient' ? this.getPageRoute('patient.bookingDetails', '/roles/patient/booking-details.html') : this.getPageRoute('doctor.earnings', '/roles/doctor/earnings.html')}" class="nav-dropdown-item">
                                <i class="fas ${role === 'patient' ? 'fa-calendar-check' : 'fa-wallet'}"></i>
                                <span>${role === 'patient' ? 'My Bookings' : 'Earnings'}</span>
                            </a>
                            <a href="#" class="nav-dropdown-item">
                                <i class="fas fa-cog"></i>
                                <span>Settings</span>
                            </a>
                            <div class="nav-dropdown-divider"></div>
                            <a href="#" class="nav-dropdown-item" data-nav-action="logout">
                                <i class="fas fa-sign-out-alt"></i>
                                <span>Logout</span>
                            </a>
                        </div>
                    </li>
                </ul>
            </div>
        `;

        existingNav.replaceWith(nav);
        this.attachNavEventListeners(nav);
    }

    attachNavEventListeners(navElement) {
        navElement.addEventListener('click', (event) => {
            const actionElement = event.target.closest('[data-nav-action]');
            if (!actionElement) {
                return;
            }

            const action = actionElement.dataset.navAction;

            if (action === 'toggle-mobile-menu') {
                this.toggleMobileMenu();
                return;
            }

            if (action === 'toggle-dropdown') {
                this.toggleDropdown(event, actionElement);
                return;
            }

            if (action === 'logout') {
                this.logout(event);
            }
        });
    }

    getUserAvatar() {
        if (this.currentUser?.profilePhoto?.url) {
            const baseUrl = (typeof AppConfig !== 'undefined' && AppConfig.BASE_URL)
                ? AppConfig.BASE_URL
                : window.location.origin;
            return `<img src="${baseUrl}${this.currentUser.profilePhoto.url}" class="nav-user-avatar" alt="Profile">`;
        }
        const initial = this.currentUser?.name?.charAt(0).toUpperCase() || 'U';
        return `<div class="nav-user-avatar-placeholder">${initial}</div>`;
    }

    formatRole(role) {
        if (!role) return 'Guest';
        if (role === 'admin') return 'Hospital Admin';
        if (role === 'doctor') return 'Medical Professional';
        if (role === 'nurse') return 'Nurse';
        if (role === 'patient') return 'Patient';
        return role.charAt(0).toUpperCase() + role.slice(1);
    }

    setActiveLink() {
        const currentPage = window.location.pathname.split('/').pop();
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href === currentPage) {
                link.classList.add('active');
            }
        });
    }
    toggleMobileMenu() {
        const menu = document.getElementById('navMenu');
        if (menu) {
            menu.classList.toggle('active');
        }
    }

    toggleDropdown(event, triggerElement) {
        if (window.innerWidth <= 1024) {
            event.preventDefault();
            const dropdown = triggerElement.closest('.nav-dropdown');
            if (dropdown) {
                dropdown.classList.toggle('active');
            }
        }
    }

    logout(event) {
        if (event && event.preventDefault) {
            event.preventDefault();
        }
        if (confirm('Are you sure you want to logout?')) {
            if (typeof AppConfig !== 'undefined' && typeof AppConfig.clearToken === 'function') {
                AppConfig.clearToken();
            } else {
                localStorage.removeItem('token');
                localStorage.removeItem('patientToken');
            }
            localStorage.removeItem('user');
            localStorage.removeItem('patient');
            window.location.href = this.getPageRoute('home', '/index.html');
        }
    }
}

// Initialize navigation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new UnifiedNavigation();
    });
} else {
    new UnifiedNavigation();
}
