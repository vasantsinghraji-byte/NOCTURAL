const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const adminDashboardScriptSrc = readProjectFile('client/public/js/admin-dashboard.js');
const adminDashboardHtmlSrc = readProjectFile('client/public/roles/admin/admin-dashboard.html');
const providerDashboardScriptSrc = readProjectFile('client/public/js/provider-dashboard.js');
const patientBookingFormScriptSrc = readProjectFile('client/public/js/patient-booking-form.js');
const patientBookingDetailsScriptSrc = readProjectFile('client/public/js/patient-booking-details.js');

describe('Frontend Provider Admin Booking Contract', () => {
  it('should keep admin dashboard booking assignment wired to current booking endpoints', () => {
    expect(adminDashboardHtmlSrc).toContain('bookingAssignmentList');
    expect(adminDashboardScriptSrc).toContain("AppConfig.fetchRoute('bookings.list'");
    expect(adminDashboardScriptSrc).toContain("AppConfig.fetchRoute('bookings.providers'");
    expect(adminDashboardScriptSrc).toContain("AppConfig.fetchRoute('bookings.assign'");
    expect(adminDashboardScriptSrc).toContain('data-provider-select');
    expect(adminDashboardScriptSrc).toContain('data-action="assign-booking"');
  });

  it('should keep provider dashboard aligned to the nested booking location shape', () => {
    expect(providerDashboardScriptSrc).toContain('booking.serviceLocation && booking.serviceLocation.address');
    expect(providerDashboardScriptSrc).toContain('getBookingLocationLabel(booking)');
    expect(providerDashboardScriptSrc).not.toContain('booking.serviceLocation.city');
  });

  it('should keep patient booking flows aligned to the live booking contract', () => {
    expect(patientBookingFormScriptSrc).toContain('serviceLocation: {');
    expect(patientBookingFormScriptSrc).toContain('address: {');
    expect(patientBookingFormScriptSrc).not.toContain('https://example.com/prescription.pdf');

    expect(patientBookingDetailsScriptSrc).toContain('booking.serviceLocation?.address');
    expect(patientBookingDetailsScriptSrc).toContain("booking.payment?.status || 'PENDING'");
    expect(patientBookingDetailsScriptSrc).toContain('booking.serviceProvider || null');
    expect(patientBookingDetailsScriptSrc).toContain("method: 'PUT'");
    expect(patientBookingDetailsScriptSrc).not.toContain('booking.paymentStatus');
    expect(patientBookingDetailsScriptSrc).not.toContain('booking.provider');
    expect(patientBookingDetailsScriptSrc).not.toContain('report.proceduresPerformed');
  });
});
