/**
 * Shared Registration Page JavaScript
 * Extracted from inline script in shared/register.html for CSP compliance.
 * Handles provider registration. Hospital onboarding is intentionally paused
 * while the product focuses on India B2C home healthcare first.
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

// Doctor/Nurse/Physiotherapist Registration
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
  var website = document.getElementById('doctorWebsite').value.trim();

  if (website) {
    return;
  }

  if (!NocturnalSession.validateRequiredValue(
    role,
    errorDiv,
    'Please select your role (Doctor, Nurse or Physiotherapist)'
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
      body: JSON.stringify({ name: name, email: email, phone: phone, password: password, confirmPassword: confirmPassword, role: role, agreeToTerms: agreeToTerms, website: website })
    });
    NocturnalSession.completeAuthSuccess(
      NocturnalSession.expectJsonSuccess(data, 'Registration failed', {
        isSuccess: function (payload) {
          return !!(payload && payload.success && payload.user);
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

// Hospital pilot waitlist
document.getElementById('hospitalForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  var btn = document.getElementById('hospitalSubmitBtn');
  var errorDiv = document.getElementById('hospitalError');
  NocturnalSession.clearFormMessage(errorDiv);

  var facilityName = document.getElementById('hospitalName').value.trim();
  var facilityType = document.getElementById('hospitalFacilityType').value;
  var contactName = document.getElementById('hospitalContactName').value.trim();
  var email = document.getElementById('hospitalEmail').value.trim();
  var phone = document.getElementById('hospitalPhone').value.trim();
  var city = document.getElementById('hospitalLocation').value.trim();
  var state = document.getElementById('hospitalState').value.trim();
  var expectedNeed = document.getElementById('hospitalExpectedNeed').value.trim();
  var companyWebsite = document.getElementById('hospitalCompanyWebsite').value.trim();

  if (companyWebsite) {
    return;
  }

  if (!facilityType) {
    NocturnalSession.renderFormMessage(errorDiv, 'Please select your facility type');
    return;
  }

  if (!facilityName || !contactName || !email || !phone || !city) {
    NocturnalSession.renderFormMessage(errorDiv, 'Please fill all required waitlist fields');
    return;
  }

  NocturnalSession.setButtonLoading(btn);

  try {
    var data = await AppConfig.fetchRoute('hospitalWaitlist.create', {
      method: 'POST',
      skipAuth: true,
      parseJson: true,
      body: JSON.stringify({
        facilityName: facilityName,
        facilityType: facilityType,
        contactName: contactName,
        email: email,
        phone: phone,
        city: city,
        state: state,
        expectedNeed: expectedNeed,
        companyWebsite: companyWebsite,
        sourcePath: window.location.pathname
      })
    });

    NocturnalSession.expectJsonSuccess(data, 'Waitlist signup failed');
    NocturnalSession.renderSuccessMessage(
      errorDiv,
      data.message || 'You are on the hospital waitlist. We will contact you when B2B onboarding opens.'
    );
    e.target.reset();
  } catch (error) {
    console.error('Waitlist error:', error);
    NocturnalSession.renderFormMessage(errorDiv, error.message || 'Waitlist signup failed');
  } finally {
    NocturnalSession.resetButtonState(btn);
  }
});
