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

function trackFunnelEvent(eventName, metadata) {
  if (!eventName || typeof AppConfig === 'undefined' || typeof AppConfig.fetch !== 'function') {
    return;
  }

  AppConfig.fetch('funnel-events', {
    method: 'POST',
    body: JSON.stringify({
      event: eventName,
      path: window.location.pathname,
      metadata: metadata || {}
    }),
    keepalive: true
  }).catch(function ignoreFunnelError() {});
}

document.getElementById('doctorPassword').addEventListener('input', (e) => {
  validatePassword(e.target.value, 'doctor');
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
      trackFunnelEvent('provider_registration_success', { role });
      NocturnalSession.completeAuthSuccess(data, {
        userTypeKey: 'userType',
        userType: role,
        successContainer: errorDiv,
        successMessage: 'Registration successful! Redirecting...',
        redirectUrl: '/shared/provider-registration-success.html',
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
  const contactName = document.getElementById('hospitalContactName').value.trim();
  const email = document.getElementById('hospitalEmail').value.trim();
  const phone = normalizePhoneNumber(document.getElementById('hospitalPhone').value);
  const city = document.getElementById('hospitalLocation').value.trim();
  const facilityType = document.getElementById('hospitalFacilityType').value;
  const notes = document.getElementById('hospitalNotes').value.trim();

  if (!hospitalName || !contactName || !email || !phone || !city || !facilityType) {
    NocturnalSession.renderFormMessage(errorDiv, 'Please complete all required waitlist fields');
    return;
  }

  NocturnalSession.setButtonLoading(btn);

  try {
    trackFunnelEvent('hospital_waitlist_submit_attempt', { facilityType });

    const response = await AppConfig.fetch('hospital-waitlist', {
      method: 'POST',
      body: JSON.stringify({
        organizationName: hospitalName,
        contactName,
        email,
        phone,
        city,
        facilityType,
        notes,
        source: 'shared-register'
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      trackFunnelEvent('hospital_waitlist_submit_success', { facilityType });
      NocturnalSession.renderSuccessMessage(
        errorDiv,
        'Waitlist request received. Redirecting...',
        { className: 'success-message' }
      );
      setTimeout(() => {
        window.location.href = '/shared/hospital-waitlist-success.html';
      }, 1000);
    } else {
      throw new Error(getApiErrorMessage(data, 'Waitlist request failed'));
    }
  } catch (error) {
    console.error('Waitlist error:', error);
    NocturnalSession.renderFormMessage(
      errorDiv,
      getApiErrorMessage({
        message: error.message
      }, 'Could not join the waitlist. Please try again.')
    );
  } finally {
    NocturnalSession.resetButtonState(btn, { textContent: 'Join B2B Waitlist' });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.hash === '#hospital-waitlist') {
    const hospitalCard = document.getElementById('hospitalCard');
    if (hospitalCard) {
      hospitalCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      hospitalCard.classList.add('selected');
      setTimeout(() => {
        hospitalCard.classList.remove('selected');
      }, 1800);
    }
  }
});
