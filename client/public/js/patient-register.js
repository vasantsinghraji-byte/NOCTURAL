        // API_URL is provided by config.js

        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('name').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const errorDiv = document.getElementById('errorDiv');
            const btn = document.getElementById('submitBtn');

            NocturnalSession.clearFormMessage(errorDiv);

            // Validation
            if (!NocturnalSession.validatePasswordStrength(password, errorDiv)) {
                return;
            }

            if (!NocturnalSession.validatePasswordMatch(password, confirmPassword, errorDiv, {
                message: 'Passwords do not match'
            })) {
                return;
            }

            if (!NocturnalSession.validatePhoneNumber(phone, errorDiv, {
                message: 'Please enter a valid 10-digit mobile number'
            })) {
                return;
            }

            NocturnalSession.setButtonLoading(btn, { clearText: true });

            try {
                const data = await AppConfig.fetchRoute('patients.register', {
                    method: 'POST',
                    skipAuth: true,
                    parseJson: true,
                    body: JSON.stringify({ name, email, phone, password })
                });
                NocturnalSession.completeAuthSuccess(
                    NocturnalSession.expectJsonSuccess(data, 'Registration failed', {
                        isSuccess: function (payload) {
                            return !!(payload && payload.success && payload.token);
                        }
                    }),
                    {
                        userKey: 'patient',
                        successContainer: errorDiv,
                        successMessage: 'Registration successful! Redirecting...',
                        redirectUrl: AppConfig.routes.page('patient.dashboard'),
                        redirectDelayMs: 1500
                    }
                );
            } catch (error) {
                console.error('Registration error:', error);
                NocturnalSession.renderFormMessage(
                    errorDiv,
                    NocturnalSession.getRegistrationErrorMessage(error, {
                        duplicateMessage: 'This email or phone is already registered. <a href="' + AppConfig.routes.page('patient.login') + '">Login instead</a>?'
                    })
                );
            } finally {
                NocturnalSession.resetButtonState(btn, { textContent: 'Create Account' });
            }
        });

        // Phone number validation
        document.getElementById('phone').addEventListener('input', function(e) {
            this.value = this.value.replace(/[^0-9]/g, '').substring(0, 10);
        });
