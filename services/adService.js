/**
 * Ads (docs/product/ADMIN_AND_ADS_GUIDE.md, Part 2).
 *
 * Safety first: a sponsored shop must already be an eligible organic result
 * for this exact search (approved, open, offers the service and mode, in range),
 * rated at or above the floor, and not already in the organic top 3. Then:
 *   score = bid × quality (rating × reliability × nearness); the winner pays just
 *   enough to beat the next ad (second price), never below the minimum CPC.
 * Every ad is labelled "Sponsored", capped per viewer per day, paced by the
 * daily budget, and charged once per viewer per day on click. Admin settings
 * (settingsService 'ads') turn placements on/off, set positions, floors and the
 * kill switch. No ads on emergency, checkout, tracking, reports or records.
 */

const crypto = require('crypto');
const AdCampaign = require('../models/adCampaign');
const { AdWallet, AdWalletEntry, AdStatDaily, AdViewerMark } = require('../models/adLedger');
const CareStore = require('../models/careStore');
const settingsService = require('./settingsService');
const careSlotService = require('./careSlotService');
const { round2 } = require('./pricingService');
const { ValidationError, NotFoundError, ConflictError, AuthorizationError, PaymentError } = require('../utils/errors');
const logger = require('../utils/logger');

const today = () => careSlotService.todayIst();
const secret = () => crypto.createHash('sha256').update(`ads|${process.env.JWT_SECRET || 'dev-only'}`).digest();

/** Who is looking: the signed-in customer, else a hash of network + device. */
function viewerKey(req) {
  if (req.user && (req.user._id || req.user.id)) return `u:${req.user._id || req.user.id}`;
  return `a:${crypto.createHash('sha256').update(`${req.ip}|${req.get('user-agent') || ''}`).digest('hex').slice(0, 24)}`;
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readToken(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const liveFilter = (now = new Date()) => ({ status: 'ACTIVE', startAt: { $lte: now }, endAt: { $gte: now } });

/** Budget left today (and in total) for a CPC campaign. */
function hasBudget(c, price) {
  const spentToday = c.spend && c.spend.day === today() ? c.spend.today : 0;
  if (c.dailyBudget > 0 && spentToday + price > c.dailyBudget) return false;
  if (c.totalBudget > 0 && (c.spend ? c.spend.total : 0) + price > c.totalBudget) return false;
  return true;
}

async function bumpStat(campaignId, placement, city, inc) {
  await AdStatDaily.updateOne(
    { campaign: campaignId, date: today(), placement, city: city || '' },
    { $inc: inc },
    { upsert: true }
  ).catch((err) => logger.warn('Ad stat update failed', { error: err.message }));
}

/** Frequency cap: may this viewer see this ad again today? Counts the view if so. */
async function takeView(viewer, campaign, cap) {
  const key = `${viewer}|${campaign._id}|${today()}`;
  const mark = await AdViewerMark.findOneAndUpdate(
    { key },
    { $inc: { views: 1 }, $setOnInsert: { viewer, campaign: campaign._id, store: campaign.store, expiresAt: new Date(Date.now() + 8 * 86400000) } },
    { upsert: true, returnDocument: 'after' }
  );
  return mark.views <= cap;
}

const adCard = (campaign, price, placement, viewer, extra = {}) => ({
  sponsored: true,
  label: 'Sponsored',
  campaignId: campaign._id,
  token: signToken({ c: String(campaign._id), p: price, pl: placement, v: viewer, d: today() }),
  creative: campaign.creative,
  ...extra
});

/**
 * Merge sponsored shops into organic search cards (both lists of shop cards).
 * Returns the new list; sponsored cards carry `sponsored`, `label`, `token`.
 */
async function withSponsoredListings(cards, { kind, serviceId, city, viewer } = {}) {
  const settings = await settingsService.getAds();
  const pl = settings.placements.SEARCH;
  if (!settings.enabled || !pl.enabled || !cards.length || (city && settings.blockedCities.includes(String(city).toLowerCase()))) return cards;
  const top3 = new Set(cards.slice(0, 3).map((c) => String(c._id)));
  const eligibleById = new Map(cards.map((c) => [String(c._id), c]));
  const now = new Date();
  const campaigns = await AdCampaign.find({
    ...liveFilter(now),
    product: 'SPONSORED_LISTING',
    house: false,
    kind,
    store: { $in: [...eligibleById.keys()].filter((id) => !top3.has(id)) }
  }).lean();

  const scored = [];
  for (const c of campaigns) {
    const card = eligibleById.get(String(c.store));
    if (!card) continue;
    if (serviceId && c.target && c.target.services && c.target.services.length && !c.target.services.some((s) => String(s) === String(serviceId))) continue;
    if (city && c.target && c.target.cities && c.target.cities.length && !c.target.cities.some((x) => x.toLowerCase() === String(city).toLowerCase())) continue;
    const rating = card.rating || { avg: 0, count: 0 };
    if (rating.count < pl.minReviews || rating.avg < pl.ratingFloor) continue;
    if (!(c.bidCpc >= pl.minCpc)) continue;
    const dist = Number.isFinite(card.distanceKm) ? card.distanceKm : card.travel ? card.travel.roadKm : 10;
    const quality = (rating.avg / 5) * (1 / (1 + dist / 10));
    scored.push({ c, card, quality, score: c.bidCpc * quality });
  }
  scored.sort((a, b) => b.score - a.score);

  const winners = [];
  for (let i = 0; i < scored.length && winners.length < pl.maxAds; i += 1) {
    const s = scored[i];
    const next = scored[i + 1];
    // Second price: just enough to beat the next ad, never more than the bid.
    const price = round2(Math.max(pl.minCpc, Math.min(s.c.bidCpc, next ? (next.score / s.quality) + 0.01 : pl.minCpc)));
    if (!hasBudget(s.c, price)) continue;
    if (!(await takeView(viewer, s.c, settings.frequencyCap))) continue;
    winners.push({ ...s, price });
  }
  if (!winners.length) return cards;

  const sponsoredIds = new Set(winners.map((w) => String(w.c.store)));
  const organic = cards.filter((c) => !sponsoredIds.has(String(c._id)));
  const out = [...organic];
  winners.forEach((w, i) => {
    const pos = Math.min((pl.positions[i] || pl.positions[pl.positions.length - 1]) - 1, out.length);
    out.splice(pos, 0, { ...w.card, ...adCard(w.c, w.price, 'SEARCH', viewer) });
  });
  for (const w of winners) await bumpStat(w.c._id, 'SEARCH', city, { impressions: 1 });
  return out;
}

/** Home carousel tile (one), or a house ad when no paid spotlight qualifies. */
async function spotlight({ city, viewer } = {}) {
  const settings = await settingsService.getAds();
  const pl = settings.placements.HOME_SPOTLIGHT;
  if (!settings.enabled || !pl.enabled || (city && settings.blockedCities.includes(String(city).toLowerCase()))) return [];
  const now = new Date();
  const rows = await AdCampaign.find({ ...liveFilter(now), product: 'SPOTLIGHT', $or: [{ house: true }, { paidUntil: { $gte: now } }] }).lean();
  const inCity = rows.filter((c) => !city || !(c.target && c.target.cities && c.target.cities.length) || c.target.cities.some((x) => x.toLowerCase() === String(city).toLowerCase()));
  const paid = inCity.filter((c) => !c.house);
  const pool = paid.length ? paid : inCity.filter((c) => c.house);
  const out = [];
  for (const c of pool.sort(() => Math.random() - 0.5)) {
    if (out.length >= pl.maxAds) break;
    if (!c.house && c.store) {
      const store = await CareStore.findOne({ _id: c.store, status: 'APPROVED', isPaused: false }).select('_id').lean();
      if (!store) continue;
    }
    if (!(await takeView(viewer, c, settings.frequencyCap))) continue;
    out.push(adCard(c, 0, 'HOME_SPOTLIGHT', viewer, { house: c.house, store: c.store }));
    await bumpStat(c._id, 'HOME_SPOTLIGHT', city, { impressions: 1 });
  }
  return out;
}

/**
 * Sponsored pins for the customer map: paid MAP_PIN campaigns whose clinic or
 * lab is near the point, live, open and well rated. Home-only professionals
 * never get a pin (their base address is private).
 */
async function mapPins({ lat, lng, city, viewer } = {}) {
  const settings = await settingsService.getAds();
  const pl = settings.placements.MAP_PIN;
  if (!settings.enabled || !pl || !pl.enabled || !pl.maxAds || (city && settings.blockedCities.includes(String(city).toLowerCase()))) return [];
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return [];
  const now = new Date();
  const rows = await AdCampaign.find({ ...liveFilter(now), product: 'MAP_PIN', house: false, paidUntil: { $gte: now } }).select('store creative target').lean();
  if (!rows.length) return [];
  const near = await CareStore.find({
    _id: { $in: rows.map((c) => c.store) },
    status: 'APPROVED',
    isPaused: false,
    'clinic.enabled': true,
    'rating.avg': { $gte: pl.ratingFloor },
    'rating.count': { $gte: pl.minReviews },
    location: { $geoWithin: { $centerSphere: [[Number(lng), Number(lat)], (pl.radiusKm || 8) / 6378.1] } }
  }).select('name kind location rating').lean();
  const byStore = new Map(near.map((s) => [String(s._id), s]));
  const out = [];
  for (const c of rows.sort(() => Math.random() - 0.5)) {
    if (out.length >= pl.maxAds) break;
    const s = byStore.get(String(c.store));
    if (!s) continue;
    if (city && c.target && c.target.cities && c.target.cities.length && !c.target.cities.some((x) => x.toLowerCase() === String(city).toLowerCase())) continue;
    if (!(await takeView(viewer, c, settings.frequencyCap))) continue;
    out.push(adCard(c, 0, 'MAP_PIN', viewer, {
      store: s._id, name: s.name, kind: s.kind, rating: s.rating,
      lat: s.location.coordinates[1], lng: s.location.coordinates[0]
    }));
    await bumpStat(c._id, 'MAP_PIN', city, { impressions: 1 });
  }
  return out;
}

/** Top banner on a service page. */
async function serviceBanner({ serviceId, city, viewer } = {}) {
  const settings = await settingsService.getAds();
  const pl = settings.placements.SERVICE_BANNER;
  if (!settings.enabled || !pl.enabled || !serviceId) return null;
  const now = new Date();
  const rows = await AdCampaign.find({ ...liveFilter(now), product: 'CATEGORY_BANNER', 'target.services': serviceId, $or: [{ house: true }, { paidUntil: { $gte: now } }] }).lean();
  for (const c of rows) {
    if (!c.house && c.store && !(await CareStore.exists({ _id: c.store, status: 'APPROVED', isPaused: false }))) continue;
    if (!(await takeView(viewer, c, settings.frequencyCap))) continue;
    await bumpStat(c._id, 'SERVICE_BANNER', city, { impressions: 1 });
    return adCard(c, 0, 'SERVICE_BANNER', viewer, { house: c.house, store: c.store });
  }
  return null;
}

/**
 * A click on a sponsored listing. Charged once per viewer per campaign per day
 * (repeat clicks, bots and the advertiser's own account are free).
 */
async function recordClick(token, viewer, { city, userId } = {}) {
  const t = readToken(token);
  if (!t || t.v !== viewer) return { charged: 0, valid: false };
  const campaign = await AdCampaign.findById(t.c);
  if (!campaign) return { charged: 0, valid: false };
  const key = `${viewer}|${campaign._id}|${t.d}`;
  const mark = await AdViewerMark.findOneAndUpdate(
    { key, clickedAt: { $exists: false } },
    { $set: { clickedAt: new Date(), viewer, campaign: campaign._id, store: campaign.store, expiresAt: new Date(Date.now() + 8 * 86400000) } },
    { returnDocument: 'after' }
  );
  const own = userId && String(userId) === String(campaign.owner);
  if (!mark || own || campaign.house || t.pl !== 'SEARCH' || !(t.p > 0)) {
    await bumpStat(campaign._id, t.pl, city, { clicks: 1, ...(mark && !own ? {} : { invalidClicks: 1 }) });
    return { charged: 0, valid: Boolean(mark && !own) };
  }
  const price = round2(t.p);
  const wallet = await AdWallet.findOneAndUpdate({ owner: campaign.owner, balance: { $gte: price }, blocked: { $ne: true } }, { $inc: { balance: -price } }, { returnDocument: 'after' });
  if (!wallet) {
    await AdCampaign.updateOne({ _id: campaign._id, status: 'ACTIVE' }, { $set: { status: 'PAUSED', pausedReason: 'Ad wallet is empty' } });
    await bumpStat(campaign._id, t.pl, city, { clicks: 1, invalidClicks: 1 });
    return { charged: 0, valid: true, paused: true };
  }
  await AdWalletEntry.create({ owner: campaign.owner, type: 'SPEND', amount: -price, campaign: campaign._id, ref: `click:${key}` }).catch(() => undefined);
  const day = today();
  await AdCampaign.updateOne({ _id: campaign._id }, campaign.spend && campaign.spend.day === day
    ? { $inc: { 'spend.total': price, 'spend.today': price } }
    : { $inc: { 'spend.total': price }, $set: { 'spend.day': day, 'spend.today': price } });
  await bumpStat(campaign._id, 'SEARCH', city, { clicks: 1, spend: price });
  return { charged: price, valid: true };
}

/** A booking within 7 days of clicking a shop's ad counts for that ad (once). */
async function attributeBooking(patientId, storeId) {
  try {
    const mark = await AdViewerMark.findOneAndUpdate(
      { viewer: `u:${patientId}`, store: storeId, clickedAt: { $gte: new Date(Date.now() - 7 * 86400000) }, attributed: false },
      { $set: { attributed: true } },
      { sort: { clickedAt: -1 }, returnDocument: 'after' }
    );
    if (mark) await bumpStat(mark.campaign, 'SEARCH', '', { bookings: 1 });
  } catch (err) {
    logger.warn('Ad attribution failed', { error: err.message });
  }
}

// ── Advertiser self-serve ────────────────────────────────────────────────

const BANNED_WORDS = /\b(cure[sd]?|guarantee[sd]?|100%|miracle|permanent(ly)? (cure|relief)|best doctor)\b/i;

function cleanCreative(c = {}) {
  const creative = {
    title: c.title ? String(c.title).trim().slice(0, 60) : undefined,
    subtitle: c.subtitle ? String(c.subtitle).trim().slice(0, 120) : undefined,
    imageUrl: c.imageUrl && /^https:\/\//.test(String(c.imageUrl)) ? String(c.imageUrl).slice(0, 500) : undefined,
    ctaPath: c.ctaPath && /^\/[A-Za-z0-9\-/_?=&.]*$/.test(String(c.ctaPath)) ? String(c.ctaPath).slice(0, 120) : undefined
  };
  if (BANNED_WORDS.test(`${creative.title || ''} ${creative.subtitle || ''}`)) {
    throw new ValidationError('Ads can’t promise cures or guarantees. Describe your service and price instead.');
  }
  return creative;
}

async function walletOf(ownerId) {
  return AdWallet.findOneAndUpdate({ owner: ownerId }, { $setOnInsert: { balance: 0 } }, { upsert: true, returnDocument: 'after' }).lean();
}

async function createCampaign(user, input = {}) {
  const ownerId = user._id || user.id;
  const store = await CareStore.findOne({ owner: ownerId, status: 'APPROVED' }).lean();
  if (!store) throw new ValidationError('Your shop must be approved before you can advertise');
  const settings = await settingsService.getAds();
  const product = String(input.product || 'SPONSORED_LISTING');
  if (!AdCampaign.PRODUCTS.includes(product)) throw new ValidationError('Choose an ad type');
  const startAt = input.startAt ? new Date(input.startAt) : new Date();
  const endAt = input.endAt ? new Date(input.endAt) : new Date(Date.now() + 30 * 86400000);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) throw new ValidationError('Check the start and end dates');
  if (endAt - startAt > 180 * 86400000) throw new ValidationError('Campaigns can run up to 180 days');
  const doc = {
    owner: ownerId,
    store: store._id,
    product,
    kind: store.kind,
    name: String(input.name || `${store.name} ad`).slice(0, 80),
    target: {
      services: (Array.isArray(input.services) ? input.services : []).slice(0, 20),
      cities: (Array.isArray(input.cities) ? input.cities : []).map((c) => String(c).slice(0, 60)).slice(0, 10)
    },
    creative: cleanCreative(input.creative),
    startAt,
    endAt
  };
  if (product === 'SPONSORED_LISTING') {
    const bid = Number(input.bidCpc);
    const daily = Number(input.dailyBudget);
    if (!Number.isFinite(bid) || bid < settings.placements.SEARCH.minCpc || bid > 1000) throw new ValidationError(`Bid at least ₹${settings.placements.SEARCH.minCpc} per click`);
    if (!Number.isFinite(daily) || daily < bid || daily > 1000000) throw new ValidationError('Daily budget must cover at least one click');
    Object.assign(doc, { bidCpc: bid, dailyBudget: daily, totalBudget: Number(input.totalBudget) > 0 ? Number(input.totalBudget) : 0 });
  } else {
    const placementOf = { SPOTLIGHT: 'HOME_SPOTLIGHT', CATEGORY_BANNER: 'SERVICE_BANNER', MAP_PIN: 'MAP_PIN' };
    if (product === 'MAP_PIN' && !(store.clinic && store.clinic.enabled)) throw new ValidationError('Map pins show your clinic or lab on the map. Turn on clinic visits first.');
    const price = settings.placements[placementOf[product]].weeklyPrice;
    doc.weeklyPrice = price;
    if (product === 'CATEGORY_BANNER' && !doc.target.services.length) throw new ValidationError('Pick the service page for the banner');
  }
  const wallet = await walletOf(ownerId);
  if (wallet.blocked) throw new AuthorizationError('Advertising is turned off for this account');
  doc.status = wallet.trusted ? 'ACTIVE' : 'PENDING_REVIEW';
  const campaign = await AdCampaign.create(doc);
  if (doc.status === 'ACTIVE' && product !== 'SPONSORED_LISTING') await chargeWeek(campaign);
  return campaign.toObject();
}

/** Spotlight / banner: take one week from the wallet; no money, no placement. */
async function chargeWeek(campaign) {
  const price = campaign.weeklyPrice || 0;
  const ref = `week:${campaign._id}:${(campaign.paidUntil || campaign.startAt).toISOString().slice(0, 10)}`;
  if (price > 0) {
    const wallet = await AdWallet.findOneAndUpdate({ owner: campaign.owner, balance: { $gte: price } }, { $inc: { balance: -price } }, { returnDocument: 'after' });
    if (!wallet) {
      await AdCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'PAUSED', pausedReason: 'Top up your ad wallet to run this week' } });
      return false;
    }
    await AdWalletEntry.create({ owner: campaign.owner, type: 'SPEND', amount: -price, campaign: campaign._id, ref }).catch(() => undefined);
  }
  const from = campaign.paidUntil && campaign.paidUntil > new Date() ? campaign.paidUntil : new Date();
  await AdCampaign.updateOne({ _id: campaign._id }, { $set: { paidUntil: new Date(from.getTime() + 7 * 86400000) }, $inc: { 'spend.total': price } });
  return true;
}

async function listMyCampaigns(user) {
  const rows = await AdCampaign.find({ owner: user._id || user.id }).sort({ createdAt: -1 }).limit(50).lean();
  const stats = await AdStatDaily.aggregate([
    { $match: { campaign: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: '$campaign', impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' }, spend: { $sum: '$spend' }, bookings: { $sum: '$bookings' } } }
  ]);
  const by = new Map(stats.map((s) => [String(s._id), s]));
  return rows.map((r) => {
    const s = by.get(String(r._id)) || { impressions: 0, clicks: 0, spend: 0, bookings: 0 };
    return { ...r, stats: { ...s, _id: undefined, ctr: s.impressions ? round2((s.clicks / s.impressions) * 100) : 0, costPerBooking: s.bookings ? round2(s.spend / s.bookings) : null } };
  });
}

async function setMyCampaignStatus(user, campaignId, status) {
  if (!['ACTIVE', 'PAUSED', 'ENDED'].includes(status)) throw new ValidationError('Pause, resume or end');
  const c = await AdCampaign.findOne({ _id: campaignId, owner: user._id || user.id });
  if (!c) throw new NotFoundError('Campaign');
  if (['REJECTED', 'ENDED', 'PENDING_REVIEW'].includes(c.status) && status === 'ACTIVE') throw new ConflictError('This campaign can’t be resumed');
  c.status = status;
  c.pausedReason = status === 'PAUSED' ? 'Paused by you' : undefined;
  await c.save();
  return c.toObject();
}

async function myWallet(user) {
  const ownerId = user._id || user.id;
  const wallet = await walletOf(ownerId);
  const entries = await AdWalletEntry.find({ owner: ownerId }).sort({ createdAt: -1 }).limit(50).lean();
  return { balance: round2(wallet.balance), trusted: wallet.trusted, blocked: wallet.blocked, entries };
}

/** Top up with Razorpay (order → verify). Needs the Razorpay keys. */
function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret || process.env.RAZORPAY_ENABLED === 'false') return null;
  return { keyId, keySecret };
}

async function createTopupOrder(user, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 500 || value > 500000) throw new ValidationError('Top up ₹500–₹5,00,000');
  const cfg = razorpayConfig();
  if (!cfg) throw new PaymentError('Online payment isn’t available yet. Contact Nabz to top up.');
  const Razorpay = require('razorpay');
  const order = await new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret }).orders.create({
    amount: Math.round(value * 100), currency: 'INR', receipt: `adtop_${String(user._id || user.id).slice(-8)}_${Date.now()}`.slice(0, 40), notes: { owner: String(user._id || user.id), kind: 'AD_TOPUP' }
  });
  return { orderId: order.id, amount: value, currency: 'INR', keyId: cfg.keyId };
}

async function verifyTopup(user, { orderId, paymentId, signature } = {}) {
  const cfg = razorpayConfig();
  if (!cfg) throw new PaymentError('Online payment isn’t available yet');
  const expected = crypto.createHmac('sha256', cfg.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const given = String(signature || '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) throw new PaymentError('Payment could not be verified');
  const Razorpay = require('razorpay');
  const order = await new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret }).orders.fetch(orderId);
  if (!order || String(order.notes && order.notes.owner) !== String(user._id || user.id)) throw new PaymentError('This payment isn’t for your account');
  return addFunds(user._id || user.id, order.amount / 100, `topup:${paymentId}`, { note: 'Top-up' });
}

/** Credit an ad wallet once per ref (top-ups, refunds of invalid clicks, admin adjustments). */
async function addFunds(ownerId, amount, ref, { type = 'TOPUP', note, by } = {}) {
  const value = round2(amount);
  if (!(Math.abs(value) > 0)) throw new ValidationError('Enter an amount');
  try {
    await AdWalletEntry.create({ owner: ownerId, type, amount: value, ref, note, by });
  } catch (err) {
    if (err && err.code === 11000) return walletOf(ownerId);
    throw err;
  }
  const filter = value < 0 ? { owner: ownerId, balance: { $gte: -value } } : { owner: ownerId };
  const wallet = await AdWallet.findOneAndUpdate(filter, { $inc: { balance: value } }, { upsert: value > 0, returnDocument: 'after' });
  if (!wallet) {
    await AdWalletEntry.deleteOne({ owner: ownerId, ref });
    throw new ValidationError('The wallet doesn’t have that much');
  }
  // Paused for an empty wallet? Resume.
  if (value > 0) await AdCampaign.updateMany({ owner: ownerId, status: 'PAUSED', pausedReason: { $in: ['Ad wallet is empty', 'Top up your ad wallet to run this week'] } }, { $set: { status: 'ACTIVE' }, $unset: { pausedReason: 1 } });
  return wallet.toObject ? wallet.toObject() : wallet;
}

// ── Admin ────────────────────────────────────────────────────────────────

async function adminList({ status } = {}) {
  const filter = status ? { status } : {};
  const rows = await AdCampaign.find(filter).populate('store', 'name kind').populate('owner', 'name email').sort({ createdAt: -1 }).limit(200).lean();
  return rows;
}

async function adminReview(adminId, campaignId, { decision, reason } = {}) {
  if (!['APPROVE', 'REJECT', 'PAUSE', 'RESUME'].includes(decision)) throw new ValidationError('Choose approve, reject, pause or resume');
  const c = await AdCampaign.findById(campaignId);
  if (!c) throw new NotFoundError('Campaign');
  const next = { APPROVE: 'ACTIVE', REJECT: 'REJECTED', PAUSE: 'PAUSED', RESUME: 'ACTIVE' }[decision];
  c.status = next;
  c.review = { by: adminId, at: new Date(), reason: reason ? String(reason).slice(0, 300) : undefined };
  if (decision === 'PAUSE') c.pausedReason = `Paused by Nabz${reason ? `: ${String(reason).slice(0, 150)}` : ''}`;
  await c.save();
  if (decision === 'APPROVE' && c.product !== 'SPONSORED_LISTING' && !c.house) await chargeWeek(c);
  logger.info('Ad campaign reviewed', { campaignId: String(c._id), decision, by: String(adminId) });
  return c.toObject();
}

async function adminCreateHouseAd(adminId, input = {}) {
  const product = input.product === 'CATEGORY_BANNER' ? 'CATEGORY_BANNER' : 'SPOTLIGHT';
  const c = await AdCampaign.create({
    owner: adminId,
    house: true,
    product,
    name: String(input.name || 'Nabz').slice(0, 80),
    target: { services: (input.services || []).slice(0, 20), cities: (input.cities || []).slice(0, 10) },
    creative: cleanCreative(input.creative),
    startAt: input.startAt ? new Date(input.startAt) : new Date(),
    endAt: input.endAt ? new Date(input.endAt) : new Date(Date.now() + 90 * 86400000),
    status: 'ACTIVE'
  });
  return c.toObject();
}

async function adminWalletAdjust(adminId, ownerId, { amount, note, trusted, blocked } = {}) {
  if (trusted !== undefined || blocked !== undefined) {
    await AdWallet.updateOne({ owner: ownerId }, { $set: { ...(trusted !== undefined ? { trusted: Boolean(trusted) } : {}), ...(blocked !== undefined ? { blocked: Boolean(blocked) } : {}) } }, { upsert: true });
  }
  if (amount) await addFunds(ownerId, amount, `admin:${adminId}:${Date.now()}`, { type: 'ADJUST', note: note ? String(note).slice(0, 200) : 'Adjusted by Nabz', by: adminId });
  return walletOf(ownerId);
}

/** Per placement and day: views, clicks, spend, bookings (the admin report). */
async function adminReport({ days = 14 } = {}) {
  const from = careSlotService.addDays(today(), -Math.min(90, Math.max(1, Number(days) || 14)) + 1);
  const rows = await AdStatDaily.aggregate([
    { $match: { date: { $gte: from } } },
    { $group: { _id: { date: '$date', placement: '$placement' }, impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' }, spend: { $sum: '$spend' }, bookings: { $sum: '$bookings' }, invalidClicks: { $sum: '$invalidClicks' } } },
    { $sort: { '_id.date': 1 } }
  ]);
  return rows.map((r) => ({ date: r._id.date, placement: r._id.placement, impressions: r.impressions, clicks: r.clicks, spend: round2(r.spend), bookings: r.bookings, invalidClicks: r.invalidClicks }));
}

/** Weekly renewals for spotlight / banners; end campaigns past their end date. */
async function sweep(now = new Date()) {
  const ended = (await AdCampaign.updateMany({ status: { $in: ['ACTIVE', 'PAUSED'] }, endAt: { $lt: now } }, { $set: { status: 'ENDED' } })).modifiedCount;
  const due = await AdCampaign.find({ status: 'ACTIVE', house: false, product: { $ne: 'SPONSORED_LISTING' }, $or: [{ paidUntil: { $exists: false } }, { paidUntil: { $lte: now } }] }).limit(100);
  let renewed = 0;
  for (const c of due) if (await chargeWeek(c)) renewed += 1;
  return { ended, renewed };
}

module.exports = {
  viewerKey,
  withSponsoredListings,
  spotlight,
  mapPins,
  serviceBanner,
  recordClick,
  attributeBooking,
  createCampaign,
  listMyCampaigns,
  setMyCampaignStatus,
  myWallet,
  createTopupOrder,
  verifyTopup,
  addFunds,
  adminList,
  adminReview,
  adminCreateHouseAd,
  adminWalletAdjust,
  adminReport,
  sweep,
  signToken,
  readToken
};
