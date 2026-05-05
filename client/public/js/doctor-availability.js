// API_URL is provided by config.js

        document.addEventListener('DOMContentLoaded', function() {
            const session = DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
            if (!session) {
                window.location.href = AppConfig.routes.page('home');
                return;
            }

            loadCurrentSettings();

            // Form handlers
            document.getElementById('recurringForm').addEventListener('submit', handleRecurringSubmit);
            document.getElementById('vacationForm').addEventListener('submit', handleVacationSubmit);
            document.getElementById('preferencesForm').addEventListener('submit', handlePreferencesSubmit);
        });

        function switchTab(tabName, tabButton) {
            // Remove active class from all tabs and content
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // Add active class to selected tab and content
            if (tabButton) {
                tabButton.classList.add('active');
            }
            document.getElementById(tabName + 'Tab').classList.add('active');
        }

        async function loadCurrentSettings() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('calendar.availability', {
                    parseJson: true
                }), 'Failed to load settings', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && Array.isArray(payload.data));
                    }
                });
                displayAvailabilitySettings(data.data);
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        }

        function displayAvailabilitySettings(settings) {
            const list = document.getElementById('availabilityList');

            if (settings.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-calendar-check"></i>
                        <h3>No availability settings yet</h3>
                        <p>Create your first availability block to manage your schedule</p>
                    </div>
                `;
                return;
            }

            let html = '';
            settings.forEach(setting => {
                const typeLabel = setting.type.replace(/_/g, ' ');
                let details = '';

                if (setting.type === 'RECURRING' && setting.recurring) {
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const selectedDays = setting.recurring.dayOfWeek.map(d => days[d]).join(', ');
                    details = `Unavailable on: ${selectedDays}`;
                } else if (setting.type === 'VACATION' && setting.dateRange) {
                    details = `${AppFormat.date(setting.dateRange.startDate)} - ${AppFormat.date(setting.dateRange.endDate)}`;
                    if (setting.dateRange.reason) {
                        details += ` (${setting.dateRange.reason})`;
                    }
                } else if (setting.type === 'PREFERRED_HOURS' && setting.preferredHours) {
                    details = `${setting.preferredHours.earliestStart} - ${setting.preferredHours.latestEnd}`;
                    if (setting.preferredHours.flexible) {
                        details += ' (Flexible)';
                    }
                } else if (setting.type === 'MAX_SHIFTS' && setting.maxShifts) {
                    details = `Max: ${setting.maxShifts.perWeek} shifts/week, ${setting.maxShifts.maxHoursPerWeek} hours/week`;
                }

                html += `
                    <div class="availability-item">
                        <div class="availability-header">
                            <div class="availability-type">${typeLabel}</div>
                            <label class="toggle-switch">
                                <input type="checkbox" ${setting.active ? 'checked' : ''} data-action="toggle-availability" data-availability-id="${setting._id}">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="availability-details">${details}</div>
                        ${setting.autoRejectNonMatching ? '<div class="availability-warning"><i class="fas fa-exclamation-triangle"></i> Auto-rejecting non-matching duties</div>' : ''}
                        <div class="availability-actions">
                            <button class="btn btn-danger" data-action="delete-availability" data-availability-id="${setting._id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;
        }

        async function handleRecurringSubmit(e) {
            e.preventDefault();

            const selectedDays = [];
            for (let i = 0; i <= 6; i++) {
                if (document.getElementById(`day${i}`).checked) {
                    selectedDays.push(i);
                }
            }

            if (selectedDays.length === 0) {
                alert('Please select at least one day');
                return;
            }

            const data = {
                type: 'RECURRING',
                recurring: {
                    dayOfWeek: selectedDays,
                    unavailable: true
                },
                autoRejectNonMatching: document.getElementById('autoRejectRecurring').checked
            };

            await saveAvailability(data);
        }

        async function handleVacationSubmit(e) {
            e.preventDefault();

            const data = {
                type: 'VACATION',
                dateRange: {
                    startDate: document.getElementById('vacationStart').value,
                    endDate: document.getElementById('vacationEnd').value,
                    reason: document.getElementById('vacationReason').value
                },
                autoRejectNonMatching: document.getElementById('autoRejectVacation').checked
            };

            await saveAvailability(data);
        }

        async function handlePreferencesSubmit(e) {
            e.preventDefault();

            const preferredHoursData = {
                type: 'PREFERRED_HOURS',
                preferredHours: {
                    earliestStart: document.getElementById('earliestStart').value,
                    latestEnd: document.getElementById('latestEnd').value,
                    flexible: document.getElementById('flexible').checked
                }
            };

            const maxShiftsData = {
                type: 'MAX_SHIFTS',
                maxShifts: {
                    perWeek: parseInt(document.getElementById('maxShiftsWeek').value),
                    perMonth: parseInt(document.getElementById('maxShiftsMonth').value),
                    maxHoursPerWeek: parseInt(document.getElementById('maxHoursWeek').value)
                }
            };

            await saveAvailability(preferredHoursData);
            await saveAvailability(maxShiftsData);
        }

        async function saveAvailability(data) {
            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('calendar.availability', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                }), 'Failed to save availability setting');
                alert('Availability setting saved successfully!');
                loadCurrentSettings();
                switchTab('current');
            } catch (error) {
                console.error('Error saving availability:', error);
                alert('Failed to save availability setting');
            }
        }

        async function toggleAvailability(id, active) {
            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('calendar.availabilityDetail', {
                    method: 'PUT',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ active })
                }, {
                    params: { availabilityId: id }
                }), 'Failed to toggle availability');
                alert(active ? 'Availability activated' : 'Availability deactivated');
            } catch (error) {
                console.error('Error toggling availability:', error);
                alert('Failed to toggle availability');
            }
        }

        async function deleteAvailability(id) {
            if (!confirm('Are you sure you want to delete this availability setting?')) {
                return;
            }

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('calendar.availabilityDetail', {
                    method: 'DELETE',
                    parseJson: true
                }, {
                    params: { availabilityId: id }
                }), 'Failed to delete availability setting');
                alert('Availability setting deleted successfully');
                loadCurrentSettings();
            } catch (error) {
                console.error('Error deleting availability:', error);
                alert('Failed to delete availability setting');
            }
        }

        function logout() {
            DoctorSession.logout({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        function bindUiEvents() {
            document.getElementById('logoutLink')?.addEventListener('click', function(event) {
                event.preventDefault();
                logout();
            });

            document.querySelectorAll('.tab[data-tab]').forEach(function(tabButton) {
                tabButton.addEventListener('click', function() {
                    switchTab(this.dataset.tab, this);
                });
            });

            document.getElementById('availabilityList')?.addEventListener('click', function(event) {
                const deleteButton = event.target.closest('[data-action="delete-availability"]');
                if (deleteButton) {
                    deleteAvailability(deleteButton.dataset.availabilityId);
                }
            });

            document.getElementById('availabilityList')?.addEventListener('change', function(event) {
                const toggleInput = event.target.closest('[data-action="toggle-availability"]');
                if (toggleInput) {
                    toggleAvailability(toggleInput.dataset.availabilityId, toggleInput.checked);
                }
            });
        }

        bindUiEvents();
