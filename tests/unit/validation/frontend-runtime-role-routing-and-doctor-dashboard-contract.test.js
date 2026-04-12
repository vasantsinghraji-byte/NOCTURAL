const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const frontendSessionSrc = readProjectFile('client/public/js/frontend-session.js');
const configSrc = readProjectFile('client/public/js/config.js');
const doctorDashboardScriptSrc = readProjectFile('client/public/js/doctor-dashboard.js');

describe('Frontend Runtime Role Routing And Doctor Dashboard Contract', () => {
  it('should keep role-based landing redirects centralized in frontend-session.js', () => {
    expect(configSrc).toContain("doctor: {");
    expect(configSrc).toContain("dashboard: '/roles/doctor/doctor-dashboard.html'");
    expect(configSrc).toContain("onboarding: '/roles/doctor/doctor-onboarding.html'");
    expect(configSrc).toContain("admin: {");
    expect(configSrc).toContain("dashboard: '/roles/admin/admin-dashboard.html'");
    expect(frontendSessionSrc).toContain('function redirectForUser(user, routeOverrides)');
    expect(frontendSessionSrc).toContain("persistSession(user, 'doctor')");
    expect(frontendSessionSrc).toContain('user.onboardingCompleted');
    expect(frontendSessionSrc).toContain('? routes.doctorDashboard');
    expect(frontendSessionSrc).toContain(': routes.doctorOnboarding');
    expect(frontendSessionSrc).toContain('window.location.href = routes.adminDashboard');
  });

  it('should persist dashboard session fields expected by downstream role pages', () => {
    expect(frontendSessionSrc).toContain("localStorage.setItem('userType'");
    expect(frontendSessionSrc).toContain("localStorage.setItem('userName'");
    expect(frontendSessionSrc).toContain("localStorage.setItem('userId'");
  });

  it('should send unauthenticated doctor dashboard users back to the root landing page', () => {
    expect(doctorDashboardScriptSrc).toContain("redirectUrl: AppConfig.routes.page('home')");
    expect(doctorDashboardScriptSrc).toContain("window.location.href = AppConfig.routes.page('home');");
  });

  it('should map doctor dashboard profile fields from the current backend response shape', () => {
    expect(doctorDashboardScriptSrc).toContain('professional.primarySpecialization');
    expect(doctorDashboardScriptSrc).toContain('professional.yearsOfExperience');
    expect(doctorDashboardScriptSrc).toContain('formatLocation(user.location)');
    expect(doctorDashboardScriptSrc).toContain('getProfilePreferences(user)');
  });

  it('should use current duty compensation fields on the dashboard', () => {
    expect(doctorDashboardScriptSrc).toContain('app.duty?.compensation?.totalAmount || 0');
    expect(doctorDashboardScriptSrc).toContain('displayRecentApplications(applications)');
    expect(frontendSessionSrc).toContain('return duty.totalCompensation || duty.netPayment || duty.pay || 0;');
  });
});
