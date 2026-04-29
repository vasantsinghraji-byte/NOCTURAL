/**
 * Patient login form interactions.
 * Extracted from patient-login.html for production CSP compliance.
 */

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('errorDiv');
  const btn = document.getElementById('submitBtn');

  errorDiv.innerHTML = '';

  NocturnalSession.setButtonLoading(btn, { clearText: true });

  try {
    const response = await AppConfig.fetch('patients/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (data.success && data.token) {
      NocturnalSession.completeAuthSuccess(data, {
        tokenKey: 'patientToken',
        userKey: 'patient',
        successContainer: errorDiv,
        successMessage: 'Login successful! Redirecting...',
        redirectUrl: 'patient-dashboard.html',
        redirectDelayMs: 1000
      });
    } else {
      throw new Error(data.message || data.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    NocturnalSession.renderFormMessage(
      errorDiv,
      NocturnalSession.getLoginErrorMessage(error, {
        notFoundMessage: 'Account not found. <a href="/roles/patient/patient-register.html">Register now</a>?'
      })
    );
  } finally {
    NocturnalSession.resetButtonState(btn, { textContent: 'Login' });
  }
});
