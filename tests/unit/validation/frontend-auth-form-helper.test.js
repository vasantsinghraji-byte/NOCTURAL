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

describe('Frontend Auth Form Helper', () => {
  it('should centralize auth form error mapping and message rendering in frontend-session.js', () => {
    expect(frontendSessionSrc).toContain('function renderFormMessage(container, message, options)');
    expect(frontendSessionSrc).toContain('function renderSuccessMessage(container, message, options)');
    expect(frontendSessionSrc).toContain('function setButtonLoading(button, options)');
    expect(frontendSessionSrc).toContain('function resetButtonState(button, options)');
    expect(frontendSessionSrc).toContain('function getLoginErrorMessage(error, overrides)');
    expect(frontendSessionSrc).toContain('function getRegistrationErrorMessage(error, overrides)');
    expect(frontendSessionSrc).toContain("invalidCredentialsMessage: 'Invalid email or password. Please try again.'");
    expect(frontendSessionSrc).toContain("defaultMessage: 'Registration failed. Please try again.'");
  });

  it('should route shared login and register page error handling through the session helper', () => {
    expect(landingSrc).toContain('NocturnalSession.getLoginErrorMessage(error)');
    expect(landingSrc).toContain('NocturnalSession.getRegistrationErrorMessage(error');
    expect(landingSrc).toContain("NocturnalSession.renderFormMessage(errorDiv, 'Passwords do not match.')");
    expect(landingSrc).toContain('NocturnalSession.setButtonLoading(btn)');
    expect(landingSrc).toContain('NocturnalSession.resetButtonState(btn)');

    expect(sharedRegisterSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(sharedRegisterSrc).toContain('NocturnalSession.getRegistrationErrorMessage(error');
    expect(sharedRegisterSrc).toContain("NocturnalSession.renderFormMessage(errorDiv, 'Passwords do not match')");
    expect(sharedRegisterSrc).toContain('NocturnalSession.renderSuccessMessage(');
    expect(sharedRegisterSrc).toContain('NocturnalSession.setButtonLoading(btn)');
    expect(sharedRegisterSrc).toContain('NocturnalSession.resetButtonState(btn)');

    expect(patientLoginSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(patientLoginSrc).toContain('NocturnalSession.getLoginErrorMessage(error');
    expect(patientLoginSrc).toContain('NocturnalSession.renderSuccessMessage(');
    expect(patientLoginSrc).toContain("NocturnalSession.setButtonLoading(btn, { clearText: true })");
    expect(patientLoginSrc).toContain("NocturnalSession.resetButtonState(btn, { textContent: 'Login' })");

    expect(providerLoginSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(providerLoginSrc).toContain('NocturnalSession.getLoginErrorMessage(error');
    expect(providerLoginSrc).toContain("{ className: 'message error' }");
    expect(providerLoginSrc).toContain("{ className: 'message success' }");
    expect(providerLoginSrc).toContain("NocturnalSession.setButtonLoading(btn, { clearText: true })");
    expect(providerLoginSrc).toContain("NocturnalSession.resetButtonState(btn, { textContent: 'Login' })");

    expect(patientRegisterSrc).toContain('<script src="/js/frontend-session.js"></script>');
    expect(patientRegisterSrc).toContain('NocturnalSession.getRegistrationErrorMessage(error');
    expect(patientRegisterSrc).toContain("NocturnalSession.renderFormMessage(errorDiv, 'Passwords do not match')");
    expect(patientRegisterSrc).toContain("NocturnalSession.renderFormMessage(errorDiv, 'Please enter a valid 10-digit mobile number')");
    expect(patientRegisterSrc).toContain('NocturnalSession.renderSuccessMessage(');
    expect(patientRegisterSrc).toContain("NocturnalSession.setButtonLoading(btn, { clearText: true })");
    expect(patientRegisterSrc).toContain("NocturnalSession.resetButtonState(btn, { textContent: 'Create Account' })");
  });
});
