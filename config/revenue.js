/**
 * Nabz revenue policy: every commission, fee and plan price in one place.
 *
 * Defaults are the launch numbers in docs/NABZ_REVENUE_MODEL.md. Each can be
 * overridden per environment (REVENUE_* env vars, e.g. in Secrets Manager /
 * ECS task env) without a code change. Rates are fractions (0.2 = 20%).
 */

const num = (name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`);
  }
  return value;
};

function loadRevenuePolicy() {
  return Object.freeze({
    currency: 'INR',
    gstRate: num('REVENUE_GST_RATE', 0.18, { max: 1 }),

    // Home-care visits (nurse / physio). Customer pays base + platform fee (+GST on
    // the fee component, as today); the provider keeps base minus commission.
    care: Object.freeze({
      customerFeeRate: num('REVENUE_CARE_CUSTOMER_FEE_RATE', 0.15, { max: 1 }),
      providerCommissionRate: num('REVENUE_CARE_PROVIDER_COMMISSION_RATE', 0.20, { max: 1 }),
      memberFeeWaived: process.env.REVENUE_CARE_MEMBER_FEE_WAIVED !== 'false'
    }),

    // Pharmacy orders. The store keeps items minus commission; the delivery fee
    // (with surge / night surcharge) is platform revenue that funds riders.
    pharmacy: Object.freeze({
      commissionRate: num('REVENUE_PHARMACY_COMMISSION_RATE', 0.10, { max: 1 }),
      defaultDeliveryFee: num('REVENUE_DELIVERY_FEE_DEFAULT', 25),
      freeDeliveryAbove: num('REVENUE_FREE_DELIVERY_ABOVE', 499), // 0 disables
      surgeMultiplier: Object.freeze({
        NORMAL: 1,
        HIGH: num('REVENUE_SURGE_HIGH', 1.5, { min: 1, max: 5 }),
        SEVERE: num('REVENUE_SURGE_SEVERE', 2, { min: 1, max: 5 })
      }),
      nightSurcharge: num('REVENUE_NIGHT_SURCHARGE', 20),
      nightStartHour: num('REVENUE_NIGHT_START_HOUR', 22, { max: 23 }),
      nightEndHour: num('REVENUE_NIGHT_END_HOUR', 6, { max: 23 }),
      timezone: process.env.REVENUE_TIMEZONE || 'Asia/Kolkata',
      memberFreeDelivery: process.env.REVENUE_MEMBER_FREE_DELIVERY !== 'false'
    }),

    // Nabz Plus membership (Swiggy One-style).
    membership: Object.freeze({
      plans: Object.freeze({
        PLUS_MONTHLY: Object.freeze({
          code: 'PLUS_MONTHLY',
          name: 'Nabz Plus',
          price: num('REVENUE_PLUS_MONTHLY_PRICE', 149),
          days: 30
        })
      }),
      trialDays: num('REVENUE_PLUS_TRIAL_DAYS', 7, { max: 90 })
    })
  });
}

let cached = null;

/** Current policy (read once; call resetRevenuePolicy() in tests after changing env). */
function getRevenuePolicy() {
  if (!cached) cached = loadRevenuePolicy();
  return cached;
}

function resetRevenuePolicy() {
  cached = null;
}

module.exports = { getRevenuePolicy, resetRevenuePolicy };
