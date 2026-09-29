/**
 * Revenue model maths (config/revenue.js + services/pricingService.js).
 * Locks: surge / night / member / free-above delivery rules and the
 * commission → payout splits that feed the settlement ledger.
 */

const { resetRevenuePolicy } = require('../../../config/revenue');
const pricing = require('../../../services/pricingService');

// 14:00 and 23:30 IST (UTC+5:30).
const DAY = new Date('2026-09-23T08:30:00Z');
const NIGHT = new Date('2026-09-23T18:00:00Z');

const zone = (level) => ({
  stress: { level },
  currentRadiusMultiplier: () => (level === 'NORMAL' ? 1 : 0.7)
});

describe('pricingService', () => {
  beforeEach(() => resetRevenuePolicy());
  afterEach(() => {
    delete process.env.REVENUE_PHARMACY_COMMISSION_RATE;
    resetRevenuePolicy();
  });

  describe('delivery fee', () => {
    it('charges the store base fee at normal times', () => {
      const q = pricing.quoteDeliveryFee({ vendor: { deliveryFee: 25 }, itemsSubtotal: 200, now: DAY });
      expect(q.deliveryFee).toBe(25);
      expect(q.breakdown).toMatchObject({ base: 25, surgeMultiplier: 1, nightSurcharge: 0, waiver: null });
    });

    it('applies zone surge (rain / rider shortage) and the night surcharge', () => {
      const high = pricing.quoteDeliveryFee({ vendor: { deliveryFee: 20 }, zone: zone('HIGH'), itemsSubtotal: 200, now: DAY });
      expect(high.deliveryFee).toBe(30); // 20 × 1.5
      const severeNight = pricing.quoteDeliveryFee({ vendor: { deliveryFee: 20 }, zone: zone('SEVERE'), itemsSubtotal: 200, now: NIGHT });
      expect(severeNight.deliveryFee).toBe(60); // 20 × 2 + 20 night
    });

    it('falls back to the platform default when the store sets none', () => {
      expect(pricing.quoteDeliveryFee({ vendor: {}, itemsSubtotal: 100, now: DAY }).deliveryFee).toBe(25);
    });

    it('is free for Nabz Plus members, even at night', () => {
      const q = pricing.quoteDeliveryFee({ vendor: { deliveryFee: 25 }, zone: zone('HIGH'), itemsSubtotal: 50, isMember: true, now: NIGHT });
      expect(q.deliveryFee).toBe(0);
      expect(q.breakdown.waiver).toBe('MEMBER');
    });

    it('waives the base fee on big baskets but keeps surge and night', () => {
      expect(pricing.quoteDeliveryFee({ vendor: { deliveryFee: 25 }, itemsSubtotal: 600, now: DAY }).deliveryFee).toBe(0);
      const q = pricing.quoteDeliveryFee({ vendor: { deliveryFee: 20 }, zone: zone('HIGH'), itemsSubtotal: 600, now: NIGHT });
      expect(q.deliveryFee).toBe(30); // surge 10 + night 20
      expect(q.breakdown.waiver).toBe('FREE_ABOVE');
    });

    it('never charges nurse pickups', () => {
      expect(pricing.quoteDeliveryFee({ vendor: { deliveryFee: 25 }, fulfilment: 'STAFF_PICKUP', now: NIGHT }).deliveryFee).toBe(0);
    });
  });

  describe('care visit price', () => {
    it('keeps the 15% platform fee and GST for non-members', () => {
      expect(pricing.quoteCareVisit({ basePrice: 500 })).toMatchObject({
        basePrice: 500, platformFee: 75, gst: 103.5, totalAmount: 678.5, memberFeeWaived: false
      });
    });

    it('waives the platform fee for members', () => {
      expect(pricing.quoteCareVisit({ basePrice: 500, isMember: true })).toMatchObject({
        platformFee: 0, gst: 90, totalAmount: 590, memberFeeWaived: true
      });
    });
  });

  describe('revenue splits', () => {
    it('pharmacy: store keeps items minus 10%, platform keeps commission + delivery', () => {
      expect(pricing.splitPharmacyOrder({ amounts: { itemsSubtotal: 350, deliveryFee: 25 } })).toEqual({
        commissionRate: 0.1, itemsSubtotal: 350, commission: 35, vendorPayout: 315, deliveryFee: 25
      });
    });

    it('care: provider keeps base minus 20%, platform keeps commission + fee', () => {
      expect(pricing.splitCareBooking({ pricing: { basePrice: 299, platformFee: 44.85 } })).toEqual({
        commissionRate: 0.2, basePrice: 299, commission: 59.8, providerPayout: 239.2, platformFee: 44.85
      });
    });

    it('rates are configurable per environment', () => {
      process.env.REVENUE_PHARMACY_COMMISSION_RATE = '0.12';
      resetRevenuePolicy();
      expect(pricing.splitPharmacyOrder({ amounts: { itemsSubtotal: 100, deliveryFee: 0 } }).commission).toBe(12);
    });
  });
});
