const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const frontendSessionSrc = readProjectFile('client/public/js/frontend-session.js');
const landingSrc = readProjectFile('client/public/js/landing.js');
const sharedRegisterSrc = readProjectFile('client/public/shared/register.html');
const patientLoginSrc = readProjectFile('client/public/roles/patient/patient-login.html');
const providerLoginSrc = readProjectFile('client/public/roles/provider/provider-login.html');
const patientRegisterSrc = readProjectFile('client/public/roles/patient/patient-register.html');
const doctorOnboardingSrc = readProjectFile('client/public/roles/doctor/doctor-onboarding.html');

describe('Frontend Auth Form Helper', () => {
  it('should centralize auth form error mapping and message rendering in frontend-session.js', () => {
    expect(frontendSessionSrc).toContain('function renderFormMessage(container, message, options)');
    expect(frontendSessionSrc).toContain('function renderSuccessMessage(container, message, options)');
    expect(frontendSessionSrc).toContain('function clearFormMessage(container)');
    expect(frontendSessionSrc).toContain('function setButtonLoading(button, options)');
    expect(frontendSessionSrc).toContain('function resetButtonState(button, options)');
    expect(frontendSessionSrc).toContain('function getLoginErrorMessage(error, overrides)');
    expect(frontendSessionSrc).toContain('function getRegistrationErrorMessage(error, overrides)');
    expect(frontendSessionSrc).toContain('function completeAuthSuccess(authData, options)');
    expect(frontendSessionSrc).toContain('function validateRequiredValue(value, container, message, options)');
    expect(frontendSessionSrc).toContain('function validatePasswordMatch(password, confirmPassword, container, options)');
    expect(frontendSessionSrc).toContain('function validatePhoneNumber(phone, container, options)');
    expect(frontendSessionSrc).toContain('function getPasswordStrengthState(password)');
    expect(frontendSessionSrc).toContain('function validatePasswordStrength(password, container, options)');
    expect(frontendSessionSrc).toContain('function handleValidationFailure(container, message, config)');
    expect(frontendSessionSrc).toContain('button.dataset.originalHtml');
    expect(frontendSessionSrc).toContain('if (config.loadingHtml)');
    expect(frontendSessionSrc).toContain('if (config.htmlContent)');
    expect(frontendSessionSrc).toContain("if (typeof config.onInvalid === 'function')");
    expect(frontendSessionSrc).toContain("invalidCredentialsMessage: 'Invalid email or password. Please try again.'");
    expect(frontendSessionSrc).toContain("defaultMessage: 'Registration failed. Please try again.'");
    expect(frontendSessionSrc).toContain("message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character.'");
  });

  it('should route shared login and register page error handling through the session helper', () => {
    expect(landingSrc).toContain('NocturnalSession.getLoginErrorMessage(error)');
    expect(landingSrc).toContain('NocturnalSession.getRegistrationErrorMessage(error');
    expect(landingSrc).toContain('NocturnalSession.clearFormMessage(errorDiv)');
    expect(landingSrc).toContain('NocturnalSession.validatePasswordStrength(password, errorDiv)');
    expect(landingSrc).toContain('NocturnalSession.validatePasswordMatch(password, confirmPassword, errorDiv');
    expect(landingSrc).toContain('NocturnalSession.setButtonLoading(btn)');
    expect(landingSrc).toContain('NocturnalSession.resetButtonState(btn)');
    expect(landingSrc).toContain('NocturnalSession.completeAuthSuccess(data, {');
    expect(landingSrc).toContain('useRoleRedirect: true');

    expect(sharedRegisterSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(sharedRegisterSrc).toContain('NocturnalSession.getRegistrationErrorMessage(error');
    expect(sharedRegisterSrc).toContain('NocturnalSession.clearFormMessage(errorDiv)');
    expect(sharedRegisterSrc).toContain('NocturnalSession.getPasswordStrengthState(password)');
    expect(sharedRegisterSrc).toContain('NocturnalSession.validatePasswordStrength(password, errorDiv)');
    expect(sharedRegisterSrc).toContain('NocturnalSession.validateRequiredValue(');
    expect(sharedRegisterSrc).toContain('NocturnalSession.validatePasswordMatch(password, confirmPassword, errorDiv');
    expect(sharedRegisterSrc).toContain('NocturnalSession.setButtonLoading(btn)');
    expect(sharedRegisterSrc).toContain('NocturnalSession.resetButtonState(btn)');
    expect(sharedRegisterSrc).toContain('NocturnalSession.completeAuthSuccess(data, {');
    expect(sharedRegisterSrc).toContain('skipAuth: true');
    expect(sharedRegisterSrc).toContain('parseJson: true');
    expect(sharedRegisterSrc).toContain("redirectUrl: 'doctor-onboarding.html'");
    expect(sharedRegisterSrc).toContain("redirectUrl: 'admin-dashboard.html'");

    expect(patientLoginSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(patientLoginSrc).toContain('NocturnalSession.clearFormMessage(errorDiv)');
    expect(patientLoginSrc).toContain('NocturnalSession.getLoginErrorMessage(error');
    expect(patientLoginSrc).toContain("NocturnalSession.setButtonLoading(btn, { clearText: true })");
    expect(patientLoginSrc).toContain("NocturnalSession.resetButtonState(btn, { textContent: 'Login' })");
    expect(patientLoginSrc).toContain('NocturnalSession.completeAuthSuccess(data, {');
    expect(patientLoginSrc).toContain('skipAuth: true');
    expect(patientLoginSrc).toContain('parseJson: true');
    expect(patientLoginSrc).toContain("tokenKey: 'patientToken'");

    expect(providerLoginSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(providerLoginSrc).toContain('NocturnalSession.clearFormMessage(messageDiv)');
    expect(providerLoginSrc).toContain('NocturnalSession.getLoginErrorMessage(error');
    expect(providerLoginSrc).toContain("{ className: 'message error' }");
    expect(providerLoginSrc).toContain("NocturnalSession.setButtonLoading(btn, { clearText: true })");
    expect(providerLoginSrc).toContain("NocturnalSession.resetButtonState(btn, { textContent: 'Login' })");
    expect(providerLoginSrc).toContain('NocturnalSession.completeAuthSuccess(data, {');
    expect(providerLoginSrc).toContain('skipAuth: true');
    expect(providerLoginSrc).toContain('parseJson: true');
    expect(providerLoginSrc).toContain("successClassName: 'message success'");
    expect(providerLoginSrc).toContain("tokenKey: 'providerToken'");

    expect(patientRegisterSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(patientRegisterSrc).toContain('NocturnalSession.clearFormMessage(errorDiv)');
    expect(patientRegisterSrc).toContain('NocturnalSession.getRegistrationErrorMessage(error');
    expect(patientRegisterSrc).toContain('NocturnalSession.validatePasswordStrength(password, errorDiv)');
    expect(patientRegisterSrc).toContain('NocturnalSession.validatePasswordMatch(password, confirmPassword, errorDiv');
    expect(patientRegisterSrc).toContain('NocturnalSession.validatePhoneNumber(phone, errorDiv');
    expect(patientRegisterSrc).toContain('uppercase, lowercase, number & special character');
    expect(patientRegisterSrc).toContain("NocturnalSession.setButtonLoading(btn, { clearText: true })");
    expect(patientRegisterSrc).toContain("NocturnalSession.resetButtonState(btn, { textContent: 'Create Account' })");
    expect(patientRegisterSrc).toContain('NocturnalSession.completeAuthSuccess(data, {');
    expect(patientRegisterSrc).toContain('skipAuth: true');
    expect(patientRegisterSrc).toContain('parseJson: true');
    expect(patientRegisterSrc).toContain("redirectUrl: 'patient-dashboard.html'");

    expect(doctorOnboardingSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(doctorOnboardingSrc).toContain('NocturnalSession.validatePasswordStrength(password, null, {');
    expect(doctorOnboardingSrc).toContain('NocturnalSession.validatePasswordMatch(password, confirmPassword, null, {');
    expect(doctorOnboardingSrc).toContain("onInvalid: (message) => showAlert(message, 'danger')");
    expect(doctorOnboardingSrc).toContain("NocturnalSession.setButtonLoading(submitBtn, {");
    expect(doctorOnboardingSrc).toContain("loadingHtml: '<i class=\"fas fa-spinner fa-spin\"></i> Processing...'");
    expect(doctorOnboardingSrc).toContain('NocturnalSession.resetButtonState(submitBtn)');
    expect(doctorOnboardingSrc).toContain("const data = await AppConfig.fetch('auth/register', {");
    expect(doctorOnboardingSrc).toContain('skipAuth: true');
    expect(doctorOnboardingSrc).toContain('parseJson: true');
    expect(doctorOnboardingSrc).toContain("const data = await AppConfig.fetch('auth/me', {");
    expect(doctorOnboardingSrc).toContain("NocturnalSession.persistSession(data.user, 'doctor')");
    expect(doctorOnboardingSrc).toContain("const result = await AppConfig.fetch(endpoint, {");
    expect(doctorOnboardingSrc).not.toContain('password.length < 6');
    expect(doctorOnboardingSrc).not.toContain('${API_URL}${endpoint}');
  });
});
