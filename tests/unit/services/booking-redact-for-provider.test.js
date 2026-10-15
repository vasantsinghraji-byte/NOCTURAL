/**
 * Booking for someone else: the nurse sees the on-site contact's phone (and
 * the customer's) only around the visit, never the customer's email.
 */
const bookingService = require('../../../services/bookingService');

const visit = (status, extra = {}) => ({
  status,
  patient: { name: 'Riya', email: 'riya@example.com', phone: '9876500001' },
  serviceLocation: { contactPerson: 'Mother', contactPhone: '9876500002' },
  ...extra
});

describe('redactForProvider', () => {
  it('hides both phones and the email before the nurse confirms', () => {
    const b = bookingService.redactForProvider(visit('ASSIGNED'));
    expect(b.patient.email).toBeUndefined();
    expect(b.patient.phone).toBeUndefined();
    expect(b.serviceLocation.contactPhone).toBeUndefined();
    expect(b.serviceLocation.contactPerson).toBe('Mother');
  });

  it('shows the phones while the visit is under way', () => {
    const b = bookingService.redactForProvider(visit('EN_ROUTE'));
    expect(b.patient.phone).toBe('9876500001');
    expect(b.serviceLocation.contactPhone).toBe('9876500002');
    expect(b.patient.email).toBeUndefined();
  });

  it('hides the phones again long after the visit', () => {
    const old = new Date(Date.now() - 3 * 24 * 3600000);
    const b = bookingService.redactForProvider(visit('COMPLETED', { statusTimestamps: { completedAt: old } }));
    expect(b.serviceLocation.contactPhone).toBeUndefined();
  });
});
