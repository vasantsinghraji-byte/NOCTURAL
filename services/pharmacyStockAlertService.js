/**
 * "Notify me when it's back": patients subscribe to a medicine at their
 * location; when any store that delivers there goes from 0 to in-stock, each
 * subscriber gets one notification. Fire-and-forget from stock updates, so it
 * never slows down or breaks a store's inventory save.
 */

const mongoose = require('mongoose');
const StockAlert = require('../models/stockAlert');
const Medicine = require('../models/medicine');
const PharmacyVendor = require('../models/pharmacyVendor');
const Notification = require('../models/notification');
const pushNotificationService = require('./pushNotificationService');
const serviceability = require('./serviceabilityService');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const ALERT_DAYS = 14;
const MAX_ACTIVE_PER_PATIENT = 20;
const EARTH_RADIUS_KM = 6378.1;

async function subscribe(patientId, medicineId, { lat, lng }, now = new Date()) {
  if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Invalid medicine id');
  const point = serviceability.toPoint(lat, lng);
  const medicine = await Medicine.findById(medicineId).select('name isActive isBanned isDiscontinued scheduleType').lean();
  if (!medicine) throw new NotFoundError('Medicine', medicineId);
  if (Medicine.onlineSaleBlockReason(medicine)) throw new ValidationError(`${medicine.name} can't be ordered online`);

  const active = await StockAlert.countDocuments({ patient: patientId, status: 'ACTIVE' });
  const existing = await StockAlert.findOne({ patient: patientId, medicine: medicineId, status: 'ACTIVE' });
  if (!existing && active >= MAX_ACTIVE_PER_PATIENT) {
    throw new ConflictError(`You can follow up to ${MAX_ACTIVE_PER_PATIENT} items at a time`);
  }
  const expiresAt = new Date(now.getTime() + ALERT_DAYS * 24 * 60 * 60 * 1000);
  if (existing) {
    existing.point = point;
    existing.expiresAt = expiresAt;
    await existing.save();
    return existing;
  }
  return StockAlert.create({ patient: patientId, medicine: medicineId, point, expiresAt });
}

async function unsubscribe(patientId, medicineId) {
  if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Invalid medicine id');
  const res = await StockAlert.updateMany({ patient: patientId, medicine: medicineId, status: 'ACTIVE' }, { $set: { status: 'CANCELLED' } });
  return { cancelled: res.modifiedCount || 0 };
}

/**
 * A store now has the medicine: notify every active subscriber inside the
 * store's delivery radius, once each (compare-and-set ACTIVE → NOTIFIED).
 */
async function notifySubscribers(vendorId, medicineId, now = new Date()) {
  const vendor = await PharmacyVendor.findById(vendorId).select('name location serviceRadiusKm status isActive').lean();
  if (!vendor || !vendor.location || !Array.isArray(vendor.location.coordinates) || vendor.status !== 'APPROVED') return { notified: 0 };
  const medicine = await Medicine.findById(medicineId).select('name').lean();
  if (!medicine) return { notified: 0 };
  const radiusKm = vendor.serviceRadiusKm || 5;
  const candidates = await StockAlert.find({
    medicine: medicineId,
    status: 'ACTIVE',
    expiresAt: { $gt: now },
    point: { $geoWithin: { $centerSphere: [vendor.location.coordinates, radiusKm / EARTH_RADIUS_KM] } }
  }).limit(500).lean();

  let notified = 0;
  for (const alert of candidates) {
    const claimed = await StockAlert.findOneAndUpdate(
      { _id: alert._id, status: 'ACTIVE' },
      { $set: { status: 'NOTIFIED', notifiedAt: now, notifiedVendor: vendorId } }
    );
    if (!claimed) continue;
    notified += 1;
    const title = `${medicine.name} is back`;
    const message = `${vendor.name} near you has ${medicine.name} in stock now.`;
    const data = { type: 'PHARMACY_ORDER_UPDATE', medicineId: String(medicineId), vendorId: String(vendorId) };
    try {
      await Notification.create({
        user: alert.patient, recipientModel: 'Patient', type: 'PHARMACY_ORDER_UPDATE', title, message,
        priority: 'MEDIUM', actionUrl: '/pharmacy', actionLabel: 'Order now', channels: { inApp: true, push: true },
        metadata: data, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      });
      await pushNotificationService.sendToOwner({ owner: alert.patient, userType: 'patient', title, body: message, data }).catch(() => {});
    } catch (err) {
      logger.warn('Back-in-stock notice failed', { alertId: String(alert._id), error: err.message });
    }
  }
  if (notified) logger.info('Back-in-stock alerts sent', { vendorId: String(vendorId), medicineId: String(medicineId), notified });
  return { notified };
}

/** Fire-and-forget hook for stock updates. Never throws. */
function onStockAvailable(vendorId, medicineId) {
  notifySubscribers(vendorId, medicineId).catch((err) => logger.warn('Stock alert hook failed', { error: err.message }));
}

/** Worker: lapse old alerts. */
async function expireAlerts(now = new Date()) {
  const res = await StockAlert.updateMany({ status: 'ACTIVE', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } });
  return { expired: res.modifiedCount || 0 };
}

module.exports = { subscribe, unsubscribe, notifySubscribers, onStockAvailable, expireAlerts };
