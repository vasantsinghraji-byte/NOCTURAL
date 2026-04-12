const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const adminDashboardScript = readProjectFile('client/public/js/admin-dashboard.js');
const adminApplicationsScript = readProjectFile('client/public/js/admin-applications.js');
const adminAnalyticsScript = readProjectFile('client/public/js/admin-analytics.js');
const adminSettingsScript = readProjectFile('client/public/js/admin-settings.js');
const doctorDashboardScript = readProjectFile('client/public/js/doctor-dashboard.js');
const doctorBrowseShiftsScript = readProjectFile('client/public/js/doctor-browse-shifts-enhanced.js');
const doctorDutyDetailsScript = readProjectFile('client/public/js/doctor-duty-details.js');
const doctorApplicationsScript = readProjectFile('client/public/js/doctor-my-applications.js');

describe('Frontend Admin Doctor API Contract', () => {
  it('should keep admin pages aligned to mounted API routes', () => {
    expect(adminDashboardScript).toContain("AppConfig.fetchRoute('duties.myDuties'");
    expect(adminDashboardScript).toContain("AppConfig.fetchRoute('applications.received'");
    expect(adminDashboardScript).toContain("AppConfig.fetchRoute('bookings.list'");
    expect(adminDashboardScript).toContain("AppConfig.fetchRoute('bookings.providers'");
    expect(adminDashboardScript).toContain("AppConfig.fetchRoute('bookings.assign'");
    expect(adminApplicationsScript).toContain("AppConfig.fetchRoute('applications.received'");
    expect(adminAnalyticsScript).toContain("AppConfig.fetchRoute('analytics.hospitalDashboard'");
    expect(adminSettingsScript).toContain("AppConfig.fetchRoute('hospitalSettings.root'");
  });

  it('should keep doctor pages aligned to mounted API routes and shared application helpers', () => {
    expect(doctorDashboardScript).toContain("AppConfig.fetchRoute('auth.me'");
    expect(doctorDashboardScript).toContain('NocturnalSession.fetchApplicationStats({');
    expect(doctorDashboardScript).toContain('NocturnalSession.fetchMyApplications({');
    expect(doctorBrowseShiftsScript).toContain("AppConfig.fetchRoute('duties.list'");
    expect(doctorDutyDetailsScript).toContain('NocturnalSession.fetchMyApplications({');
    expect(doctorDutyDetailsScript).toContain('NocturnalSession.handleDutyApplication(event,');
    expect(doctorApplicationsScript).toContain('NocturnalSession.fetchApplicationStats({');
    expect(doctorApplicationsScript).toContain('NocturnalSession.fetchMyApplications({');
  });

  it('should keep admin and doctor scripts off retired or incorrect application endpoints', () => {
    [
      adminDashboardScript,
      adminApplicationsScript,
      doctorDashboardScript,
      doctorBrowseShiftsScript,
      doctorDutyDetailsScript,
      doctorApplicationsScript
    ].forEach((source) => {
      expect(source).not.toContain("applications/my-applications");
      expect(source).not.toContain("applications/apply");
    });
  });
});
