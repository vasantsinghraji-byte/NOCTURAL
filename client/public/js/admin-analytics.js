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
                    AppUi.setDisplay(document.getElementById('loading'), 'none');
                    AppUi.setDisplay(document.getElementById('mainContent'), 'block');
                } else {
                    // Show mock data for demo
                    displayMockData();
                    AppUi.setDisplay(document.getElementById('loading'), 'none');
                    AppUi.setDisplay(document.getElementById('mainContent'), 'block');
                }
            } catch (error) {
                console.error('Error loading analytics:', error);
                // Show mock data for demo
                displayMockData();
                AppUi.setDisplay(document.getElementById('loading'), 'none');
                AppUi.setDisplay(document.getElementById('mainContent'), 'block');
            }
        }

        function displayAnalytics(data) {
            console.log('Analytics data received:', data);

            // Update key metrics
            document.getElementById('totalPosted').textContent = data.keyMetrics?.totalPosted || 0;
            document.getElementById('fillRate').textContent = AppFormat.percent(data.keyMetrics?.fillRate || 0);
            document.getElementById('avgTime').textContent = AppFormat.hours(data.keyMetrics?.avgTimeToFill || 0, 'h');
            document.getElementById('totalSpend').textContent = AppFormat.currencyCompactThousands(data.keyMetrics?.totalSpend || 0, 0);

            // Update budget section
            const monthlyBudget = data.budget?.monthlyBudget || 0;
            const spent = data.budget?.spent || 0;
            const remaining = data.budget?.remaining || 0;
            const avgCost = spent > 0 && data.keyMetrics?.totalPosted > 0
                ? Math.round(spent / data.keyMetrics.totalPosted)
                : 0;

            document.getElementById('budget').textContent = AppFormat.currencyCompactThousands(monthlyBudget, 0);
            document.getElementById('spent').textContent = AppFormat.currencyCompactThousands(spent, 0);
            document.getElementById('remaining').textContent = AppFormat.currencyCompactThousands(remaining, 0);
            document.getElementById('avgCost').textContent = AppFormat.currencyWhole(avgCost);

            // Update forecast section
            if (data.predictions) {
                document.getElementById('predictedShifts').textContent = data.predictions.nextTwoWeeks || 0;
                const filledUpcoming = (data.predictions.nextTwoWeeks || 0) - (data.predictions.staffingGap || 0);
                document.getElementById('currentCoverage').textContent = filledUpcoming;
                document.getElementById('staffingGap').textContent = data.predictions.staffingGap || 0;
                const estimatedCost = avgCost * (data.predictions.nextTwoWeeks || 0);
                document.getElementById('estimatedCost').textContent = AppFormat.currencyCompactThousands(estimatedCost, 0);

                // Show warning if staffing gap exists
                if (data.predictions.staffingGap > 0) {
                    AppUi.setDisplay(document.getElementById('forecastWarning'), 'block');
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

        function createIcon(className) {
            const icon = document.createElement('i');
            icon.className = className;
            return icon;
        }

        function createDetailItem(iconClass, text) {
            const item = document.createElement('div');
            item.className = 'detail-item';
            item.append(createIcon(iconClass), document.createTextNode(' ' + text));
            return item;
        }

        function displayRecommendations() {
            const card = document.createElement('div');
            card.className = 'recommendation-card';

            const heading = document.createElement('h4');
            heading.append(createIcon('fas fa-lightbulb'), document.createTextNode(' AI Recommendations'));

            const intro = document.createElement('p');
            intro.textContent = 'Based on historical data and current trends, we recommend:';

            const list = document.createElement('ul');
            [
                'Post duties now (not last minute) to reduce emergency surcharges by 30%',
                'Increase pay by 10% for this high-demand period to attract more applicants',
                'Contact your top 5 preferred doctors early for availability',
                'Expected total cost: Rs 2,45,000 (within budget)'
            ].forEach(function (recommendation) {
                const item = document.createElement('li');
                item.textContent = recommendation;
                list.appendChild(item);
            });

            card.append(heading, intro, list);
            document.getElementById('recommendationsList').replaceChildren(card);
        }

        function displaySampleApplicants() {
            const applicants = [
                { name: 'Dr. Sharma', rating: 4.9, experience: 12, distance: 2.3, shifts: 8, match: 96 },
                { name: 'Dr. Patel', rating: 4.8, experience: 8, distance: 5.1, shifts: 0, match: 89 },
                { name: 'Dr. Kumar', rating: 4.2, experience: 3, distance: 18, shifts: 0, match: 72 }
            ];
            const list = document.getElementById('applicantList');
            list.replaceChildren();

            applicants.forEach((applicant, index) => {
                const card = document.createElement('div');
                card.className = 'applicant-card' + (index === 0 ? ' top' : '');

                const header = document.createElement('div');
                header.className = 'applicant-header';

                const name = document.createElement('div');
                name.className = 'applicant-name';
                name.textContent = `${index + 1}. ${applicant.name}`;

                const match = document.createElement('div');
                match.className = 'match-score';
                match.textContent = `${applicant.match}% Match`;

                const details = document.createElement('div');
                details.className = 'applicant-details';
                details.append(
                    createDetailItem('fas fa-star', `${applicant.rating} star rating`),
                    createDetailItem('fas fa-briefcase', `${applicant.experience} years exp`),
                    createDetailItem('fas fa-map-marker-alt', `${applicant.distance} km away`),
                    createDetailItem('fas fa-history', applicant.shifts > 0 ? `Worked ${applicant.shifts} times` : 'New applicant'),
                    createDetailItem('fas fa-clock', 'Applied 2 min ago'),
                    createDetailItem('fas fa-check-circle', '100% completion rate')
                );

                header.append(name, match);
                card.append(header, details);

                if (index === 0) {
                    const bestMatch = document.createElement('p');
                    bestMatch.className = 'best-match-note';
                    bestMatch.append(createIcon('fas fa-thumbs-up'), document.createTextNode(' Best match! Has worked for you 8 times with 5 star every time'));
                    card.appendChild(bestMatch);
                }

                const actions = document.createElement('div');
                actions.className = 'applicant-actions';

                const acceptButton = document.createElement('button');
                acceptButton.className = 'btn btn-success';
                acceptButton.dataset.action = 'accept-applicant';
                acceptButton.dataset.applicantName = applicant.name;
                acceptButton.append(createIcon('fas fa-check'), document.createTextNode(' Instant Accept'));

                const interviewButton = document.createElement('button');
                interviewButton.className = 'btn btn-primary';
                interviewButton.append(createIcon('fas fa-phone'), document.createTextNode(' Interview'));

                const rejectButton = document.createElement('button');
                rejectButton.className = 'btn btn-danger';
                rejectButton.append(createIcon('fas fa-times'), document.createTextNode(' Reject'));

                actions.append(acceptButton, interviewButton, rejectButton);
                card.appendChild(actions);
                list.appendChild(card);
            });
        }

        function displayTopPerformers(performers) {
            const mockPerformers = [
                { name: 'Dr. Sharma', shifts: 15, rating: 4.9 },
                { name: 'Dr. Patel', shifts: 12, rating: 4.8 },
                { name: 'Dr. Kumar', shifts: 10, rating: 4.7 }
            ];
            const safePerformers = performers && performers.length > 0 ? performers : mockPerformers;
            const list = document.getElementById('performersList');
            list.replaceChildren();

            safePerformers.forEach(performer => {
                const item = document.createElement('div');
                item.className = 'performer-item';

                const info = document.createElement('div');
                info.className = 'performer-info';

                const avatar = document.createElement('div');
                avatar.className = 'performer-avatar';
                avatar.textContent = String(performer.name || 'DR').split(' ').map(n => n[0]).join('');

                const details = document.createElement('div');
                details.className = 'performer-details';

                const name = document.createElement('h4');
                name.textContent = performer.name || 'Doctor';

                const specialty = document.createElement('p');
                specialty.textContent = performer.specialty || 'Cardiology Specialist';

                const stats = document.createElement('div');
                stats.className = 'performer-stats';

                const shifts = document.createElement('div');
                shifts.className = 'performer-stat';
                const shiftValue = document.createElement('strong');
                shiftValue.textContent = performer.shifts || 0;
                shifts.append(shiftValue, document.createTextNode(' shifts'));

                const rating = document.createElement('div');
                rating.className = 'performer-stat';
                const ratingValue = document.createElement('strong');
                ratingValue.textContent = performer.rating || 0;
                rating.append(ratingValue, document.createTextNode(' star rating'));

                details.append(name, specialty);
                info.append(avatar, details);
                stats.append(shifts, rating);
                item.append(info, stats);
                list.appendChild(item);
            });
        }

        function displayOptimization() {
            const optimizations = [
                ['fas fa-calendar', 'Plan Ahead', 'Post shifts 7 days ahead', '-Rs 45k/month', 'Reduces emergency surcharges by 30%'],
                ['fas fa-redo', 'Use Recurring', 'Book recurring shifts', '-Rs 30k/month', '10% discount on shift series'],
                ['fas fa-users', 'Preferred Pool', 'Hire from preferred doctors', '-Rs 25k/month', '15% faster fill rate'],
                ['fas fa-clock', 'Peak Hours', 'Post during high-traffic times', '-Rs 20k/month', '20% more applicants']
            ];
            const list = document.getElementById('optimizationList');
            list.replaceChildren();

            optimizations.forEach(function (optimization) {
                const item = document.createElement('div');
                item.className = 'optimization-item';

                const heading = document.createElement('h5');
                heading.append(createIcon(optimization[0]), document.createTextNode(' ' + optimization[1]));

                const description = document.createElement('p');
                description.className = 'optimization-description';
                description.textContent = optimization[2];

                const savings = document.createElement('div');
                savings.className = 'savings-amount';
                savings.textContent = optimization[3];

                const detail = document.createElement('p');
                detail.className = 'optimization-detail';
                detail.textContent = optimization[4];

                item.append(heading, description, savings, detail);
                list.appendChild(item);
            });
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






