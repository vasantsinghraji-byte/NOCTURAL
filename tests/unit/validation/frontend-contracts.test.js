const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const landingSrc = fs.readFileSync(
  path.join(rootDir, 'client', 'public', 'js', 'landing.js'),
  'utf8'
);

const frontendSessionSrc = fs.readFileSync(
  path.join(rootDir, 'client', 'public', 'js', 'frontend-session.js'),
  'utf8'
);

const doctorDashboardSrc = fs.readFileSync(
  path.join(rootDir, 'client', 'public', 'roles', 'doctor', 'doctor-dashboard.html'),
  'utf8'
);

describe('Frontend Contract Reconciliation', () => {
  it('should redirect landing auth flows to role-specific absolute routes', () => {
    expect(frontendSessionSrc).toContain("/roles/doctor/doctor-dashboard.html");
    expect(frontendSessionSrc).toContain("/roles/doctor/doctor-onboarding.html");
    expect(frontendSessionSrc).toContain("/roles/admin/admin-dashboard.html");
    expect(frontendSessionSrc).toContain('function redirectForUser(user, routeOverrides)');
    expect(frontendSessionSrc).toContain("persistSession(user, 'doctor')");
    expect(frontendSessionSrc).toContain('user.onboardingCompleted');
    expect(frontendSessionSrc).toContain('? routes.doctorDashboard');
    expect(frontendSessionSrc).toContain(': routes.doctorOnboarding');
    expect(frontendSessionSrc).toContain("window.location.href = routes.adminDashboard");
    expect(landingSrc).toContain('NocturnalSession.redirectForUser(data.user, ROUTE_MAP)');
  });

  it('should persist dashboard session fields expected by doctor pages', () => {
    expect(frontendSessionSrc).toContain("localStorage.setItem('userType'");
    expect(frontendSessionSrc).toContain("localStorage.setItem('userName'");
    expect(frontendSessionSrc).toContain("localStorage.setItem('userId'");
  });

  it('should send unauthenticated doctor dashboard users back to the root landing page', () => {
    expect(doctorDashboardSrc).toContain("window.location.href = '/index.html'");
  });

  it('should map doctor dashboard profile fields from current backend response shape', () => {
    expect(doctorDashboardSrc).toContain('professional.primarySpecialization');
    expect(doctorDashboardSrc).toContain('professional.yearsOfExperience');
    expect(doctorDashboardSrc).toContain('formatLocation(user.location)');
    expect(doctorDashboardSrc).toContain('getProfilePreferences(user)');
  });

  it('should use current duty compensation fields on the dashboard', () => {
    expect(doctorDashboardSrc).toContain('app.duty?.totalCompensation || app.duty?.netPayment || 0');
    expect(doctorDashboardSrc).toContain('compensation: {');
    expect(doctorDashboardSrc).toContain('displayRecentApplications(normalizedApplications.slice(0, 5))');
  });
});
