/**
 * Pharmacy store network: pure rules (DB-free).
 * Opening hours in India time, store gate, salt keys, ranking, cart merging,
 * and partial-refund money safety with a mocked gateway.
 */

jest.mock('../../../models/pharmacyOrder', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../../../services/pharmacyNotificationService', () => ({ notifyVendorNewOrder: jest.fn() }));
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), logSecurity: jest.fn()
}));
jest.mock('../../../utils/monitoring', () => ({ triggerAlert: jest.fn(), trackError: jest.fn() }));
jest.mock('../../../utils/razorpayGateway', () => {
  const actual = jest.requireActual('../../../utils/razorpayGateway');
  return { ...actual, getClient: jest.fn(), isEnabled: jest.fn() };
});

const mongoose = require('mongoose');
const Medicine = require('../../../models/medicine');
const serviceability = require('../../../services/serviceabilityService');
const availability = require('../../../services/pharmacyAvailabilityService');
const PharmacyOrder = require('../../../models/pharmacyOrder');
const gateway = require('../../../utils/razorpayGateway');
const payments = require('../../../services/pharmacyPaymentService');

// 2026-09-21 is a Monday. IST = UTC + 5:30.
const ist = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const base = Date.UTC(2026, 8, 21 + day, h, m) - 330 * 60 * 1000;
  return new Date(base);
};

describe('operating hours (India time)', () => {
  const vendor = {
    operatingHours: [
      { day: 'MON', open: '09:00', close: '22:00' },
      { day: 'TUE', open: '20:00', close: '02:00' }, // overnight
      { day: 'WED', isClosed: true }
    ]
  };

  it('uses India time even though servers run in UTC', () => {
    expect(serviceability.isWithinOperatingHours(vendor, ist(0, '09:30'))).toBe(true);
    expect(serviceability.isWithinOperatingHours(vendor, ist(0, '08:59'))).toBe(false);
    expect(serviceability.isWithinOperatingHours(vendor, ist(0, '22:00'))).toBe(false);
  });

  it('handles hours that run past midnight', () => {
    expect(serviceability.isWithinOperatingHours(vendor, ist(1, '23:15'))).toBe(true);
    expect(serviceability.isWithinOperatingHours(vendor, ist(2, '01:30'))).toBe(true); // Tue's night, on Wed
    expect(serviceability.isWithinOperatingHours(vendor, ist(2, '02:30'))).toBe(false);
  });

  it('treats a store with no posted hours as open', () => {
    expect(serviceability.isWithinOperatingHours({ operatingHours: [] }, ist(3, '03:00'))).toBe(true);
  });
});

describe('storeBlockReason', () => {
  const ok = { status: 'APPROVED', isActive: true, isOpen: true };
  const now = new Date('2026-09-24T06:00:00Z');

  it('passes a trading store and names the first problem otherwise', () => {
    expect(serviceability.storeBlockReason(ok, now)).toBeNull();
    expect(serviceability.storeBlockReason({ ...ok, isOpen: false }, now)).toBe('CLOSED');
    expect(serviceability.storeBlockReason({ ...ok, pausedUntil: new Date(now.getTime() + 60000) }, now)).toBe('PAUSED');
    expect(serviceability.storeBlockReason({ ...ok, pausedUntil: new Date(now.getTime() - 60000) }, now)).toBeNull();
    expect(serviceability.storeBlockReason({ ...ok, drugLicenseExpiry: now }, now)).toBe('LICENCE_EXPIRED');
    expect(serviceability.storeBlockReason({ ...ok, status: 'SUSPENDED' }, now)).toBe('NOT_APPROVED');
  });
});

describe('salt keys and online-sale rules', () => {
  it('matches brands with the same ingredients, strength and form, in any order', () => {
    const a = Medicine.deriveSaltKey({ composition: [{ ingredient: 'Amoxicillin', strength: '500 mg' }, { ingredient: 'Clavulanic Acid', strength: '125mg' }], form: 'TABLET' });
    const b = Medicine.deriveSaltKey({ composition: [{ ingredient: 'clavulanic acid', strength: '125 mg' }, { ingredient: 'AMOXICILLIN', strength: '500mg' }], form: 'TABLET' });
    expect(a).toBe(b);
    expect(Medicine.deriveSaltKey({ composition: [{ ingredient: 'Amoxicillin', strength: '500mg' }], form: 'CAPSULE' })).not.toBe(a);
    expect(Medicine.deriveSaltKey({ name: 'No composition' })).toBeUndefined();
  });

  it('blocks Schedule X, banned, discontinued and inactive products', () => {
    expect(Medicine.onlineSaleBlockReason({ scheduleType: 'SCHEDULE_X' })).toBe('SCHEDULE_X');
    expect(Medicine.onlineSaleBlockReason({ isBanned: true })).toBe('BANNED');
    expect(Medicine.onlineSaleBlockReason({ isDiscontinued: true })).toBe('DISCONTINUED');
    expect(Medicine.onlineSaleBlockReason({ isActive: false })).toBe('INACTIVE');
    expect(Medicine.onlineSaleBlockReason({ scheduleType: 'SCHEDULE_H1' })).toBeNull();
  });
});

describe('ranking and cart hygiene', () => {
  it('prefers faster, cheaper, reliable, freshly-counted stores', () => {
    const base = { etaMinutes: 20, subtotal: 200, acceptRate: 0.95, staleItems: 0 };
    expect(availability.rankScore(base)).toBeLessThan(availability.rankScore({ ...base, etaMinutes: 30 }));
    expect(availability.rankScore(base)).toBeLessThan(availability.rankScore({ ...base, subtotal: 400 }));
    expect(availability.rankScore(base)).toBeLessThan(availability.rankScore({ ...base, acceptRate: 0.5 }));
    expect(availability.rankScore(base)).toBeLessThan(availability.rankScore({ ...base, staleItems: 1 }));
  });

  it('gives new stores the benefit of the doubt, then follows evidence', () => {
    expect(availability.acceptanceRate({})).toBeCloseTo(0.9);
    expect(availability.acceptanceRate({ reliability: { offered: 100, accepted: 50 } })).toBeLessThan(0.6);
  });

  it('merges duplicate lines and rejects bad ones', () => {
    const id = new mongoose.Types.ObjectId().toString();
    expect(availability.normalizeCartItems([{ medicineId: id, quantity: 1 }, { medicineId: id, quantity: 2 }]))
      .toEqual([{ medicineId: id, quantity: 3 }]);
    expect(() => availability.normalizeCartItems([{ medicineId: 'nope', quantity: 1 }])).toThrow();
    expect(() => availability.normalizeCartItems([{ medicineId: id, quantity: 0 }])).toThrow();
    expect(() => availability.normalizeCartItems([])).toThrow();
  });
});

describe('partial refunds', () => {
  const ORDER_ID = new mongoose.Types.ObjectId();
  const ENTRY_ID = new mongoose.Types.ObjectId();
  const mockRazorpay = { payments: { refund: jest.fn(), fetchMultipleRefund: jest.fn() } };
  const orderWith = (entry) => ({
    _id: ORDER_ID,
    razorpay: { paymentId: 'pay_1' },
    refunds: Object.assign([entry], { id: () => entry })
  });

  beforeEach(() => {
    gateway.getClient.mockReturnValue(mockRazorpay);
    gateway.isEnabled.mockReturnValue(true);
  });

  it('refunds only the missing amount, once, and records it', async () => {
    const entry = { _id: ENTRY_ID, amount: 15, reason: 'Not available', status: 'PENDING', attempts: 0 };
    PharmacyOrder.findOneAndUpdate
      .mockResolvedValueOnce(orderWith(entry)) // queue
      .mockResolvedValueOnce(orderWith({ ...entry, attempts: 1 })) // lock
      .mockResolvedValueOnce({ _id: ORDER_ID, refunds: [{ ...entry, status: 'DONE' }] }); // mark done
    mockRazorpay.payments.refund.mockResolvedValue({ id: 'rfnd_1' });

    await payments.requestPartialRefund(ORDER_ID, 15, 'Not available');
    expect(mockRazorpay.payments.refund).toHaveBeenCalledTimes(1);
    expect(mockRazorpay.payments.refund.mock.calls[0][1].amount).toBe(1500);
    const doneUpdate = PharmacyOrder.findOneAndUpdate.mock.calls[2][1];
    expect(doneUpdate.$inc['amounts.refunded']).toBe(15);
  });

  it('does nothing for COD or unpaid orders', async () => {
    PharmacyOrder.findOneAndUpdate.mockResolvedValueOnce(null);
    PharmacyOrder.findById.mockResolvedValue({ _id: ORDER_ID });
    await payments.requestPartialRefund(ORDER_ID, 15, 'x');
    expect(mockRazorpay.payments.refund).not.toHaveBeenCalled();
  });

  it('on retry, finds an earlier refund that went through instead of paying twice', async () => {
    const entry = { _id: ENTRY_ID, amount: 15, status: 'FAILED', attempts: 2 };
    PharmacyOrder.findOneAndUpdate
      .mockResolvedValueOnce(orderWith(entry)) // lock
      .mockResolvedValueOnce({ _id: ORDER_ID }); // mark done
    mockRazorpay.payments.fetchMultipleRefund.mockResolvedValue({ items: [{ id: 'rfnd_earlier', notes: { refundEntryId: String(ENTRY_ID) } }] });

    await payments.processPartialRefund(ORDER_ID, ENTRY_ID);
    expect(mockRazorpay.payments.refund).not.toHaveBeenCalled();
    expect(PharmacyOrder.findOneAndUpdate.mock.calls[1][1].$set['refunds.$.refundId']).toBe('rfnd_earlier');
  });

  it('marks the entry FAILED (for the retry worker) when the gateway errors', async () => {
    const entry = { _id: ENTRY_ID, amount: 15, status: 'PENDING', attempts: 1 };
    PharmacyOrder.findOneAndUpdate
      .mockResolvedValueOnce(orderWith(entry))
      .mockResolvedValueOnce({ _id: ORDER_ID });
    mockRazorpay.payments.refund.mockRejectedValue(new Error('gateway down'));

    await payments.processPartialRefund(ORDER_ID, ENTRY_ID);
    expect(PharmacyOrder.findOneAndUpdate.mock.calls[1][1].$set['refunds.$.status']).toBe('FAILED');
  });

  it('skips an entry another worker holds the lock on', async () => {
    PharmacyOrder.findOneAndUpdate.mockResolvedValueOnce(null);
    PharmacyOrder.findById.mockResolvedValue({ _id: ORDER_ID });
    await payments.processPartialRefund(ORDER_ID, ENTRY_ID);
    expect(mockRazorpay.payments.refund).not.toHaveBeenCalled();
  });
});

describe('stock file parsing', () => {
  const catalog = require('../../../services/pharmacyCatalogService');
  const { csvCell } = require('../../../services/pharmacyComplianceService');

  it('parses quoted fields, escaped quotes, CRLF and semicolon files', () => {
    expect(catalog.parseCsv('Name,Qty\r\n"Shelcal, 500",8\r\n"He said ""hi""",2\n')).toEqual([
      ['Name', 'Qty'], ['Shelcal, 500', '8'], ['He said "hi"', '2']
    ]);
    expect(catalog.parseCsv('Name;Qty\nDolo;4')).toEqual([['Name', 'Qty'], ['Dolo', '4']]);
    expect(catalog.parseCsv('\uFEFFName,Qty\nA,1')[0]).toEqual(['Name', 'Qty']);
  });

  it('maps common billing-software headers', () => {
    expect(catalog.mapHeader(['Item Name', 'MRP', 'Sale Rate', 'Closing Stock', 'Batch No', 'Exp Date']))
      .toEqual({ name: 0, mrp: 1, sellingPrice: 2, stock: 3, batchNumber: 4, expiryDate: 5 });
  });

  it('reads pack-style expiry dates (MM/YY = end of that month) and Indian day-first dates', () => {
    expect(catalog.parseExpiry('09/28').toISOString().slice(0, 10)).toBe('2028-09-30');
    expect(catalog.parseExpiry('02/2028').toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(catalog.parseExpiry('05/11/2027').toISOString().slice(0, 10)).toBe('2027-11-05');
    expect(catalog.parseExpiry('2027-11-05').toISOString().slice(0, 10)).toBe('2027-11-05');
    expect(catalog.parseExpiry('')).toBeUndefined();
    expect(catalog.parseExpiry('soon')).toBeNull();
  });

  it('neutralises spreadsheet formulas in exported registers', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+91 98xxxx')).toBe("'+91 98xxxx");
    expect(csvCell('Dolo, 650')).toBe('"Dolo, 650"');
  });
});
