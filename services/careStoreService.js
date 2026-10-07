/**
 * Care marketplace shops: a physio / clinic / lab sets up its shop and its rate
 * card (its own prices for Nabz catalog services); customers search and compare.
 * See docs/product/PROVIDER_MARKETPLACE_PLAN.md.
 *
 * Guardrails: prices inside the catalog's floor/ceiling (unless an admin
 * approved a range), travel ₹/km inside the Nabz band, one shop per council
 * registration, only whitelisted fields are editable by the shop.
 */

const CareStore = require('../models/careStore');
const RateCardItem = require('../models/rateCardItem');
const ServiceCatalog = require('../models/serviceCatalog');
const NurseBooking = require('../models/nurseBooking');
const User = require('../models/user');
const { getRevenuePolicy } = require('../config/revenue');
const { VERIFIED_FILTER } = require('./careVisitPolicy');
const pricingService = require('./pricingService');
const careSlotService = require('./careSlotService');
const { haversineKm, toLatLng } = require('../utils/geoDistance');
const { STORE_OWNER_ROLES, KIND_CATEGORIES, WEEKDAYS, STORE_KINDS } = require('../constants/marketplace');
const { ValidationError, NotFoundError, AuthorizationError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const lazyPlans = () => require('./carePlanService');
const ACTIVE_SESSION_STATUSES = ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const kindForRole = (role) => Object.keys(STORE_OWNER_ROLES).find((k) => STORE_OWNER_ROLES[k].includes(role));
const str = (v, max) => (v === undefined || v === null ? undefined : String(v).trim().slice(0, max));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cleanPoint(value, label) {
  const p = toLatLng(value);
  if (!p) throw new ValidationError(`Pin the ${label} on the map`);
  return { type: 'Point', coordinates: [p.lng, p.lat] };
}

function cleanHours(list, label) {
  if (!Array.isArray(list)) return [];
  if (list.length > 28) throw new ValidationError(`Too many ${label} hours`);
  return list.map((h) => {
    const day = String(h && h.day).toUpperCase();
    if (!WEEKDAYS.includes(day) || !TIME.test(String(h.open)) || !TIME.test(String(h.close)) || h.open >= h.close) {
      throw new ValidationError(`Check your ${label} hours: each needs a day and an opening time before the closing time`);
    }
    return { day, open: h.open, close: h.close };
  });
}

/** Count of booked, not yet done sessions for a shop (optionally one service/mode). */
async function upcomingSessions(storeId, { rateCardItem, mode } = {}) {
  return NurseBooking.countDocuments({
    'marketplace.store': storeId,
    ...(rateCardItem ? { 'marketplace.rateCardItem': rateCardItem } : {}),
    ...(mode ? { 'marketplace.mode': mode } : {}),
    status: { $in: ACTIVE_SESSION_STATUSES },
    scheduledDate: { $gte: new Date(`${careSlotService.todayIst()}T00:00:00Z`) }
  });
}

async function ownedStore(user) {
  const kind = kindForRole(user.role);
  if (!kind) throw new AuthorizationError('Only physiotherapists, nurses and lab partners can run a shop');
  return CareStore.findOne({ owner: user._id || user.id, kind });
}

// ── Partner: shop profile ────────────────────────────────────────────────

async function getMyStore(user) {
  const store = await ownedStore(user);
  if (!store) return null;
  const rateCard = await RateCardItem.find({ store: store._id })
    .populate('service', 'name displayName category marketplace serviceDetails.duration lab')
    .sort({ createdAt: 1 })
    .lean();
  return { store: store.toObject(), rateCard, upcomingSessions: await upcomingSessions(store._id) };
}

async function saveMyStore(user, input = {}) {
  const kind = kindForRole(user.role);
  if (!kind) throw new AuthorizationError('Only physiotherapists, nurses and lab partners can run a shop');
  const ownerId = user._id || user.id;
  const travel = getRevenuePolicy().care.travel;
  const existing = await CareStore.findOne({ owner: ownerId, kind });

  const formats = kind === 'LAB' ? ['LAB'] : ['SOLO', 'CLINIC'];
  const format = input.format !== undefined ? String(input.format).toUpperCase() : (existing ? existing.format : formats[0]);
  if (!formats.includes(format)) throw new ValidationError(`Choose ${formats.join(' or ')}`);
  const solo = format === 'SOLO';

  const set = { format };
  const name = str(input.name, 120);
  if (name !== undefined) {
    if (name.length < 2) throw new ValidationError('Enter your shop or clinic name');
    set.name = name;
  } else if (!existing) {
    throw new ValidationError('Enter your shop or clinic name');
  }
  if (input.registration) {
    const number = str(input.registration.number, 60);
    if (number !== undefined) set['registration.number'] = number ? number.toUpperCase() : undefined;
    if (input.registration.body !== undefined) set['registration.body'] = str(input.registration.body, 80);
  }
  if (input.bio !== undefined) set.bio = str(input.bio, 600);
  if (input.photos !== undefined) {
    const photos = (Array.isArray(input.photos) ? input.photos : []).map((u) => String(u)).filter((u) => /^https:\/\//.test(u)).slice(0, 8);
    set.photos = photos.map((u) => u.slice(0, 500));
  }
  if (input.languages !== undefined) set.languages = (Array.isArray(input.languages) ? input.languages : []).map((l) => str(l, 30)).filter(Boolean).slice(0, 8);
  if (input.gender !== undefined) {
    if (input.gender && !['FEMALE', 'MALE', 'OTHER'].includes(input.gender)) throw new ValidationError('Choose a gender');
    set.gender = input.gender || undefined;
  }
  if (input.qualification !== undefined) set.qualification = str(input.qualification, 80);
  if (input.experienceYears !== undefined) {
    const years = Number(input.experienceYears);
    if (!Number.isFinite(years) || years < 0 || years > 70) throw new ValidationError('Enter years of experience (0–70)');
    set.experienceYears = years;
  }
  if (input.address) {
    const a = input.address;
    if (a.pincode && !/^\d{6}$/.test(String(a.pincode))) throw new ValidationError('Enter a 6-digit pincode');
    set.address = { line1: str(a.line1, 200), line2: str(a.line2, 200), city: str(a.city, 80), state: str(a.state, 80), pincode: a.pincode ? String(a.pincode) : undefined };
  }
  if (input.location !== undefined) set.location = cleanPoint(input.location, kind === 'LAB' ? 'lab' : 'clinic or base');
  else if (!existing) throw new ValidationError('Pin your clinic or base on the map');

  const clinicIn = input.clinic || {};
  const homeIn = input.home || {};
  const clinic = existing ? existing.clinic.toObject() : { enabled: true, capacity: 1, hours: [] };
  const home = existing ? existing.home.toObject() : { enabled: false, radiusKm: 8, ratePerKm: 12, bufferMinutes: 30, capacity: 1, hours: [] };
  if (clinicIn.enabled !== undefined) clinic.enabled = Boolean(clinicIn.enabled);
  if (clinicIn.capacity !== undefined) clinic.capacity = Number(clinicIn.capacity);
  if (clinicIn.hours !== undefined) clinic.hours = cleanHours(clinicIn.hours, 'clinic');
  if (homeIn.enabled !== undefined) home.enabled = Boolean(homeIn.enabled);
  if (homeIn.radiusKm !== undefined) home.radiusKm = Number(homeIn.radiusKm);
  if (homeIn.ratePerKm !== undefined) home.ratePerKm = Number(homeIn.ratePerKm);
  if (homeIn.bufferMinutes !== undefined) home.bufferMinutes = Number(homeIn.bufferMinutes);
  if (homeIn.capacity !== undefined) home.capacity = Number(homeIn.capacity);
  if (homeIn.hours !== undefined) home.hours = cleanHours(homeIn.hours, 'home-visit');
  if (homeIn.base !== undefined) home.base = homeIn.base ? cleanPoint(homeIn.base, 'base') : undefined;
  if (solo) {
    clinic.capacity = 1;
    home.capacity = 1;
  }

  if (!clinic.enabled && !home.enabled) throw new ValidationError('Offer clinic visits, home visits, or both');
  if (clinic.enabled && !clinic.hours.length) throw new ValidationError('Add your clinic hours');
  if (!Number.isInteger(clinic.capacity) || clinic.capacity < 1 || clinic.capacity > 20) throw new ValidationError('Clinic capacity must be 1–20');
  if (home.enabled) {
    if (!home.hours.length) throw new ValidationError('Add your home-visit hours');
    if (!Number.isFinite(home.radiusKm) || home.radiusKm < 1 || home.radiusKm > travel.maxRadiusKm) {
      throw new ValidationError(`Home-visit distance must be 1–${travel.maxRadiusKm} km`);
    }
    if (!Number.isFinite(home.ratePerKm) || home.ratePerKm < travel.minRatePerKm || home.ratePerKm > travel.maxRatePerKm) {
      throw new ValidationError(`Travel rate must be ₹${travel.minRatePerKm}–₹${travel.maxRatePerKm} per km`);
    }
    if (!Number.isFinite(home.bufferMinutes) || home.bufferMinutes < 0 || home.bufferMinutes > 180) throw new ValidationError('Travel buffer must be 0–180 minutes');
    if (!Number.isInteger(home.capacity) || home.capacity < 1 || home.capacity > 20) throw new ValidationError('Home-visit capacity must be 1–20');
  }
  set.clinic = clinic;
  set.home = home;

  // Turning a mode off doesn't cancel what's booked; tell the shop.
  const warnings = [];
  if (existing) {
    for (const [mode, wasOn, isOn] of [['CLINIC', existing.clinic.enabled, clinic.enabled], ['HOME', existing.home.enabled, home.enabled]]) {
      if (wasOn && !isOn) {
        const n = await upcomingSessions(existing._id, { mode });
        if (n) warnings.push(`You have ${n} upcoming ${mode === 'HOME' ? 'home' : 'clinic'} sessions. They stay booked.`);
      }
    }
  }

  try {
    if (existing) {
      const updated = await CareStore.findOneAndUpdate({ _id: existing._id }, { $set: set }, { returnDocument: 'after', runValidators: true });
      return { store: updated.toObject(), warnings };
    }
    const verified = kind !== 'LAB' && await User.exists({ _id: ownerId, isActive: { $ne: false }, ...VERIFIED_FILTER });
    const created = await CareStore.create({
      ...Object.fromEntries(Object.entries(set).filter(([k]) => !k.includes('.'))),
      registration: { number: set['registration.number'], body: set['registration.body'] },
      kind,
      owner: ownerId,
      members: [{ user: ownerId, role: kind === 'LAB' ? 'MANAGER' : 'PRACTITIONER' }],
      // Verified professionals go live at once; labs wait for an ops check (NABL, licence).
      status: verified ? 'APPROVED' : 'PENDING'
    });
    logger.info('Care store created', { storeId: String(created._id), kind, status: created.status });
    return { store: created.toObject(), warnings };
  } catch (err) {
    if (err && err.code === 11000 && JSON.stringify(err.keyPattern || {}).includes('registration')) {
      throw new ConflictError('This registration number is already listed on Nabz');
    }
    throw err;
  }
}

// ── Partner: rate card ───────────────────────────────────────────────────

function checkPrice(service, item, price, label) {
  if (!Number.isFinite(price) || price <= 0) throw new ValidationError(`Enter a ${label} price`);
  const m = service.marketplace || {};
  const approved = item && item.priceApproval && Number.isFinite(item.priceApproval.min) ? item.priceApproval : null;
  const floor = approved ? approved.min : m.priceFloor;
  const ceiling = approved ? approved.max : m.priceCeiling;
  if ((Number.isFinite(floor) && price < floor) || (Number.isFinite(ceiling) && price > ceiling)) {
    throw new ValidationError(`${service.displayName || service.name}: ${label} price must be ₹${floor ?? 0}–₹${ceiling ?? '∞'}. Ask Nabz support if you need a different range.`);
  }
}

async function upsertRateCardItem(user, serviceId, input = {}) {
  const store = await ownedStore(user);
  if (!store) throw new NotFoundError('Shop (set up your shop first)');
  const service = await ServiceCatalog.findOne({ _id: serviceId, 'availability.isActive': true }).lean();
  if (!service) throw new NotFoundError('Service');
  const categoryOk = (service.marketplace && service.marketplace.kind === store.kind) || KIND_CATEGORIES[store.kind].includes(service.category);
  if (!categoryOk) throw new ValidationError('This service isn’t offered by this kind of shop');
  const m = service.marketplace || {};
  const existing = await RateCardItem.findOne({ store: store._id, service: service._id });

  const clinicOn = Boolean(input.clinic && input.clinic.enabled);
  const homeOn = Boolean(input.home && input.home.enabled);
  if (!clinicOn && !homeOn) throw new ValidationError('Offer this service at the clinic, at home, or both');
  if (homeOn && m.homeAllowed === false) throw new ValidationError('This service can’t be done at home');
  if (clinicOn && m.clinicAllowed === false) throw new ValidationError('This service is home-only');
  const clinicPrice = clinicOn ? Number(input.clinic.price) : undefined;
  // Home price defaults to the clinic price.
  const homePrice = homeOn ? Number(input.home.price !== undefined && input.home.price !== '' ? input.home.price : input.clinic && input.clinic.price) : undefined;
  if (clinicOn) checkPrice(service, existing, clinicPrice, 'clinic');
  if (homeOn) checkPrice(service, existing, homePrice, 'home');

  const durationMinutes = input.durationMinutes !== undefined ? Number(input.durationMinutes) : (existing ? existing.durationMinutes : (m.defaultDurationMinutes || 45));
  if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) throw new ValidationError('Session length must be 10–480 minutes');

  const tiers = Array.isArray(input.sessionDiscounts) ? input.sessionDiscounts : (existing ? existing.sessionDiscounts.map((t) => t.toObject()) : []);
  if (tiers.length > 3) throw new ValidationError('Up to 3 multi-session discounts');
  const sessionDiscounts = tiers.map((t) => ({ minSessions: Number(t.minSessions), percent: Number(t.percent) }))
    .sort((a, b) => a.minSessions - b.minSessions);
  sessionDiscounts.forEach((t, i) => {
    if (!Number.isInteger(t.minSessions) || t.minSessions < 2 || t.minSessions > getRevenuePolicy().care.plan.maxSessions) throw new ValidationError('A discount needs at least 2 sessions');
    if (!Number.isFinite(t.percent) || t.percent < 1 || t.percent > 30) throw new ValidationError('Discounts can be 1–30%');
    if (i && t.minSessions === sessionDiscounts[i - 1].minSessions) throw new ValidationError('Each discount needs a different number of sessions');
  });

  const set = {
    kind: store.kind,
    clinic: { enabled: clinicOn, price: clinicPrice },
    home: { enabled: homeOn, price: homePrice },
    durationMinutes,
    sessionDiscounts,
    isActive: input.isActive !== false
  };
  if (store.kind === 'LAB') {
    const reportHours = Number(input.lab && input.lab.reportHours);
    set.lab = {
      reportHours: Number.isFinite(reportHours) && reportHours >= 1 && reportHours <= 720 ? reportHours : (service.lab && service.lab.defaultReportHours) || 24,
      homeCollection: homeOn && (!service.lab || service.lab.homeCollectable !== false)
    };
  }

  const priceKey = (doc) => JSON.stringify([doc.clinic, doc.home, doc.sessionDiscounts, doc.isActive, doc.durationMinutes]);
  const changed = !existing || priceKey({ ...set }) !== priceKey({
    clinic: { enabled: existing.clinic.enabled, price: existing.clinic.enabled ? existing.clinic.price : undefined },
    home: { enabled: existing.home.enabled, price: existing.home.enabled ? existing.home.price : undefined },
    sessionDiscounts: existing.sessionDiscounts.map((t) => ({ minSessions: t.minSessions, percent: t.percent })),
    isActive: existing.isActive,
    durationMinutes: existing.durationMinutes
  });

  const warnings = [];
  if (existing) {
    for (const [mode, wasOn, isOn] of [['CLINIC', existing.clinic.enabled, clinicOn], ['HOME', existing.home.enabled, homeOn]]) {
      if (wasOn && !isOn) {
        const n = await upcomingSessions(store._id, { rateCardItem: existing._id, mode });
        if (n) warnings.push(`You have ${n} upcoming ${mode === 'HOME' ? 'home' : 'clinic'} sessions for this. They stay booked at the booked price.`);
      }
    }
  }

  const item = await RateCardItem.findOneAndUpdate(
    { store: store._id, service: service._id },
    { $set: set, ...(existing ? (changed ? { $inc: { version: 1 } } : {}) : { $setOnInsert: { version: 1 } }) },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
  return { item: item.toObject(), warnings };
}

async function removeRateCardItem(user, serviceId) {
  const store = await ownedStore(user);
  if (!store) throw new NotFoundError('Shop');
  const item = await RateCardItem.findOneAndUpdate({ store: store._id, service: serviceId }, { $set: { isActive: false }, $inc: { version: 1 } }, { returnDocument: 'after' });
  if (!item) throw new NotFoundError('Rate card item');
  const n = await upcomingSessions(store._id, { rateCardItem: item._id });
  return { item: item.toObject(), warnings: n ? [`You have ${n} upcoming sessions for this. They stay booked.`] : [] };
}

async function setPaused(user, paused) {
  const store = await ownedStore(user);
  if (!store) throw new NotFoundError('Shop');
  store.isPaused = Boolean(paused);
  await store.save();
  return { isPaused: store.isPaused };
}

/** Days off. Sessions already booked on those days are released to their customers to move or cancel for free. */
async function addLeave(user, { from, to, reason } = {}) {
  const store = await ownedStore(user);
  if (!store) throw new NotFoundError('Shop');
  const today = careSlotService.todayIst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || from))) throw new ValidationError('Pick the leave dates');
  const end = to || from;
  if (from < today || end < from) throw new ValidationError('Leave must start today or later and end after it starts');
  if (careSlotService.addDays(from, 60) < end) throw new ValidationError('Add leave in blocks of up to 60 days');
  store.leave.push({ from, to: end, reason: str(reason, 120) });
  await store.save();
  const released = await lazyPlans().releaseStoreSessions(store, { from, to: end, reason: 'The professional is on leave that day' });
  return { leave: store.leave, released };
}

async function removeLeave(user, leaveId) {
  const store = await ownedStore(user);
  if (!store) throw new NotFoundError('Shop');
  store.leave = store.leave.filter((l) => String(l._id) !== String(leaveId));
  await store.save();
  return { leave: store.leave };
}

// ── Public: browse and compare ───────────────────────────────────────────

/** Is the shop's owner still an active (and, for professionals, verified) partner? */
async function liveOwners(stores) {
  const owners = [...new Set(stores.map((s) => String(s.owner)))];
  if (!owners.length) return new Set();
  const rows = await User.find({ _id: { $in: owners }, isActive: { $ne: false } }).select('_id role careProfile.verification').lean();
  return new Set(rows.filter((u) => u.role === 'lab_partner' || (u.careProfile && u.careProfile.verification
    && u.careProfile.verification.idVerified && u.careProfile.verification.policeVerified && u.careProfile.verification.councilVerified))
    .map((u) => String(u._id)));
}

const latLngOf = (point) => ({ lat: point.coordinates[1], lng: point.coordinates[0] });
const tripOrigin = (store) => (store.home && store.home.base && store.home.base.coordinates && store.home.base.coordinates.length === 2
  ? latLngOf(store.home.base) : latLngOf(store.location));

/** What a customer may see about a shop. A home-only professional's base stays private. */
function publicStore(store) {
  const clinicOn = Boolean(store.clinic && store.clinic.enabled);
  return {
    _id: store._id,
    kind: store.kind,
    format: store.format,
    name: store.name,
    bio: store.bio,
    photos: store.photos || [],
    languages: store.languages || [],
    gender: store.gender,
    qualification: store.qualification,
    experienceYears: store.experienceYears,
    accredited: Boolean(store.registration && store.registration.accredited),
    registered: Boolean(store.registration && store.registration.number),
    rating: store.rating || { avg: 0, count: 0 },
    isPaused: Boolean(store.isPaused),
    city: store.address && store.address.city,
    clinic: clinicOn ? {
      enabled: true,
      address: store.address,
      location: latLngOf(store.location),
      hours: store.clinic.hours
    } : { enabled: false },
    home: store.home && store.home.enabled ? {
      enabled: true,
      radiusKm: store.home.radiusKm,
      ratePerKm: store.home.ratePerKm,
      hours: store.home.hours
    } : { enabled: false }
  };
}

/** Distance, travel fee and whether home visits reach this point. */
function reachFor(store, point) {
  if (!point) return {};
  const clinicKm = Math.round(haversineKm(point, latLngOf(store.location)) * 10) / 10;
  if (!store.home || !store.home.enabled) return { distanceKm: clinicKm, homeCovered: false };
  const homeKm = haversineKm(tripOrigin(store), point);
  const homeCovered = homeKm <= store.home.radiusKm;
  return {
    distanceKm: store.clinic && store.clinic.enabled ? clinicKm : undefined,
    homeCovered,
    travel: homeCovered ? pricingService.quoteTravel({ straightKm: homeKm, ratePerKm: store.home.ratePerKm }) : null
  };
}

function publicItem(item) {
  const s = item.service || {};
  return {
    _id: item._id,
    service: { _id: s._id, name: s.name, displayName: s.displayName || s.name, category: s.category, shortDescription: s.shortDescription, lab: s.lab },
    clinic: item.clinic && item.clinic.enabled ? { enabled: true, price: item.clinic.price } : { enabled: false },
    home: item.home && item.home.enabled ? { enabled: true, price: item.home.price } : { enabled: false },
    durationMinutes: item.durationMinutes,
    sessionDiscounts: item.sessionDiscounts || [],
    lab: item.lab
  };
}

/** Catalog services of a kind with "from ₹X" and how many shops offer each. */
async function listMarketplaceServices(kind = 'PHYSIO') {
  if (!STORE_KINDS.includes(kind)) throw new ValidationError('Unknown kind');
  const services = await ServiceCatalog.find({ 'marketplace.kind': kind, 'availability.isActive': true })
    .select('name displayName category subCategory shortDescription icon image marketplace lab serviceDetails.duration isPopular sortOrder')
    .sort({ sortOrder: 1, displayName: 1 })
    .lean();
  const stats = await RateCardItem.aggregate([
    { $match: { kind, isActive: true, service: { $in: services.map((s) => s._id) } } },
    { $lookup: { from: CareStore.collection.name, localField: 'store', foreignField: '_id', as: 'store' } },
    { $unwind: '$store' },
    { $match: { 'store.status': 'APPROVED', 'store.isPaused': false } },
    {
      $group: {
        _id: '$service',
        providers: { $sum: 1 },
        minClinic: { $min: { $cond: ['$clinic.enabled', '$clinic.price', null] } },
        minHome: { $min: { $cond: ['$home.enabled', '$home.price', null] } }
      }
    }
  ]);
  const byService = new Map(stats.map((s) => [String(s._id), s]));
  return services.map((s) => {
    const st = byService.get(String(s._id)) || {};
    const prices = [st.minClinic, st.minHome].filter((p) => Number.isFinite(p));
    return {
      _id: s._id,
      name: s.name,
      displayName: s.displayName || s.name,
      category: s.category,
      subCategory: s.subCategory,
      shortDescription: s.shortDescription,
      icon: s.icon,
      homeAllowed: !s.marketplace || s.marketplace.homeAllowed !== false,
      clinicAllowed: !s.marketplace || s.marketplace.clinicAllowed !== false,
      lab: s.lab,
      providers: st.providers || 0,
      fromPrice: prices.length ? Math.min(...prices) : null
    };
  });
}

/**
 * Shops near a point, optionally offering one service in one mode, with the
 * price and travel fee for that point. HOME results only include shops whose
 * home-visit area covers the point.
 */
async function searchStores({ kind = 'PHYSIO', serviceId, mode, lat, lng, sort = 'recommended', gender, language, limit = 30 } = {}) {
  if (!STORE_KINDS.includes(kind)) throw new ValidationError('Unknown kind');
  if (mode && !['HOME', 'CLINIC'].includes(mode)) throw new ValidationError('Choose home or clinic');
  const point = toLatLng({ lat, lng });
  if (mode === 'HOME' && !point) throw new ValidationError('Choose the visit address first');

  const filter = { kind, status: 'APPROVED', isPaused: false };
  if (gender && ['FEMALE', 'MALE'].includes(gender)) filter.gender = gender;
  if (language) filter.languages = { $regex: `^${escapeRegex(String(language).slice(0, 30))}$`, $options: 'i' };
  if (mode === 'HOME') filter['home.enabled'] = true;
  if (mode === 'CLINIC') filter['clinic.enabled'] = true;
  let items = [];
  if (serviceId) {
    items = await RateCardItem.find({ service: serviceId, isActive: true, ...(mode ? { [`${mode === 'HOME' ? 'home' : 'clinic'}.enabled`]: true } : {}) })
      .populate('service', 'name displayName category shortDescription lab').lean();
    filter._id = { $in: items.map((i) => i.store) };
  }
  const maxKm = mode === 'HOME' ? getRevenuePolicy().care.travel.maxRadiusKm : 50;
  const stores = point
    ? await CareStore.find({ ...filter, location: { $nearSphere: { $geometry: { type: 'Point', coordinates: [point.lng, point.lat] }, $maxDistance: maxKm * 1000 } } }).limit(150).lean()
    : await CareStore.find(filter).sort({ 'rating.avg': -1 }).limit(150).lean();
  const live = await liveOwners(stores);
  const itemByStore = new Map(items.map((i) => [String(i.store), i]));

  const cards = [];
  for (const store of stores) {
    if (!live.has(String(store.owner))) continue;
    const reach = reachFor(store, point);
    if (mode === 'HOME' && !reach.homeCovered) continue;
    const item = itemByStore.get(String(store._id));
    const price = item ? (mode === 'HOME' ? item.home.price : mode === 'CLINIC' ? item.clinic.price
      : Math.min(...[item.clinic.enabled ? item.clinic.price : Infinity, item.home.enabled ? item.home.price : Infinity])) : null;
    cards.push({ ...publicStore(store), ...reach, item: item ? publicItem(item) : null, price: Number.isFinite(price) ? price : null });
  }
  const dist = (c) => (Number.isFinite(c.distanceKm) ? c.distanceKm : c.travel ? c.travel.roadKm : 999);
  const sorters = {
    price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || dist(a) - dist(b),
    distance: (a, b) => dist(a) - dist(b),
    rating: (a, b) => b.rating.avg - a.rating.avg || b.rating.count - a.rating.count,
    // Well-rated first (a rating counts once it has 3+ reviews), then nearer.
    recommended: (a, b) => (b.rating.count >= 3 ? b.rating.avg : 4) - (a.rating.count >= 3 ? a.rating.avg : 4) || dist(a) - dist(b)
  };
  cards.sort(sorters[sort] || sorters.recommended);
  return cards.slice(0, Math.min(Math.max(1, Number(limit) || 30), 50));
}

/** A shop's page: profile and full rate card, with the travel fee to a point. */
async function getStorePublic(storeId, { lat, lng } = {}) {
  const store = await CareStore.findOne({ _id: storeId, status: 'APPROVED' }).lean();
  if (!store || !(await liveOwners([store])).has(String(store.owner))) throw new NotFoundError('Provider');
  const items = await RateCardItem.find({ store: store._id, isActive: true })
    .populate('service', 'name displayName category shortDescription lab availability.isActive')
    .lean();
  return {
    ...publicStore(store),
    ...reachFor(store, toLatLng({ lat, lng })),
    rateCard: items.filter((i) => i.service && i.service.availability && i.service.availability.isActive).map(publicItem)
  };
}

/** Free start times for one service and mode. */
async function getStoreSlots(storeId, { serviceId, mode, from, days } = {}) {
  if (!['HOME', 'CLINIC'].includes(mode)) throw new ValidationError('Choose home or clinic');
  const store = await CareStore.findOne({ _id: storeId, status: 'APPROVED' });
  if (!store) throw new NotFoundError('Provider');
  if (store.isPaused) return { paused: true, days: [] };
  const item = await RateCardItem.findOne({ store: store._id, service: serviceId, isActive: true });
  if (!item || item.priceFor(mode) === null) throw new ValidationError(`This provider doesn’t offer that ${mode === 'HOME' ? 'at home' : 'at the clinic'}`);
  return { paused: false, durationMinutes: item.durationMinutes, days: await careSlotService.availability(store, mode, item.durationMinutes, { from, days }) };
}

// ── Admin ────────────────────────────────────────────────────────────────

async function adminListStores({ status, kind } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (kind) filter.kind = kind;
  return CareStore.find(filter).populate('owner', 'name email phone role').sort({ createdAt: -1 }).limit(200).lean();
}

async function adminSetStatus(adminId, storeId, status, reason) {
  if (!['APPROVED', 'SUSPENDED', 'REJECTED', 'PENDING'].includes(status)) throw new ValidationError('Unknown status');
  const store = await CareStore.findOneAndUpdate({ _id: storeId }, { $set: { status, statusReason: str(reason, 300) } }, { returnDocument: 'after' });
  if (!store) throw new NotFoundError('Shop');
  let released = 0;
  if (['SUSPENDED', 'REJECTED'].includes(status)) {
    released = await lazyPlans().releaseStoreSessions(store, { reason: 'This provider is no longer taking bookings on Nabz' });
  }
  logger.info('Care store status changed', { storeId: String(storeId), status, by: String(adminId), released });
  return { store: store.toObject(), released };
}

/** Allow a price range outside the catalog band for one rate card line. */
async function adminApprovePrice(adminId, itemId, { min, max } = {}) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi < lo) throw new ValidationError('Enter a valid price range');
  const item = await RateCardItem.findOneAndUpdate(
    { _id: itemId },
    { $set: { priceApproval: { min: lo, max: hi, approvedBy: adminId, approvedAt: new Date() } } },
    { returnDocument: 'after' }
  );
  if (!item) throw new NotFoundError('Rate card item');
  return item.toObject();
}

/** Reliability strike (no-show, extra cash asked). Three in 30 days pause the shop. */
async function addStrike(storeId, reason, bookingId) {
  const since = new Date(Date.now() - 30 * 86400000);
  const store = await CareStore.findOneAndUpdate(
    { _id: storeId },
    { $push: { strikes: { at: new Date(), reason: str(reason, 200), booking: bookingId } } },
    { returnDocument: 'after' }
  );
  if (!store) return null;
  const recent = store.strikes.filter((s) => s.at >= since).length;
  if (recent >= 3 && !store.isPaused) {
    await CareStore.updateOne({ _id: store._id }, { $set: { isPaused: true } });
    logger.warn('Care store paused after repeated strikes', { storeId: String(store._id), recent });
  }
  return { strikes: recent };
}

module.exports = {
  kindForRole,
  getMyStore,
  saveMyStore,
  upsertRateCardItem,
  removeRateCardItem,
  setPaused,
  addLeave,
  removeLeave,
  listMarketplaceServices,
  searchStores,
  getStorePublic,
  getStoreSlots,
  adminListStores,
  adminSetStatus,
  adminApprovePrice,
  addStrike,
  publicStore,
  reachFor,
  tripOrigin,
  liveOwners,
  upcomingSessions
};
