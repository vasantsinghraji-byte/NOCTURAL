// API_URL is provided by config.js
        let earningsChart;

        document.addEventListener('DOMContentLoaded', function() {
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = AppConfig.routes.page('home');
                return;
            }

            loadEarningsDashboard();
            loadEarningsOptimizer();
        });

        async function loadEarningsDashboard() {
            try {
                const token = localStorage.getItem('token');
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('earnings.dashboard', {
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }), 'Failed to load earnings data', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.data);
                    }
                });
                displayEarningsData(data.data);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('mainContent').style.display = 'block';
            } catch (error) {
                console.error('Error loading earnings:', error);
                document.getElementById('loading').innerHTML = '<p style="color: var(--danger);">Error loading earnings data. Please try again.</p>';
            }
        }

        function displayEarningsData(data) {
            // Update stats cards
            document.getElementById('totalEarnings').textContent = `₹${data.currentMonth.totalEarnings.toLocaleString()}`;
            document.getElementById('hoursWorked').textContent = `${data.currentMonth.hoursWorked} hrs`;
            document.getElementById('avgRate').textContent = `₹${data.currentMonth.avgRate.toLocaleString()}/hr`;
            document.getElementById('goalProgress').textContent = `${data.currentMonth.goalProgress}%`;
            document.getElementById('goalProgressBar').style.width = `${data.currentMonth.goalProgress}%`;
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
            document.getElementById('paidAmount').textContent = `₹${data.breakdown.paid.toLocaleString()}`;
            document.getElementById('pendingAmount').textContent = `₹${data.breakdown.pending.toLocaleString()}`;
            document.getElementById('overdueAmount').textContent = `₹${data.breakdown.overdue.toLocaleString()}`;

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
                            <div class="timeline-date">Due: ${new Date(payment.expectedPaymentDate).toLocaleDateString()}</div>
                            <div class="timeline-title">${payment.hospital}</div>
                            <div class="timeline-amount">₹${payment.netAmount.toLocaleString()}</div>
                            <button class="btn btn-danger" style="margin-top: 10px; font-size: 0.85rem;" data-action="dispute-payment" data-earning-id="${payment._id}">
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
                            <div class="timeline-date">Expected: ${new Date(payment.expectedPaymentDate).toLocaleDateString()}</div>
                            <div class="timeline-title">${payment.hospital}</div>
                            <div class="timeline-amount">₹${payment.netAmount.toLocaleString()}</div>
                        </div>
                    `;
                });
            }

            if (html === '') {
                html = '<p style="text-align: center; color: var(--gray); padding: 20px;">No pending payments</p>';
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
                const token = localStorage.getItem('token');
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('earnings.optimizer', {
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
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
                            <div class="suggestion-pay">₹${duty.totalCompensation.toLocaleString()}</div>
                        </div>
                        <div class="suggestion-details">
                            ${duty.hospital} • ${new Date(duty.date).toLocaleDateString()} • ${duty.startTime} - ${duty.endTime}
                        </div>
                        <button class="btn btn-success" style="margin-top: 10px; font-size: 0.85rem;" data-action="view-duty-details" data-duty-id="${duty._id}">
                            View Details
                        </button>
                    </div>
                `;
            });

            list.innerHTML = html;
            document.getElementById('potentialEarnings').textContent = `₹${data.potential.totalEarnings.toLocaleString()}`;

            if (data.potential.exceedsLimit) {
                document.getElementById('warningMessage').innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i> ${data.potential.warning}
                `;
            }

            card.style.display = 'block';
        }

        async function disputePayment(earningId) {
            const reason = prompt('Please provide a reason for the dispute:');
            if (!reason) return;

            try {
                const token = localStorage.getItem('token');
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('earnings.dispute', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`,
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
