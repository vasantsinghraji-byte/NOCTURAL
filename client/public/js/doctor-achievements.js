// API_URL is provided by config.js
        let currentCategory = 'shifts';
        let currentPeriod = 'month';
        let currentUserId = null;

        document.addEventListener('DOMContentLoaded', function() {
            const token = DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
            if (!token) {
                window.location.href = AppConfig.routes.page('home');
                return;
            }

            // Get current user ID from token
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUserId = payload.id;

            loadAchievements();
            loadLeaderboard();
        });

        function switchTab(tabName, tabButton) {
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            if (tabButton) {
                tabButton.classList.add('active');
            }
            document.getElementById(tabName + 'Tab').classList.add('active');

            if (tabName === 'leaderboard') {
                loadLeaderboard();
            }
        }

        async function loadAchievements() {
            try {
                const token = localStorage.getItem('token');
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('achievements.list', {
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }), 'Failed to load achievements');
                displayAchievements(Array.isArray(data.data) ? data.data : []);
            } catch (error) {
                console.error('Error loading achievements:', error);
            }
        }

        function displayAchievements(achievements) {
            const list = document.getElementById('achievementsList');

            if (achievements.length === 0) {
                list.innerHTML = '<p style="text-align: center; color: var(--gray); grid-column: 1/-1;">No achievements yet. Start completing shifts to earn badges!</p>';
                return;
            }

            let html = '';
            achievements.forEach(achievement => {
                const isEarned = achievement.earnedAt;
                const progressPercent = (achievement.progress.current / achievement.progress.target) * 100;

                html += `
                    <div class="achievement-card ${isEarned ? '' : 'locked'}">
                        ${achievement.tier ? `<div class="achievement-tier tier-${achievement.tier.toLowerCase()}">${achievement.tier}</div>` : ''}
                        <div class="achievement-icon">${achievement.icon}</div>
                        <div class="achievement-title">${achievement.title}</div>
                        <div class="achievement-description">${achievement.description}</div>

                        ${!isEarned ? `
                            <div class="achievement-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                                </div>
                                <div class="progress-text">${achievement.progress.current} / ${achievement.progress.target} ${achievement.progress.unit}</div>
                            </div>
                        ` : ''}

                        ${achievement.reward === 'BONUS' && achievement.rewardAmount ?
                            `<div class="reward-badge">Reward: ₹${achievement.rewardAmount.toLocaleString()}</div>` : ''}

                        ${isEarned && achievement.reward === 'BONUS' && !achievement.rewardClaimed ?
                            `<button class="claim-btn" data-action="claim-reward" data-achievement-id="${achievement._id}">Claim Reward</button>` : ''}

                        ${isEarned ?
                            `<button class="share-btn" data-action="share-achievement" data-achievement-id="${achievement._id}"><i class="fab fa-linkedin"></i> Share</button>` : ''}

                        ${isEarned ? `<p style="margin-top: 15px; font-size: 0.85rem; color: var(--success);">Earned: ${new Date(achievement.earnedAt).toLocaleDateString()}</p>` : ''}
                    </div>
                `;
            });

            list.innerHTML = html;
        }

        async function loadLeaderboard() {
            try {
                const token = localStorage.getItem('token');
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('achievements.leaderboard', {
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }, {
                    query: {
                        category: currentCategory,
                        period: currentPeriod
                    }
                }), 'Failed to load leaderboard', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.data);
                    }
                });
                displayLeaderboard(data.data);
            } catch (error) {
                console.error('Error loading leaderboard:', error);
            }
        }

        function displayLeaderboard(data) {
            const list = document.getElementById('leaderboardList');
            document.getElementById('yourRank').textContent = data.userRank || '-';

            let html = '';
            data.leaderboard.forEach((entry, index) => {
                const isCurrentUser = entry.user._id === currentUserId;
                const rankClass = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : '';
                const rowClass = index < 3 ? 'top-three' : '';
                const userClass = isCurrentUser ? 'current-user' : '';

                const initials = entry.user.name.split(' ').map(n => n[0]).join('').toUpperCase();

                html += `
                    <div class="leaderboard-item ${rowClass} ${userClass}">
                        <div class="rank ${rankClass}">#${entry.rank}</div>
                        <div class="user-info">
                            <div class="user-avatar">${initials}</div>
                            <div class="user-details">
                                <h4>${entry.user.name} ${isCurrentUser ? '(You)' : ''}</h4>
                                <p>${entry.user.specialty || 'Doctor'}</p>
                            </div>
                        </div>
                        <div class="stat-value">${entry.shifts}</div>
                        <div class="stat-value">₹${(entry.earnings/1000).toFixed(0)}k</div>
                        <div class="badge-display">
                            <span style="font-size: 1.2rem;">${entry.badges} 🏆</span>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;
        }

        function changeCategory(category, button) {
            currentCategory = category;
            document.querySelectorAll('.filter-group .filter-btn').forEach(btn => {
                if (btn.textContent.includes('Shifts') || btn.textContent.includes('Earners') || btn.textContent.includes('Rated')) {
                    btn.classList.remove('active');
                }
            });
            if (button) {
                button.classList.add('active');
            }
            loadLeaderboard();
        }

        function changePeriod(period, button) {
            currentPeriod = period;
            document.querySelectorAll('.filter-group .filter-btn').forEach(btn => {
                if (btn.textContent.includes('Month') || btn.textContent.includes('Time')) {
                    btn.classList.remove('active');
                }
            });
            if (button) {
                button.classList.add('active');
            }
            loadLeaderboard();
        }

        async function claimReward(achievementId) {
            try {
                const token = localStorage.getItem('token');
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('achievements.claim', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }, {
                    params: { achievementId: achievementId }
                }), 'Failed to claim reward');
                alert('Reward claimed successfully!');
                loadAchievements();
            } catch (error) {
                console.error('Error claiming reward:', error);
                alert('Failed to claim reward');
            }
        }

        async function shareAchievement(achievementId) {
            try {
                const token = localStorage.getItem('token');
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('achievements.share', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ platform: 'LINKEDIN' })
                }, {
                    params: { achievementId: achievementId }
                }), 'Failed to share achievement', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.data && payload.data.shareableUrl);
                    }
                });
                const shareUrl = data.data.shareableUrl;
                const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
                window.open(linkedInUrl, '_blank');
            } catch (error) {
                console.error('Error sharing achievement:', error);
                alert('Failed to share achievement');
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

            document.querySelectorAll('.tab[data-tab]').forEach(function(button) {
                button.addEventListener('click', function() {
                    switchTab(this.dataset.tab, this);
                });
            });

            document.querySelectorAll('.filter-btn[data-category]').forEach(function(button) {
                button.addEventListener('click', function() {
                    changeCategory(this.dataset.category, this);
                });
            });

            document.querySelectorAll('.filter-btn[data-period]').forEach(function(button) {
                button.addEventListener('click', function() {
                    changePeriod(this.dataset.period, this);
                });
            });

            document.body.addEventListener('click', function(event) {
                const actionElement = event.target.closest('[data-action]');
                if (!actionElement) {
                    return;
                }

                if (actionElement.dataset.action === 'claim-reward') {
                    claimReward(actionElement.dataset.achievementId);
                } else if (actionElement.dataset.action === 'share-achievement') {
                    shareAchievement(actionElement.dataset.achievementId);
                }
            });
        }

        bindUiEvents();
