/**
 * Customer Home feed: offer banners, care packages and what's popular locally.
 *
 * Banners only advertise things that are actually true in the product
 * (config/revenue.js), so the copy can never promise an offer that doesn't exist.
 */

const NurseBooking = require('../models/nurseBooking');
const { getRevenuePolicy } = require('../config/revenue');
const careSuppliesService = require('./careSuppliesService');

let cache = { at: 0, popular: [] };
const POPULAR_TTL_MS = 10 * 60 * 1000;

async function popularServiceTypes() {
  if (Date.now() - cache.at < POPULAR_TTL_MS) return cache.popular;
  const rows = await NurseBooking.aggregate([
    { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } },
    { $group: { _id: '$serviceType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 6 }
  ]);
  cache = { at: Date.now(), popular: rows.map((r) => r._id) };
  return cache.popular;
}

async function getHome() {
  const policy = getRevenuePolicy();
  const plan = policy.membership.plans.PLUS_MONTHLY;
  const services = await careSuppliesService.listServices();
  const popularTypes = await popularServiceTypes();
  const byType = new Map(services.map((s) => [s.serviceType, s]));
  const popular = popularTypes.map((t) => byType.get(t)).filter(Boolean);
  const featured = services.filter((s) => s.isFeatured && s.category !== 'PACKAGE');

  const banners = [
    {
      id: 'plus-trial',
      kind: 'PLUS',
      title: `Try ${plan.name} free for ${policy.membership.trialDays} days`,
      subtitle: 'Free medicine delivery and no platform fee on visits',
      cta: 'Start free trial',
      action: 'plus'
    },
    {
      id: 'supplies',
      kind: 'SUPPLIES',
      title: 'Your nurse brings the supplies',
      subtitle: 'Syringes, dressings, IV sets from the nearest pharmacy',
      cta: 'Book a visit',
      action: 'book'
    },
    policy.pharmacy.freeDeliveryAbove > 0 ? {
      id: 'free-delivery',
      kind: 'PHARMACY',
      title: `Free delivery above ₹${policy.pharmacy.freeDeliveryAbove}`,
      subtitle: 'Medicines from licensed pharmacies near you',
      cta: 'Order medicines',
      action: 'pharmacy'
    } : null,
    {
      id: 'pay-later',
      kind: 'TRUST',
      title: 'Pay after the visit',
      subtitle: 'Verified professionals · clear, itemised bill',
      cta: 'How it works',
      action: 'trust'
    }
  ].filter(Boolean);

  return {
    banners,
    packages: services.filter((s) => s.category === 'PACKAGE'),
    popular: popular.length ? popular : featured.slice(0, 6)
  };
}

module.exports = { getHome };
