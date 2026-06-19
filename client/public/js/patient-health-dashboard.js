        // Check authentication
        PatientSession.requireAuthenticatedPage({
            redirectUrl: AppConfig.routes.page('patient.login')
        });

        // Load patient data
        PatientSession.populateIdentity({
            nameElementId: 'userName'
        });

        // Initialize dashboard
        async function initDashboard() {
            await Promise.all([
                loadDashboardOverview(),
                loadWhoHasAccess()
            ]);
        }

        // Load dashboard overview from API
        async function loadDashboardOverview() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('patientDashboard.root', {
                    parseJson: true
                }), 'Failed to load dashboard', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.overview);
                    }
                });
                displayDashboard(data.overview);
            } catch (error) {
                console.error('Error loading dashboard:', error);
                showToast('Failed to load health data', 'error');
            }
        }

        // Display dashboard data
        function displayDashboard(overview) {
            // Update intake status
            updateIntakeBanner(overview.intakeStatus);

            // Update health summary
            if (overview.healthSummary) {
                displayVitals(overview.healthSummary.latestVitals);
                displayConditions(overview.healthSummary.conditions);
                displayAllergies(overview.healthSummary.allergies);
                displayMedications(overview.healthSummary.medications);

                // Show emergency card if health record exists
                if (overview.healthSummary.hasHealthRecord) {
                    displayEmergencyCard(overview.healthSummary);
                }
            }

            // Update stats
            document.getElementById('recordsCount').textContent = overview.healthSummary?.hasHealthRecord ? '1' : '0';

            // Update alerts
            const alertCount = overview.healthAlerts?.length || 0;
            document.getElementById('alertsCount').textContent = alertCount;
            if (alertCount > 0) {
                document.getElementById('alertCard').classList.add('alert');
            } else {
                document.getElementById('alertCard').classList.add('good');
            }
        }

        // Update intake banner based on status
        function updateIntakeBanner(intakeStatus) {
            const banner = document.getElementById('intakeBanner');
            const title = document.getElementById('intakeTitle');
            const message = document.getElementById('intakeMessage');
            const btn = document.getElementById('intakeBtn');

            if (!intakeStatus) return;

            switch (intakeStatus.status) {
                case 'APPROVED':
                    banner.classList.add('completed');
                    title.textContent = 'Health Profile Complete';
                    message.textContent = 'Your health information is up to date';
                    btn.textContent = 'View Profile';
                    btn.dataset.route = AppConfig.routes.page('patient.healthIntakeForm', { view: true });
                    break;
                case 'PENDING_REVIEW':
                    title.textContent = 'Awaiting Review';
                    message.textContent = 'Your health profile is being reviewed by a doctor';
                    btn.textContent = 'View Status';
                    btn.disabled = true;
                    delete btn.dataset.route;
                    break;
                case 'PENDING_PATIENT':
                case 'CHANGES_REQUESTED':
                    title.textContent = 'Action Required';
                    message.textContent = 'Please complete or update your health profile';
                    btn.textContent = 'Continue';
                    btn.dataset.route = AppConfig.routes.page('patient.clinicalHistoryForm');
                    break;
                default:
                    // NOT_STARTED - keep default
                    btn.dataset.route = AppConfig.routes.page('patient.clinicalHistoryForm');
                    break;
            }
        }

        // Display vitals
        function displayVitals(vitals) {
            const grid = document.getElementById('vitalsGrid');

            if (!vitals || Object.keys(vitals).length === 0) {
                grid.innerHTML = `
                    <div class="empty-state empty-state-full">
                        <div class="icon">📊</div>
                        <p>No vitals recorded yet</p>
                    </div>
                `;
                return;
            }

            const vitalIcons = {
                BP_SYSTOLIC: '🫀',
                BP_DIASTOLIC: '🫀',
                HEART_RATE: '💓',
                TEMPERATURE: '🌡️',
                OXYGEN_LEVEL: '🫁',
                BLOOD_SUGAR: '🩸',
                WEIGHT: '⚖️',
                HEIGHT: '📏',
                BMI: '📐'
            };

            const vitalLabels = {
                BP_SYSTOLIC: 'Systolic BP',
                BP_DIASTOLIC: 'Diastolic BP',
                HEART_RATE: 'Heart Rate',
                TEMPERATURE: 'Temperature',
                OXYGEN_LEVEL: 'Oxygen',
                BLOOD_SUGAR: 'Blood Sugar',
                WEIGHT: 'Weight',
                HEIGHT: 'Height',
                BMI: 'BMI'
            };

            let html = '';
            for (const [type, data] of Object.entries(vitals)) {
                html += `
                    <div class="vital-card">
                        <div class="icon">${vitalIcons[type] || '📊'}</div>
                        <div class="value">${data.value}</div>
                        <div class="unit">${data.unit || ''}</div>
                        <div class="label">${vitalLabels[type] || type}</div>
                    </div>
                `;
            }

            grid.innerHTML = html || '<div class="empty-state"><p>No vitals recorded</p></div>';
        }

        // Display conditions
        function displayConditions(conditions) {
            const list = document.getElementById('conditionsList');

            if (!conditions || conditions.count === 0) {
                list.innerHTML = '<div class="empty-state"><p>No conditions recorded</p></div>';
                return;
            }

            list.innerHTML = conditions.items.map(c => `
                <span class="tag condition severity-${(c.severity || 'mild').toLowerCase()}">${c.name}</span>
            `).join('');
        }

        // Display allergies
        function displayAllergies(allergies) {
            const list = document.getElementById('allergiesList');

            if (!allergies || allergies.count === 0) {
                list.innerHTML = '<div class="empty-state"><p>No allergies recorded</p></div>';
                return;
            }

            list.innerHTML = allergies.items.map(a => `
                <span class="tag allergy severity-${(a.severity || 'mild').toLowerCase()}">${a.allergen}</span>
            `).join('');
        }

        // Display medications
        function displayMedications(medications) {
            const list = document.getElementById('medicationsList');

            if (!medications || medications.count === 0) {
                list.innerHTML = '<div class="empty-state"><p>No medications recorded</p></div>';
                return;
            }

            list.innerHTML = medications.items.map(m => `
                <span class="tag medication">${m.name} ${m.dosage ? `(${m.dosage})` : ''}</span>
            `).join('');
        }

        // Display emergency card
        function displayEmergencyCard(summary) {
            const card = document.getElementById('emergencyCard');
            const grid = document.getElementById('emergencyGrid');

            AppUi.setDisplay(card, 'block');

            grid.innerHTML = `
                <div class="emergency-item">
                    <div class="label">Blood Group</div>
                    <div class="value">${summary.bloodGroup || 'Not specified'}</div>
                </div>
                <div class="emergency-item">
                    <div class="label">Critical Conditions</div>
                    <div class="value">${summary.conditions?.count || 0}</div>
                </div>
                <div class="emergency-item">
                    <div class="label">Allergies</div>
                    <div class="value">${summary.allergies?.count || 0} ${summary.allergies?.hasCritical ? '(Critical!)' : ''}</div>
                </div>
                <div class="emergency-item">
                    <div class="label">Current Medications</div>
                    <div class="value">${summary.medications?.count || 0}</div>
                </div>
            `;
        }

        // Load who has access
        async function loadWhoHasAccess() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('doctorAccess.list', {
                    parseJson: true
                }), 'Failed to load access info', {
                    isSuccess: function (payload) {
                        return !!(payload && Array.isArray(payload.accessTokens));
                    }
                });
                displayAccessList(data.accessTokens || []);
                document.getElementById('accessCount').textContent = data.accessTokens?.length || 0;
            } catch (error) {
                console.error('Error loading access info:', error);
                document.getElementById('accessLog').innerHTML = '<div class="empty-state"><p>Failed to load access information</p></div>';
            }
        }

        // Display access list
        function displayAccessList(tokens) {
            const log = document.getElementById('accessLog');

            if (tokens.length === 0) {
                log.innerHTML = `
                    <div class="empty-state">
                        <div class="icon">🔒</div>
                        <h4>No one has access</h4>
                        <p>Your health data is private. Access will be granted when you book a service.</p>
                    </div>
                `;
                return;
            }

            log.innerHTML = tokens.map(t => `
                <div class="access-item">
                    <div class="access-avatar">${t.grantedTo?.name?.charAt(0) || 'D'}</div>
                    <div class="access-details">
                        <div class="name">${t.grantedTo?.name || 'Healthcare Provider'}</div>
                        <div class="role">${t.grantedToRole || 'Provider'} - ${t.accessLevel}</div>
                    </div>
                    <span class="access-status active">Active</span>
                    <button class="btn-revoke" data-token-id="${t._id}">Revoke</button>
                </div>
            `).join('');
        }

        // Revoke access
        async function revokeAccess(tokenId) {
            if (!confirm('Are you sure you want to revoke this access?')) return;

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('doctorAccess.revoke', {
                    method: 'POST',
                    parseJson: true
                }, {
                    params: { tokenId: tokenId }
                }), 'Failed to revoke access');

                showToast('Access revoked successfully', 'success');
                loadWhoHasAccess();
            } catch (error) {
                console.error('Error revoking access:', error);
                showToast('Failed to revoke access', 'error');
            }
        }

        // Generate QR Code
        async function generateQRCode() {
            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('patientDashboard.emergencyQr', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ expiryHours: 24 })
                }), 'Failed to generate QR');
                showToast('QR Code generated! Valid for 24 hours.', 'success');
                // Could display QR code in a modal
            } catch (error) {
                console.error('Error generating QR:', error);
                showToast('Failed to generate QR code', 'error');
            }
        }

        // Go to intake form
        function goToIntake() {
            window.location.href = AppConfig.routes.page('patient.healthIntakeForm');
        }

        // Go to complete medical history form
        function goToMedicalHistory() {
            window.location.href = AppConfig.routes.page('patient.clinicalHistoryForm');
        }

        // Logout
        function logout() {
            PatientSession.logout({
                redirectUrl: AppConfig.routes.page('patient.login')
            });
        }

        function bindUiEvents() {
            document.getElementById('logoutBtn')?.addEventListener('click', logout);
            document.getElementById('quickIntakeBtn')?.addEventListener('click', function() {
                window.location.href = AppConfig.routes.page('patient.healthIntakeForm');
            });
            document.getElementById('intakeBtn')?.addEventListener('click', function() {
                const route = this.dataset.route || AppConfig.routes.page('patient.clinicalHistoryForm');
                window.location.href = route;
            });
            document.getElementById('generateQrBtn')?.addEventListener('click', generateQRCode);

            document.querySelectorAll('.nav-tab[data-route]').forEach(tab => {
                tab.addEventListener('click', function() {
                    window.location.href = this.dataset.route;
                });
            });

            document.getElementById('accessLog')?.addEventListener('click', function(event) {
                const revokeButton = event.target.closest('.btn-revoke[data-token-id]');
                if (!revokeButton) {
                    return;
                }

                revokeAccess(revokeButton.dataset.tokenId);
            });
        }

        // Show toast notification
        function showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.remove();
            }, 3000);
        }

        // Initialize
        bindUiEvents();
        initDashboard();
