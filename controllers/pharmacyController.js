/**
 * Pharmacy Controller
 *
 * HTTP handlers for the local-pharmacy-vendor marketplace. Thin layer over
 * pharmacyService / pharmacyAdminService; responses via responseHelper.
 */

const pharmacyService = require('../services/pharmacyService');
const pharmacyAdminService = require('../services/pharmacyAdminService');
const pharmacyPaymentService = require('../services/pharmacyPaymentService');
const pharmacyAvailabilityService = require('../services/pharmacyAvailabilityService');
const pharmacyAssignmentService = require('../services/pharmacyAssignmentService');
const pharmacyBatchService = require('../services/pharmacyBatchService');
const pharmacyComplianceService = require('../services/pharmacyComplianceService');
const pharmacyCatalogService = require('../services/pharmacyCatalogService');
const pharmacyStockAlertService = require('../services/pharmacyStockAlertService');
const pharmacyCheckoutService = require('../services/pharmacyCheckoutService');
const responseHelper = require('../utils/responseHelper');
const storageConfig = require('../config/storage');
const { AuthorizationError } = require('../utils/errors');

// Resolve the PharmacyVendor id a vendor-user is scoped to.
const resolveVendorId = (req) => {
  const vendorId = req.user && req.user.pharmacyVendor;
  if (!vendorId) {
    throw new AuthorizationError('Your account is not linked to a pharmacy vendor');
  }
  return vendorId;
};

// ── Patient-facing ────────────────────────────────────────────────────────

exports.getNearbyVendors = async (req, res, next) => {
  try {
    const { vendors, serviceability } = await pharmacyService.getNearbyVendors({
      lat: req.query.lat,
      lng: req.query.lng,
      radiusKm: req.query.radiusKm,
      limit: req.query.limit
    });
    responseHelper.sendSuccess(res, { vendors, serviceability }, 'Nearby vendors fetched');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.searchMedicines = async (req, res, next) => {
  try {
    const results = await pharmacyService.searchMedicines({
      q: req.query.q,
      vendorId: req.query.vendorId,
      category: req.query.category,
      page: req.query.page,
      limit: req.query.limit
    });
    responseHelper.sendSuccess(res, { results }, 'Medicine search results');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.getMedicineAvailability = async (req, res, next) => {
  try {
    const result = await pharmacyAvailabilityService.getMedicineAvailability({
      medicineId: req.params.id,
      lat: req.query.lat,
      lng: req.query.lng,
      quantity: req.query.quantity
    });
    responseHelper.sendSuccess(res, result, 'Availability near you');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.planCart = async (req, res, next) => {
  try {
    const plan = await pharmacyAvailabilityService.planCart({
      lat: req.body.lat,
      lng: req.body.lng,
      items: req.body.items
    });
    responseHelper.sendSuccess(res, pharmacyAvailabilityService.stripInternal(plan), 'Cart plan');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.getVendorStorefront = async (req, res, next) => {
  try {
    const storefront = await pharmacyService.getVendorStorefront(req.params.vendorId);
    responseHelper.sendSuccess(res, storefront, 'Vendor storefront fetched');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.createOrder = async (req, res, next) => {
  try {
    const order = await pharmacyService.createOrder(req.user.id, req.body);
    responseHelper.sendCreated(res, { order }, 'Order placed successfully');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.getOrder = async (req, res, next) => {
  try {
    const requester = {
      id: req.user.id,
      type: req.userType,
      role: req.user.role,
      vendorId: req.user.pharmacyVendor
    };
    const order = await pharmacyService.getOrderById(req.params.id, requester);
    responseHelper.sendSuccess(res, { order }, 'Order fetched');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const { orders, pagination } = await pharmacyService.getPatientOrders(req.user.id, req.query);
    responseHelper.sendSuccess(res, { orders, pagination }, 'Your orders');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await pharmacyService.cancelOrderByPatient(req.params.id, req.user.id, req.body.reason);
    responseHelper.sendSuccess(res, { order }, 'Order cancelled');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// ── Patient payments (Razorpay) ───────────────────────────────────────────

exports.getPaymentOptions = (req, res) => {
  responseHelper.sendSuccess(res, pharmacyPaymentService.getPaymentOptions(), 'Payment options');
};

exports.createPaymentOrder = async (req, res, next) => {
  try {
    const checkout = await pharmacyPaymentService.createGatewayOrder(req.params.id, req.user.id);
    responseHelper.sendSuccess(res, checkout, 'Payment initiated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.verifyPayment = async (req, res, next) => {
  try {
    const order = await pharmacyPaymentService.verifyPayment(req.params.id, req.user.id, {
      razorpayOrderId: req.body.razorpay_order_id,
      razorpayPaymentId: req.body.razorpay_payment_id,
      razorpaySignature: req.body.razorpay_signature
    });
    responseHelper.sendSuccess(res, { order }, 'Payment verified');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.reportPaymentFailure = async (req, res, next) => {
  try {
    const order = await pharmacyPaymentService.recordPaymentFailure(req.params.id, req.user.id, req.body.reason);
    responseHelper.sendSuccess(res, { order }, 'Payment failure recorded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// Serve an order's prescription to the patient, the order's pharmacy or an
// admin. Access is scoped by getOrderById; files are never public.
exports.getPrescription = async (req, res, next) => {
  try {
    const requester = {
      id: req.user.id,
      type: req.userType,
      role: req.user.role,
      vendorId: req.user.pharmacyVendor
    };
    const order = await pharmacyService.getOrderById(req.params.id, requester);
    const key = order.prescription && order.prescription.key;
    if (!key) return responseHelper.sendError(res, 'This order has no prescription', 404);

    res.set('Cache-Control', 'private, no-store');
    if (storageConfig.USE_CLOUD) {
      const signedUrl = await storageConfig.getSignedUrl(key, 300);
      if (!signedUrl) return responseHelper.sendError(res, 'Prescription file not found', 404);
      return res.redirect(302, signedUrl);
    }
    return res.sendFile(storageConfig.resolveLocalFile(key));
  } catch (error) {
    return responseHelper.handleServiceError(error, res, next);
  }
};

// Patient uploads a prescription image/PDF; returns the key to pass to createOrder.
exports.uploadPrescription = async (req, res, next) => {
  try {
    if (!req.file) {
      return responseHelper.sendBadRequest(res, 'No prescription file uploaded (field name: "prescription")');
    }
    const stored = storageConfig.toStoredFile(req.file);
    return responseHelper.sendCreated(res, { url: stored.url, key: stored.key }, 'Prescription uploaded');
  } catch (error) {
    return responseHelper.handleServiceError(error, res, next);
  }
};

// ── Vendor dashboard ────────────────────────────────────────────────────

exports.listVendorOrders = async (req, res, next) => {
  try {
    const vendorId = resolveVendorId(req);
    const { orders, pagination } = await pharmacyService.listVendorOrders(vendorId, req.query);
    responseHelper.sendSuccess(res, { orders, pagination }, 'Store orders');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const vendorId = resolveVendorId(req);
    const order = await pharmacyService.updateOrderStatus(req.params.id, {
      vendorId,
      actorUserId: req.user.id,
      status: req.body.status,
      note: req.body.note,
      reasonCode: req.body.reasonCode,
      unavailableMedicineIds: req.body.unavailableMedicineIds,
      deliveryCode: req.body.deliveryCode,
      deliveredWithoutCodeReason: req.body.deliveredWithoutCodeReason
    });
    responseHelper.sendSuccess(res, { order }, 'Order status updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.markItemsUnavailable = async (req, res, next) => {
  try {
    const vendorId = resolveVendorId(req);
    const order = await pharmacyAssignmentService.markItemsUnavailable(req.params.id, {
      vendorId,
      actorUserId: req.user.id,
      medicineIds: req.body.medicineIds,
      reason: req.body.reason
    });
    responseHelper.sendSuccess(res, { order }, 'Items marked unavailable');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.confirmInventory = async (req, res, next) => {
  try {
    const vendorId = resolveVendorId(req);
    const result = await pharmacyService.confirmInventory(vendorId, req.body || {});
    responseHelper.sendSuccess(res, result, 'Stock confirmed');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.upsertInventory = async (req, res, next) => {
  try {
    const vendorId = resolveVendorId(req);
    const item = await pharmacyService.upsertInventoryItem(vendorId, req.body);
    responseHelper.sendSuccess(res, { item }, 'Inventory item saved');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.listInventory = async (req, res, next) => {
  try {
    const vendorId = resolveVendorId(req);
    const { items, pagination } = await pharmacyService.listVendorInventory(vendorId, req.query);
    responseHelper.sendSuccess(res, { items, pagination }, 'Store inventory');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.updateVendorProfile = async (req, res, next) => {
  try {
    const vendorId = resolveVendorId(req);
    const vendor = await pharmacyService.updateVendorProfile(vendorId, req.body);
    responseHelper.sendSuccess(res, { vendor }, 'Storefront updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// ── Admin ─────────────────────────────────────────────────────────────────

exports.adminCreateVendor = async (req, res, next) => {
  try {
    const result = await pharmacyAdminService.createVendor(req.body, req.user.id);
    responseHelper.sendCreated(res, result, 'Vendor created');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.adminSetVendorStatus = async (req, res, next) => {
  try {
    const vendor = await pharmacyAdminService.setVendorStatus(req.params.id, req.body.status, req.user.id);
    responseHelper.sendSuccess(res, { vendor }, 'Vendor status updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.adminListVendors = async (req, res, next) => {
  try {
    const { vendors, pagination } = await pharmacyAdminService.listVendors(req.query);
    responseHelper.sendSuccess(res, { vendors, pagination }, 'Vendors');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.adminListZones = async (req, res, next) => {
  try {
    const result = await pharmacyAdminService.listZones(req.query);
    responseHelper.sendSuccess(res, result, 'Service zones');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.adminCreateZone = async (req, res, next) => {
  try {
    const result = await pharmacyAdminService.createZone(req.body, req.user.id);
    responseHelper.sendCreated(res, result, 'Service zone created');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.adminUpdateZone = async (req, res, next) => {
  try {
    const result = await pharmacyAdminService.updateZone(req.params.id, req.body, req.user.id);
    responseHelper.sendSuccess(res, result, 'Service zone updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.adminCreateMedicine = async (req, res, next) => {
  try {
    const medicine = await pharmacyAdminService.createMedicine(req.body);
    responseHelper.sendCreated(res, { medicine }, 'Medicine created');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.adminUpdateMedicine = async (req, res, next) => {
  try {
    const medicine = await pharmacyAdminService.updateMedicine(req.params.id, req.body);
    responseHelper.sendSuccess(res, { medicine }, 'Medicine updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

exports.adminListMedicines = async (req, res, next) => {
  try {
    const { medicines, pagination } = await pharmacyAdminService.listMedicines(req.query);
    responseHelper.sendSuccess(res, { medicines, pagination }, 'Medicines');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// ── Store network, phase 2: batches, compliance, imports, demand, alerts ──

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
const patientIdOf = (req) => req.user.id; // protectPatient puts the patient id here

exports.receiveBatch = wrap(async (req, res) => {
  const batch = await pharmacyBatchService.receiveBatch(resolveVendorId(req), req.body, { actorId: req.user.id });
  responseHelper.sendSuccess(res, { batch }, 'Batch received', 201);
});

exports.setBatchCount = wrap(async (req, res) => {
  const batch = await pharmacyBatchService.setBatchCount(resolveVendorId(req), req.params.batchId, req.body.qty, { actorId: req.user.id });
  responseHelper.sendSuccess(res, { batch }, 'Batch count updated');
});

exports.listBatches = wrap(async (req, res) => {
  const batches = await pharmacyBatchService.listBatches(resolveVendorId(req), { medicineId: req.query.medicineId });
  responseHelper.sendSuccess(res, { batches }, 'Batches');
});

exports.verifyPrescription = wrap(async (req, res) => {
  const order = await pharmacyComplianceService.verifyPrescription(req.params.id, {
    vendorId: resolveVendorId(req),
    actorUserId: req.user.id,
    prescriberName: req.body.prescriberName,
    prescriberRegistrationNumber: req.body.prescriberRegistrationNumber,
    prescriberAddress: req.body.prescriberAddress,
    prescribedOn: req.body.prescribedOn
  });
  responseHelper.sendSuccess(res, { order }, 'Prescription verified');
});

const sendRegister = (res, register, format, filename) => {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(pharmacyComplianceService.h1RegisterCsv(register));
  }
  return responseHelper.sendSuccess(res, register, 'Schedule H1 register');
};

exports.vendorH1Register = wrap(async (req, res) => {
  const register = await pharmacyComplianceService.h1Register({ vendorId: resolveVendorId(req), from: req.query.from, to: req.query.to });
  sendRegister(res, register, req.query.format, 'schedule-h1-register.csv');
});

exports.adminH1Register = wrap(async (req, res) => {
  const register = await pharmacyComplianceService.h1Register({ vendorId: req.query.vendorId || null, from: req.query.from, to: req.query.to });
  sendRegister(res, register, req.query.format, 'schedule-h1-register-all.csv');
});

exports.importInventory = wrap(async (req, res) => {
  const text = typeof req.body === 'string' ? req.body : '';
  const result = await pharmacyCatalogService.importInventoryCsv(resolveVendorId(req), text, { actorId: req.user.id });
  responseHelper.sendSuccess(res, { import: result }, 'Stock file processed', 201);
});

exports.getImport = wrap(async (req, res) => {
  const result = await pharmacyCatalogService.getImport(resolveVendorId(req), req.params.importId);
  responseHelper.sendSuccess(res, { import: result }, 'Stock import');
});

exports.resolveImportRow = wrap(async (req, res) => {
  const result = await pharmacyCatalogService.resolveImportRow(resolveVendorId(req), req.params.importId, req.params.line, req.body, { actorId: req.user.id });
  responseHelper.sendSuccess(res, { import: result }, 'Row updated');
});

exports.vendorDemand = wrap(async (req, res) => {
  const items = await pharmacyCatalogService.vendorDemand(resolveVendorId(req), { days: req.query.days });
  responseHelper.sendSuccess(res, { items }, 'Unmet demand near your store');
});

exports.adminDemand = wrap(async (req, res) => {
  const items = await pharmacyCatalogService.adminDemand({ days: req.query.days, geohashPrefix: req.query.geohash });
  responseHelper.sendSuccess(res, { items }, 'Unmet demand');
});

exports.adminMergeMedicine = wrap(async (req, res) => {
  const result = await pharmacyCatalogService.mergeMedicines(req.params.id, req.body.intoId, { force: req.body.force === true });
  responseHelper.sendSuccess(res, result, 'Products merged');
});

exports.adminRecallBatch = wrap(async (req, res) => {
  const result = await pharmacyBatchService.recallBatch({
    medicineId: req.body.medicineId, batchNumber: req.body.batchNumber, reason: req.body.reason, notifyPatients: req.body.notifyPatients === true
  });
  responseHelper.sendSuccess(res, result, 'Batch recalled');
});

exports.adminFlaggedOrders = wrap(async (req, res) => {
  const orders = await pharmacyComplianceService.listFlaggedOrders({ days: req.query.days });
  responseHelper.sendSuccess(res, { orders }, 'Orders flagged for review');
});

exports.subscribeStockAlert = wrap(async (req, res) => {
  const alert = await pharmacyStockAlertService.subscribe(patientIdOf(req), req.params.id, { lat: req.body.lat, lng: req.body.lng });
  responseHelper.sendSuccess(res, { alert }, "We'll tell you when it's back", 201);
});

exports.unsubscribeStockAlert = wrap(async (req, res) => {
  const result = await pharmacyStockAlertService.unsubscribe(patientIdOf(req), req.params.id);
  responseHelper.sendSuccess(res, result, 'Alert removed');
});

exports.createSplitCheckout = wrap(async (req, res) => {
  const result = await pharmacyCheckoutService.createSplitCheckout(patientIdOf(req), req.body);
  responseHelper.sendSuccess(res, result, 'Orders placed', 201);
});

exports.getCheckout = wrap(async (req, res) => {
  const result = await pharmacyCheckoutService.getCheckout(patientIdOf(req), req.params.id);
  responseHelper.sendSuccess(res, result, 'Checkout');
});
