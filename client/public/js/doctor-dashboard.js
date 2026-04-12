// Check JWT authentication on page load
        (function() {
            const token = DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });

            if (!token) {
                window.location.href = AppConfig.routes.page('home');
            }
        })();

// API Base URL
        // API_URL is provided by config.js

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
                welcomeElementId: 'welcomeName',
                avatarElementId: 'userAvatar'
            });
        }

        function formatLocation(location) {
            if (!location) return 'Not specified';
            if (typeof location === 'string') return location;

            const parts = [
                location.address,
                location.city,
                location.state
            ].filter(Boolean);

            return parts.length > 0 ? parts.join(', ') : 'Not specified';
        }

        function getProfilePreferences(user) {
            const prefs = [];
            const professional = user.professional || {};

            if (professional.preferredShiftTimes && professional.preferredShiftTimes.length > 0) {
                prefs.push(`Shifts: ${professional.preferredShiftTimes.join(', ')}`);
            }
            if (professional.minimumRate) {
                prefs.push(`Min Rate: INR ${professional.minimumRate}/hr`);
            }
            if (professional.serviceRadius) {
                prefs.push(`Service Radius: ${professional.serviceRadius} km`);
            }

            return prefs.length > 0 ? prefs.join(' | ') : 'Not set';
        }

        // Fetch and display full user profile
        async function fetchUserProfile() {
            const token = checkAuth();
            if (!token) return;

            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('auth.me', {
                    parseJson: true
                }), 'Failed to load profile', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.user);
                    }
                });
                const user = data.user;
                    const professional = user.professional || {};
                    const qualifications = professional.secondarySpecializations && professional.secondarySpecializations.length > 0
                        ? professional.secondarySpecializations.join(', ')
                        : 'Not specified';

                    // Update profile information section
                    document.getElementById('userSpecialty').textContent = user.specialty || professional.primarySpecialization || 'Not specified';
                    document.getElementById('userHospital').textContent = user.hospital || user.hospitalName || 'Not specified';
                    document.getElementById('userLocation').textContent = formatLocation(user.location);
                    document.getElementById('userExperience').textContent = professional.yearsOfExperience ? `${professional.yearsOfExperience} years` : 'Not specified';
                    document.getElementById('userQualifications').textContent = qualifications;
                    document.getElementById('userPhone').textContent = user.phone || 'Not specified';
                    document.getElementById('userEmail').textContent = user.email || 'Not specified';
                    document.getElementById('profileStrength').textContent = user.profileStrength ? `${user.profileStrength}%` : 'Not calculated';

                    // Display preferences if available
                    if (user.preferences && Object.keys(user.preferences).length > 0) {
                        const prefs = [];
                        if (user.preferences.preferredShifts && user.preferences.preferredShifts.length > 0) {
                            prefs.push(`Shifts: ${user.preferences.preferredShifts.join(', ')}`);
                        }
                        if (user.preferences.preferredLocations && user.preferences.preferredLocations.length > 0) {
                            prefs.push(`Locations: ${user.preferences.preferredLocations.join(', ')}`);
                        }
                        if (user.preferences.minPay) {
                            prefs.push(`Min Pay: ₹${user.preferences.minPay}`);
                        }
                        if (user.preferences.maxDistance) {
                            prefs.push(`Max Distance: ${user.preferences.maxDistance} km`);
                        }
                        document.getElementById('userPreferences').textContent = prefs.length > 0 ? prefs.join(' | ') : 'Not set';
                    } else {
                        document.getElementById('userPreferences').textContent = 'Not set';
                    }

                    document.getElementById('userPreferences').textContent = getProfilePreferences(user);

                    // Show profile section
                    document.getElementById('profileInfo').style.display = 'block';

                    // Update localStorage with latest user data
                    localStorage.setItem('userName', user.name);
                    localStorage.setItem('user', JSON.stringify(user));
            } catch (error) {
                console.error('Error fetching user profile:', error);
            }
        }

        // Fetch dashboard stats
        async function fetchDashboardStats() {
            const token = checkAuth();
            if (!token) return;

            try {
                const dutiesDataPromise = AppConfig.fetchRoute('duties.list', {
                    parseJson: true
                });
                const applicationStatsPromise = NocturnalSession.fetchApplicationStats({
                    fallbackMessage: 'Failed to load application stats'
                });
                const recentApplicationsPromise = NocturnalSession.fetchMyApplications({
                    limit: 5,
                    allPages: false,
                    fallbackMessage: 'Failed to load recent applications'
                });

                const dutiesData = NocturnalSession.expectJsonSuccess(
                    await dutiesDataPromise,
                    'Failed to load duties'
                );
                const stats = await applicationStatsPromise;
                const appsResult = await recentApplicationsPromise;
                const applications = appsResult.applications;

                    document.getElementById('availableDuties').textContent = dutiesData.count || 0;
                    document.getElementById('pendingApps').textContent = stats.pending || 0;
                    document.getElementById('acceptedApps').textContent = stats.accepted || 0;

                    // Calculate total earnings from accepted duties
                    const totalEarnings = stats.totalEarnings || 0;
                    document.getElementById('totalEarnings').textContent = `₹${totalEarnings.toLocaleString()}`;

                    document.getElementById('totalEarnings').textContent = `INR ${totalEarnings.toLocaleString()}`;

                    // Display recent applications
                    displayRecentApplications(applications);
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
                document.getElementById('availableDuties').textContent = '0';
                document.getElementById('pendingApps').textContent = '0';
                document.getElementById('acceptedApps').textContent = '0';
            }
        }

        // Display recent applications
        function displayRecentApplications(applications) {
            const container = document.getElementById('recentApplications');
            
            if (!applications || applications.length === 0) {
                container.innerHTML = '<div class="no-data">No applications yet. Start browsing available duties!</div>';
                return;
            }

            container.innerHTML = applications.map(app => `
                <div class="application-item">
                    <div class="application-info">
                        <h3>${app.duty?.hospitalName || 'Hospital'} - ${app.duty?.specialty || 'General'}</h3>
                        <p>📅 ${app.duty?.date ? new Date(app.duty.date).toLocaleDateString() : 'TBD'} | ⏰ ${app.duty?.startTime || 'TBD'} | 💰 ₹${app.duty?.compensation?.totalAmount || 0}</p>
                    </div>
                    <span class="status-badge ${NocturnalSession.getApplicationStatusClass(app.status)}">${NocturnalSession.normalizeApplicationStatus(app.status)}</span>
                </div>
            `).join('');
        }

        // Initialize dashboard
        window.addEventListener('DOMContentLoaded', () => {
            checkAuth();
            loadUserInfo();
            fetchUserProfile(); // Fetch and display full profile
            fetchDashboardStats();

            // Attach logout listener
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await logout();
                });
            }
        });
