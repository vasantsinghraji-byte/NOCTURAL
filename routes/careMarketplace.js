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
  [
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
    res.json({ success: true, stores: await careStoreService.searchStores({ ...req.query, kind: req.query.kind || 'PHYSIO' }) });
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
    res.status(201).json({ success: true, plan: await carePlanService.bookPlan(req.user._id || req.user.id, req.body.quoteId) });
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
  res.json({ success: true, ...((await careStoreService.getMyStore(req.user)) || { store: null, rateCard: [] }) });
}));

router.put('/partner/store', partner, [body('name').optional().isString().isLength({ max: 120 })], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careStoreService.saveMyStore(req.user, req.body)) });
}));

router.put(
  '/partner/store/rate-card/:serviceId',
  partner,
  [
    id('serviceId'),
    body('clinic.price').optional({ values: 'falsy' }).isFloat({ min: 0, max: 1000000 }),
    body('home.price').optional({ values: 'falsy' }).isFloat({ min: 0, max: 1000000 }),
    body('durationMinutes').optional().isInt({ min: 10, max: 480 }),
    body('sessionDiscounts').optional().isArray({ max: 3 })
  ],
  validate,
  wrap(async (req, res) => {
    res.json({ success: true, ...(await careStoreService.upsertRateCardItem(req.user, req.params.serviceId, req.body)) });
  })
);

router.delete('/partner/store/rate-card/:serviceId', partner, [id('serviceId')], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careStoreService.removeRateCardItem(req.user, req.params.serviceId)) });
}));

router.put('/partner/store/pause', partner, [body('paused').isBoolean()], validate, wrap(async (req, res) => {
  res.json({ success: true, ...(await careStoreService.setPaused(req.user, req.body.paused)) });
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
  res.json({ success: true, ...(await careStoreService.removeLeave(req.user, req.params.leaveId)) });
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

module.exports = router;
