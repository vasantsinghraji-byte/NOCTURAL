const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const frontendSessionSrc = readProjectFile('client/public/js/frontend-session.js');
const patientSessionSrc = readProjectFile('client/public/js/patient-session.js');
const providerSessionSrc = readProjectFile('client/public/js/provider-session.js');
const adminSessionSrc = readProjectFile('client/public/js/admin-session.js');
const doctorSessionSrc = readProjectFile('client/public/js/doctor-session.js');
const patientDashboardSrc = readProjectFile('client/public/roles/patient/patient-dashboard.html');
const patientDashboardScriptSrc = readProjectFile('client/public/js/patient-dashboard.js');
const bookingFormSrc = readProjectFile('client/public/roles/patient/booking-form.html');
const bookingFormScriptSrc = readProjectFile('client/public/js/patient-booking-form.js');
const bookingDetailsSrc = readProjectFile('client/public/roles/patient/booking-details.html');
const bookingDetailsScriptSrc = readProjectFile('client/public/js/patient-booking-details.js');
const healthIntakeFormSrc = readProjectFile('client/public/roles/patient/health-intake-form.html');
const healthIntakeFormScriptSrc = readProjectFile('client/public/js/patient-health-intake-form.js');
const patientHealthDashboardSrc = readProjectFile('client/public/roles/patient/patient-health-dashboard.html');
const patientHealthDashboardScriptSrc = readProjectFile('client/public/js/patient-health-dashboard.js');
const patientAnalyticsSrc = readProjectFile('client/public/roles/patient/patient-analytics.html');
const patientAnalyticsScriptSrc = readProjectFile('client/public/js/patient-analytics.js');
const reportDetailsSrc = readProjectFile('client/public/roles/patient/report-details.html');
const reportDetailsScriptSrc = readProjectFile('client/public/js/patient-report-details.js');
const patientClinicalHistorySrc = readProjectFile('client/public/roles/patient/patient-clinical-history-form.html');
const patientClinicalHistoryScriptSrc = readProjectFile('client/public/js/patient-clinical-history-form.js');
const providerLoginSrc = readProjectFile('client/public/roles/provider/provider-login.html');
const providerDashboardScriptSrc = readProjectFile('client/public/js/provider-dashboard.js');

const extractedRolePageScripts = {
  'client/public/roles/admin/admin-analytics.html': 'client/public/js/admin-analytics.js',
  'client/public/roles/admin/admin-post-duty.html': 'client/public/js/admin-post-duty.js',
  'client/public/roles/admin/admin-settings.html': 'client/public/js/admin-settings.js',
  'client/public/roles/doctor/achievements.html': 'client/public/js/doctor-achievements.js',
  'client/public/roles/doctor/availability.html': 'client/public/js/doctor-availability.js',
  'client/public/roles/doctor/browse-shifts-enhanced.html': 'client/public/js/doctor-browse-shifts-enhanced.js',
  'client/public/roles/doctor/calendar.html': 'client/public/js/doctor-calendar.js',
  'client/public/roles/doctor/doctor-dashboard.html': 'client/public/js/doctor-dashboard.js',
  'client/public/roles/doctor/doctor-onboarding.html': 'client/public/js/doctor-onboarding.js',
  'client/public/roles/doctor/doctor-profile-enhanced.html': 'client/public/js/doctor-profile-enhanced.js',
  'client/public/roles/doctor/duty-details.html': 'client/public/js/doctor-duty-details.js',
  'client/public/roles/doctor/earnings.html': 'client/public/js/doctor-earnings.js',
  'client/public/roles/doctor/my-applications.html': 'client/public/js/doctor-my-applications.js'
};

const extractedPatientProviderPageScripts = {
  'client/public/roles/patient/patient-dashboard.html': 'client/public/js/patient-dashboard.js',
  'client/public/roles/patient/booking-form.html': 'client/public/js/patient-booking-form.js',
  'client/public/roles/patient/booking-details.html': 'client/public/js/patient-booking-details.js',
  'client/public/roles/patient/health-intake-form.html': 'client/public/js/patient-health-intake-form.js',
  'client/public/roles/patient/patient-health-dashboard.html': 'client/public/js/patient-health-dashboard.js',
  'client/public/roles/patient/patient-analytics.html': 'client/public/js/patient-analytics.js',
  'client/public/roles/patient/report-details.html': 'client/public/js/patient-report-details.js',
  'client/public/roles/provider/provider-login.html': 'client/public/js/provider-login.js'
};

const pageFiles = [
  'client/public/roles/doctor/doctor-dashboard.html',
  'client/public/roles/admin/admin-post-duty.html',
  'client/public/roles/admin/admin-settings.html',
  'client/public/roles/admin/admin-analytics.html',
  'client/public/roles/patient/patient-dashboard.html',
  'client/public/roles/patient/booking-form.html',
  'client/public/roles/patient/booking-details.html',
  'client/public/roles/provider/provider-dashboard.html',
  'client/public/roles/doctor/browse-shifts-enhanced.html',
  'client/public/roles/doctor/my-applications.html',
  'client/public/roles/doctor/duty-details.html',
  'client/public/roles/doctor/achievements.html',
  'client/public/roles/doctor/calendar.html',
  'client/public/roles/doctor/availability.html',
  'client/public/roles/doctor/doctor-profile-enhanced.html',
  'client/public/roles/doctor/earnings.html',
  'client/public/roles/patient/health-intake-form.html',
  'client/public/roles/patient/patient-clinical-history-form.html',
  'client/public/roles/patient/patient-health-dashboard.html'
];

const successResponseScriptFiles = [
  'client/public/js/admin-dashboard.js',
  'client/public/js/admin-applications.js',
  'client/public/js/admin-profile.js',
  'client/public/js/admin-analytics.js',
  'client/public/js/admin-post-duty.js',
  'client/public/js/admin-settings.js',
  'client/public/js/doctor-achievements.js',
  'client/public/js/doctor-availability.js',
  'client/public/js/doctor-browse-shifts-enhanced.js',
  'client/public/js/doctor-calendar.js',
  'client/public/js/doctor-dashboard.js',
  'client/public/js/doctor-onboarding.js',
  'client/public/js/doctor-profile-enhanced.js',
  'client/public/js/doctor-duty-details.js',
  'client/public/js/doctor-earnings.js',
  'client/public/js/patient-dashboard.js',
  'client/public/js/patient-booking-form.js',
  'client/public/js/patient-booking-details.js',
  'client/public/js/patient-health-intake-form.js',
  'client/public/js/patient-health-dashboard.js',
  'client/public/js/provider-dashboard.js',
  'client/public/js/patient-clinical-history-form.js'
];

const adminDoctorPages = [
  'client/public/roles/admin/admin-analytics.html',
  'client/public/roles/admin/admin-applications.html',
  'client/public/roles/admin/admin-dashboard.html',
  'client/public/roles/admin/admin-post-duty.html',
  'client/public/roles/admin/admin-profile.html',
  'client/public/roles/admin/admin-settings.html',
  'client/public/roles/doctor/achievements.html',
  'client/public/roles/doctor/availability.html',
  'client/public/roles/doctor/browse-shifts-enhanced.html',
  'client/public/roles/doctor/calendar.html',
  'client/public/roles/doctor/doctor-dashboard.html',
  'client/public/roles/doctor/doctor-onboarding.html',
  'client/public/roles/doctor/doctor-profile-enhanced.html',
  'client/public/roles/doctor/duty-details.html',
  'client/public/roles/doctor/earnings.html',
  'client/public/roles/doctor/my-applications.html'
];

const logoutHelperFiles = [
  'client/public/roles/doctor/doctor-dashboard.html',
  'client/public/roles/doctor/my-applications.html',
  'client/public/roles/doctor/achievements.html',
  'client/public/roles/doctor/availability.html',
  'client/public/roles/doctor/calendar.html',
  'client/public/roles/doctor/earnings.html',
  'client/public/roles/admin/admin-post-duty.html',
  'client/public/roles/admin/admin-settings.html',
  'client/public/roles/admin/admin-analytics.html',
  'client/public/roles/patient/patient-dashboard.html',
  'client/public/roles/patient/patient-health-dashboard.html',
  'client/public/roles/patient/patient-analytics.html',
  'client/public/roles/patient/report-details.html',
  'client/public/roles/provider/provider-dashboard.html'
];

describe('Frontend Session Standardization', () => {
  it('should centralize success-response branching in frontend-session.js for standardized dashboard/detail pages', () => {
    expect(frontendSessionSrc).toContain('function expectJsonSuccess(data, fallbackMessage, options)');
    expect(frontendSessionSrc).toContain('function normalizeApplicationStatus(status)');
    expect(frontendSessionSrc).toContain('function getApplicationStatusClass(status)');
    expect(frontendSessionSrc).toContain('function getApplicationDutyId(application)');
    expect(frontendSessionSrc).toContain('async function applyForDuty(dutyId, options)');
    expect(frontendSessionSrc).toContain('async function handleDutyApplication(event, dutyId, options)');

    pageFiles.forEach((relativePath) => {
      const source = readProjectFile(relativePath);
      expect(source).toContain('<script src="/js/frontend-session.js"></script>');

      if (relativePath === 'client/public/roles/patient/patient-clinical-history-form.html') {
        expect(source).toContain('<script src="/js/patient-session.js"></script>');
        expect(source).toContain('<script src="/js/patient-clinical-history-form.js"></script>');
        return;
      }

      if (relativePath === 'client/public/roles/provider/provider-dashboard.html') {
        expect(source).toContain('<script src="/js/provider-session.js"></script>');
        expect(source).toContain('<script src="/js/provider-dashboard.js"></script>');
        return;
      }

      if (extractedPatientProviderPageScripts[relativePath]) {
        const scriptPath = extractedPatientProviderPageScripts[relativePath];
        expect(source).toContain(`<script src="/js/${path.basename(scriptPath)}"></script>`);
        return;
      }

      if (extractedRolePageScripts[relativePath]) {
        const scriptPath = extractedRolePageScripts[relativePath];
        expect(source).toContain(`<script src="/js/${path.basename(scriptPath)}"></script>`);
        return;
      }

      expect(source).toContain('NocturnalSession.expectJsonSuccess(');
    });

    successResponseScriptFiles.forEach((relativePath) => {
      const source = readProjectFile(relativePath);
      expect(source).toContain('NocturnalSession.expectJsonSuccess(');
    });

    expect(readProjectFile('client/public/js/doctor-my-applications.js')).toContain('NocturnalSession.fetchMyApplications({');
    expect(readProjectFile('client/public/js/doctor-my-applications.js')).toContain('NocturnalSession.fetchApplicationStats({');
    expect(patientClinicalHistorySrc).toContain('<script src="/js/patient-session.js"></script>');
    expect(patientClinicalHistorySrc).toContain('<script src="/js/patient-clinical-history-form.js"></script>');
  });

  it('should centralize optional draft loading for patient form pages in frontend-session.js', () => {
    expect(frontendSessionSrc).toContain('async function loadOptionalDraft(routeKey, options)');
    expect(healthIntakeFormScriptSrc)
      .toContain("NocturnalSession.loadOptionalDraft('healthIntake.form'");
    expect(readProjectFile('client/public/js/patient-clinical-history-form.js'))
      .toContain("NocturnalSession.loadOptionalDraft('healthIntake.form'");
  });

  it('should centralize authenticated page bootstrap checks in frontend-session.js and role session modules', () => {
    expect(frontendSessionSrc).toContain('function requireAuthToken(options)');
    expect(frontendSessionSrc).toContain('function requireAuthenticatedPage(options)');
    expect(frontendSessionSrc).toContain('function createRoleSession(options)');
    expect(frontendSessionSrc).toContain('createRoleSession: createRoleSession');

    expect(patientSessionSrc).toContain('NocturnalSession.createRoleSession({');
    expect(patientSessionSrc).toContain("role: 'patient'");
    expect(patientSessionSrc).toContain("legacyTokenKeys: ['patientToken']");
    expect(patientSessionSrc).toContain('patientSession.getStoredPatient = patientSession.getStoredRole');

    expect(providerSessionSrc).toContain('NocturnalSession.createRoleSession({');
    expect(providerSessionSrc).toContain("role: 'provider'");
    expect(providerSessionSrc).toContain("legacyTokenKeys: ['providerToken']");
    expect(providerSessionSrc).toContain('session.redirectAuthenticatedLogin = function(options)');

    expect(adminSessionSrc).toContain('NocturnalSession.createRoleSession({');
    expect(adminSessionSrc).toContain("role: 'admin'");
    expect(adminSessionSrc).toContain("userType: 'hospital'");
    expect(adminSessionSrc).toContain('adminSession.getStoredAdmin = adminSession.getStoredRole');

    expect(doctorSessionSrc).toContain('NocturnalSession.createRoleSession({');
    expect(doctorSessionSrc).toContain("role: 'doctor'");
    expect(doctorSessionSrc).toContain("userType: 'doctor'");
    expect(doctorSessionSrc).toContain('doctorSession.getStoredDoctor = doctorSession.getStoredRole');

    expect(patientDashboardSrc).toContain('<script src="/js/patient-dashboard.js"></script>');
    expect(patientDashboardScriptSrc).toContain('PatientSession.requireAuthenticatedPage(');
    expect(patientDashboardScriptSrc).toContain('PatientSession.populateIdentity(');
    expect(bookingFormSrc).toContain('<script src="/js/patient-booking-form.js"></script>');
    expect(bookingFormScriptSrc).toContain('PatientSession.requireAuthenticatedPage(');
    expect(bookingDetailsSrc).toContain('<script src="/js/patient-booking-details.js"></script>');
    expect(bookingDetailsScriptSrc).toContain('PatientSession.requireAuthenticatedPage(');
    expect(healthIntakeFormSrc).toContain('<script src="/js/patient-health-intake-form.js"></script>');
    expect(healthIntakeFormScriptSrc).toContain('PatientSession.requireAuthenticatedPage(');
    expect(patientHealthDashboardSrc).toContain('<script src="/js/patient-health-dashboard.js"></script>');
    expect(patientHealthDashboardScriptSrc).toContain('PatientSession.requireAuthenticatedPage(');
    expect(patientHealthDashboardScriptSrc).toContain('PatientSession.populateIdentity(');
    expect(patientClinicalHistoryScriptSrc).toContain('PatientSession.requireAuthenticatedPage(');
    expect(patientAnalyticsSrc).toContain('<script src="/js/patient-analytics.js"></script>');
    expect(patientAnalyticsScriptSrc).toContain('PatientSession.requireAuthenticatedPage(');
    expect(patientAnalyticsScriptSrc).toContain('PatientSession.getToken()');
    expect(reportDetailsSrc).toContain('<script src="/js/patient-report-details.js"></script>');
    expect(reportDetailsScriptSrc).toContain('PatientSession.requireAuthenticatedPage(');
    expect(reportDetailsScriptSrc).toContain('PatientSession.getToken()');

    expect(providerLoginSrc).toContain('<script src="/js/provider-session.js"></script>');
    expect(providerLoginSrc).toContain('<script src="/js/provider-login.js"></script>');
    expect(readProjectFile('client/public/js/provider-login.js')).toContain('ProviderSession.redirectAuthenticatedLogin({');
    expect(providerDashboardScriptSrc).toContain('ProviderSession.requireAuthenticatedPage(');
    expect(providerDashboardScriptSrc).toContain('ProviderSession.populateIdentity(');

    Object.entries(extractedRolePageScripts).forEach(([htmlPath, scriptPath]) => {
      const htmlSource = readProjectFile(htmlPath);
      const scriptSource = readProjectFile(scriptPath);
      const scriptName = path.basename(scriptPath);

      if (htmlPath === 'client/public/roles/doctor/doctor-onboarding.html') {
        expect(htmlSource).toContain(`<script type="module" src="/js/${scriptName}"></script>`);
      } else {
        expect(htmlSource).toContain(`<script src="/js/${scriptName}"></script>`);
      }

      if (htmlPath.includes('/roles/admin/')) {
        expect(htmlSource).toContain('<script src="/js/admin-session.js"></script>');
        expect(scriptSource).toContain('AdminSession.requireAuthenticatedPage(');
      }

      if (htmlPath.includes('/roles/doctor/')) {
        if (htmlPath !== 'client/public/roles/doctor/doctor-onboarding.html') {
          expect(htmlSource).toContain('<script src="/js/doctor-session.js"></script>');
          const usesDoctorAuth = scriptSource.includes('DoctorSession.requireAuthenticatedPage(');
          const usesDoctorSession = scriptSource.includes('DoctorSession.logout(') || scriptSource.includes('DoctorSession.populateIdentity(');
          expect(usesDoctorAuth || usesDoctorSession).toBe(true);
        }
      }
    });

    expect(readProjectFile('client/public/js/admin-dashboard.js')).toContain('AdminSession.requireAuthenticatedPage(');
    expect(readProjectFile('client/public/js/admin-dashboard.js')).toContain('AdminSession.populateIdentity(');
    expect(readProjectFile('client/public/js/admin-applications.js')).toContain('AdminSession.requireAuthenticatedPage(');
    expect(readProjectFile('client/public/js/admin-applications.js')).toContain('AdminSession.populateIdentity(');
    expect(readProjectFile('client/public/js/admin-profile.js')).toContain('AdminSession.requireAuthenticatedPage(');
    expect(readProjectFile('client/public/js/admin-profile.js')).toContain('AdminSession.populateIdentity(');
  });

  it('should centralize logout/session-clear behavior in frontend-session.js for standardized role pages', () => {
    expect(frontendSessionSrc).toContain('function logout(options)');
    expect(frontendSessionSrc).toContain('AppConfig.clearToken()');
    expect(frontendSessionSrc).toContain("var ROLE_LOGOUT_KEYS = {");
    expect(frontendSessionSrc).toContain("patient: ['patient']");
    expect(frontendSessionSrc).toContain("provider: ['provider']");
    expect(frontendSessionSrc).toContain('logoutForRole: logoutForRole');

    expect(patientSessionSrc).toContain("role: 'patient'");
    expect(providerSessionSrc).toContain("role: 'provider'");
    expect(adminSessionSrc).toContain("role: 'admin'");
    expect(doctorSessionSrc).toContain("role: 'doctor'");

    expect(patientDashboardScriptSrc).toContain('PatientSession.logout(');
    expect(patientHealthDashboardScriptSrc).toContain('PatientSession.logout(');
    expect(patientAnalyticsScriptSrc).toContain('PatientSession.logout(');
    expect(reportDetailsScriptSrc).toContain('PatientSession.logout(');
    expect(providerDashboardScriptSrc).toContain('ProviderSession.logout(');

    expect(readProjectFile('client/public/js/admin-dashboard.js')).toContain('AdminSession.logout(');
    expect(readProjectFile('client/public/js/admin-applications.js')).toContain('AdminSession.logout(');
    expect(readProjectFile('client/public/js/admin-profile.js')).toContain('AdminSession.logout(');

    Object.entries(extractedRolePageScripts).forEach(([htmlPath, scriptPath]) => {
      const scriptSource = readProjectFile(scriptPath);

      if (htmlPath.includes('/roles/admin/')) {
        expect(scriptSource).toContain('AdminSession.logout(');
      }

      if (htmlPath.includes('/roles/doctor/') && logoutHelperFiles.includes(htmlPath)) {
        const usesDoctorLogout = scriptSource.includes('DoctorSession.logout(');
        const usesSharedLogout = scriptSource.includes('NocturnalSession.logout(');
        expect(usesDoctorLogout || usesSharedLogout).toBe(true);
      }
    });
  });

  it('should keep admin and doctor role pages free of inline scripts after extraction', () => {
    adminDoctorPages.forEach((relativePath) => {
      const source = readProjectFile(relativePath);
      expect(source).not.toMatch(/<script(?![^>]*src=)/);
    });
  });
});
