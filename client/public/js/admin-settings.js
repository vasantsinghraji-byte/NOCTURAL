// API_URL is provided by config.js

        function checkAuth() {
            return AdminSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        function logout() {
            AdminSession.logout({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        function loadUserInfo() {
            AdminSession.populateIdentity({
                nameElementId: 'userName',
                avatarElementId: 'userAvatar'
            });
        }

        async function loadSettings() {
            const token = checkAuth();
            if (!token) return;

            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('hospitalSettings.root', {
                    parseJson: true
                }), 'Failed to load settings', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.data);
                    }
                });

                const settings = data.data;

                // Budget settings
                document.getElementById('monthlyBudget').value = settings.budget.monthlyBudget || '';
                document.getElementById('alertThreshold').value = settings.budget.alertThreshold || 80;

                // Forecasting settings
                document.getElementById('forecastingEnabled').checked = settings.forecasting.enabled;
                document.getElementById('lookAheadDays').value = settings.forecasting.lookAheadDays || 14;

                // Notification preferences
                document.getElementById('emailAlerts').checked = settings.notifications.emailAlerts;
                document.getElementById('budgetAlerts').checked = settings.notifications.budgetAlerts;
                document.getElementById('staffingGapAlerts').checked = settings.notifications.staffingGapAlerts;
                document.getElementById('newApplicationAlerts').checked = settings.notifications.newApplicationAlerts;

                // Analytics preferences
                document.getElementById('defaultDateRange').value = settings.analytics.defaultDateRange || '30days';
                document.getElementById('showPredictions').checked = settings.analytics.showPredictions;

                // Load budget preview if budget is set
                if (settings.budget.monthlyBudget > 0) {
                    loadBudgetPreview();
                }
            } catch (error) {
                console.error('Error loading settings:', error);
                showMessage('Failed to load settings. Please try again.', 'error');
            }
        }

        async function loadBudgetPreview() {
            const token = checkAuth();
            if (!token) return;

            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('analytics.hospitalDashboard', {
                    parseJson: true
                }), 'Failed to load budget preview', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.data && payload.data.budget);
                    }
                });

                const budget = data.data.budget;

                document.getElementById('budgetPreview').classList.remove('is-hidden');
                document.getElementById('previewBudget').textContent = AppFormat.currencyWhole(budget.monthlyBudget);
                document.getElementById('previewSpent').textContent = AppFormat.currencyWhole(budget.spent);
                document.getElementById('previewRemaining').textContent = AppFormat.currencyWhole(budget.remaining);
                document.getElementById('previewPercent').textContent = AppFormat.percent(budget.percentUsed);
            } catch (error) {
                console.error('Error loading budget preview:', error);
            }
        }

        async function saveSettings(event) {
            event.preventDefault();

            const token = checkAuth();
            if (!token) return;

            const saveBtn = document.getElementById('saveBtn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            const formData = {
                budget: {
                    monthlyBudget: parseInt(document.getElementById('monthlyBudget').value) || 0,
                    alertThreshold: parseInt(document.getElementById('alertThreshold').value) || 80
                },
                forecasting: {
                    enabled: document.getElementById('forecastingEnabled').checked,
                    lookAheadDays: parseInt(document.getElementById('lookAheadDays').value) || 14
                },
                notifications: {
                    emailAlerts: document.getElementById('emailAlerts').checked,
                    budgetAlerts: document.getElementById('budgetAlerts').checked,
                    staffingGapAlerts: document.getElementById('staffingGapAlerts').checked,
                    newApplicationAlerts: document.getElementById('newApplicationAlerts').checked
                },
                analytics: {
                    defaultDateRange: document.getElementById('defaultDateRange').value,
                    showPredictions: document.getElementById('showPredictions').checked
                }
            };

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('hospitalSettings.root', {
                    method: 'PUT',
                    parseJson: true,
                    body: JSON.stringify(formData)
                }), 'Failed to save settings');

                showMessage('Settings saved successfully!', 'success');

                // Reload budget preview
                if (formData.budget.monthlyBudget > 0) {
                    setTimeout(loadBudgetPreview, 500);
                }
            } catch (error) {
                console.error('Error saving settings:', error);
                showMessage('Unable to save settings. Please try again.', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save All Settings';
            }
        }

        function showMessage(text, type) {
            const container = document.getElementById('messageContainer');
            container.innerHTML = `<div class="alert ${type}">${text}</div>`;

            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(() => {
                    container.innerHTML = '';
                }, 5000);
            }

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Budget input live preview
        document.getElementById('monthlyBudget')?.addEventListener('input', function() {
            if (this.value > 0) {
                loadBudgetPreview();
            }
        });

        window.addEventListener('DOMContentLoaded', () => {
            checkAuth();
            loadUserInfo();
            loadSettings();

            document.getElementById('logout-btn').addEventListener('click', logout);
            document.getElementById('settingsForm').addEventListener('submit', saveSettings);
        });

