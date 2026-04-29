/**
 * Shared provider registration page interactions.
 * Extracted from shared/register.html so production CSP can block inline scripts.
 */

function validatePassword(password, prefix) {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[@$!%*?&]/.test(password)
  };

  document.getElementById(`${prefix}Req1`).className = requirements.length ? 'valid' : 'invalid';
  document.getElementById(`${prefix}Req2`).className = requirements.uppercase ? 'valid' : 'invalid';
  document.getElementById(`${prefix}Req3`).className = requirements.lowercase ? 'valid' : 'invalid';
  document.getElementById(`${prefix}Req4`).className = requirements.number ? 'valid' : 'invalid';
  document.getElementById(`${prefix}Req5`).className = requirements.special ? 'valid' : 'invalid';

  return Object.values(requirements).every(Boolean);
}

document.getElementById('doctorPassword').addEventListener('input', (e) => {
  validatePassword(e.target.value, 'doctor');
});

document.getElementById('hospitalPassword').addEventListener('input', (e) => {
  validatePassword(e.target.value, 'hospital');
});

document.getElementById('doctorForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('doctorSubmitBtn');
  const errorDiv = document.getElementById('doctorError');
  errorDiv.innerHTML = '';

  const name = document.getElementById('doctorName').value.trim();
  const email = document.getElementById('doctorEmail').value.trim();
  const phone = document.getElementById('doctorPhone').value.trim();
  const role = document.getElementById('doctorRole').value;
  const password = document.getElementById('doctorPassword').value;
  const confirmPassword = document.getElementById('doctorConfirmPassword').value;

  if (!role) {
    errorDiv.innerHTML = '<div class="error-message">Please select your role (Doctor, Nurse or Physiotherapist)</div>';
    return;
  }

  if (!validatePassword(password, 'doctor')) {
    errorDiv.innerHTML = '<div class="error-message">Password does not meet requirements</div>';
    return;
  }

  if (password !== confirmPassword) {
    NocturnalSession.renderFormMessage(errorDiv, 'Passwords do not match');
    return;
  }

  NocturnalSession.setButtonLoading(btn);

  try {
    const response = await AppConfig.fetch('auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, phone, password, role })
    });

    const data = await response.json();

    if (data.success && data.token) {
      NocturnalSession.completeAuthSuccess(data, {
        userTypeKey: 'userType',
        userType: role,
        successContainer: errorDiv,
        successMessage: 'Registration successful! Redirecting to provider onboarding...',
        redirectUrl: '/roles/doctor/doctor-onboarding.html',
        redirectDelayMs: 1500
      });
    } else {
      throw new Error(data.message || 'Registration failed');
    }
  } catch (error) {
    console.error('Registration error:', error);
    NocturnalSession.renderFormMessage(
      errorDiv,
      NocturnalSession.getRegistrationErrorMessage(error, {
        duplicateMessage: 'This email is already registered. <a href="/index.html">Login instead</a>?'
      })
    );
  } finally {
    NocturnalSession.resetButtonState(btn);
  }
});

document.getElementById('hospitalForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('hospitalSubmitBtn');
  const errorDiv = document.getElementById('hospitalError');
  errorDiv.innerHTML = '';

  const hospitalName = document.getElementById('hospitalName').value.trim();
  const name = document.getElementById('hospitalContactName').value.trim();
  const email = document.getElementById('hospitalEmail').value.trim();
  const phone = document.getElementById('hospitalPhone').value.trim();
  const location = document.getElementById('hospitalLocation').value.trim();
  const password = document.getElementById('hospitalPassword').value;
  const confirmPassword = document.getElementById('hospitalConfirmPassword').value;

  if (!validatePassword(password, 'hospital')) {
    errorDiv.innerHTML = '<div class="error-message">Password does not meet requirements</div>';
    return;
  }

  if (password !== confirmPassword) {
    NocturnalSession.renderFormMessage(errorDiv, 'Passwords do not match');
    return;
  }

  NocturnalSession.setButtonLoading(btn);

  try {
    const response = await AppConfig.fetch('auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        phone,
        password,
        role: 'admin',
        hospital: hospitalName,
        location
      })
    });

    const data = await response.json();

    if (data.success && data.token) {
      NocturnalSession.completeAuthSuccess(data, {
        userTypeKey: 'userType',
        userType: 'hospital',
        successContainer: errorDiv,
        successMessage: 'Registration successful! Redirecting to dashboard...',
        redirectUrl: 'admin-dashboard.html',
        redirectDelayMs: 1500
      });
    } else {
      throw new Error(data.message || 'Registration failed');
    }
  } catch (error) {
    console.error('Registration error:', error);
    NocturnalSession.renderFormMessage(
      errorDiv,
      NocturnalSession.getRegistrationErrorMessage(error, {
        duplicateMessage: 'This email is already registered. <a href="/index.html">Login instead</a>?'
      })
    );
  } finally {
    NocturnalSession.resetButtonState(btn);
  }
});
