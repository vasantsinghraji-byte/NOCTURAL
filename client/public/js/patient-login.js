        // API_URL is provided by config.js

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('errorDiv');
            const btn = document.getElementById('submitBtn');

            NocturnalSession.clearFormMessage(errorDiv);

            NocturnalSession.setButtonLoading(btn, { clearText: true });

            try {
                const data = await AppConfig.fetchRoute('patients.login', {
                    method: 'POST',
                    skipAuth: true,
                    parseJson: true,
                    body: JSON.stringify({ email, password })
                });
                NocturnalSession.completeAuthSuccess(
                    NocturnalSession.expectJsonSuccess(data, 'Login failed', {
                        isSuccess: function (payload) {
                            return !!(payload && payload.success && payload.patient);
                        }
                    }),
                    {
                        userKey: 'patient',
                        successContainer: errorDiv,
                        successMessage: 'Login successful! Redirecting...',
                        redirectUrl: AppConfig.routes.page('patient.dashboard'),
                        redirectDelayMs: 1000
                    }
                );
            } catch (error) {
                console.error('Login error:', error);
                NocturnalSession.renderFormMessage(
                    errorDiv,
                    NocturnalSession.getLoginErrorMessage(error, {
                        notFoundMessage: 'Account not found. <a href="' + AppConfig.routes.page('patient.register') + '">Register now</a>?'
                    })
                );
            } finally {
                NocturnalSession.resetButtonState(btn, { textContent: 'Login' });
            }
        });
