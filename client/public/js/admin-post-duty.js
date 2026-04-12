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

        async function handlePostDuty(event) {
            event.preventDefault();
            const token = checkAuth();
            if (!token) return;

            const dutyData = {
                title: document.getElementById('duty-title').value,
                specialty: document.getElementById('duty-specialty').value,
                description: document.getElementById('duty-description').value,
                date: document.getElementById('duty-date').value,
                shift: document.getElementById('duty-shift').value,
                startTime: document.getElementById('duty-start-time').value,
                endTime: document.getElementById('duty-end-time').value,
                rate: parseFloat(document.getElementById('duty-rate').value),
                urgency: document.getElementById('duty-urgency').value,
            };

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('duties.list', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(dutyData)
                }), 'Failed to post duty');
                const successMsg = document.getElementById('success-msg');
                successMsg.textContent = 'Duty posted successfully!';
                successMsg.style.display = 'block';
                document.getElementById('post-duty-form').reset();

                setTimeout(() => {
                    window.location.href = AppConfig.routes.page('admin.dashboard');
                }, 2000);
            } catch (error) {
                const errorMsg = document.getElementById('error-msg');
                errorMsg.textContent = error.message;
                errorMsg.style.display = 'block';
            }
        }

        window.addEventListener('DOMContentLoaded', () => {
            checkAuth();
            loadUserInfo();

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', logout);
            }

            const form = document.getElementById('post-duty-form');
            if (form) {
                form.addEventListener('submit', handlePostDuty);
            }

            // Set minimum date to today
            const dateInput = document.getElementById('duty-date');
            const today = new Date().toISOString().split('T')[0];
            dateInput.min = today;
        });
