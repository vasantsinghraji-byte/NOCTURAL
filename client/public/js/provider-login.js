let deferredPrompt;

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;

    const installPrompt = document.getElementById('installPrompt');
    if (installPrompt) {
        installPrompt.style.display = 'block';
    }
});

function installPWA() {
    if (!deferredPrompt) {
        return;
    }

    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('PWA installed');
        }

        deferredPrompt = null;

        const installPrompt = document.getElementById('installPrompt');
        if (installPrompt) {
            installPrompt.style.display = 'none';
        }
    });
}

const installPwaButton = document.getElementById('installPwaButton');
if (installPwaButton) {
    installPwaButton.addEventListener('click', installPWA);
}

const token = localStorage.getItem('providerToken');
if (token) {
    window.location.href = 'provider-dashboard.html';
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const messageDiv = document.getElementById('messageDiv');
    const btn = document.getElementById('submitBtn');

    messageDiv.innerHTML = '';

    NocturnalSession.setButtonLoading(btn, { clearText: true });

    try {
        const response = await AppConfig.fetch('auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success && data.token) {
            if (!['nurse', 'physiotherapist'].includes(data.user.role)) {
                throw new Error('This portal is only for nurses and physiotherapists');
            }

            NocturnalSession.completeAuthSuccess(data, {
                tokenKey: 'providerToken',
                userKey: 'provider',
                successContainer: messageDiv,
                successMessage: 'Login successful! Redirecting...',
                successClassName: 'message success',
                redirectUrl: 'provider-dashboard.html',
                redirectDelayMs: 1000
            });
        } else {
            throw new Error(data.message || 'Login failed');
        }
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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(() => console.log('Service Worker registered'))
        .catch(() => console.log('Service Worker registration failed'));
}
