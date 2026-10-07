/**
 * Care marketplace (/api/v1/marketplace): physios and labs as shops with their
 * own rate cards. See docs/product/PROVIDER_MARKETPLACE_PLAN.md.
 *
 *   public    browse services, compare shops, a shop's menu and free times
 *   patient   quote → book a plan → pay / move / change address / cancel
 *   partner   my shop, rate card, pause, leave, my plans
 *   admin     approve / suspend shops, approve an out-of-band price, strikes
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize, requireRecentAuth } = require('../middleware/auth');
const { protectBoth } = require('../middleware/patientAuth');
const idempotency = require('../middleware/idempotency');
const careStoreService = require('../services/careStoreService');
const carePlanService = require('../services/carePlanService');
const labOrderService = require('../services/labOrderService');
const walletService = require('../services/walletService');
const adService = require('../services/adService');
const careAdminService = require('../services/careAdminService');
const settingsService = require('../services/settingsService');
const storageConfig = require('../config/storage');
const { uploadLabReport } = require('../middleware/upload');
const { STORE_KINDS } = require('../constants/marketplace');

const router = express.Router();
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

const patient = [protectBoth, authorize('patient')];
const partner = [protect, authorize('physiotherapist', 'nurse', 'medical_staff', 'lab_partner')];
const admin = [protect, authorize('platform_admin')];
const adminSensitive = [...admin, requireRecentAuth];
const id = (name) => param(name).isMongoId().withMessage('Not found');
const latLng = [
  query('lat').optional().isFloat({ min: -90, max: 90 }),
  query('lng').optional().isFloat({ min: -180, max: 180 })
];

// ── Public ───────────────────────────────────────────────────────────────

router.get('/services', [query('kind').optional().isIn(STORE_KINDS)], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ success: true, services: await careStoreService.listMarketplaceServices(req.query.kind || 'PHYSIO') });
}));

router.get(
  '/stores',
  (req, res, next) => (req.headers.authorization ? protectBoth(req, { status: () => ({ json: () => next() }) }, next) : next()),
  [
    query('city').optional().isString().isLength({ max: 60 }),
    query('kind').optional().isIn(STORE_KINDS),
    query('serviceId').optional().isMongoId(),
    query('mode').optional().isIn(['HOME', 'CLINIC']),
    query('sort').optional().isIn(['recommended', 'price', 'distance', 'rating']),
    query('gender').optional().isIn(['FEMALE', 'MALE']),
    query('language').optional().isString().isLength({ max: 30 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    ...latLng
  ],
  validate,
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const kind = req.query.kind || 'PHYSIO';
    const organic = await careStoreService.searchStores({ ...req.query, kind });
    const stores = await adService.withSponsoredListings(organic, { kind, serviceId: req.query.serviceId, city: req.query.city, viewer: adService.viewerKey(req) });
    res.json({ success: true, stores });
  })
);

router.get('/stores/:id', [id('id'), ...latLng], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, store: await careStoreService.getStorePublic(req.params.id, req.query) });
}));

router.get(
  '/stores/:id/slots',
  [id('id'), query('serviceId').isMongoId(), query('mode').isIn(['HOME', 'CLINIC']), query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/), query('days').optional().isInt({ min: 1, max: 31 })],
  validate,
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...(await careStoreService.getStoreSlots(req.params.id, req.query)) });
  })
);

// ── Patient ──────────────────────────────────────────────────────────────

const quoteValidation = [
  body('storeId').isMongoId().withMessage('Choose a provider'),
  body('serviceId').isMongoId().withMessage('Choose a service'),
  body('mode').isIn(['HOME', 'CLINIC']).withMessage('Choose home or clinic'),
  body('sessions').isInt({ min: 1, max: 100 }).withMessage('Choose the number of sessions'),
  body('paymentMode').optional().isIn(['PREPAID', 'PER_SESSION']),
  body('schedule.startDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Pick a start date'),
  body('schedule.time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Pick a time'),
  body('schedule.weekdays').optional().isArray({ max: 7 }),
  body('schedule.weekdays.*').optional().isInt({ min: 0, max: 6 }),
  body('addressId').optional().isMongoId(),
  body('address.street').optional().isString().isLength({ max: 200 }),
  body('address.city').optional().isString().isLength({ max: 80 }),
  body('address.pincode').optional().matches(/^\d{6}$/).withMessage('Enter a 6-digit pincode'),
  body('address.coordinates.lat').optional().isFloat({ min: -90, max: 90 }),
  body('address.coordinates.lng').optional().isFloat({ min: -180, max: 180 }),
  body('patientDetails.name').optional().isString().isLength({ max: 120 }),
  body('patientDetails.age').optional().isInt({ min: 0, max: 150 }),
  body('patientDetails.gender').optional().isIn(['Male', 'Female', 'Other'])
];

router.post('/quotes', patient, quoteValidation, validate, wrap(async (req, res) => {
  res.status(201).json({ success: true, quote: await carePlanService.createQuote(req.user._id || req.user.id, req.body) });
}));

router.post(
  '/plans',
  patient,
  [body('quoteId').isMongoId().withMessage('Get a price first')],
  validate,
  idempotency({ route: 'marketplace/plans' }),
  wrap(async (req, res) => {
    const pid = req.user._id || req.user.id;
    const plan = await carePlanService.bookPlan(pid, req.body.quoteId);
    if (plan && plan.store) adService.attributeBooking(pid, plan.store._id || plan.store).catch(() => undefined);
    res.status(201).json({ success: true, plan });
  })
);

router.get('/plans', patient, wrap(async (req, res) => {
  res.json({ success: true, plans: await carePlanService.listMyPlans(req.user._id || req.user.id) });
}));

router.get('/plans/:id', patient, [id('id')], validate, wrap(async (req, res) => {
  res.json({ success: true, plan: await carePlanService.getPlan(req.user._id || req.user.id, req.params.id) });
}));

router.post('/plans/:id/cancel', patient, [id('id'), body('reason').optional().isString().isLength({ max: 300 })], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await carePlanService.cancelPlan(req.user._id || req.user.id, req.params.id, req.body.reason || undefined)) });
}));

router.post('/plans/:id/payment/order', patient, [id('id')], validate, wrap(async (req, res) => {
  res.json({ success: true, order: await carePlanService.createPaymentOrder(req.user._id || req.user.id, req.params.id) });
}));

router.post(
  '/plans/:id/payment/verify',
  patient,
  [id('id'), body('orderId').isString().isLength({ max: 100 }), body('paymentId').isString().isLength({ max: 100 }), body('signature').isString().isLength({ max: 200 })],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, plan: await carePlanService.verifyPayment(req.user._id || req.user.id, req.params.id, req.body) });
  })
);

router.put(
  '/sessions/:bookingId/schedule',
  patient,
  [id('bookingId'), body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Pick a date'), body('time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Pick a time')],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, session: await carePlanService.rescheduleSession(req.user._id || req.user.id, req.params.bookingId, req.body) });
  })
);

router.put(
  '/sessions/:bookingId/address',
  patient,
  [id('bookingId'), body('addressId').optional().isMongoId(), body('allUpcoming').optional().isBoolean(), body('address.pincode').optional().matches(/^\d{6}$/)],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, ...(await carePlanService.changeSessionAddress(req.user._id || req.user.id, req.params.bookingId, req.body)) });
  })
);

router.post(
  '/sessions/:bookingId/report',
  patient,
  [id('bookingId'), body('kind').isIn(['EXTRA_CASH', 'NO_SHOW', 'OTHER']), body('note').optional().isString().isLength({ max: 300 })],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, ...(await carePlanService.reportProblem(req.user._id || req.user.id, req.params.bookingId, req.body)) });
  })
);

// ── Partner ──────────────────────────────────────────────────────────────

router.get('/partner/store', partner, wrap(async (req, res) => {
  res.json({ success: true, kinds: careStoreService.kindsForRole(req.user.role), ...((await careStoreService.getMyStore(req.user, req.query.kind)) || { store: null, rateCard: [] }) });
}));

router.put('/partner/store', partner, [body('name').optional().isString().isLength({ max: 120 }), body('kind').optional().isIn(STORE_KINDS)], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careStoreService.saveMyStore(req.user, req.body)) });
}));

router.put(
  '/partner/store/rate-card/:serviceId',
  partner,
  [
    id('serviceId'),
    body('clinic.price').optional({ values: 'falsy' }).isFloat({ min: 0, max: 1000000 }),
    body('home.price').optional({ values: 'falsy' }).isFloat({ min: 0, max: 1000000 }),
    body('durationMinutes').optional().isInt({ min: 10, max: 1440 }),
    body('sessionDiscounts').optional().isArray({ max: 3 })
  ],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, ...(await careStoreService.upsertRateCardItem(req.user, req.params.serviceId, req.body)) });
  })
);

router.delete('/partner/store/rate-card/:serviceId', partner, [id('serviceId')], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careStoreService.removeRateCardItem(req.user, req.params.serviceId, req.query.kind)) });
}));

router.put('/partner/store/pause', partner, [body('paused').isBoolean()], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careStoreService.setPaused(req.user, req.body.paused, req.body.kind)) });
}));

router.post(
  '/partner/store/leave',
  partner,
  [body('from').matches(/^\d{4}-\d{2}-\d{2}$/), body('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/), body('reason').optional().isString().isLength({ max: 120 })],
  validate,
  wrap(async (req, res) => {
    res.status(201).json({ success: true, ...(await careStoreService.addLeave(req.user, req.body)) });
  })
);

router.delete('/partner/store/leave/:leaveId', partner, [id('leaveId')], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careStoreService.removeLeave(req.user, req.params.leaveId, req.query.kind)) });
}));

router.get('/partner/plans', partner, wrap(async (req, res) => {
  res.json({ success: true, plans: await carePlanService.listStorePlans(req.user) });
}));

// ── Admin ────────────────────────────────────────────────────────────────

router.get(
  '/admin/stores',
  admin,
  [query('status').optional().isIn(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']), query('kind').optional().isIn(STORE_KINDS)],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, stores: await careStoreService.adminListStores(req.query) });
  })
);

router.put(
  '/admin/stores/:id/status',
  adminSensitive,
  [id('id'), body('status').isIn(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']), body('reason').optional().isString().isLength({ max: 300 })],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, ...(await careStoreService.adminSetStatus(req.user._id, req.params.id, req.body.status, req.body.reason)) });
  })
);

router.put(
  '/admin/rate-cards/:id/price-approval',
  adminSensitive,
  [id('id'), body('min').isFloat({ min: 1 }), body('max').isFloat({ min: 1 })],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, item: await careStoreService.adminApprovePrice(req.user._id, req.params.id, req.body) });
  })
);

router.post(
  '/admin/stores/:id/strikes',
  adminSensitive,
  [id('id'), body('reason').isString().isLength({ min: 3, max: 200 }), body('bookingId').optional().isMongoId()],
  validate,
  wrap(async (req, res) => {
    res.status(201).json({ success: true, ...(await careStoreService.addStrike(req.params.id, req.body.reason, req.body.bookingId)) });
  })
);

// ── Customer home, ads, wallet, plan suggestions ─────────────────────────

// Signed-in customers are recognised (ads frequency cap and booking credit),
// anyone else browses anonymously; a bad or expired token never blocks browsing.
const optionalUser = (req, res, next) => {
  if (!req.headers.authorization && !(req.cookies && Object.keys(req.cookies).length)) return next();
  return protectBoth(req, { status: () => ({ json: () => next() }) }, next);
};

router.get('/home', optionalUser, [query('city').optional().isString().isLength({ max: 60 })], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const viewer = adService.viewerKey(req);
  const [spotlight, physio, homecare, labs] = await Promise.all([
    adService.spotlight({ city: req.query.city, viewer }),
    careStoreService.listMarketplaceServices('PHYSIO'),
    careStoreService.listMarketplaceServices('HOMECARE'),
    careStoreService.listMarketplaceServices('LAB')
  ]);
  res.json({ success: true, spotlight, physio: physio.slice(0, 8), homecare: homecare.slice(0, 8), labs: labs.slice(0, 8) });
}));

router.get('/services/:id/banner', optionalUser, [id('id'), query('city').optional().isString().isLength({ max: 60 })], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, banner: await adService.serviceBanner({ serviceId: req.params.id, city: req.query.city, viewer: adService.viewerKey(req) }) });
}));

router.post('/ads/click', optionalUser, [body('token').isString().isLength({ max: 600 }), body('city').optional().isString().isLength({ max: 60 })], validate, wrap(async (req, res) => {
  const out = await adService.recordClick(req.body.token, adService.viewerKey(req), { city: req.body.city, userId: req.user && (req.user._id || req.user.id) });
  res.json({ success: true, valid: out.valid });
}));

router.get('/wallet', patient, wrap(async (req, res) => {
  const pid = req.user._id || req.user.id;
  res.json({ success: true, balance: await walletService.balance(pid), entries: await walletService.history(pid) });
}));

router.get('/proposals', patient, wrap(async (req, res) => {
  res.json({ success: true, proposals: await carePlanService.listMyProposals(req.user._id || req.user.id) });
}));

router.post('/proposals/:id/decline', patient, [id('id')], validate, wrap(async (req, res) => {
  res.json({ success: true, proposal: await carePlanService.declineProposal(req.user._id || req.user.id, req.params.id) });
}));

// ── Labs ─────────────────────────────────────────────────────────────────

const serviceIdsQuery = query('serviceIds').isString().isLength({ max: 800 }).withMessage('Choose tests');
const splitIds = (s) => String(s || '').split(',').map((x) => x.trim()).filter((x) => /^[a-f0-9]{24}$/i.test(x));

router.get('/labs/compare', [serviceIdsQuery, query('mode').optional().isIn(['HOME', 'CLINIC']), ...latLng], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, labs: await labOrderService.compareLabs({ ...req.query, serviceIds: splitIds(req.query.serviceIds) }) });
}));

router.get('/labs/:id/menu', [id('id')], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ success: true, tests: await labOrderService.labMenu(req.params.id) });
}));

const labOrderValidation = [
  body('storeId').isMongoId().withMessage('Choose a lab'),
  body('serviceIds').isArray({ min: 1, max: 30 }).withMessage('Choose tests'),
  body('serviceIds.*').isMongoId(),
  body('mode').isIn(['HOME', 'CLINIC']).withMessage('Home collection or lab visit'),
  body('slot.date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Pick a date'),
  body('slot.time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Pick a time'),
  body('addressId').optional().isMongoId(),
  body('address.pincode').optional().matches(/^\d{6}$/),
  body('paymentMode').optional().isIn(['PREPAID', 'PAY_AT_COLLECTION']),
  body('prescriptionKey').optional().isString().isLength({ max: 300 }),
  body('patientDetails.name').optional().isString().isLength({ max: 120 })
];

router.post('/labs/quote', patient, labOrderValidation, validate, wrap(async (req, res) => {
  res.json({ success: true, quote: await labOrderService.quoteLabOrder(req.user._id || req.user.id, req.body) });
}));

router.post('/labs/orders', patient, [...labOrderValidation, body('expectedTotal').optional().isFloat({ min: 0 })], validate, idempotency({ route: 'marketplace/labs/orders' }), wrap(async (req, res) => {
  const pid = req.user._id || req.user.id;
  const order = await labOrderService.bookLabOrder(pid, req.body);
  adService.attributeBooking(pid, req.body.storeId).catch(() => undefined);
  res.status(201).json({ success: true, order });
}));

router.get('/labs/orders', patient, wrap(async (req, res) => {
  res.json({ success: true, orders: await labOrderService.listMyLabOrders(req.user._id || req.user.id) });
}));

router.get('/labs/orders/:id', patient, [id('id')], validate, wrap(async (req, res) => {
  res.json({ success: true, order: await labOrderService.getMyLabOrder(req.user._id || req.user.id, req.params.id) });
}));

router.post('/labs/orders/:id/cancel', patient, [id('id'), body('reason').optional().isString().isLength({ max: 200 })], validate, wrap(async (req, res) => {
  res.json({ success: true, order: await labOrderService.cancelLabOrder(req.user._id || req.user.id, req.params.id, req.body.reason || undefined) });
}));

const slotBody = [body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Pick a date'), body('time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Pick a time')];

router.put('/labs/orders/:id/schedule', patient, [id('id'), ...slotBody], validate, wrap(async (req, res) => {
  res.json({ success: true, order: await labOrderService.rescheduleLabOrder(req.user._id || req.user.id, req.params.id, req.body) });
}));

router.post('/labs/orders/:id/recollect', patient, [id('id'), ...slotBody], validate, wrap(async (req, res) => {
  res.status(201).json({ success: true, order: await labOrderService.bookRecollection(req.user._id || req.user.id, req.params.id, req.body) });
}));

router.get('/labs/orders/:id/report', patient, [id('id')], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...(await labOrderService.reportLink(req.user._id || req.user.id, req.params.id)) });
}));

// ── Partner: team, offers, proposals, lab orders, ads ────────────────────

const kindQuery = query('kind').optional().isIn(STORE_KINDS);

router.get('/partner/team', partner, [kindQuery], validate, wrap(async (req, res) => {
  res.json({ success: true, members: await careStoreService.getTeam(req.user, req.query.kind) });
}));

router.post('/partner/team', partner, [body('phone').optional().isString().isLength({ max: 15 }), body('email').optional().isEmail(), body('kind').optional().isIn(STORE_KINDS)], validate, wrap(async (req, res) => {
  res.status(201).json({ success: true, ...(await careStoreService.addMember(req.user, req.body)) });
}));

router.delete('/partner/team/:userId', partner, [id('userId'), kindQuery], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careStoreService.removeMember(req.user, req.params.userId, req.query.kind)) });
}));

router.put(
  '/partner/store/rate-card/:serviceId/offer',
  partner,
  [id('serviceId'), body('percent').isFloat({ min: 5, max: 50 }), body('maxDiscount').isFloat({ min: 1, max: 5000 }), body('kind').optional().isIn(STORE_KINDS)],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, item: await careStoreService.setOffer(req.user, req.params.serviceId, req.body) });
  })
);

router.delete('/partner/store/rate-card/:serviceId/offer', partner, [id('serviceId'), kindQuery], validate, wrap(async (req, res) => {
  res.json({ success: true, item: await careStoreService.removeOffer(req.user, req.params.serviceId, req.query.kind) });
}));

router.post(
  '/partner/visits/:bookingId/proposal',
  partner,
  [id('bookingId'), body('serviceId').isMongoId(), body('mode').isIn(['HOME', 'CLINIC']), body('sessions').isInt({ min: 1, max: 100 }), body('sessionsPerWeek').optional().isInt({ min: 1, max: 7 }), body('note').optional().isString().isLength({ max: 500 })],
  validate,
  wrap(async (req, res) => {
    res.status(201).json({ success: true, proposal: await carePlanService.createProposal(req.user, req.params.bookingId, req.body) });
  })
);

router.get('/partner/proposals', partner, wrap(async (req, res) => {
  res.json({ success: true, proposals: await carePlanService.listStoreProposals(req.user) });
}));

const labStaff = [protect, authorize('lab_partner', 'phlebotomist')];

router.get('/partner/lab/orders', labStaff, [query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/), query('status').optional().isString().isLength({ max: 20 })], validate, wrap(async (req, res) => {
  res.json({ success: true, orders: await labOrderService.listLabOrdersForLab(req.user, req.query) });
}));

router.post(
  '/partner/lab/orders/:id/collect',
  labStaff,
  [id('id'), body('code').optional().isString().isLength({ max: 8 }), body('paidAmount').optional().isFloat({ min: 0, max: 1000000 }), body('method').optional().isIn(['CASH', 'UPI'])],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, order: await labOrderService.markCollected(req.user, req.params.id, req.body) });
  })
);

router.post('/partner/lab/orders/:id/status', labStaff, [id('id'), body('status').isIn(['AT_LAB', 'PROCESSING'])], validate, wrap(async (req, res) => {
  res.json({ success: true, order: await labOrderService.advance(req.user, req.params.id, req.body.status) });
}));

router.post('/partner/lab/orders/:id/report', labStaff, [id('id')], validate, uploadLabReport, wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Attach the report (PDF or image)' });
  return res.json({ success: true, order: await labOrderService.uploadReport(req.user, req.params.id, storageConfig.toStoredFile(req.file)) });
}));

router.post('/partner/lab/orders/:id/reject', labStaff, [id('id'), body('reason').isString().isLength({ min: 3, max: 200 })], validate, wrap(async (req, res) => {
  res.json({ success: true, order: await labOrderService.rejectSample(req.user, req.params.id, req.body.reason) });
}));

router.get('/partner/ads', partner, wrap(async (req, res) => {
  res.json({ success: true, campaigns: await adService.listMyCampaigns(req.user), wallet: await adService.myWallet(req.user) });
}));

router.post(
  '/partner/ads',
  partner,
  [
    body('product').isIn(['SPONSORED_LISTING', 'SPOTLIGHT', 'CATEGORY_BANNER']),
    body('name').optional().isString().isLength({ max: 80 }),
    body('bidCpc').optional().isFloat({ min: 0, max: 1000 }),
    body('dailyBudget').optional().isFloat({ min: 0, max: 1000000 }),
    body('totalBudget').optional().isFloat({ min: 0, max: 10000000 }),
    body('services').optional().isArray({ max: 20 }),
    body('services.*').optional().isMongoId(),
    body('cities').optional().isArray({ max: 10 }),
    body('startAt').optional().isISO8601(),
    body('endAt').optional().isISO8601()
  ],
  validate,
  wrap(async (req, res) => {
    res.status(201).json({ success: true, campaign: await adService.createCampaign(req.user, req.body) });
  })
);

router.put('/partner/ads/:id/status', partner, [id('id'), body('status').isIn(['ACTIVE', 'PAUSED', 'ENDED'])], validate, wrap(async (req, res) => {
  res.json({ success: true, campaign: await adService.setMyCampaignStatus(req.user, req.params.id, req.body.status) });
}));

router.post('/partner/ads/wallet/order', partner, [body('amount').isFloat({ min: 500, max: 500000 })], validate, wrap(async (req, res) => {
  res.json({ success: true, order: await adService.createTopupOrder(req.user, req.body.amount) });
}));

router.post('/partner/ads/wallet/verify', partner, [body('orderId').isString().isLength({ max: 100 }), body('paymentId').isString().isLength({ max: 100 }), body('signature').isString().isLength({ max: 200 })], validate, wrap(async (req, res) => {
  res.json({ success: true, wallet: await adService.verifyTopup(req.user, req.body) });
}));

// ── Admin: queues, catalog, offers, credit, ads, settings ────────────────

router.get('/admin/overview', admin, wrap(async (req, res) => {
  res.json({ success: true, overview: await careAdminService.overview() });
}));

router.get('/admin/refunds', admin, wrap(async (req, res) => {
  res.json({ success: true, refunds: await careAdminService.refundQueue() });
}));

router.post('/admin/refunds', adminSensitive, [body('type').isIn(['PLAN', 'LAB']), body('id').isMongoId(), body('reference').optional().isString().isLength({ max: 80 })], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careAdminService.processRefund(req.user._id, req.body)) });
}));

router.get('/admin/reports', admin, wrap(async (req, res) => {
  res.json({ success: true, reports: await careAdminService.reportQueue() });
}));

router.post('/admin/reports/:bookingId/resolve', adminSensitive, [id('bookingId'), body('outcome').isIn(['NO_SHOW', 'EXTRA_CASH', 'DISMISS']), body('note').optional().isString().isLength({ max: 200 })], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await carePlanService.resolveReport(req.user._id, req.params.bookingId, req.body)) });
}));

router.get('/admin/needs-action', admin, wrap(async (req, res) => {
  res.json({ success: true, sessions: await careAdminService.needsActionQueue() });
}));

router.get('/admin/sessions', admin, [query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/)], validate, wrap(async (req, res) => {
  res.json({ success: true, sessions: await careAdminService.sessionsBoard(req.query.date) });
}));

router.get('/admin/lab-orders', admin, [query('status').optional().isString().isLength({ max: 20 }), query('late').optional().isIn(['true', 'false'])], validate, wrap(async (req, res) => {
  res.json({ success: true, orders: await careAdminService.labBoard(req.query) });
}));

router.get('/admin/catalog', admin, [kindQuery], validate, wrap(async (req, res) => {
  res.json({ success: true, services: await careAdminService.catalogList(req.query.kind) });
}));

const catalogBody = [
  body('kind').optional().isIn(STORE_KINDS),
  body('displayName').optional().isString().isLength({ max: 100 }),
  body('priceFloor').isFloat({ min: 1, max: 1000000 }),
  body('priceCeiling').isFloat({ min: 1, max: 1000000 }),
  body('defaultDurationMinutes').optional().isInt({ min: 10, max: 1440 }),
  body('tests').optional().isArray({ max: 80 }),
  body('tests.*').optional().isMongoId()
];

router.post('/admin/catalog', adminSensitive, catalogBody, validate, wrap(async (req, res) => {
  res.status(201).json({ success: true, service: await careAdminService.catalogCreate(req.user._id, req.body) });
}));

router.put('/admin/catalog/:id', adminSensitive, [id('id'), ...catalogBody], validate, wrap(async (req, res) => {
  res.json({ success: true, service: await careAdminService.catalogUpdate(req.user._id, req.params.id, req.body) });
}));

router.get('/admin/offers', admin, [query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED'])], validate, wrap(async (req, res) => {
  res.json({ success: true, offers: await careStoreService.adminListOffers(req.query.status || 'PENDING') });
}));

router.put('/admin/offers/:itemId', adminSensitive, [id('itemId'), body('decision').isIn(['APPROVED', 'REJECTED']), body('reason').optional().isString().isLength({ max: 200 })], validate, wrap(async (req, res) => {
  res.json({ success: true, item: await careStoreService.adminReviewOffer(req.user._id, req.params.itemId, req.body) });
}));

router.post('/admin/customers/:patientId/credit', adminSensitive, [id('patientId'), body('amount').isFloat({ min: 1, max: 5000 }), body('reason').isString().isLength({ min: 5, max: 200 })], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careAdminService.giveCredit(req.user._id, req.params.patientId, req.body)) });
}));

router.get('/admin/ads', admin, [query('status').optional().isIn(['PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'ENDED'])], validate, wrap(async (req, res) => {
  res.json({ success: true, campaigns: await adService.adminList(req.query), report: await adService.adminReport({ days: 14 }) });
}));

router.put('/admin/ads/:id', adminSensitive, [id('id'), body('decision').isIn(['APPROVE', 'REJECT', 'PAUSE', 'RESUME']), body('reason').optional().isString().isLength({ max: 300 })], validate, wrap(async (req, res) => {
  res.json({ success: true, campaign: await adService.adminReview(req.user._id, req.params.id, req.body) });
}));

router.post(
  '/admin/ads/house',
  adminSensitive,
  [body('product').optional().isIn(['SPOTLIGHT', 'CATEGORY_BANNER']), body('name').isString().isLength({ min: 2, max: 80 }), body('creative.title').isString().isLength({ min: 2, max: 60 }), body('services').optional().isArray({ max: 20 })],
  validate,
  wrap(async (req, res) => {
    res.status(201).json({ success: true, campaign: await adService.adminCreateHouseAd(req.user._id, req.body) });
  })
);

router.put('/admin/ads/wallets/:ownerId', adminSensitive, [id('ownerId'), body('amount').optional().isFloat({ min: -100000, max: 100000 }), body('trusted').optional().isBoolean(), body('blocked').optional().isBoolean(), body('note').optional().isString().isLength({ max: 200 })], validate, wrap(async (req, res) => {
  res.json({ success: true, wallet: await adService.adminWalletAdjust(req.user._id, req.params.ownerId, req.body) });
}));

router.get('/admin/settings', admin, wrap(async (req, res) => {
  res.json({ success: true, ...(await settingsService.describe()), history: await settingsService.history(30) });
}));

router.post('/admin/settings', adminSensitive, [body('key').isIn(['revenue', 'ads']), body('changes').optional().isObject(), body('blockedCities').optional().isArray({ max: 50 }), body('reason').isString().isLength({ min: 5, max: 300 })], validate, wrap(async (req, res) => {
  res.status(201).json({ success: true, change: await settingsService.propose(req.user._id, req.body) });
}));

router.put('/admin/settings/:id', adminSensitive, [id('id'), body('decision').isIn(['APPROVE', 'REJECT']), body('note').optional().isString().isLength({ max: 300 })], validate, wrap(async (req, res) => {
  res.json({ success: true, change: await settingsService.review(req.user._id, req.params.id, req.body) });
}));

module.exports = router;
