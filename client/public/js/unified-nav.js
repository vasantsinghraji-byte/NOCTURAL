/**
 * Unified Navigation Component
 * Provides consistent navigation across all pages based on user role
 */

class UnifiedNavigation {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    async init() {
        await this.loadUser();
        this.injectStyles();
        this.createNavigation();
        this.setActiveLink();
    }

    async loadUser() {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            // Use config.js API_URL if available
            const apiUrl = (typeof API_CONFIG !== 'undefined')
                ? `${API_CONFIG.BASE_URL}/api/${API_CONFIG.API_VERSION}`
                : 'http://localhost:5000/api/v1';

            const response = await fetch(`${apiUrl}/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.currentUser = data.user;
            }
        } catch (error) {
            console.error('Error loading user:', error);
        }
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .unified-navbar {
                background: white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                position: sticky;
                top: 0;
                z-index: 999;
            }

            .nav-container {
                max-width: 1400px;
                margin: 0 auto;
                padding: 0 2rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                min-height: 70px;
            }

            .nav-brand {
                display: flex;
                align-items: center;
                gap: 1rem;
                text-decoration: none;
            }

            .nav-logo {
                font-size: 1.8rem;
                font-weight: 700;
                color: #5B8DBE;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .nav-role-badge {
                padding: 0.4rem 1rem;
                background: linear-gradient(135deg, #5B8DBE 0%, #764ba2 100%);
                color: white;
                border-radius: 20px;
                font-size: 0.85rem;
                font-weight: 600;
            }

            .nav-menu {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                list-style: none;
            }

            .nav-item {
                position: relative;
            }

            .nav-link {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.75rem 1.25rem;
                color: #475569;
                text-decoration: none;
                font-weight: 500;
                border-radius: 8px;
                transition: all 0.3s;
                font-size: 0.95rem;
            }

            .nav-link:hover {
                background: #f8f9fa;
                color: #5B8DBE;
            }

            .nav-link.active {
                background: #e8f4fd;
                color: #5B8DBE;
                font-weight: 600;
            }

            .nav-dropdown {
                position: relative;
            }

            .nav-dropdown-toggle {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.75rem 1.25rem;
                background: none;
                border: none;
                color: #475569;
                font-weight: 500;
                cursor: pointer;
                border-radius: 8px;
                transition: all 0.3s;
                font-size: 0.95rem;
            }

            .nav-dropdown-toggle:hover {
                background: #f8f9fa;
                color: #5B8DBE;
            }

            .nav-dropdown-menu {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 0.5rem;
                min-width: 200px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                padding: 0.5rem;
                display: none;
                z-index: 1000;
            }

            .nav-dropdown:hover .nav-dropdown-menu {
                display: block;
            }

            .nav-dropdown-item {
                display: block;
                padding: 0.75rem 1rem;
                color: #475569;
                text-decoration: none;
                border-radius: 6px;
                transition: all 0.3s;
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .nav-dropdown-item:hover {
                background: #f8f9fa;
                color: #5B8DBE;
            }

            .nav-dropdown-divider {
                height: 1px;
                background: #e0e0e0;
                margin: 0.5rem 0;
            }

            .nav-user {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .nav-user-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                object-fit: cover;
                border: 2px solid #5B8DBE;
            }

            .nav-user-avatar-placeholder {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: linear-gradient(135deg, #5B8DBE 0%, #764ba2 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 1.1rem;
            }

            .nav-user-info {
                display: flex;
                flex-direction: column;
            }

            .nav-user-name {
                font-weight: 600;
                color: #2C3E50;
                font-size: 0.95rem;
            }

            .nav-user-role {
                font-size: 0.8rem;
                color: #666;
            }

            .mobile-menu-toggle {
                display: none;
                background: none;
                border: none;
                font-size: 1.5rem;
                color: #475569;
                cursor: pointer;
            }

            @media (max-width: 1024px) {
                .nav-menu {
                    position: fixed;
                    top: 70px;
                    left: -100%;
                    width: 300px;
                    height: calc(100vh - 70px);
                    background: white;
                    flex-direction: column;
                    align-items: flex-start;
                    padding: 1rem;
                    box-shadow: 2px 0 10px rgba(0,0,0,0.1);
                    transition: left 0.3s;
                    overflow-y: auto;
                }

                .nav-menu.active {
                    left: 0;
                }

                .mobile-menu-toggle {
                    display: block;
                }

                .nav-dropdown-menu {
                    position: static;
                    box-shadow: none;
                    margin-top: 0.5rem;
                    margin-left: 1rem;
                }

                .nav-dropdown:hover .nav-dropdown-menu {
                    display: none;
                }

                .nav-dropdown.active .nav-dropdown-menu {
                    display: block;
                }
            }
        `;
        document.head.appendChild(style);
    }

    createNavigation() {
        const existingNav = document.querySelector('.navbar') || document.querySelector('nav');
        if (!existingNav) return;

        const role = this.currentUser?.role;
        let menuItems = [];

        if (role === 'doctor') {
            menuItems = [
                { icon: 'fa-home', text: 'Dashboard', href: '/roles/doctor/doctor-dashboard.html' },
                { icon: 'fa-search', text: 'Browse Shifts', href: '/roles/doctor/browse-shifts-enhanced.html' },
                { icon: 'fa-calendar', text: 'My Calendar', href: '/roles/doctor/calendar.html' },
                { icon: 'fa-file-alt', text: 'Applications', href: '/roles/doctor/my-applications.html' },
                { icon: 'fa-wallet', text: 'Earnings', href: '/roles/doctor/earnings.html' },
                {
                    icon: 'fa-ellipsis-h',
                    text: 'More',
                    dropdown: [
                        { icon: 'fa-user', text: 'My Profile', href: '/roles/doctor/doctor-profile-enhanced.html' },
                        { icon: 'fa-trophy', text: 'Achievements', href: '/roles/doctor/achievements.html' },
                        { icon: 'fa-clock', text: 'Availability', href: '/roles/doctor/availability.html' },
                        { divider: true },
                        { icon: 'fa-cog', text: 'Settings', href: '#' },
                        { icon: 'fa-question-circle', text: 'Help', href: '#' }
                    ]
                }
            ];
        } else if (role === 'admin' || role === 'nurse') {
            menuItems = [
                { icon: 'fa-home', text: 'Dashboard', href: '/roles/admin/admin-dashboard.html' },
                { icon: 'fa-plus-circle', text: 'Post Shift', href: '/roles/admin/admin-post-duty.html' },
                { icon: 'fa-users', text: 'Applications', href: '/roles/admin/admin-applications.html' },
                { icon: 'fa-chart-bar', text: 'Analytics', href: '/roles/admin/admin-analytics.html' },
                {
                    icon: 'fa-ellipsis-h',
                    text: 'More',
                    dropdown: [
                        { icon: 'fa-user', text: 'Profile', href: '/roles/admin/admin-profile.html' },
                        { icon: 'fa-cog', text: 'Settings', href: '/roles/admin/admin-settings.html' },
                        { icon: 'fa-wallet', text: 'Payments', href: '#' },
                        { divider: true },
                        { icon: 'fa-question-circle', text: 'Help', href: '#' }
                    ]
                }
            ];
        } else if (role === 'patient') {
            menuItems = [
                { icon: 'fa-home', text: 'Dashboard', href: '/roles/patient/patient-dashboard.html' },
                { icon: 'fa-calendar-plus', text: 'Book Service', href: '/roles/patient/booking-form.html' },
                { icon: 'fa-list-alt', text: 'My Bookings', href: '/roles/patient/booking-details.html' },
                { icon: 'fa-wallet', text: 'Payments', href: '/roles/patient/payments-dashboard.html' },
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
        const dashboardUrl = role === 'doctor' ? '/roles/doctor/doctor-dashboard.html'
            : role === 'patient' ? '/roles/patient/patient-dashboard.html'
            : role === 'admin' || role === 'nurse' ? '/roles/admin/admin-dashboard.html'
            : '/index.html';

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

                <button class="mobile-menu-toggle" onclick="toggleMobileMenu()">
                    <i class="fas fa-bars"></i>
                </button>

                <ul class="nav-menu" id="navMenu">
                    ${menuItems.map(item => {
                        if (item.dropdown) {
                            return `
                                <li class="nav-item nav-dropdown">
                                    <button class="nav-dropdown-toggle" onclick="toggleDropdown(event)">
                                        <i class="fas ${item.icon}"></i>
                                        <span>${item.text}</span>
                                        <i class="fas fa-chevron-down" style="font-size: 0.7rem;"></i>
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

                    <li class="nav-item" style="margin-left: 1rem;">
                        <div id="notificationCenter"></div>
                    </li>

                    <li class="nav-item nav-dropdown">
                        <button class="nav-dropdown-toggle" onclick="toggleDropdown(event)">
                            <div class="nav-user">
                                ${this.getUserAvatar()}
                                <div class="nav-user-info">
                                    <div class="nav-user-name">${this.currentUser?.name || 'User'}</div>
                                    <div class="nav-user-role">${this.formatRole(role)}</div>
                                </div>
                            </div>
                            <i class="fas fa-chevron-down" style="font-size: 0.7rem;"></i>
                        </button>
                        <div class="nav-dropdown-menu">
                            <a href="${role === 'doctor' ? '/roles/doctor/doctor-profile-enhanced.html' : role === 'patient' ? '/roles/patient/patient-dashboard.html' : '/roles/admin/admin-profile.html'}" class="nav-dropdown-item">
                                <i class="fas fa-user"></i>
                                <span>My Profile</span>
                            </a>
                            <a href="${role === 'patient' ? '/roles/patient/booking-details.html' : '/roles/doctor/earnings.html'}" class="nav-dropdown-item">
                                <i class="fas ${role === 'patient' ? 'fa-calendar-check' : 'fa-wallet'}"></i>
                                <span>${role === 'patient' ? 'My Bookings' : 'Earnings'}</span>
                            </a>
                            <a href="#" class="nav-dropdown-item">
                                <i class="fas fa-cog"></i>
                                <span>Settings</span>
                            </a>
                            <div class="nav-dropdown-divider"></div>
                            <a href="#" class="nav-dropdown-item" onclick="logout(event)">
                                <i class="fas fa-sign-out-alt"></i>
                                <span>Logout</span>
                            </a>
                        </div>
                    </li>
                </ul>
            </div>
        `;

        existingNav.replaceWith(nav);
    }

    getUserAvatar() {
        if (this.currentUser?.profilePhoto?.url) {
            const baseUrl = (typeof API_CONFIG !== 'undefined') ? API_CONFIG.BASE_URL : 'http://localhost:5000';
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
}

// Global functions for mobile menu and dropdowns
window.toggleMobileMenu = function() {
    const menu = document.getElementById('navMenu');
    menu.classList.toggle('active');
};

window.toggleDropdown = function(event) {
    if (window.innerWidth <= 1024) {
        event.preventDefault();
        const dropdown = event.target.closest('.nav-dropdown');
        dropdown.classList.toggle('active');
    }
};

window.logout = function(event) {
    if (event && event.preventDefault) {
        event.preventDefault();
    }
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('patientToken');
        localStorage.removeItem('patient');
        window.location.href = '/index.html';
    }
};

// Initialize navigation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new UnifiedNavigation();
    });
} else {
    new UnifiedNavigation();
}
