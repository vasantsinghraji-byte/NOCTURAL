/**
 * Split checkout: a cart no single store can fill becomes one order per store
 * (at most `maxSplitStores`), created all-or-nothing. Each child order then
 * lives its own life: its own store turn, SLA, reassignment and delivery.
 *
 * Cash on delivery only for now: a single online payment across several
 * stores needs one gateway order shared by the children (see the plan doc).
 */

const mongoose = require('mongoose');
const PharmacyCheckout = require('../models/pharmacyCheckout');
const PharmacyOrder = require('../models/pharmacyOrder');
const { getPharmacyOps } = require('../config/pharmacyOps');
const { ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

const lazyPharmacyService = () => require('./pharmacyService');

async function createSplitCheckout(patientId, payload = {}) {
  const { groups, deliveryAddress, deliveryLocation, prescriptionKey } = payload;
  const ops = getPharmacyOps();
  if (payload.paymentMode && payload.paymentMode !== 'COD') {
    throw new ValidationError('Orders split across pharmacies are cash on delivery for now');
  }
  if (!Array.isArray(groups) || groups.length < 2) throw new ValidationError('A split checkout needs items from at least two pharmacies');
  if (groups.length > ops.maxSplitStores) throw new ValidationError(`A checkout can use at most ${ops.maxSplitStores} pharmacies`);

  const vendorIds = groups.map((g) => String(g && g.vendorId));
  if (vendorIds.some((id) => !mongoose.isValidObjectId(id))) throw new ValidationError('Each part needs a valid vendorId');
  if (new Set(vendorIds).size !== vendorIds.length) throw new ValidationError('Each pharmacy can appear only once');
  const seen = new Set();
  for (const g of groups) {
    if (!Array.isArray(g.items) || g.items.length === 0) throw new ValidationError('Each part needs at least one item');
    for (const it of g.items) {
      const id = String(it && it.medicineId);
      if (seen.has(id)) throw new ValidationError('The same item can come from only one pharmacy');
      seen.add(id);
    }
  }

  const checkout = await PharmacyCheckout.create({ patient: patientId, paymentMode: 'COD' });
  const pharmacyService = lazyPharmacyService();
  const created = [];
  try {
    for (const g of groups) {
      const order = await pharmacyService.createOrder(patientId, {
        vendorId: g.vendorId,
        items: g.items,
        deliveryAddress,
        deliveryLocation,
        prescriptionKey,
        paymentMode: 'COD',
        quotedSubtotal: g.quotedSubtotal
      }, { checkout: checkout._id });
      created.push(order);
    }
  } catch (err) {
    // All or nothing: cancel (and restock) the parts already placed.
    for (const order of created) {
      await pharmacyService.cancelOrderByPatient(order._id, patientId, 'Another part of this checkout could not be placed')
        .catch((cancelErr) => logger.error('Split checkout rollback failed', { orderId: String(order._id), error: cancelErr.message }));
    }
    await PharmacyCheckout.updateOne({ _id: checkout._id }, { $set: { status: 'FAILED', failureReason: String(err.message).slice(0, 300), orders: created.map((o) => o._id) } });
    throw err;
  }
  const total = Math.round(created.reduce((s, o) => s + o.amounts.total, 0) * 100) / 100;
  const saved = await PharmacyCheckout.findByIdAndUpdate(checkout._id, { $set: { status: 'PLACED', orders: created.map((o) => o._id), total } }, { new: true });
  return { checkout: saved, orders: created };
}

async function getCheckout(patientId, checkoutId) {
  if (!mongoose.isValidObjectId(checkoutId)) throw new ValidationError('Invalid checkout id');
  const checkout = await PharmacyCheckout.findOne({ _id: checkoutId, patient: patientId }).lean();
  if (!checkout) throw new NotFoundError('Checkout', checkoutId);
  const orders = await PharmacyOrder.find({ _id: { $in: checkout.orders } }).populate('vendor', 'name address').lean();
  return { checkout, orders };
}

module.exports = { createSplitCheckout, getCheckout };
