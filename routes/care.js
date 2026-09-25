/**
 * Home-care catalog (public): bookable nursing/physio services and the
 * supplies each visit needs, priced from the nearest partner pharmacy.
 * Booking itself stays on /bookings (authenticated).
 */

const express = require('express');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const careSuppliesService = require('../services/careSuppliesService');
const staffAvailabilityService = require('../services/staffAvailabilityService');
const staffDashboardService = require('../services/staffDashboardService');
const homeContentService = require('../services/homeContentService');
const bookingService = require('../services/bookingService');
const { SERVICE_TYPE_TO_CATALOG_NAME } = require('../constants/careServices');

const router = express.Router();

router.get('/services', async (req, res, next) => {
  try {
    const services = await careSuppliesService.listServices();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, services });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/supplies/quote',
  [
    query('serviceType').isIn(Object.keys(SERVICE_TYPE_TO_CATALOG_NAME)).withMessage('Invalid service type'),
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('lat is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('lng is required'),
    query('vendorId').optional().isMongoId()
  ],
  validate,
  async (req, res, next) => {
    try {
      const quote = await careSuppliesService.quoteSupplies({
        serviceType: req.query.serviceType,
        lat: req.query.lat,
        lng: req.query.lng,
        vendorId: req.query.vendorId
      });
      res.json({ success: true, quote });
    } catch (error) {
      next(error);
    }
  }
);

// Customer Home feed: banners (only real offers), packages, popular services.
router.get('/home', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ success: true, ...(await homeContentService.getHome()) });
  } catch (error) {
    next(error);
  }
});

// Family tracking link (public, unguessable token; no contact details exposed).
router.get('/track/:token', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, tracking: await bookingService.getSharedTracking(req.params.token) });
  } catch (error) {
    next(error);
  }
});

// ── Staff "Go online" (Uber-driver style) ──────────────────────────────────
// Customers: how many staff are online nearby (blurred positions, no identities).
router.get(
  '/staff/nearby',
  [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('lat is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('lng is required'),
    query('radiusKm').optional().isFloat({ min: 1, max: 25 })
  ],
  validate,
  async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, ...(await staffAvailabilityService.findNearbyOnline(req.query)) });
    } catch (error) {
      next(error);
    }
  }
);

// Staff app: my online status / go online (+ heartbeat with location) / go offline.
const staffOnly = [protect, authorize(...staffAvailabilityService.STAFF_ROLES)];

router.get('/staff/availability', staffOnly, async (req, res, next) => {
  try {
    res.json({ success: true, availability: await staffAvailabilityService.getAvailability(req.user._id) });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/staff/availability',
  staffOnly,
  [
    body('online').isBoolean().withMessage('online must be true or false'),
    body('lat').if(body('online').equals('true')).isFloat({ min: -90, max: 90 }).withMessage('Location is required to go online'),
    body('lng').if(body('online').equals('true')).isFloat({ min: -180, max: 180 }).withMessage('Location is required to go online')
  ],
  validate,
  async (req, res, next) => {
    try {
      const online = req.body.online === true || req.body.online === 'true';
      const availability = await staffAvailabilityService.setAvailability(req.user._id, { online, lat: req.body.lat, lng: req.body.lng });
      res.json({ success: true, availability });
    } catch (error) {
      next(error);
    }
  }
);

// Partner app dashboard: earnings, visits, demand, current offer.
router.get('/staff/dashboard', staffOnly, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, dashboard: await staffDashboardService.getDashboard(req.user._id) });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/staff/profile',
  staffOnly,
  [
    body('qualification').optional().isString().isLength({ max: 80 }),
    body('languages').optional().isArray({ max: 6 }),
    body('gender').optional().isIn(['FEMALE', 'MALE', 'OTHER']),
    body('bio').optional().isString().isLength({ max: 400 }),
    body('experienceYears').optional().isInt({ min: 0, max: 60 })
  ],
  validate,
  async (req, res, next) => {
    try {
      res.json({ success: true, profile: await staffDashboardService.updateProfile(req.user._id, req.body) });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
