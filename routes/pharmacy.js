/**
 * Pharmacy Marketplace Routes  (mounted at /api/v1/pharmacy)
 *
 * Public browse (storefront SSR) · patient orders · vendor dashboard · admin.
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize, requireRecentAuth } = require('../middleware/auth');
const { protectPatient } = require('../middleware/patientAuth');
const idempotency = require('../middleware/idempotency');
const { uploadPrescription } = require('../middleware/upload');
const {
  PHARMACY_ORDER_STATUSES,
  PHARMACY_VENDOR_STATUSES,
  MEDICINE_FORMS,
  MEDICINE_SCHEDULE_TYPES,
  MEDICINE_CATEGORIES,
  ZONE_STRESS_LEVELS
} = require('../constants/enums');
const ctrl = require('../controllers/pharmacyController');

// ── Validation ────────────────────────────────────────────────────────────

const nearbyValidation = [
  query('lat').notEmpty().withMessage('lat is required').isFloat({ min: -90, max: 90 }),
  query('lng').notEmpty().withMessage('lng is required').isFloat({ min: -180, max: 180 }),
  query('radiusKm').optional().isFloat({ min: 0.5, max: 50 })
];

const createOrderValidation = [
  body('vendorId').notEmpty().isMongoId().withMessage('Valid vendorId is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.medicineId').isMongoId().withMessage('Each item needs a valid medicineId'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Each item needs quantity >= 1'),
  body('deliveryAddress.line1').trim().notEmpty().withMessage('Delivery address line1 is required'),
  body('deliveryAddress.pincode').trim().matches(/^\d{6}$/).withMessage('Valid 6-digit pincode required'),
  body('prescriptionKey').optional().isString().trim().isLength({ min: 1, max: 512 }).withMessage('prescriptionKey must be the key returned by POST /prescriptions'),
  body('paymentMode').optional().isIn(['PREPAID', 'COD'])
];

const orderStatusValidation = [
  body('status').notEmpty().isIn(PHARMACY_ORDER_STATUSES).withMessage('Invalid order status'),
  body('note').optional().trim().isLength({ max: 500 })
];

const inventoryValidation = [
  body('medicineId').notEmpty().isMongoId().withMessage('Valid medicineId is required'),
  body('mrp').notEmpty().isFloat({ min: 0 }),
  body('sellingPrice').notEmpty().isFloat({ min: 0 }),
  body('stockQty').optional().isInt({ min: 0 }),
  body('isAvailable').optional().isBoolean()
];

const medicineValidation = [
  body('name').trim().notEmpty().withMessage('Medicine name is required'),
  body('form').optional().isIn(MEDICINE_FORMS),
  body('scheduleType').optional().isIn(MEDICINE_SCHEDULE_TYPES),
  body('category').optional().isIn(MEDICINE_CATEGORIES),
  body('referenceMrp').optional().isFloat({ min: 0 })
];

const verifyPaymentValidation = [
  body('razorpay_order_id').isString().trim().notEmpty().withMessage('razorpay_order_id is required'),
  body('razorpay_payment_id').isString().trim().notEmpty().withMessage('razorpay_payment_id is required'),
  body('razorpay_signature').isString().trim().notEmpty().withMessage('razorpay_signature is required')
];

const paymentFailureValidation = [
  body('reason').optional().isString().trim().isLength({ max: 300 })
];

const vendorStatusValidation = [
  body('status').notEmpty().isIn(PHARMACY_VENDOR_STATUSES).withMessage('Invalid vendor status')
];

const zoneBoundaryValidation = (field) => [
  body(`${field}.type`).isIn(['Polygon', 'MultiPolygon']).withMessage('boundary must be a GeoJSON Polygon or MultiPolygon'),
  body(`${field}.coordinates`).isArray({ min: 1 }).withMessage('boundary.coordinates must be an array of rings')
];

const createZoneValidation = [
  body('code').trim().matches(/^[A-Za-z0-9_-]{2,40}$/).withMessage('code: 2-40 chars A-Z, 0-9, _ or -'),
  body('name').trim().notEmpty().isLength({ max: 120 }),
  body('city').trim().notEmpty(),
  ...zoneBoundaryValidation('boundary'),
  body('maxLastMileKm').optional().isFloat({ min: 0.5, max: 50 })
];

const updateZoneValidation = [
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('isActive').optional().isBoolean(),
  body('maxLastMileKm').optional().isFloat({ min: 0.5, max: 50 }),
  body('stress.level').optional().isIn(ZONE_STRESS_LEVELS),
  body('stress.radiusMultiplier').optional().isFloat({ min: 0.1, max: 1 }),
  body('stress.reason').optional().isString().isLength({ max: 200 }),
  body('stress.until').optional().isISO8601(),
  body('boundary').optional().isObject(),
  body('boundary.type').optional().isIn(['Polygon', 'MultiPolygon'])
];

const mongoIdParam = (name) => [param(name).isMongoId().withMessage(`Invalid ${name}`)];

// ══ Public browse (no auth — powers storefront SSR) ═══════════════════════

router.get('/vendors/nearby', nearbyValidation, validate, ctrl.getNearbyVendors);
router.get('/medicines/search', ctrl.searchMedicines);
router.get('/vendors/:vendorId', mongoIdParam('vendorId'), validate, ctrl.getVendorStorefront);
// Whether online payment is available + the publishable Razorpay key id.
router.get('/payment-options', ctrl.getPaymentOptions);

// ══ Vendor dashboard (role: pharmacy_vendor) ══════════════════════════════

router.get('/vendor/orders', protect, authorize('pharmacy_vendor'), ctrl.listVendorOrders);
router.get('/vendor/orders/:id', protect, authorize('pharmacy_vendor'), mongoIdParam('id'), validate, ctrl.getOrder);
router.get('/vendor/orders/:id/prescription', protect, authorize('pharmacy_vendor'), mongoIdParam('id'), validate, ctrl.getPrescription);
router.patch('/vendor/orders/:id/status', protect, authorize('pharmacy_vendor'), mongoIdParam('id'), orderStatusValidation, validate, ctrl.updateOrderStatus);
router.get('/vendor/inventory', protect, authorize('pharmacy_vendor'), ctrl.listInventory);
router.put('/vendor/inventory', protect, authorize('pharmacy_vendor'), inventoryValidation, validate, ctrl.upsertInventory);
router.patch('/vendor/profile', protect, authorize('pharmacy_vendor'), ctrl.updateVendorProfile);

// ══ Admin (role: admin / platform_admin) ══════════════════════════════════

router.get('/admin/vendors', protect, authorize('admin', 'platform_admin'), ctrl.adminListVendors);
router.post('/admin/vendors', protect, authorize('admin', 'platform_admin'), requireRecentAuth, ctrl.adminCreateVendor);
router.patch('/admin/vendors/:id/status', protect, authorize('admin', 'platform_admin'), requireRecentAuth, mongoIdParam('id'), vendorStatusValidation, validate, ctrl.adminSetVendorStatus);
router.get('/admin/orders/:id/prescription', protect, authorize('admin', 'platform_admin'), mongoIdParam('id'), validate, ctrl.getPrescription);
router.get('/admin/zones', protect, authorize('admin', 'platform_admin'), ctrl.adminListZones);
router.post('/admin/zones', protect, authorize('admin', 'platform_admin'), createZoneValidation, validate, ctrl.adminCreateZone);
router.patch('/admin/zones/:id', protect, authorize('admin', 'platform_admin'), mongoIdParam('id'), updateZoneValidation, validate, ctrl.adminUpdateZone);
router.get('/admin/medicines', protect, authorize('admin', 'platform_admin'), ctrl.adminListMedicines);
router.post('/admin/medicines', protect, authorize('admin', 'platform_admin'), medicineValidation, validate, ctrl.adminCreateMedicine);
router.patch('/admin/medicines/:id', protect, authorize('admin', 'platform_admin'), mongoIdParam('id'), validate, ctrl.adminUpdateMedicine);

// ══ Patient orders (role: patient) ════════════════════════════════════════

router.post('/prescriptions', protectPatient, uploadPrescription, ctrl.uploadPrescription);
router.post('/orders', protectPatient, createOrderValidation, validate, idempotency({ route: 'pharmacy/orders/create' }), ctrl.createOrder);
router.get('/orders', protectPatient, ctrl.getMyOrders);
router.get('/orders/:id', protectPatient, mongoIdParam('id'), validate, ctrl.getOrder);
router.get('/orders/:id/prescription', protectPatient, mongoIdParam('id'), validate, ctrl.getPrescription);
router.post('/orders/:id/cancel', protectPatient, mongoIdParam('id'), validate, ctrl.cancelOrder);
router.post('/orders/:id/payment', protectPatient, mongoIdParam('id'), validate, idempotency({ route: 'pharmacy/orders/payment' }), ctrl.createPaymentOrder);
router.post('/orders/:id/payment/verify', protectPatient, mongoIdParam('id'), verifyPaymentValidation, validate, idempotency({ route: 'pharmacy/orders/payment/verify' }), ctrl.verifyPayment);
router.post('/orders/:id/payment/failure', protectPatient, mongoIdParam('id'), paymentFailureValidation, validate, ctrl.reportPaymentFailure);

module.exports = router;
