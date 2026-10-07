/**
 * Admin-editable platform settings (docs/product/ADMIN_AND_ADS_GUIDE.md).
 *
 * revenue  fee and commission rates, travel band, plan rules, credits, GST switch.
 *          Each field has hard bounds; new bookings use the new value at once,
 *          booked visits and plans keep their locked prices.
 * ads      kill switch, per-placement on/off, positions, max ads, minimum CPC,
 *          rating floor, weekly prices, frequency cap, cities without ads.
 *
 * Maker-checker: one admin proposes, another approves. When the team has a
 * single platform admin, they may approve their own change (flagged in the log).
 */

const { PlatformSetting, SettingChange } = require('../models/platformSetting');
const User = require('../models/user');
const { getRevenuePolicy, setRevenueOverrides } = require('../config/revenue');
const { ValidationError, NotFoundError, ConflictError, AuthorizationError } = require('../utils/errors');
const logger = require('../utils/logger');

const num = (min, max, label) => ({ type: 'number', min, max, label });
const bool = (label) => ({ type: 'boolean', label });

// What the admin may change, with hard bounds (outside them the change is refused).
const REVENUE_FIELDS = Object.freeze({
  'care.customerFeeRate': num(0, 0.4, 'Nabz fee on care visits (fraction)'),
  'care.providerCommissionRate': num(0, 0.5, 'Provider commission (fraction)'),
  'care.travel.minRatePerKm': num(0, 100, 'Travel: lowest ₹/km a provider may set'),
  'care.travel.maxRatePerKm': num(1, 200, 'Travel: highest ₹/km a provider may set'),
  'care.travel.minFee': num(0, 500, 'Travel: minimum fee (₹)'),
  'care.travel.roadFactor': num(1, 3, 'Travel: road distance factor'),
  'care.travel.maxRadiusKm': num(1, 100, 'Travel: largest home-visit radius (km)'),
  'care.plan.maxSessions': num(1, 100, 'Plans: most sessions in one plan'),
  'care.plan.weeksPerSession': num(1, 8, 'Plans: weeks allowed per session'),
  'care.plan.quoteMinutes': num(1, 120, 'Price lock (minutes)'),
  'care.plan.paymentHoldMinutes': num(5, 240, 'Prepaid: slot hold while paying (minutes)'),
  'care.lab.commissionRate': num(0, 0.5, 'Labs: Nabz commission (fraction)'),
  'care.lab.customerFeeRate': num(0, 0.2, 'Labs: customer fee (fraction)'),
  'care.lab.lateReportCreditMin': num(0, 1000, 'Labs: late report credit, minimum (₹)'),
  'care.lab.lateReportCreditMax': num(0, 5000, 'Labs: late report credit, maximum (₹)'),
  'care.noShowCredit': num(0, 2000, 'Credit when a professional doesn’t come (₹)'),
  'pharmacy.commissionRate': num(0, 0.4, 'Pharmacy commission (fraction)'),
  'pharmacy.defaultDeliveryFee': num(0, 500, 'Delivery fee (₹)'),
  'pharmacy.freeDeliveryAbove': num(0, 100000, 'Free delivery above (₹, 0 = never)'),
  'pharmacy.nightSurcharge': num(0, 500, 'Night delivery surcharge (₹)'),
  gstHealthcareExempt: bool('GST only on the Nabz fee (health care exempt) — only after the CA confirms')
});

const AD_DEFAULTS = Object.freeze({
  enabled: true,
  frequencyCap: 3,
  blockedCities: [],
  placements: {
    SEARCH: { enabled: true, positions: [2, 6], maxAds: 2, minCpc: 5, ratingFloor: 4, minReviews: 10 },
    HOME_SPOTLIGHT: { enabled: true, maxAds: 1, weeklyPrice: 2999 },
    SERVICE_BANNER: { enabled: true, maxAds: 1, weeklyPrice: 1999 }
  }
});

const AD_FIELDS = Object.freeze({
  enabled: bool('Ads on (kill switch)'),
  frequencyCap: num(1, 20, 'Same ad per customer per day'),
  'placements.SEARCH.enabled': bool('Sponsored listings in search'),
  'placements.SEARCH.maxAds': num(0, 3, 'Sponsored listings in the first 10 results'),
  'placements.SEARCH.minCpc': num(1, 500, 'Minimum cost per click (₹)'),
  'placements.SEARCH.ratingFloor': num(3, 5, 'Lowest rating that may advertise'),
  'placements.SEARCH.minReviews': num(0, 100, 'Reviews needed to advertise'),
  'placements.HOME_SPOTLIGHT.enabled': bool('Home spotlight tile'),
  'placements.HOME_SPOTLIGHT.weeklyPrice': num(0, 1000000, 'Spotlight price per week (₹)'),
  'placements.SERVICE_BANNER.enabled': bool('Service page banner'),
  'placements.SERVICE_BANNER.weeklyPrice': num(0, 1000000, 'Banner price per week (₹)')
});

const FIELDS = { revenue: REVENUE_FIELDS, ads: AD_FIELDS };

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, value) {
  const parts = path.split('.');
  const leaf = parts.pop();
  let parent = obj;
  for (const k of parts) {
    if (!parent[k] || typeof parent[k] !== 'object') parent[k] = {};
    parent = parent[k];
  }
  parent[leaf] = value;
}

let adsCache = null;
let adsCachedAt = 0;

/** Ads settings (defaults + saved), cached for 30 s. */
async function getAds() {
  if (adsCache && Date.now() - adsCachedAt < 30000) return adsCache;
  const row = await PlatformSetting.findOne({ key: 'ads' }).lean().catch(() => null);
  const merged = structuredClone(AD_DEFAULTS);
  const saved = (row && row.value) || {};
  for (const path of Object.keys(AD_FIELDS)) {
    const v = getPath(saved, path);
    if (v !== undefined) setPath(merged, path, v);
  }
  if (Array.isArray(saved.blockedCities)) merged.blockedCities = saved.blockedCities.map((c) => String(c).toLowerCase()).slice(0, 50);
  adsCache = merged;
  adsCachedAt = Date.now();
  return merged;
}

/** Load revenue overrides into config (boot, every tick, after a change). */
// Revenue overrides are stored by path with "__" for "." (MongoDB field names).
const encode = (path) => path.replace(/\./g, '__');
const decode = (key) => key.replace(/__/g, '.');

async function loadRevenueOverrides() {
  const row = await PlatformSetting.findOne({ key: 'revenue' }).lean();
  const flat = Object.fromEntries(Object.entries((row && row.value) || {}).map(([k, v]) => [decode(k), v]));
  setRevenueOverrides(flat);
  return flat;
}

/** Current values with labels and bounds, for the admin settings page. */
async function describe() {
  const revenue = getRevenuePolicy();
  const ads = await getAds();
  const rows = (key, source) => Object.entries(FIELDS[key]).map(([path, f]) => ({ key, path, ...f, value: getPath(source, path) }));
  const pending = await SettingChange.find({ status: 'PENDING' }).populate('proposedBy', 'name').sort({ createdAt: -1 }).lean();
  return { fields: [...rows('revenue', revenue), ...rows('ads', ads)], blockedCities: ads.blockedCities, pending };
}

function validateChanges(key, changes) {
  const fields = FIELDS[key];
  if (!fields) throw new ValidationError('Unknown settings group');
  const entries = Object.entries(changes || {});
  if (!entries.length) throw new ValidationError('Change at least one value');
  const clean = {};
  for (const [path, raw] of entries) {
    const f = fields[path];
    if (!f) throw new ValidationError(`${path} can’t be changed here`);
    if (f.type === 'boolean') {
      if (typeof raw !== 'boolean') throw new ValidationError(`${f.label}: on or off`);
      clean[path] = raw;
    } else {
      const v = Number(raw);
      if (!Number.isFinite(v) || v < f.min || v > f.max) throw new ValidationError(`${f.label} must be ${f.min}–${f.max}`);
      clean[path] = v;
    }
  }
  if (key === 'revenue') {
    const policy = getRevenuePolicy();
    const lo = clean['care.travel.minRatePerKm'] ?? policy.care.travel.minRatePerKm;
    const hi = clean['care.travel.maxRatePerKm'] ?? policy.care.travel.maxRatePerKm;
    if (lo > hi) throw new ValidationError('The lowest ₹/km can’t be above the highest');
  }
  return clean;
}

async function propose(adminId, { key, changes, reason, blockedCities } = {}) {
  if (!reason || String(reason).trim().length < 5) throw new ValidationError('Say why (at least a few words)');
  const clean = changes && Object.keys(changes).length ? validateChanges(key, changes) : {};
  if (key === 'ads' && Array.isArray(blockedCities)) clean.blockedCities = blockedCities.map((c) => String(c).trim().toLowerCase().slice(0, 60)).filter(Boolean).slice(0, 50);
  if (!Object.keys(clean).length) throw new ValidationError('Change at least one value');
  const current = key === 'revenue' ? getRevenuePolicy() : await getAds();
  const list = Object.entries(clean).map(([path, value]) => ({ path, value, previous: getPath(current, path) }));
  const change = await SettingChange.create({ key, changes: list, reason: String(reason).slice(0, 300), proposedBy: adminId });
  logger.info('Setting change proposed', { changeId: String(change._id), key, by: String(adminId) });
  return change.toObject();
}

async function review(adminId, changeId, { decision, note } = {}) {
  if (!['APPROVE', 'REJECT'].includes(decision)) throw new ValidationError('Approve or reject');
  const change = await SettingChange.findById(changeId);
  if (!change) throw new NotFoundError('Change');
  if (change.status !== 'PENDING') throw new ConflictError('This change was already decided');
  const self = String(change.proposedBy) === String(adminId);
  if (self && decision === 'APPROVE') {
    const admins = await User.countDocuments({ role: 'platform_admin', isActive: { $ne: false } });
    if (admins > 1) throw new AuthorizationError('Another admin must approve this change');
  }
  if (decision === 'REJECT') {
    Object.assign(change, { status: 'REJECTED', reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note });
    await change.save();
    return change.toObject();
  }
  // Re-check against the bounds (the policy may have moved since it was proposed).
  const fieldChanges = Object.fromEntries(change.changes.filter((c) => c.path !== 'blockedCities').map((c) => [c.path, c.value]));
  if (Object.keys(fieldChanges).length) validateChanges(change.key, fieldChanges);
  const row = await PlatformSetting.findOne({ key: change.key });
  const value = structuredClone((row && row.value) || {});
  for (const { path, value: v } of change.changes) {
    if (change.key === 'revenue') value[encode(path)] = v;
    else if (path === 'blockedCities') value.blockedCities = v;
    else setPath(value, path, v);
  }
  await PlatformSetting.findOneAndUpdate(
    { key: change.key },
    { $set: { value, updatedBy: adminId }, $inc: { version: 1 } },
    { upsert: true }
  );
  Object.assign(change, { status: 'APPLIED', reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note, selfApproved: self });
  await change.save();
  if (change.key === 'revenue') await loadRevenueOverrides();
  adsCache = null;
  logger.info('Setting change applied', { changeId: String(change._id), key: change.key, by: String(adminId), selfApproved: self });
  return change.toObject();
}

async function history(limit = 50) {
  return SettingChange.find({}).populate('proposedBy', 'name').populate('reviewedBy', 'name').sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = { getAds, loadRevenueOverrides, describe, propose, review, history, REVENUE_FIELDS, AD_FIELDS, AD_DEFAULTS };
