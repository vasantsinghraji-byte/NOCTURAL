/**
 * Patient registration form interactions.
 * Extracted from patient-register.html for production CSP compliance.
 */

function getApiErrorMessage(data, fallbackMessage) {
  if (data && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map(function mapError(error) {
      return error.message;
    }).filter(Boolean).join('. ');
  }

  return (data && (data.message || data.error)) || fallbackMessage;
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const errorDiv = document.getElementById('errorDiv');
  const btn = document.getElementById('submitBtn');

  errorDiv.innerHTML = '';

  if (password !== confirmPassword) {
    NocturnalSession.renderFormMessage(errorDiv, 'Passwords do not match');
    return;
  }

  if (phone.length !== 10 || !phone.match(/^[6-9][0-9]{9}$/)) {
    NocturnalSession.renderFormMessage(errorDiv, 'Please enter a valid 10-digit mobile number');
    return;
  }

  NocturnalSession.setButtonLoading(btn, { clearText: true });

  try {
    const response = await AppConfig.fetch('patients/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, phone, password })
    });

    const data = await response.json();

    if (data.success && data.token) {
      NocturnalSession.completeAuthSuccess(data, {
        tokenKey: 'patientToken',
        userKey: 'patient',
        successContainer: errorDiv,
        successMessage: 'Registration successful! Redirecting...',
        redirectUrl: 'patient-dashboard.html',
        redirectDelayMs: 1500
      });
    } else {
      throw new Error(getApiErrorMessage(data, 'Registration failed'));
    }
  } catch (error) {
    console.error('Registration error:', error);
    NocturnalSession.renderFormMessage(
      errorDiv,
      NocturnalSession.getRegistrationErrorMessage(error, {
        duplicateMessage: 'This email or phone is already registered. <a href="/roles/patient/patient-login.html">Login instead</a>?'
      })
    );
  } finally {
    NocturnalSession.resetButtonState(btn, { textContent: 'Create Account' });
  }
});

document.getElementById('phone').addEventListener('input', function handlePhoneInput() {
  this.value = this.value.replace(/[^0-9]/g, '').substring(0, 10);
});
