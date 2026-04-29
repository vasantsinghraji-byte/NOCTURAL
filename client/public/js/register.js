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

function normalizePhoneNumber(phone) {
  var digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return '+91' + digits;
  }

  if (digits.length === 12 && digits.indexOf('91') === 0) {
    return '+' + digits;
  }

  if (phone.trim().indexOf('+') === 0) {
    return '+' + digits;
  }

  return phone.trim();
}

function isValidE164Phone(phone) {
  return /^\+?[1-9]\d{1,14}$/.test(phone);
}

function getApiErrorMessage(data, fallbackMessage) {
  if (data && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map(function mapError(error) {
      return error.message;
    }).filter(Boolean).join('. ');
  }

  return (data && (data.message || data.error)) || fallbackMessage;
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
  const phone = normalizePhoneNumber(document.getElementById('doctorPhone').value);
  const role = document.getElementById('doctorRole').value;
  const password = document.getElementById('doctorPassword').value;
  const confirmPassword = document.getElementById('doctorConfirmPassword').value;
  const agreeToTerms = document.getElementById('doctorAgreeToTerms').checked;

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

  if (!isValidE164Phone(phone)) {
    NocturnalSession.renderFormMessage(errorDiv, 'Please enter a valid phone number like +919876543210');
    return;
  }

  if (!agreeToTerms) {
    NocturnalSession.renderFormMessage(errorDiv, 'Please agree to the Terms and Conditions');
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
        role,
        password,
        confirmPassword,
        agreeToTerms
      })
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
      throw new Error(getApiErrorMessage(data, 'Registration failed'));
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
