// API_URL is provided by config.js
        let earningsChart;

        document.addEventListener('DOMContentLoaded', function() {
            const session = DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
            if (!session) {
                window.location.href = AppConfig.routes.page('home');
                return;
            }

            loadEarningsDashboard();
            loadEarningsOptimizer();
        });

        async function loadEarningsDashboard() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('earnings.dashboard', {
                    parseJson: true
                }), 'Failed to load earnings data', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.data);
                    }
                });
                displayEarningsData(data.data);
                AppUi.setDisplay(document.getElementById('loading'), 'none');
                AppUi.setDisplay(document.getElementById('mainContent'), 'block');
            } catch (error) {
                console.error('Error loading earnings:', error);
                document.getElementById('loading').innerHTML = '<p class="error-text">Error loading earnings data. Please try again.</p>';
            }
        }

        function displayEarningsData(data) {
            // Update stats cards
            document.getElementById('totalEarnings').textContent = AppFormat.currencyWhole(data.currentMonth.totalEarnings);
            document.getElementById('hoursWorked').textContent = AppFormat.hours(data.currentMonth.hoursWorked, ' hrs');
            document.getElementById('avgRate').textContent = `${AppFormat.currencyWhole(data.currentMonth.avgRate)}/hr`;
            document.getElementById('goalProgress').textContent = AppFormat.percent(data.currentMonth.goalProgress);
            AppUi.setPercentWidth(document.getElementById('goalProgressBar'), data.currentMonth.goalProgress);
            document.getElementById('shiftsCount').textContent = `${data.currentMonth.shiftsCompleted} shifts completed`;

            // Earnings change
            const change = data.comparison.change;
            const changeEl = document.getElementById('earningsChange');
            if (change > 0) {
                changeEl.className = 'stat-change positive';
                changeEl.innerHTML = `<i class="fas fa-arrow-up"></i> ${change}% vs last month`;
            } else if (change < 0) {
                changeEl.className = 'stat-change negative';
                changeEl.innerHTML = `<i class="fas fa-arrow-down"></i> ${Math.abs(change)}% vs last month`;
            } else {
                changeEl.className = 'stat-change';
                changeEl.innerHTML = 'No change vs last month';
            }

            // Breakdown
            document.getElementById('paidAmount').textContent = AppFormat.currencyWhole(data.breakdown.paid);
            document.getElementById('pendingAmount').textContent = AppFormat.currencyWhole(data.breakdown.pending);
            document.getElementById('overdueAmount').textContent = AppFormat.currencyWhole(data.breakdown.overdue);

            // Payment timeline
            displayPaymentTimeline(data.paymentTimeline);

            // Create chart
            createEarningsChart(data);
        }

        function displayPaymentTimeline(timeline) {
            const timelineEl = document.getElementById('paymentTimeline');
            let html = '';

            // Overdue payments
            if (timeline.overdue && timeline.overdue.length > 0) {
                timeline.overdue.forEach(payment => {
                    html += `
                        <div class="timeline-item overdue">
                            <div class="timeline-date">Due: ${AppFormat.date(payment.expectedPaymentDate)}</div>
                            <div class="timeline-title">${payment.hospital}</div>
                            <div class="timeline-amount">${AppFormat.currencyWhole(payment.netAmount)}</div>
                            <button class="btn btn-danger btn-sm-spaced" data-action="dispute-payment" data-earning-id="${payment._id}">
                                <i class="fas fa-exclamation-circle"></i> Raise Dispute
                            </button>
                        </div>
                    `;
                });
            }

            // Upcoming payments
            if (timeline.upcoming && timeline.upcoming.length > 0) {
                timeline.upcoming.forEach(payment => {
                    html += `
                        <div class="timeline-item pending">
                            <div class="timeline-date">Expected: ${AppFormat.date(payment.expectedPaymentDate)}</div>
                            <div class="timeline-title">${payment.hospital}</div>
                            <div class="timeline-amount">${AppFormat.currencyWhole(payment.netAmount)}</div>
                        </div>
                    `;
                });
            }

            if (html === '') {
                html = '<p class="empty-payment-text">No pending payments</p>';
            }

            timelineEl.innerHTML = html;
        }

        function createEarningsChart(data) {
            const ctx = document.getElementById('earningsChart').getContext('2d');

            // Mock data for last 6 months
            const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
            const earnings = [180000, 195000, 213000, 245000, 213000, data.currentMonth.totalEarnings];

            earningsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'Monthly Earnings (₹)',
                        data: earnings,
                        borderColor: '#5B8DBE',
                        backgroundColor: 'rgba(91, 141, 190, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '₹' + (value/1000) + 'k';
                                }
                            }
                        }
                    }
                }
            });
        }

        async function loadEarningsOptimizer() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('earnings.optimizer', {
                    parseJson: true
                }), 'Failed to load optimizer data', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.data);
                    }
                });
                if (data.data.suggestions.length > 0) {
                    displayOptimizer(data.data);
                }
            } catch (error) {
                console.error('Error loading optimizer:', error);
            }
        }

        function displayOptimizer(data) {
            const card = document.getElementById('optimizerCard');
            const list = document.getElementById('suggestionsList');

            let html = '';
            data.suggestions.forEach(duty => {
                html += `
                    <div class="suggestion-item">
                        <div class="suggestion-header">
                            <div class="suggestion-title">${duty.title}</div>
                            <div class="suggestion-pay">${AppFormat.currencyWhole(duty.totalCompensation)}</div>
                        </div>
                        <div class="suggestion-details">
                            ${duty.hospital} • ${AppFormat.date(duty.date)} • ${duty.startTime} - ${duty.endTime}
                        </div>
                        <button class="btn btn-success btn-sm-spaced" data-action="view-duty-details" data-duty-id="${duty._id}">
                            View Details
                        </button>
                    </div>
                `;
            });

            list.innerHTML = html;
            document.getElementById('potentialEarnings').textContent = AppFormat.currencyWhole(data.potential.totalEarnings);

            if (data.potential.exceedsLimit) {
                document.getElementById('warningMessage').innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i> ${data.potential.warning}
                `;
            }

            AppUi.setDisplay(card, 'block');
        }

        async function disputePayment(earningId) {
            const reason = prompt('Please provide a reason for the dispute:');
            if (!reason) return;

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('earnings.dispute', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ reason })
                }, {
                    params: { earningId: earningId }
                }), 'Failed to raise dispute');
                alert('Dispute raised successfully. Admin will review shortly.');
                loadEarningsDashboard();
            } catch (error) {
                console.error('Error raising dispute:', error);
                alert('Failed to raise dispute');
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

            document.getElementById('paymentTimeline')?.addEventListener('click', function(event) {
                const disputeButton = event.target.closest('[data-action="dispute-payment"]');
                if (disputeButton) {
                    disputePayment(disputeButton.dataset.earningId);
                }
            });

            document.getElementById('suggestionsList')?.addEventListener('click', function(event) {
                const viewButton = event.target.closest('[data-action="view-duty-details"]');
                if (viewButton) {
                    window.location.href = AppConfig.routes.page('doctor.dutyDetails', {
                        id: viewButton.dataset.dutyId
                    });
                }
            });
        }

        bindUiEvents();
