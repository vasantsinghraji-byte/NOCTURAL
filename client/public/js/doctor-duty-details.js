// API Base URL
        // API_URL is provided by config.js

        // Check authentication
        function checkAuth() {
            return DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        // Go back
        function goBack() {
            window.history.back();
        }

        // Get duty ID from URL
        function getDutyId() {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('id');
        }

        // Fetch duty details
        async function fetchDutyDetails() {
            const token = checkAuth();
            if (!token) return;

            const dutyId = getDutyId();
            if (!dutyId) {
                document.getElementById('dutyContent').innerHTML = 
                    '<div class="loading">Invalid duty ID</div>';
                return;
            }

            try {
                const dutyData = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('duties.detail', {
                    parseJson: true
                }, {
                    params: { dutyId: dutyId }
                }), 'Failed to load duty details', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.duty);
                    }
                });
                const duty = dutyData.duty;

                if (!duty || !duty._id) {
                    throw new Error('Duty not found');
                }

                // Check if already applied
                const applicationsResult = await NocturnalSession.fetchMyApplications({
                    fallbackMessage: 'Failed to load application status'
                });
                const applications = applicationsResult.applications;
                const isApplied = applications.some(app => NocturnalSession.getApplicationDutyId(app) === dutyId);

                displayDutyDetails(duty, isApplied);
            } catch (error) {
                console.error('Error fetching duty details:', error);
                document.getElementById('dutyContent').innerHTML = 
                    '<div class="loading">Error loading duty details. Please try again.</div>';
            }
        }

        // Display duty details
        function displayDutyDetails(duty, isApplied) {
            const date = AppFormat.date(duty.date, 'en-IN', { 
                weekday: 'long',
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            });

            const html = `
                <div class="duty-details-card">
                    <div class="duty-header">
                        <h1>${duty.specialty || 'General Medicine'}</h1>
                        <div class="hospital-info">
                            <span>🏥</span>
                            <span>${duty.hospitalName || 'Hospital Name'}</span>
                        </div>
                        <div class="badges-container">
                            <span class="badge">${duty.shift || 'Night'} Shift</span>
                            <span class="badge">📍 ${duty.location || 'Location'}</span>
                            ${duty.urgent ? '<span class="badge">⚡ Urgent</span>' : ''}
                        </div>
                    </div>

                    <div class="duty-content">
                        <!-- Key Details -->
                        <div class="key-details">
                            <div class="detail-box">
                                <div class="icon">💰</div>
                                <div class="label">Payment</div>
                                <div class="value pay">${AppFormat.currencyWhole(duty.pay || 0)}</div>
                            </div>
                            <div class="detail-box">
                                <div class="icon">📅</div>
                                <div class="label">Date</div>
                                <div class="value">${date}</div>
                            </div>
                            <div class="detail-box">
                                <div class="icon">⏰</div>
                                <div class="label">Shift Time</div>
                                <div class="value">${duty.shift || 'Night'}</div>
                            </div>
                            <div class="detail-box">
                                <div class="icon">⏱️</div>
                                <div class="label">Duration</div>
                                <div class="value">${duty.duration || '8 hours'}</div>
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="section">
                            <h2>📋 Duty Description</h2>
                            <p>${duty.description || 'No description provided for this duty.'}</p>
                        </div>

                        <!-- Requirements -->
                        <div class="section">
                            <h2>📌 Requirements</h2>
                            <ul class="requirements-list">
                                ${duty.requirements ? duty.requirements.map(req => `<li>${req}</li>`).join('') : `
                                    <li>Valid medical degree and license</li>
                                    <li>Experience in ${duty.specialty || 'general medicine'}</li>
                                    <li>Availability for ${duty.shift || 'night'} shifts</li>
                                    <li>Good communication skills</li>
                                `}
                            </ul>
                        </div>

                        <!-- Hospital Contact -->
                        <div class="section">
                            <h2>📞 Contact Information</h2>
                            <div class="contact-card">
                                <div class="contact-item">
                                    <span class="icon">🏥</span>
                                    <span><strong>Hospital:</strong> ${duty.hospitalName || 'Hospital Name'}</span>
                                </div>
                                <div class="contact-item">
                                    <span class="icon">📍</span>
                                    <span><strong>Location:</strong> ${duty.location || 'Location not specified'}</span>
                                </div>
                                ${duty.contactEmail ? `
                                <div class="contact-item">
                                    <span class="icon">📧</span>
                                    <span><strong>Email:</strong> ${duty.contactEmail}</span>
                                </div>
                                ` : ''}
                                ${duty.contactPhone ? `
                                <div class="contact-item">
                                    <span class="icon">📱</span>
                                    <span><strong>Phone:</strong> ${duty.contactPhone}</span>
                                </div>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Apply Section -->
                        <div class="apply-section">
                            <p>${isApplied ? 'You have already applied for this duty' : 'Ready to take on this duty? Apply now!'}</p>
                            <button 
                                class="apply-btn" 
                                id="applyBtn"
                                data-action="apply-duty"
                                data-duty-id="${duty._id}"
                                ${isApplied ? 'disabled' : ''}
                            >
                                ${isApplied ? '✓ Already Applied' : 'Apply for This Duty'}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('dutyContent').innerHTML = html;
        }
        function bindUiEvents() {
            document.getElementById('backBtn')?.addEventListener('click', goBack);
            document.getElementById('dutyContent')?.addEventListener('click', function(event) {
                const applyButton = event.target.closest('[data-action="apply-duty"]');
                if (!applyButton) {
                    return;
                }

                NocturnalSession.handleDutyApplication(event, applyButton.dataset.dutyId, {
                    loadingText: 'Submitting Application...',
                    successText: '✓ Application Submitted!',
                    resetText: 'Apply for This Duty',
                    successMessage: 'Your application has been submitted successfully!',
                    redirectUrl: AppConfig.routes.page('doctor.applications'),
                    redirectDelayMs: 1500
                });
            });
        }

        // Initialize page
        window.addEventListener('DOMContentLoaded', () => {
            checkAuth();
            bindUiEvents();
            fetchDutyDetails();
        });
