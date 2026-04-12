// API_URL is provided by config.js
        let allShifts = [];
        let currentUser = null;

        // Check authentication
        function checkAuth() {
            return DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        // Load user profile
        async function loadUser() {
            const token = checkAuth();
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('auth.me', {
                    parseJson: true,
                    headers: { 'Authorization': `Bearer ${token}` }
                }), 'Failed to load user', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.user);
                    }
                });
                currentUser = data.user;
            } catch (error) {
                console.error('Error loading user:', error);
            }
        }

        // Load shifts
        async function loadShifts() {
            const token = checkAuth();
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('duties.list', {
                    parseJson: true,
                    headers: { 'Authorization': `Bearer ${token}` }
                }, {
                    query: { status: 'OPEN' }
                }), 'Failed to load shifts');
                allShifts = Array.isArray(data.duties) ? data.duties : [];
                applyFilters();
            } catch (error) {
                console.error('Error loading shifts:', error);
            }
        }

        // Set date filter
        function setDateFilter(filter, button) {
            document.querySelectorAll('.quick-filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            if (button) {
                button.classList.add('active');
            }

            if (filter !== 'custom') {
                document.getElementById('customDateFilter').value = '';
            }
        }

        // Apply filters
        function applyFilters() {
            let filtered = [...allShifts];

            // Specialty filter
            const specialty = document.getElementById('specialtyFilter').value;
            if (specialty) {
                filtered = filtered.filter(shift => shift.specialty === specialty);
            }

            // Min pay filter
            const minPay = document.getElementById('minPayFilter').value;
            if (minPay) {
                filtered = filtered.filter(shift => shift.hourlyRate >= parseInt(minPay));
            }

            // Date filters
            const activeDate = document.querySelector('.quick-filter-btn.active').dataset.date;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (activeDate === 'today') {
                filtered = filtered.filter(shift => {
                    const shiftDate = new Date(shift.date);
                    shiftDate.setHours(0, 0, 0, 0);
                    return shiftDate.getTime() === today.getTime();
                });
            } else if (activeDate === 'tomorrow') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                filtered = filtered.filter(shift => {
                    const shiftDate = new Date(shift.date);
                    shiftDate.setHours(0, 0, 0, 0);
                    return shiftDate.getTime() === tomorrow.getTime();
                });
            } else if (activeDate === 'week') {
                const weekEnd = new Date(today);
                weekEnd.setDate(weekEnd.getDate() + 7);
                filtered = filtered.filter(shift => {
                    const shiftDate = new Date(shift.date);
                    return shiftDate >= today && shiftDate <= weekEnd;
                });
            }

            // Custom date
            const customDate = document.getElementById('customDateFilter').value;
            if (customDate) {
                const targetDate = new Date(customDate);
                targetDate.setHours(0, 0, 0, 0);
                filtered = filtered.filter(shift => {
                    const shiftDate = new Date(shift.date);
                    shiftDate.setHours(0, 0, 0, 0);
                    return shiftDate.getTime() === targetDate.getTime();
                });
            }

            // Sort
            const sortBy = document.getElementById('sortBy').value;
            if (sortBy === 'highest-paid') {
                filtered.sort((a, b) => b.hourlyRate - a.hourlyRate);
            } else if (sortBy === 'date') {
                filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
            } else if (sortBy === 'urgent') {
                filtered.sort((a, b) => {
                    const urgencyOrder = { EMERGENCY: 0, URGENT: 1, NORMAL: 2 };
                    return (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
                });
            }

            displayShifts(filtered);
        }

        // Display shifts
        function displayShifts(shifts) {
            const grid = document.getElementById('shiftsGrid');
            const noResults = document.getElementById('noResults');
            const resultsCount = document.getElementById('resultsCount');

            resultsCount.textContent = shifts.length;

            if (shifts.length === 0) {
                grid.classList.add('is-hidden');
                noResults.classList.remove('is-hidden');
                return;
            }

            grid.classList.remove('is-hidden');
            noResults.classList.add('is-hidden');

            grid.innerHTML = shifts.map(shift => {
                const date = new Date(shift.date);
                const matchScore = Math.floor(Math.random() * 30) + 70; // Mock match score
                const spotsLeft = (shift.positionsNeeded || 1) - (shift.positionsFilled || 0);

                let matchClass = 'match-fair';
                let matchLabel = 'Fair Match';
                if (matchScore >= 90) {
                    matchClass = 'match-excellent';
                    matchLabel = `${matchScore}% Match`;
                } else if (matchScore >= 75) {
                    matchClass = 'match-good';
                    matchLabel = `${matchScore}% Match`;
                }

                return `
                    <div class="shift-card ${shift.urgency === 'URGENT' || shift.urgency === 'EMERGENCY' ? 'urgent' : ''} ${matchScore >= 90 ? 'high-match' : ''}"
                         data-shift-id="${shift._id}">
                        <div class="shift-header">
                            <div class="hospital-info">
                                <div class="hospital-name">${shift.hospitalName || shift.hospital}</div>
                                <div class="hospital-rating">
                                    <span class="stars">⭐ 4.8</span>
                                    <span>• 📍 2.3 km away</span>
                                </div>
                            </div>
                            <div class="match-badge ${matchClass}">${matchLabel}</div>
                        </div>

                        <div class="specialty-badge">
                            <i class="fas fa-stethoscope"></i> ${shift.specialty}
                        </div>

                        <div class="shift-details">
                            <div class="detail-row">
                                <i class="fas fa-calendar"></i>
                                <span>${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                            </div>
                            <div class="detail-row">
                                <i class="fas fa-clock"></i>
                                <span>${shift.startTime} - ${shift.endTime} (${shift.duration || 12} hours)</span>
                            </div>
                            <div class="detail-row">
                                <i class="fas fa-map-marker-alt"></i>
                                <span>${shift.location}</span>
                            </div>
                        </div>

                        <div class="compensation">
                            <div class="comp-rate">₹${shift.hourlyRate.toLocaleString()}/hr</div>
                            <div class="comp-total">Total: ₹${(shift.totalCompensation || shift.hourlyRate * 12).toLocaleString()}</div>
                        </div>

                        <div class="perks">
                            ${shift.facilities?.mealsProvided?.dinner ? '<span class="perk-tag"><i class="fas fa-utensils"></i> Meals</span>' : ''}
                            ${shift.facilities?.parking ? '<span class="perk-tag"><i class="fas fa-parking"></i> Parking</span>' : ''}
                            <span class="perk-tag"><i class="fas fa-check"></i> Instant Confirm</span>
                        </div>

                        <div class="shift-footer">
                            <div>
                                ${shift.urgency === 'URGENT' ? '<span class="urgency-tag urgent-tag"><i class="fas fa-exclamation-triangle"></i> Urgent</span>' : ''}
                                ${shift.urgency === 'EMERGENCY' ? '<span class="urgency-tag emergency-tag"><i class="fas fa-ambulance"></i> Emergency</span>' : ''}
                                ${spotsLeft <= 2 && spotsLeft > 0 ? `<span class="spots-left">🔥 ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left</span>` : ''}
                            </div>
                            <button class="btn-apply" data-action="quick-apply" data-shift-id="${shift._id}">
                                <i class="fas fa-paper-plane"></i> Quick Apply
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // View shift details
        function viewShift(shiftId) {
            window.location.href = AppConfig.routes.page('doctor.dutyDetails', { id: shiftId });
        }

        // Clear filters
        function clearFilters() {
            document.getElementById('specialtyFilter').value = '';
            document.getElementById('timeFilter').value = '';
            document.getElementById('distanceFilter').value = '';
            document.getElementById('minPayFilter').value = '';
            document.getElementById('ratingFilter').value = '';
            document.getElementById('customDateFilter').value = '';
            document.getElementById('sortBy').value = 'match';

            document.querySelectorAll('.quick-filter-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.date === 'all') {
                    btn.classList.add('active');
                }
            });

            applyFilters();
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', async () => {
            bindUiEvents();
            await loadUser();
            await loadShifts();
        });

        function bindUiEvents() {
            document.getElementById('clearFiltersTopBtn')?.addEventListener('click', clearFilters);
            document.getElementById('clearFiltersBtn')?.addEventListener('click', clearFilters);
            document.getElementById('applyFiltersBtn')?.addEventListener('click', applyFilters);
            document.getElementById('sortBy')?.addEventListener('change', applyFilters);

            document.querySelectorAll('.quick-filter-btn[data-date]').forEach(button => {
                button.addEventListener('click', function() {
                    setDateFilter(this.dataset.date, this);
                });
            });

            document.getElementById('shiftsGrid')?.addEventListener('click', function(event) {
                const applyButton = event.target.closest('[data-action="quick-apply"]');
                if (applyButton) {
                    NocturnalSession.handleDutyApplication(event, applyButton.dataset.shiftId, {
                        coverLetter: 'I am interested in this position and believe I am a great fit.',
                        fallbackMessage: 'Failed to apply',
                        successMessage: 'Application submitted successfully!',
                        errorMessage: 'Error submitting application'
                    });
                    return;
                }

                const shiftCard = event.target.closest('.shift-card[data-shift-id]');
                if (shiftCard) {
                    viewShift(shiftCard.dataset.shiftId);
                }
            });
        }
