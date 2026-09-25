/**
 * Pharmacy marketplace contract tests (DB-free).
 *
 * Locks the enum/role/status-transition contracts the pharmacy domain relies
 * on so accidental edits to constants surface immediately. Integration tests
 * that exercise the order lifecycle against MongoDB live under tests/integration.
 */

const {
  STAFF_ROLES,
  PHARMACY_ORDER_STATUSES,
  PHARMACY_VENDOR_STATUSES,
  MEDICINE_FORMS,
  MEDICINE_SCHEDULE_TYPES,
  MEDICINE_CATEGORIES,
  DELIVERY_STATUSES
} = require('../../../constants/enums');
const { isValidRole } = require('../../../constants/roles');
const { VENDOR_STATUS_TRANSITIONS } = require('../../../services/pharmacyService');
const User = require('../../../models/user');
const PharmacyVendor = require('../../../models/pharmacyVendor');
const PharmacyOrder = require('../../../models/pharmacyOrder');

describe('pharmacy marketplace contracts', () => {
  it('registers the new MedRush roles for authorization', () => {
    for (const role of ['pharmacy_vendor', 'delivery_partner', 'medical_staff', 'phlebotomist']) {
      expect(isValidRole(role)).toBe(true);
      expect(STAFF_ROLES).toContain(role);
    }
  });

  it('exposes a complete pharmacy order status set', () => {
    expect(PHARMACY_ORDER_STATUSES).toEqual([
      'PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED'
    ]);
    expect(PHARMACY_VENDOR_STATUSES).toContain('APPROVED');
  });

  it('only allows status transitions between valid statuses', () => {
    for (const [from, targets] of Object.entries(VENDOR_STATUS_TRANSITIONS)) {
      expect(PHARMACY_ORDER_STATUSES).toContain(from);
      for (const to of targets) {
        expect(PHARMACY_ORDER_STATUSES).toContain(to);
      }
    }
  });

  it('never allows moving out of a terminal state', () => {
    for (const terminal of ['DELIVERED', 'REJECTED', 'CANCELLED']) {
      expect(VENDOR_STATUS_TRANSITIONS[terminal]).toBeUndefined();
    }
  });

  it('has non-empty catalog vocabularies', () => {
    expect(MEDICINE_FORMS.length).toBeGreaterThan(0);
    expect(MEDICINE_SCHEDULE_TYPES).toContain('OTC');
    expect(MEDICINE_SCHEDULE_TYPES).toContain('PRESCRIPTION');
    expect(MEDICINE_CATEGORIES).toContain('ANTIBIOTIC');
    expect(DELIVERY_STATUSES).toContain('DELIVERED');
  });

  // Regression: a GeoJSON field must NOT default to a partial { type:'Point' }
  // with no coordinates — that breaks 2dsphere inserts for every doc lacking a
  // location (users, vendors, orders). It must be entirely absent when unset.
  describe('geojson fields have no partial default (2dsphere safety)', () => {
    it('User.currentLocation is absent when no coordinates are provided', () => {
      const u = new User({ name: 'X', email: 'x@y.com', password: 'Abcdef1!', role: 'platform_admin' }).toObject();
      expect(u.currentLocation).toBeUndefined();
    });
    it('PharmacyVendor.location is absent when no coordinates are provided', () => {
      const v = new PharmacyVendor({ name: 'Store' }).toObject();
      expect(v.location).toBeUndefined();
    });
    it('PharmacyOrder.deliveryLocation is absent when no coordinates are provided', () => {
      const o = new PharmacyOrder({
        patient: '6ab2b67884a08e34fbb0f9f8',
        vendor: '6ab2b67884a08e34fbb0f9f8',
        items: [{ medicine: '6ab2b67884a08e34fbb0f9f8', name: 'M', quantity: 1, unitPrice: 10, lineTotal: 10 }],
        amounts: { itemsSubtotal: 10, total: 10 }
      }).toObject();
      expect(o.deliveryLocation).toBeUndefined();
    });
  });
});
