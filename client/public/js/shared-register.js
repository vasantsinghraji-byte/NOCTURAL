/**
 * Shared Registration Page JavaScript
 * Extracted from inline script in shared/register.html for CSP compliance.
 * Handles doctor/nurse and hospital registration forms.
 */

// Guard: config.js and frontend-session.js must load before this script
if (typeof AppConfig === 'undefined') {
  console.error('shared-register.js: AppConfig not loaded - ensure config.js is included before this script');
}

// Password validation with live indicator updates
function validatePassword(password, prefix) {
  var requirements = NocturnalSession.getPasswordStrengthState(password);
  requirements.isValid =
    requirements.length &&
    requirements.uppercase &&
    requirements.lowercase &&
    requirements.number &&
    requirements.special;

  document.getElementById(prefix + 'Req1').className = requirements.length ? 'valid' : 'invalid';
  document.getElementById(prefix + 'Req2').className = requirements.uppercase ? 'valid' : 'invalid';
  document.getElementById(prefix + 'Req3').className = requirements.lowercase ? 'valid' : 'invalid';
  document.getElementById(prefix + 'Req4').className = requirements.number ? 'valid' : 'invalid';
  document.getElementById(prefix + 'Req5').className = requirements.special ? 'valid' : 'invalid';

  return requirements.isValid;
}

// Live password strength indicators
document.getElementById('doctorPassword').addEventListener('input', function (e) {
  validatePassword(e.target.value, 'doctor');
});

document.getElementById('hospitalPassword').addEventListener('input', function (e) {
  validatePassword(e.target.value, 'hospital');
});

// Doctor/Nurse Registration
document.getElementById('doctorForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  var btn = document.getElementById('doctorSubmitBtn');
  var errorDiv = document.getElementById('doctorError');
  NocturnalSession.clearFormMessage(errorDiv);

  var name = document.getElementById('doctorName').value.trim();
  var email = document.getElementById('doctorEmail').value.trim();
  var phone = document.getElementById('doctorPhone').value.trim();
  var role = document.getElementById('doctorRole').value;
  var password = document.getElementById('doctorPassword').value;
  var confirmPassword = document.getElementById('doctorConfirmPassword').value;
  var agreeToTerms = document.getElementById('doctorAgreeTerms').checked;

  if (!NocturnalSession.validateRequiredValue(
    role,
    errorDiv,
    'Please select your role (Doctor or Nurse)'
  )) {
    return;
  }

  if (!validatePassword(password, 'doctor')) {
    NocturnalSession.validatePasswordStrength(password, errorDiv);
    return;
  }

  if (!NocturnalSession.validatePasswordMatch(password, confirmPassword, errorDiv, {
    message: 'Passwords do not match'
  })) {
    return;
  }

  if (!agreeToTerms) {
    NocturnalSession.renderFormMessage(errorDiv, 'You must agree to the Terms & Conditions');
    return;
  }

  NocturnalSession.setButtonLoading(btn);

  try {
    var data = await AppConfig.fetchRoute('auth.register', {
      method: 'POST',
      skipAuth: true,
      parseJson: true,
      body: JSON.stringify({ name: name, email: email, phone: phone, password: password, confirmPassword: confirmPassword, role: role, agreeToTerms: agreeToTerms })
    });
    NocturnalSession.completeAuthSuccess(
      NocturnalSession.expectJsonSuccess(data, 'Registration failed', {
        isSuccess: function (payload) {
          return !!(payload && payload.success && payload.token);
        }
      }),
      {
        successContainer: errorDiv,
        successMessage: 'Registration successful! Redirecting...',
        useRoleRedirect: true,
        redirectDelayMs: 1500
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    NocturnalSession.renderFormMessage(
      errorDiv,
      NocturnalSession.getRegistrationErrorMessage(error, {
        duplicateMessage: 'This email is already registered. <a href="' + AppConfig.routes.page('home') + '">Login instead</a>?'
      })
    );
  } finally {
    NocturnalSession.resetButtonState(btn);
  }
});

// Hospital Registration
document.getElementById('hospitalForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  var btn = document.getElementById('hospitalSubmitBtn');
  var errorDiv = document.getElementById('hospitalError');
  NocturnalSession.clearFormMessage(errorDiv);

  var hospitalName = document.getElementById('hospitalName').value.trim();
  var name = document.getElementById('hospitalContactName').value.trim();
  var email = document.getElementById('hospitalEmail').value.trim();
  var phone = document.getElementById('hospitalPhone').value.trim();
  var location = document.getElementById('hospitalLocation').value.trim();
  var password = document.getElementById('hospitalPassword').value;
  var confirmPassword = document.getElementById('hospitalConfirmPassword').value;
  var agreeToTerms = document.getElementById('hospitalAgreeTerms').checked;

  if (!validatePassword(password, 'hospital')) {
    NocturnalSession.validatePasswordStrength(password, errorDiv);
    return;
  }

  if (!NocturnalSession.validatePasswordMatch(password, confirmPassword, errorDiv, {
    message: 'Passwords do not match'
  })) {
    return;
  }

  if (!agreeToTerms) {
    NocturnalSession.renderFormMessage(errorDiv, 'You must agree to the Terms & Conditions');
    return;
  }

  NocturnalSession.setButtonLoading(btn);

  try {
    var data = await AppConfig.fetchRoute('auth.register', {
      method: 'POST',
      skipAuth: true,
      parseJson: true,
      body: JSON.stringify({
        name: name,
        email: email,
        phone: phone,
        password: password,
        confirmPassword: confirmPassword,
        role: 'admin',
        hospital: hospitalName,
        location: location,
        agreeToTerms: agreeToTerms
      })
    });
    NocturnalSession.completeAuthSuccess(
      NocturnalSession.expectJsonSuccess(data, 'Registration failed', {
        isSuccess: function (payload) {
          return !!(payload && payload.success && payload.token);
        }
      }),
      {
        successContainer: errorDiv,
        successMessage: 'Registration successful! Redirecting...',
        useRoleRedirect: true,
        redirectDelayMs: 1500
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    NocturnalSession.renderFormMessage(
      errorDiv,
      NocturnalSession.getRegistrationErrorMessage(error, {
        duplicateMessage: 'This email is already registered. <a href="' + AppConfig.routes.page('home') + '">Login instead</a>?'
      })
    );
  } finally {
    NocturnalSession.resetButtonState(btn);
  }
});
