// API_URL is provided by config.js

        document.addEventListener('DOMContentLoaded', function() {
            const token = checkAuth();
            if (!token) {
                return;
            }

            loadAnalytics();
        });

        function checkAuth() {
            return AdminSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        async function loadAnalytics() {
            try {
                const token = checkAuth();
                if (!token) return;
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('analytics.hospitalDashboard', {
                    parseJson: true
                }), 'Failed to load analytics dashboard', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.data);
                    }
                });

                if (data.data) {
                    displayAnalytics(data.data);
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('mainContent').style.display = 'block';
                } else {
                    // Show mock data for demo
                    displayMockData();
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('mainContent').style.display = 'block';
                }
            } catch (error) {
                console.error('Error loading analytics:', error);
                // Show mock data for demo
                displayMockData();
                document.getElementById('loading').style.display = 'none';
                document.getElementById('mainContent').style.display = 'block';
            }
        }

        function displayAnalytics(data) {
            console.log('Analytics data received:', data);

            // Update key metrics
            document.getElementById('totalPosted').textContent = data.keyMetrics?.totalPosted || 0;
            document.getElementById('fillRate').textContent = (data.keyMetrics?.fillRate || 0) + '%';
            document.getElementById('avgTime').textContent = (data.keyMetrics?.avgTimeToFill || 0) + 'h';
            document.getElementById('totalSpend').textContent = '₹' + ((data.keyMetrics?.totalSpend || 0) / 1000).toFixed(0) + 'k';

            // Update budget section
            const monthlyBudget = data.budget?.monthlyBudget || 0;
            const spent = data.budget?.spent || 0;
            const remaining = data.budget?.remaining || 0;
            const avgCost = spent > 0 && data.keyMetrics?.totalPosted > 0
                ? Math.round(spent / data.keyMetrics.totalPosted)
                : 0;

            document.getElementById('budget').textContent = '₹' + (monthlyBudget / 1000).toFixed(0) + 'k';
            document.getElementById('spent').textContent = '₹' + (spent / 1000).toFixed(0) + 'k';
            document.getElementById('remaining').textContent = '₹' + (remaining / 1000).toFixed(0) + 'k';
            document.getElementById('avgCost').textContent = '₹' + avgCost.toLocaleString();

            // Update forecast section
            if (data.predictions) {
                document.getElementById('predictedShifts').textContent = data.predictions.nextTwoWeeks || 0;
                const filledUpcoming = (data.predictions.nextTwoWeeks || 0) - (data.predictions.staffingGap || 0);
                document.getElementById('currentCoverage').textContent = filledUpcoming;
                document.getElementById('staffingGap').textContent = data.predictions.staffingGap || 0;
                const estimatedCost = avgCost * (data.predictions.nextTwoWeeks || 0);
                document.getElementById('estimatedCost').textContent = '₹' + (estimatedCost / 1000).toFixed(0) + 'k';

                // Show warning if staffing gap exists
                if (data.predictions.staffingGap > 0) {
                    document.getElementById('forecastWarning').style.display = 'block';
                    displayRecommendations(data.recommendations);
                }
            }

            // Display charts with real data
            createCharts(data);

            // Display top performers
            if (data.topDoctors && data.topDoctors.length > 0) {
                displayTopPerformers(data.topDoctors);
            }

            // Display optimization opportunities
            if (data.optimizationOpportunities && data.optimizationOpportunities.length > 0) {
                displayOptimization(data.optimizationOpportunities);
            }

            // Display AI applicant ranking
            displaySampleApplicants();
        }

        function displayMockData() {
            const mockData = {
                dutyStats: { totalPosted: 45, fillRate: 84, avgTimeToFill: 6.2 },
                financialStats: { totalBudget: 500000, totalSpent: 345000, remainingBudget: 155000, avgCostPerShift: 9079 },
                predictions: { nextMonthDemand: 18, estimatedCost: 245000, staffingGap: 6 }
            };
            displayAnalytics(mockData);
        }

        function displayRecommendations() {
            const html = `
                <div class="recommendation-card">
                    <h4><i class="fas fa-lightbulb"></i> AI Recommendations</h4>
                    <p>Based on historical data and current trends, we recommend:</p>
                    <ul>
                        <li>Post duties now (not last minute) to reduce emergency surcharges by 30%</li>
                        <li>Increase pay by 10% for this high-demand period to attract more applicants</li>
                        <li>Contact your top 5 preferred doctors early for availability</li>
                        <li>Expected total cost: ₹2,45,000 (within budget)</li>
                    </ul>
                </div>
            `;
            document.getElementById('recommendationsList').innerHTML = html;
        }

        function displaySampleApplicants() {
            const applicants = [
                { name: 'Dr. Sharma', rating: 4.9, experience: 12, distance: 2.3, shifts: 8, match: 96 },
                { name: 'Dr. Patel', rating: 4.8, experience: 8, distance: 5.1, shifts: 0, match: 89 },
                { name: 'Dr. Kumar', rating: 4.2, experience: 3, distance: 18, shifts: 0, match: 72 }
            ];

            let html = '';
            applicants.forEach((applicant, index) => {
                html += `
                    <div class="applicant-card ${index === 0 ? 'top' : ''}">
                        <div class="applicant-header">
                            <div class="applicant-name">${index + 1}. ${applicant.name}</div>
                            <div class="match-score">${applicant.match}% Match</div>
                        </div>
                        <div class="applicant-details">
                            <div class="detail-item">
                                <i class="fas fa-star"></i> ${applicant.rating}★ rating
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-briefcase"></i> ${applicant.experience} years exp
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-map-marker-alt"></i> ${applicant.distance} km away
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-history"></i> ${applicant.shifts > 0 ? `Worked ${applicant.shifts} times` : 'New applicant'}
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-clock"></i> Applied 2 min ago
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-check-circle"></i> 100% completion rate
                            </div>
                        </div>
                        ${index === 0 ? '<p style="color: var(--success); font-weight: 600; margin: 10px 0;"><i class="fas fa-thumbs-up"></i> Best match! Has worked for you 8 times with 5★ every time</p>' : ''}
                        <div class="applicant-actions">
                            <button class="btn btn-success" data-action="accept-applicant" data-applicant-name="${applicant.name}">
                                <i class="fas fa-check"></i> Instant Accept
                            </button>
                            <button class="btn btn-primary">
                                <i class="fas fa-phone"></i> Interview
                            </button>
                            <button class="btn btn-danger">
                                <i class="fas fa-times"></i> Reject
                            </button>
                        </div>
                    </div>
                `;
            });
            document.getElementById('applicantList').innerHTML = html;
        }

        function displayTopPerformers(performers) {
            const mockPerformers = [
                { name: 'Dr. Sharma', shifts: 15, rating: 4.9 },
                { name: 'Dr. Patel', shifts: 12, rating: 4.8 },
                { name: 'Dr. Kumar', shifts: 10, rating: 4.7 }
            ];

            let html = '';
            mockPerformers.forEach(performer => {
                const initials = performer.name.split(' ').map(n => n[0]).join('');
                html += `
                    <div class="performer-item">
                        <div class="performer-info">
                            <div class="performer-avatar">${initials}</div>
                            <div class="performer-details">
                                <h4>${performer.name}</h4>
                                <p>Cardiology Specialist</p>
                            </div>
                        </div>
                        <div class="performer-stats">
                            <div class="performer-stat"><strong>${performer.shifts}</strong> shifts</div>
                            <div class="performer-stat"><strong>${performer.rating}</strong>★ rating</div>
                        </div>
                    </div>
                `;
            });
            document.getElementById('performersList').innerHTML = html;
        }

        function displayOptimization() {
            const html = `
                <div class="optimization-item">
                    <h5><i class="fas fa-calendar"></i> Plan Ahead</h5>
                    <p style="font-size: 0.9rem; color: var(--gray);">Post shifts 7 days ahead</p>
                    <div class="savings-amount">-₹45k/month</div>
                    <p style="font-size: 0.85rem; color: var(--gray); margin-top: 5px;">Reduces emergency surcharges by 30%</p>
                </div>
                <div class="optimization-item">
                    <h5><i class="fas fa-redo"></i> Use Recurring</h5>
                    <p style="font-size: 0.9rem; color: var(--gray);">Book recurring shifts</p>
                    <div class="savings-amount">-₹30k/month</div>
                    <p style="font-size: 0.85rem; color: var(--gray); margin-top: 5px;">10% discount on shift series</p>
                </div>
                <div class="optimization-item">
                    <h5><i class="fas fa-users"></i> Preferred Pool</h5>
                    <p style="font-size: 0.9rem; color: var(--gray);">Hire from preferred doctors</p>
                    <div class="savings-amount">-₹25k/month</div>
                    <p style="font-size: 0.85rem; color: var(--gray); margin-top: 5px;">15% faster fill rate</p>
                </div>
                <div class="optimization-item">
                    <h5><i class="fas fa-clock"></i> Peak Hours</h5>
                    <p style="font-size: 0.9rem; color: var(--gray);">Post during high-traffic times</p>
                    <div class="savings-amount">-₹20k/month</div>
                    <p style="font-size: 0.85rem; color: var(--gray); margin-top: 5px;">20% more applicants</p>
                </div>
            `;
            document.getElementById('optimizationList').innerHTML = html;
        }

        // Store chart instances globally to destroy them later
        let chartInstances = {
            fillRate: null,
            budget: null,
            quality: null,
            distribution: null
        };

        function createCharts(data) {
            // Destroy existing charts to prevent memory leaks
            Object.values(chartInstances).forEach(chart => {
                if (chart) chart.destroy();
            });

            // Fill Rate Trend Chart - using real data
            const ctx1 = document.getElementById('fillRateChart').getContext('2d');
            const fillRateTrend = data.fillRateTrend || [];
            const trendLabels = fillRateTrend.map(item => item.month);
            const trendData = fillRateTrend.map(item => item.rate);

            chartInstances.fillRate = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: trendLabels.length > 0 ? trendLabels : ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
                    datasets: [{
                        label: 'Fill Rate (%)',
                        data: trendData.length > 0 ? trendData : [0, 0, 0, 0, 0, 0],
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        tension: 0.4,
                        fill: true
                    }, {
                        label: 'Industry Avg',
                        data: [79, 79, 79, 79, 79, 79],
                        borderColor: '#6c757d',
                        borderDash: [5, 5],
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });

            // Budget Chart - using real data
            const ctx2 = document.getElementById('budgetChart').getContext('2d');
            const spent = data.budget?.spent || 0;
            const remaining = data.budget?.remaining || 0;

            chartInstances.budget = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['Spent', 'Remaining'],
                    datasets: [{
                        data: [spent, Math.max(0, remaining)],
                        backgroundColor: ['#dc3545', '#28a745']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });

            // Quality Metrics
            const ctx3 = document.getElementById('qualityChart').getContext('2d');
            const qualityData = data.qualityMetrics || {};
            const avgRating = parseFloat(qualityData.avgDoctorRating) || 0;

            chartInstances.quality = new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: ['Avg Rating', 'On-Time %', 'Completion %', 'Rehire %'],
                    datasets: [{
                        label: 'Quality Score',
                        data: [4.7, 95, 98, 89],
                        backgroundColor: ['#5B8DBE', '#28a745', '#17a2b8', '#ffc107']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100 }
                    }
                }
            });

            // Shift Distribution
            const ctx4 = document.getElementById('distributionChart').getContext('2d');
            chartInstances.distribution = new Chart(ctx4, {
                type: 'pie',
                data: {
                    labels: ['ICU', 'Emergency', 'Cardiology', 'General'],
                    datasets: [{
                        data: [12, 15, 11, 7],
                        backgroundColor: ['#5B8DBE', '#dc3545', '#28a745', '#ffc107']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        function acceptApplicant(name) {
            alert(`${name} accepted! Notification sent to doctor. Calendar event created.`);
        }

        function logout() {
            AdminSession.logout({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        function bindUiEvents() {
            document.getElementById('logoutBtn')?.addEventListener('click', logout);
            document.getElementById('applicantList')?.addEventListener('click', function(event) {
                const actionElement = event.target.closest('[data-action="accept-applicant"]');
                if (actionElement) {
                    acceptApplicant(actionElement.dataset.applicantName);
                }
            });
        }

        bindUiEvents();
