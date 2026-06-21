const { readProjectFile } = require('./projectFileReader');

const adminDashboardScriptSrc = readProjectFile('client/public/js/admin-dashboard.js');
const adminDashboardHtmlSrc = readProjectFile('client/public/roles/admin/admin-dashboard.html');
const providerDashboardScriptSrc = readProjectFile('client/public/js/provider-dashboard.js');
const patientBookingFormHtmlSrc = readProjectFile('client/public/roles/patient/booking-form.html');
const patientBookingFormScriptSrc = readProjectFile('client/public/js/patient-booking-form.js');
const patientDashboardScriptSrc = readProjectFile('client/public/js/patient-dashboard.js');
const patientBookingDetailsHtmlSrc = readProjectFile('client/public/roles/patient/booking-details.html');
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
    expect(providerDashboardScriptSrc).toContain("booking.scheduledTimezone || 'Not specified'");
    expect(providerDashboardScriptSrc).toContain('AppFormat.timeInZone(booking.scheduledDate, booking.scheduledTime, booking.scheduledTimezone, booking.scheduledTimezoneOffsetMinutes)');
    expect(providerDashboardScriptSrc).not.toContain('booking.serviceLocation.city');
  });

  it('should keep patient booking flows aligned to the live booking contract', () => {
    expect(patientBookingFormScriptSrc).toContain('serviceLocation: {');
    expect(patientBookingFormScriptSrc).toContain('address: {');
    expect(patientBookingFormScriptSrc).toContain('scheduledTimezone,');
    expect(patientBookingFormScriptSrc).toContain("scheduledTimezoneOffsetMinutes: getScheduledTimezoneOffsetMinutes(");
    expect(patientBookingFormScriptSrc).toContain('getOffsetMinutesForInstant(candidateDate, timeZone)');
    expect(patientBookingFormScriptSrc).toContain("document.getElementById('timezone').value || getBrowserTimeZone()");
    expect(patientBookingFormHtmlSrc).toContain('id="timezone"');
    expect(patientBookingFormHtmlSrc).toContain('Appointment Timezone *');
    expect(patientBookingFormScriptSrc).not.toContain('https://example.com/prescription.pdf');

    expect(patientDashboardScriptSrc).toContain('AppFormat.timeInZone(booking.scheduledDate, booking.scheduledTime, booking.scheduledTimezone, booking.scheduledTimezoneOffsetMinutes)');
    expect(patientDashboardScriptSrc).toContain("booking.scheduledTimezone || 'Not specified'");
    expect(patientBookingDetailsHtmlSrc).toContain('id="scheduledTimezone"');
    expect(patientBookingDetailsScriptSrc).toContain('AppFormat.timeInZone(');
    expect(patientBookingDetailsScriptSrc).toContain("booking.scheduledTimezone || 'Timezone not specified'");
    expect(patientBookingDetailsScriptSrc).toContain('booking.serviceLocation?.address');
    expect(patientBookingDetailsScriptSrc).toContain("booking.payment?.status || 'PENDING'");
    expect(patientBookingDetailsScriptSrc).toContain('booking.serviceProvider || null');
    expect(patientBookingDetailsScriptSrc).toContain("method: 'PUT'");
    expect(patientBookingDetailsScriptSrc).not.toContain('booking.paymentStatus');
    expect(patientBookingDetailsScriptSrc).not.toContain('booking.provider');
    expect(patientBookingDetailsScriptSrc).not.toContain('report.proceduresPerformed');
  });
});
