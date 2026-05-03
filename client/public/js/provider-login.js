        // API_URL is provided by config.js
        let deferredPrompt;

        // PWA Install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            AppUi.setDisplay(document.getElementById('installPrompt'), 'block');
        });

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('PWA installed');
                    }
                    deferredPrompt = null;
                    AppUi.setDisplay(document.getElementById('installPrompt'), 'none');
                });
    }
}

var installPwaButton = document.getElementById('installPwaButton');
if (installPwaButton) {
    installPwaButton.addEventListener('click', installPWA);
}

        // Check if already logged in
        ProviderSession.redirectAuthenticatedLogin({
            redirectUrl: AppConfig.routes.page('provider.dashboard')
        });

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const messageDiv = document.getElementById('messageDiv');
            const btn = document.getElementById('submitBtn');

            NocturnalSession.clearFormMessage(messageDiv);

            NocturnalSession.setButtonLoading(btn, { clearText: true });

            try {
                const data = await AppConfig.fetchRoute('auth.login', {
                    method: 'POST',
                    skipAuth: true,
                    parseJson: true,
                    body: JSON.stringify({ email, password })
                });
                var authData = NocturnalSession.expectJsonSuccess(data, 'Login failed', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.user);
                    }
                });

                if (!['nurse', 'physiotherapist'].includes(authData.user.role)) {
                    throw new Error('This portal is only for nurses and physiotherapists');
                }

                NocturnalSession.completeAuthSuccess(authData, {
                    userKey: 'provider',
                    successContainer: messageDiv,
                    successMessage: 'Login successful! Redirecting...',
                    successClassName: 'message success',
                    redirectUrl: AppConfig.routes.page('provider.dashboard'),
                    redirectDelayMs: 1000
                });
            } catch (error) {
                console.error('Login error:', error);
                NocturnalSession.renderFormMessage(
                    messageDiv,
                    NocturnalSession.getLoginErrorMessage(error),
                    { className: 'message error' }
                );
            } finally {
                NocturnalSession.resetButtonState(btn, { textContent: 'Login' });
            }
        });

        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed'));
        }
