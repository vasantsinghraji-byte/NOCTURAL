/**
 * Care marketplace maths: travel fee, plan bill, refunds and calendar helpers
 * (docs/product/PROVIDER_MARKETPLACE_PLAN.md). Pure functions, no database.
 */
const { resetRevenuePolicy } = require('../../../config/revenue');
const pricing = require('../../../services/pricingService');
const slots = require('../../../services/careSlotService');
const { refundDue } = require('../../../services/carePlanService');

const ENV_KEYS = ['REVENUE_GST_HEALTHCARE_EXEMPT', 'REVENUE_TRAVEL_MIN_FEE', 'REVENUE_CARE_CUSTOMER_FEE_RATE'];
const saved = {};

beforeEach(() => {
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  resetRevenuePolicy();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  resetRevenuePolicy();
});

describe('travel fee', () => {
  it('charges road km (straight × 1.3) rounded up to the next km × the shop rate', () => {
    // 4.77 km straight → 6.2 km road → 7 km charged × ₹12
    expect(pricing.quoteTravel({ straightKm: 4.77, ratePerKm: 12 })).toMatchObject({ roadKm: 6.2, chargedKm: 7, ratePerKm: 12, fee: 84 });
  });

  it('applies the Nabz minimum for short trips', () => {
    expect(pricing.quoteTravel({ straightKm: 0.4, ratePerKm: 10 }).fee).toBe(30);
    process.env.REVENUE_TRAVEL_MIN_FEE = '0';
    resetRevenuePolicy();
    expect(pricing.quoteTravel({ straightKm: 0.4, ratePerKm: 10 })).toMatchObject({ chargedKm: 1, fee: 10 });
  });

  it('an exact whole km is not rounded up to the next one', () => {
    // 10 km straight × 1.3 = 13.0 km road → 13 km charged
    expect(pricing.quoteTravel({ straightKm: 10, ratePerKm: 15 })).toMatchObject({ roadKm: 13, chargedKm: 13, fee: 195 });
  });
});

describe('plan bill', () => {
  const tiers = [{ minSessions: 5, percent: 5 }, { minSessions: 10, percent: 10 }];

  it('gives the multi-session discount only when the plan is paid upfront', () => {
    const prepaid = pricing.quoteCarePlan({ listPrice: 600, sessions: 10, mode: 'HOME', travelPerSession: 84, discountTiers: tiers, paymentMode: 'PREPAID' });
    const perSession = pricing.quoteCarePlan({ listPrice: 600, sessions: 10, mode: 'HOME', travelPerSession: 84, discountTiers: tiers, paymentMode: 'PER_SESSION' });
    expect(prepaid).toMatchObject({ discountPercent: 10, servicePerSession: 540, serviceSubtotal: 6000, discount: 600, travelTotal: 840 });
    expect(perSession).toMatchObject({ discountPercent: 0, servicePerSession: 600, discount: 0 });
  });

  it('picks the best tier the session count reaches', () => {
    expect(pricing.sessionDiscountPercent(tiers, 4)).toBe(0);
    expect(pricing.sessionDiscountPercent(tiers, 7)).toBe(5);
    expect(pricing.sessionDiscountPercent(tiers, 30)).toBe(10);
  });

  it('a plan total is exactly the sum of its sessions (no rounding drift)', () => {
    const q = pricing.quoteCarePlan({ listPrice: 333.33, sessions: 7, mode: 'HOME', travelPerSession: 47, discountTiers: [{ minSessions: 7, percent: 7 }], paymentMode: 'PREPAID' });
    expect(Math.round(q.perSessionPayable * 7 * 100)).toBe(Math.round(q.total * 100));
    expect(q.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0)).toBe(Math.round(q.total * 100));
  });

  it('takes no Nabz fee on travel and none at the clinic', () => {
    const home = pricing.quoteCarePlan({ listPrice: 500, sessions: 1, mode: 'HOME', travelPerSession: 100, paymentMode: 'PER_SESSION' });
    const clinic = pricing.quoteCarePlan({ listPrice: 500, sessions: 1, mode: 'CLINIC', travelPerSession: 100, paymentMode: 'PER_SESSION' });
    expect(home.platformFee).toBe(75); // 15% of 500 only
    expect(clinic.travelTotal).toBe(0);
  });

  it('taxes the whole bill today, and only the Nabz fee once health care is marked exempt', () => {
    const before = pricing.quoteCarePlan({ listPrice: 500, sessions: 1, mode: 'HOME', travelPerSession: 100, paymentMode: 'PER_SESSION' });
    expect(before.gst).toBe(121.5); // 18% of (500 + 100 + 75)
    process.env.REVENUE_GST_HEALTHCARE_EXEMPT = 'true';
    resetRevenuePolicy();
    const exempt = pricing.quoteCarePlan({ listPrice: 500, sessions: 1, mode: 'HOME', travelPerSession: 100, paymentMode: 'PER_SESSION' });
    expect(exempt.gst).toBe(13.5); // 18% of the ₹75 fee
  });

  it('waives the Nabz fee for Plus members', () => {
    const q = pricing.quoteCarePlan({ listPrice: 500, sessions: 2, mode: 'CLINIC', paymentMode: 'PER_SESSION', isMember: true });
    expect(q).toMatchObject({ platformFee: 0, memberFeeWaived: true });
  });

  it('pays the professional the travel fee in full, with commission only on the service', () => {
    const split = pricing.splitCareBooking({ pricing: { basePrice: 600, travelFee: 84, platformFee: 90 }, commissionOverride: { rate: 0.2 } });
    expect(split).toMatchObject({ commission: 120, travelFee: 84, providerPayout: 564 });
  });
});

describe('refund of unused prepaid sessions', () => {
  const plan = (extra = {}) => ({
    paymentMode: 'PREPAID',
    mode: 'CLINIC',
    payment: { status: 'PAID', amount: 0 },
    price: { listPricePerSession: 600, discountPercent: 10, servicePerSession: 540, travelPerSession: 0, platformFeePerSession: 81, gstPerSession: 111.78 },
    refund: { credit: 0 },
    ...extra
  });
  const prepaidTotal = pricing.quoteCarePlan({ listPrice: 600, sessions: 10, mode: 'CLINIC', discountTiers: [{ minSessions: 10, percent: 10 }], paymentMode: 'PREPAID' }).total;
  const listSession = pricing.quoteCarePlan({ listPrice: 600, sessions: 1, mode: 'CLINIC', paymentMode: 'PER_SESSION' }).perSessionPayable;
  const done = (n) => Array.from({ length: n }, () => ({ status: 'COMPLETED' }));

  it('counts used sessions at the list price (no "buy 10 for the discount, use 3")', () => {
    const p = plan({ payment: { status: 'PAID', amount: prepaidTotal } });
    expect(refundDue(p, done(3))).toBeCloseTo(prepaidTotal - 3 * listSession, 2);
  });

  it('never goes below zero', () => {
    const p = plan({ payment: { status: 'PAID', amount: prepaidTotal } });
    expect(refundDue(p, done(10))).toBe(0);
  });

  it('keeps the discount when the provider let the plan down', () => {
    const p = plan({ payment: { status: 'PAID', amount: prepaidTotal } });
    const sessions = [...done(3), { status: 'CANCELLED', cancellation: { cancelledBy: 'ADMIN' } }];
    expect(refundDue(p, sessions)).toBeCloseTo(prepaidTotal - 3 * (540 + 81 + 111.78), 2);
  });

  it('adds credits and returns nothing for unpaid or pay-per-session plans', () => {
    expect(refundDue(plan({ payment: { status: 'PAID', amount: 100 }, refund: { credit: 25 } }), done(5))).toBe(25);
    expect(refundDue(plan({ payment: { status: 'PENDING', amount: 5000 } }), [])).toBe(0);
    expect(refundDue(plan({ paymentMode: 'PER_SESSION' }), [])).toBe(0);
  });
});

describe('calendar helpers', () => {
  const store = {
    _id: 'store1',
    format: 'SOLO',
    clinic: { enabled: true, capacity: 1, hours: [{ day: 'MON', open: '08:00', close: '12:00' }, { day: 'MON', open: '17:00', close: '21:00' }] },
    home: { enabled: true, capacity: 1, bufferMinutes: 30, hours: [{ day: 'MON', open: '09:00', close: '18:00' }] },
    leave: [{ from: '2026-10-19', to: '2026-10-20' }]
  };

  it('fits sessions inside split working hours only', () => {
    expect(slots.fitsHours(store, 'CLINIC', '2026-10-12', '11:00', 60)).toBe(true);
    expect(slots.fitsHours(store, 'CLINIC', '2026-10-12', '11:30', 60)).toBe(false); // runs past 12:00
    expect(slots.fitsHours(store, 'CLINIC', '2026-10-12', '14:00', 45)).toBe(false); // the break
    expect(slots.fitsHours(store, 'CLINIC', '2026-10-13', '09:00', 45)).toBe(false); // Tuesday: closed
  });

  it('a home visit also holds the travel buffer; a solo professional shares one calendar', () => {
    const home = slots.slotKeysFor(store, 'HOME', '2026-10-12', '10:00', 45).map((s) => s.key);
    const clinic = slots.slotKeysFor(store, 'CLINIC', '2026-10-12', '10:00', 45).map((s) => s.key);
    expect(home).toHaveLength(5); // 10:00–11:15 incl. 30 min buffer, in 15-minute slots
    expect(clinic).toHaveLength(3);
    expect(home[0]).toBe(clinic[0]); // same person: home and clinic can't overlap
  });

  it('a clinic has separate clinic and home calendars with their own capacity', () => {
    const clinicStore = { ...store, format: 'CLINIC', clinic: { ...store.clinic, capacity: 3 }, home: { ...store.home, capacity: 2 } };
    expect(slots.resourceFor(clinicStore, 'CLINIC')).toEqual({ resource: 'CLINIC', capacity: 3 });
    expect(slots.resourceFor(clinicStore, 'HOME')).toEqual({ resource: 'HOME', capacity: 2 });
    expect(slots.resourceFor(store, 'HOME')).toEqual({ resource: 'PRACTITIONER', capacity: 1 });
  });

  it('plan dates follow the chosen weekdays and skip leave days', () => {
    const dates = slots.planDates({ startDate: '2026-10-12', weekdays: [1, 3, 5], sessions: 6, untilDate: '2026-12-31', store });
    expect(dates).toEqual(['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-21', '2026-10-23', '2026-10-26']);
  });

  it('refuses times too close to now, on leave, or outside hours', () => {
    const now = new Date('2026-10-12T03:30:00Z').getTime(); // 09:00 IST Monday
    expect(slots.bookabilityProblem(store, 'CLINIC', '2026-10-12', '09:15', 45, now)).toMatch(/at least/);
    expect(slots.bookabilityProblem(store, 'CLINIC', '2026-10-12', '10:00', 45, now)).toBeNull();
    expect(slots.bookabilityProblem(store, 'CLINIC', '2026-10-19', '10:00', 45, now)).toMatch(/leave/);
    expect(slots.bookabilityProblem(store, 'HOME', '2026-10-12', '17:30', 45, now)).toMatch(/home-visit hours/);
  });
});
