const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const doctorProfileEnhancedScriptSrc = readProjectFile('client/public/js/doctor-profile-enhanced.js');
const doctorOnboardingScriptSrc = readProjectFile('client/public/js/doctor-onboarding.js');
const patientBookingFormScriptSrc = readProjectFile('client/public/js/patient-booking-form.js');
const patientClinicalHistoryFormSrc = readProjectFile('client/public/roles/patient/patient-clinical-history-form.html');
const patientClinicalHistoryScriptSrc = readProjectFile('client/public/js/patient-clinical-history-form.js');
const configSrc = readProjectFile('client/public/js/config.js');
const authServiceSrc = readProjectFile('services/authService.js');
const authValidatorSrc = readProjectFile('validators/authValidator.js');
const listFilesRecursive = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return listFilesRecursive(entryPath);
    }

    return [entryPath];
  });
};

const toProjectRelativePath = (absolutePath) => path.relative(rootDir, absolutePath).replace(/\\/g, '/');
const RETIRED_DIST_ARTIFACT_PATTERNS = [
  /client\/dist\/index-unified\.html$/,
  /client\/dist\/js\/index-unified(?:\.[^/]+)?\.js$/,
  /client\/dist\/shared\/auth-setup\.html$/,
  /client\/dist\/js\/auth-setup(?:\.[^/]+)?\.js$/,
  /client\/dist\/roles\/doctor\/browse-duties\.html$/,
  /client\/dist\/js\/doctor-browse-duties(?:\.[^/]+)?\.js$/,
  /client\/dist\/roles\/doctor\/doctor-profile\.html$/,
  /client\/dist\/js\/doctor-profile(?:\.[^/]+)?\.js$/,
  /client\/dist\/roles\/patient\/payments-dashboard\.html$/,
  /client\/dist\/js\/patient-payments-dashboard(?:\.[^/]+)?\.js$/
];

describe('Frontend Final Contract Closures', () => {
  it('should keep the maintained doctor profile page on the mounted auth.me endpoint', () => {
    expect(doctorProfileEnhancedScriptSrc).toContain("AppConfig.fetchRoute('auth.me'");
    expect(doctorProfileEnhancedScriptSrc).not.toContain('users.profile');
    expect(configSrc).not.toContain('users: {');
    expect(doctorProfileEnhancedScriptSrc).toContain("AppConfig.fetchRoute('uploads.profilePhoto'");
    expect(doctorProfileEnhancedScriptSrc).toContain("AppConfig.fetchRoute('uploads.document'");
  });

  it('should keep doctor onboarding registration and profile updates compatible with shared auth validation', () => {
    expect(doctorOnboardingScriptSrc).toContain('confirmPassword: formData.password');
    expect(doctorOnboardingScriptSrc).toContain('agreeToTerms: true');
    expect(doctorOnboardingScriptSrc).toContain('const profileUpdatePayload = buildProfileUpdatePayload();');
    expect(doctorOnboardingScriptSrc).toContain('onboardingCompleted: true');
    expect(doctorOnboardingScriptSrc).toContain("'Authorization': `Bearer ${token}`");

    expect(authServiceSrc).toContain("'licenseNumber'");
    expect(authServiceSrc).toContain("'bankDetails'");
    expect(authServiceSrc).toContain("'onboardingCompleted'");

    expect(authValidatorSrc).toContain("throw new Error('Location must be a string or an object');");
    expect(authValidatorSrc).toContain("throw new Error('Location must include at least a city or state');");
  });

  it('should keep patient booking creation aligned to the nested serviceLocation.address payload contract', () => {
    expect(patientBookingFormScriptSrc).toContain("type: 'HOME'");
    expect(patientBookingFormScriptSrc).toContain('serviceLocation: {');
    expect(patientBookingFormScriptSrc).toContain('address: {');
    expect(patientBookingFormScriptSrc).toContain("pincode: document.getElementById('pincode').value");
    expect(patientBookingFormScriptSrc).not.toContain('serviceLocation.street');
  });

  it('should keep patient clinical history intake routed through the real health-intake contract', () => {
    expect(patientClinicalHistoryFormSrc).toContain('<script src="/js/patient-session.js"></script>');
    expect(patientClinicalHistoryFormSrc).toContain('<script src="/js/patient-clinical-history-form.js"></script>');
    expect(patientClinicalHistoryFormSrc).toContain('Patient Clinical History Intake');
    expect(patientClinicalHistoryScriptSrc).toContain("NocturnalSession.loadOptionalDraft('healthIntake.form'");
    expect(patientClinicalHistoryScriptSrc).toContain("AppConfig.fetchRoute('healthIntake.draft'");
    expect(patientClinicalHistoryScriptSrc).toContain("AppConfig.fetchRoute('healthIntake.submit'");
    expect(patientClinicalHistoryScriptSrc).toContain("window.location.href = AppConfig.routes.page('patient.healthDashboard');");
  });

  it('should keep canonical frontend routes pointed at maintained pages instead of deprecated release artifacts', () => {
    expect(configSrc).toContain("unifiedLanding: '/shared/register.html'");
    expect(configSrc).toContain("browseDuties: '/roles/doctor/browse-shifts-enhanced.html'");
    expect(configSrc).toContain("profile: '/roles/doctor/doctor-profile-enhanced.html'");
    expect(configSrc).toContain("paymentsDashboard: '/roles/patient/patient-dashboard.html'");
  });

  it('should keep deprecated helper and legacy page artifacts out of the built frontend output', () => {
    const distDir = path.join(rootDir, 'client', 'dist');
    const distFiles = listFilesRecursive(distDir)
      .map(toProjectRelativePath)
      .sort();

    RETIRED_DIST_ARTIFACT_PATTERNS.forEach((pattern) => {
      const matchingFiles = distFiles.filter((relativePath) => pattern.test(relativePath));
      expect(matchingFiles).toEqual([]);
    });
  });

  it('should physically archive retired source pages and scripts instead of keeping them as hidden build inputs', () => {
    [
      'client/public/index-unified.html',
      'client/public/js/index-unified.js',
      'client/public/roles/doctor/browse-duties.html',
      'client/public/js/doctor-browse-duties.js',
      'client/public/roles/doctor/doctor-profile.html',
      'client/public/js/doctor-profile.js',
      'client/public/roles/patient/payments-dashboard.html',
      'client/public/js/patient-payments-dashboard.js'
    ].forEach((relativePath) => {
      expect(fs.existsSync(path.join(rootDir, relativePath))).toBe(false);
    });
  });

  it('should keep frontend source and build output free of archival originals and deployable test helper pages', () => {
    const publicDir = path.join(rootDir, 'client', 'public');
    const distDir = path.join(rootDir, 'client', 'dist');
    const publicTestDir = path.join(publicDir, 'test');

    const publicOriginals = listFilesRecursive(publicDir)
      .filter((filePath) => filePath.endsWith('.original'))
      .map(toProjectRelativePath)
      .sort();

    const distOriginals = listFilesRecursive(distDir)
      .filter((filePath) => filePath.endsWith('.original'))
      .map(toProjectRelativePath)
      .sort();

    const publicTestFiles = listFilesRecursive(publicTestDir)
      .map(toProjectRelativePath)
      .sort();

    expect(publicOriginals).toEqual([]);
    expect(distOriginals).toEqual([]);
    expect(publicTestFiles).toEqual([]);
  });
});
