// API Base URL
        // API_URL is provided by config.js
        let allApplications = [];
        let globalStats = null;
        let currentFilter = 'all';
        let currentPage = 1;
        let currentPagination = null;
        const APPLICATIONS_FILTER_STORAGE_KEY = 'doctorApplicationsFilter';
        const APPLICATIONS_PAGE_STORAGE_KEY = 'doctorApplicationsPage';
        const APPLICATIONS_PAGE_SIZE_STORAGE_KEY = 'doctorApplicationsPageSize';
        const APPLICATIONS_SCROLL_STORAGE_KEY = 'doctorApplicationsScrollY';
        const APPLICATIONS_SCROLL_WRITE_DEBOUNCE_MS = 150;
        let applicationsPageSize = 10;
        let shouldRestoreScrollPosition = false;
        let preferencesToastTimeout = null;
        let preferencesToastCleanupTimeout = null;
        let scrollPersistenceTimeout = null;

        // Check authentication
        function checkAuth() {
            return DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        // Logout function
        async function logout() {
            try {
                DoctorSession.logout({
                    redirectUrl: AppConfig.routes.page('home')
                });
            } catch (error) {
                console.error('Logout error:', error);
                // Force redirect anyway
                window.location.href = AppConfig.routes.page('home');
            }
        }

        // Load user info
        function loadUserInfo() {
            DoctorSession.populateIdentity({
                nameElementId: 'userName',
                avatarElementId: 'userAvatar'
            });
        }

        function loadStoredPageSize() {
            const storedValue = parseInt(localStorage.getItem(APPLICATIONS_PAGE_SIZE_STORAGE_KEY), 10);
            const allowedPageSizes = [10, 25, 50];

            if (allowedPageSizes.includes(storedValue)) {
                applicationsPageSize = storedValue;
            }

            const selector = document.getElementById('pageSizeSelect');
            if (selector) {
                selector.value = String(applicationsPageSize);
            }
        }

        function loadStoredPage() {
            const storedPage = getStoredPageForFilter();

            if (storedPage > 0) {
                currentPage = storedPage;
                shouldRestoreScrollPosition = true;
            }
        }

        function getPageStorageKey(status = currentFilter) {
            return `${APPLICATIONS_PAGE_STORAGE_KEY}:${status || 'all'}`;
        }

        function getStoredPageForFilter(status = currentFilter) {
            const storedPage = parseInt(
                localStorage.getItem(getPageStorageKey(status)) || localStorage.getItem(APPLICATIONS_PAGE_STORAGE_KEY),
                10
            );

            return Number.isInteger(storedPage) && storedPage > 0 ? storedPage : 1;
        }

        function getScrollStorageKey(status = currentFilter) {
            return `${APPLICATIONS_SCROLL_STORAGE_KEY}:${status || 'all'}`;
        }

        function persistScrollPositionNow(status = currentFilter) {
            if (scrollPersistenceTimeout) {
                window.clearTimeout(scrollPersistenceTimeout);
                scrollPersistenceTimeout = null;
            }

            localStorage.setItem(
                getScrollStorageKey(status),
                String(window.scrollY || window.pageYOffset || 0)
            );
        }

        function persistScrollPosition() {
            if (scrollPersistenceTimeout) {
                window.clearTimeout(scrollPersistenceTimeout);
            }

            const statusToPersist = currentFilter;
            scrollPersistenceTimeout = window.setTimeout(() => {
                persistScrollPositionNow(statusToPersist);
            }, APPLICATIONS_SCROLL_WRITE_DEBOUNCE_MS);
        }

        function restoreScrollPosition() {
            if (!shouldRestoreScrollPosition) {
                return;
            }

            shouldRestoreScrollPosition = false;
            const storedScroll = parseInt(localStorage.getItem(getScrollStorageKey()), 10);

            if (Number.isInteger(storedScroll) && storedScroll >= 0) {
                const applicationsSection = document.querySelector('.applications-section');
                const applicationsSectionTop = applicationsSection
                    ? Math.max(applicationsSection.getBoundingClientRect().top + window.scrollY - 16, 0)
                    : 0;
                const maxScrollableTop = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
                const targetScroll = storedScroll > maxScrollableTop
                    ? Math.min(applicationsSectionTop, maxScrollableTop)
                    : Math.min(storedScroll, maxScrollableTop);

                window.requestAnimationFrame(() => {
                    window.scrollTo({
                        top: targetScroll,
                        behavior: 'auto'
                    });
                });
            }
        }

        function setActiveFilterTab(status) {
            document.querySelectorAll('.filter-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.status === status);
            });
        }

        function loadStoredFilter() {
            const storedFilter = localStorage.getItem(APPLICATIONS_FILTER_STORAGE_KEY);
            const allowedFilters = ['all', 'pending', 'accepted', 'rejected', 'withdrawn'];

            if (allowedFilters.includes(storedFilter)) {
                currentFilter = storedFilter;
            }

            setActiveFilterTab(currentFilter);
        }

        function showPreferencesToast(message) {
            const toast = document.getElementById('preferencesToast');
            if (!toast) {
                return;
            }

            toast.textContent = message;
            toast.classList.remove('hiding');
            toast.classList.add('visible');

            if (preferencesToastTimeout) {
                window.clearTimeout(preferencesToastTimeout);
            }

            if (preferencesToastCleanupTimeout) {
                window.clearTimeout(preferencesToastCleanupTimeout);
            }

            const toastDuration = window.matchMedia('(max-width: 768px)').matches ? 1600 : 2200;
            preferencesToastTimeout = window.setTimeout(() => {
                toast.classList.add('hiding');
                preferencesToastCleanupTimeout = window.setTimeout(() => {
                    toast.classList.remove('visible', 'hiding');
                }, 240);
            }, toastDuration);
        }

        function clampCurrentPageToPagination() {
            if (!currentPagination || !currentPagination.pages || currentPage <= currentPagination.pages) {
                return false;
            }

            currentPage = currentPagination.pages;
            localStorage.setItem(getPageStorageKey(), String(currentPage));
            return true;
        }

        function getActiveStatusFilter() {
            return currentFilter === 'all'
                ? null
                : NocturnalSession.normalizeApplicationStatus(currentFilter);
        }

        async function fetchApplicationStats() {
            const token = checkAuth();
            if (!token) return;

            try {
                const stats = await NocturnalSession.fetchApplicationStats({
                    fallbackMessage: 'Failed to load application stats'
                });
                globalStats = stats;
                updateStats();
            } catch (error) {
                console.error('Error fetching application stats:', error);
                globalStats = {
                    total: 0,
                    pending: 0,
                    accepted: 0,
                    rejected: 0,
                    withdrawn: 0,
                    totalEarnings: 0,
                    acceptanceRate: 0
                };
                updateStats();
            }
        }

        // Fetch applications
        async function fetchApplications(page = currentPage) {
            const token = checkAuth();
            if (!token) return;

            currentPage = page;
            localStorage.setItem(getPageStorageKey(), String(currentPage));

            try {
                const result = await NocturnalSession.fetchMyApplications({
                    page: currentPage,
                    limit: applicationsPageSize,
                    allPages: false,
                    status: getActiveStatusFilter(),
                    fallbackMessage: 'Failed to load applications'
                });
                allApplications = result.applications;
                currentPagination = result.pagination || {
                    page: currentPage,
                    pages: 1,
                    total: allApplications.length,
                    count: allApplications.length,
                    limit: applicationsPageSize,
                    hasPrev: false,
                    hasNext: false,
                    prevPage: null,
                    nextPage: null
                };

                if (clampCurrentPageToPagination()) {
                    fetchApplications(currentPage);
                    return;
                }

                updateStats();
                displayApplications(allApplications);
                renderPagination();
                restoreScrollPosition();
            } catch (error) {
                console.error('Error fetching applications:', error);
                document.getElementById('applicationsContainer').innerHTML = 
                    '<div class="no-applications">Error loading applications. Please try again later.</div>';
                document.getElementById('paginationControls').innerHTML = '';
            }
        }

        function getDisplayedStats() {
            const baseStats = globalStats || {
                total: 0,
                pending: 0,
                accepted: 0,
                rejected: 0,
                withdrawn: 0,
                totalEarnings: 0,
                acceptanceRate: 0
            };

            if (currentFilter === 'all') {
                return {
                    stats: baseStats,
                    scopeLabel: 'Showing overall totals'
                };
            }

            const filteredTotal = baseStats[currentFilter] || 0;
            const filteredStats = {
                total: filteredTotal,
                pending: currentFilter === 'pending' ? baseStats.pending || 0 : 0,
                accepted: currentFilter === 'accepted' ? baseStats.accepted || 0 : 0,
                rejected: currentFilter === 'rejected' ? baseStats.rejected || 0 : 0,
                withdrawn: currentFilter === 'withdrawn' ? baseStats.withdrawn || 0 : 0,
                totalEarnings: currentFilter === 'accepted' ? baseStats.totalEarnings || 0 : 0,
                acceptanceRate: baseStats.total
                    ? Math.round((filteredTotal / baseStats.total) * 100)
                    : 0
            };

            return {
                stats: filteredStats,
                scopeLabel: `Showing ${currentFilter} totals`
            };
        }

        // Update stats
        function updateStats() {
            const displayed = getDisplayedStats();
            const stats = displayed.stats;

            document.getElementById('totalApps').textContent = stats.total || 0;
            document.getElementById('pendingApps').textContent = stats.pending || 0;
            document.getElementById('acceptedApps').textContent = stats.accepted || 0;
            document.getElementById('rejectedApps').textContent = stats.rejected || 0;
            document.getElementById('withdrawnApps').textContent = stats.withdrawn || 0;
            document.getElementById('acceptedEarnings').textContent = AppFormat.currencyWhole(stats.totalEarnings || 0, 'INR ');
            document.getElementById('acceptanceRate').textContent = AppFormat.percent(stats.acceptanceRate || 0);
            document.getElementById('statsScope').textContent = displayed.scopeLabel;
        }

        // Display applications
        function displayApplications(applications) {
            const container = document.getElementById('applicationsContainer');
            
            if (!applications || applications.length === 0) {
                displayNoApplications();
                return;
            }

            container.innerHTML = applications.map(app => {
                const duty = app.duty || {};
                const appliedDate = AppFormat.date(app.appliedAt || app.createdAt, 'en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
                const dutyDate = duty.date
                    ? AppFormat.date(duty.date, 'en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                    })
                    : 'TBD';

                return `
                    <div class="application-card ${NocturnalSession.getApplicationStatusClass(app.status)}">
                        <div class="app-header">
                            <div class="app-title">
                                <h3>${duty.title || duty.specialty || 'General Medicine'}</h3>
                                <div class="hospital">
                                    <span>🏥</span>
                                    <span>${duty.hospitalName || 'Hospital'}</span>
                                </div>
                            </div>
                            <span class="status-badge ${NocturnalSession.getApplicationStatusClass(app.status)}">${NocturnalSession.normalizeApplicationStatus(app.status)}</span>
                        </div>

                        <div class="app-details">
                            <div class="detail-item">
                                <span class="icon">📅</span>
                                <span>${dutyDate}</span>
                            </div>
                            <div class="detail-item">
                                <span class="icon">⏰</span>
                                <span>${NocturnalSession.getDutyShiftText(duty)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="icon">📍</span>
                                <span>${NocturnalSession.getDutyLocationText(duty)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="icon">💰</span>
                                <span>${AppFormat.currencyWhole(duty.pay || 0)}</span>
                            </div>
                        </div>

                        <div class="app-footer">
                            <div class="applied-date">
                                Applied on ${appliedDate}
                            </div>
                            <button class="view-btn" data-action="view-duty" data-duty-id="${duty._id}">
                                View Details
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Display no applications message
        function displayNoApplications() {
            document.getElementById('paginationControls').innerHTML = '';
            document.getElementById('applicationsSummary').textContent = currentFilter === 'all'
                ? 'No applications found'
                : `No ${currentFilter} applications found`;
            document.getElementById('applicationsContainer').innerHTML = `
                <div class="no-applications">
                    <div class="icon">📭</div>
                    <h3>${currentFilter === 'all' ? 'No applications yet' : `No ${currentFilter} applications`}</h3>
                    <p>Start browsing available duties and apply to begin your journey!</p>
                    <a href="${AppConfig.routes.page('doctor.browseDuties')}" class="browse-btn">Browse Duties</a>
                </div>
            `;
        }

        function renderPagination() {
            const container = document.getElementById('paginationControls');
            const summary = document.getElementById('applicationsSummary');

            if (!currentPagination || !currentPagination.total) {
                summary.textContent = currentFilter === 'all'
                    ? 'No applications found'
                    : `No ${currentFilter} applications found`;
                container.innerHTML = '';
                return;
            }

            const startItem = ((currentPagination.page - 1) * currentPagination.limit) + 1;
            const endItem = startItem + currentPagination.count - 1;
            const pageNumbers = getVisiblePageNumbers();
            summary.textContent = `Showing ${startItem}-${endItem} of ${currentPagination.total} ${currentFilter === 'all' ? 'applications' : `${currentFilter} applications`}`;

            if (currentPagination.pages <= 1) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = `
                <div class="pagination-info">
                    Page size ${currentPagination.limit}
                </div>
                <div class="pagination-actions">
                    <button class="pagination-btn" data-action="change-page" data-page="${currentPagination.prevPage || 1}" ${currentPagination.hasPrev ? '' : 'disabled'}>
                        Previous
                    </button>
                    <div class="pagination-pages">
                        ${pageNumbers.map(page => page === '...'
                            ? '<span class="pagination-ellipsis">...</span>'
                            : `<button class="pagination-number ${page === currentPagination.page ? 'active' : ''}" data-action="change-page" data-page="${page}">${page}</button>`).join('')}
                    </div>
                    <span class="pagination-page">Page ${currentPagination.page} of ${currentPagination.pages}</span>
                    <button class="pagination-btn" data-action="change-page" data-page="${currentPagination.nextPage || currentPagination.pages}" ${currentPagination.hasNext ? '' : 'disabled'}>
                        Next
                    </button>
                </div>
            `;
        }

        function getVisiblePageNumbers() {
            if (!currentPagination || !currentPagination.pages) {
                return [];
            }

            const totalPages = currentPagination.pages;
            const current = currentPagination.page;

            if (totalPages <= 7) {
                return Array.from({ length: totalPages }, (_, index) => index + 1);
            }

            const pages = [1];
            const start = Math.max(2, current - 1);
            const end = Math.min(totalPages - 1, current + 1);

            if (start > 2) {
                pages.push('...');
            }

            for (let page = start; page <= end; page += 1) {
                pages.push(page);
            }

            if (end < totalPages - 1) {
                pages.push('...');
            }

            pages.push(totalPages);
            return pages;
        }

        function changePage(page) {
            if (!currentPagination || page === currentPage || page < 1 || page > currentPagination.pages) {
                return;
            }

            persistScrollPositionNow();
            fetchApplications(page);
        }

        function changePageSize(event) {
            const nextPageSize = parseInt(event.target.value, 10) || 10;

            if (nextPageSize === applicationsPageSize) {
                return;
            }

            persistScrollPositionNow();
            applicationsPageSize = nextPageSize;
            localStorage.setItem(APPLICATIONS_PAGE_SIZE_STORAGE_KEY, String(applicationsPageSize));
            currentPage = 1;
            localStorage.setItem(getPageStorageKey(), String(currentPage));
            fetchApplications(1);
        }

        function resetApplicationPreferences() {
            applicationsPageSize = 10;
            currentFilter = 'all';
            currentPage = 1;

            localStorage.removeItem(APPLICATIONS_PAGE_SIZE_STORAGE_KEY);
            localStorage.removeItem(APPLICATIONS_FILTER_STORAGE_KEY);
            localStorage.removeItem(APPLICATIONS_PAGE_STORAGE_KEY);
            ['all', 'pending', 'accepted', 'rejected', 'withdrawn'].forEach(status => {
                localStorage.removeItem(getPageStorageKey(status));
                localStorage.removeItem(getScrollStorageKey(status));
            });

            const selector = document.getElementById('pageSizeSelect');
            if (selector) {
                selector.value = '10';
            }

            setActiveFilterTab(currentFilter);
            updateStats();
            fetchApplications(1);
            showPreferencesToast('Application preferences reset');
        }

        // Filter applications
        function filterApplications(status) {
            persistScrollPositionNow();
            currentFilter = status;
            currentPage = getStoredPageForFilter(status);
            shouldRestoreScrollPosition = true;
            localStorage.setItem(APPLICATIONS_FILTER_STORAGE_KEY, currentFilter);
            localStorage.setItem(getPageStorageKey(), String(currentPage));
            setActiveFilterTab(currentFilter);

            fetchApplications(currentPage);
        }

        // View duty details
        function viewDuty(dutyId) {
            window.location.href = AppConfig.routes.page('doctor.dutyDetails', { id: dutyId });
        }

        // Initialize page
        window.addEventListener('DOMContentLoaded', () => {
            checkAuth();
            loadUserInfo();
            loadStoredPageSize();
            loadStoredFilter();
            loadStoredPage();
            window.addEventListener('scroll', persistScrollPosition, { passive: true });
            bindUiEvents();
            fetchApplicationStats();
            fetchApplications();
        });

        function bindUiEvents() {
            document.getElementById('logoutBtn')?.addEventListener('click', logout);
            document.getElementById('pageSizeSelect')?.addEventListener('change', changePageSize);
            document.getElementById('resetPreferencesBtn')?.addEventListener('click', resetApplicationPreferences);

            document.querySelectorAll('.filter-tab[data-status]').forEach(button => {
                button.addEventListener('click', function() {
                    filterApplications(this.dataset.status);
                });
            });

            document.getElementById('applicationsContainer')?.addEventListener('click', function(event) {
                const actionElement = event.target.closest('[data-action="view-duty"]');
                if (actionElement) {
                    viewDuty(actionElement.dataset.dutyId);
                }
            });

            document.getElementById('paginationControls')?.addEventListener('click', function(event) {
                const actionElement = event.target.closest('[data-action="change-page"]');
                if (actionElement) {
                    changePage(parseInt(actionElement.dataset.page, 10));
                }
            });
        }

