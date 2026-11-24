/**
 * `isOver` rules for middleware/idempotency.js: has everything a saved response
 * created been cancelled since? Then the same request again is a new order.
 * Anything unclear (nothing found, something still live) counts as not over.
 */
const CLOSED = ['CANCELLED', 'REJECTED'];

/** @param {() => import('mongoose').Model} model  @param {(body: object) => Array<string>} ids */
const allCancelled = (model, ids) => async (body) => {
  const list = (ids(body) || []).filter(Boolean);
  if (!list.length) return false;
  const docs = await model().find({ _id: { $in: list } }).select('status').lean();
  return docs.length === list.length && docs.every((d) => CLOSED.includes(d.status));
};

const PharmacyOrder = () => require('../models/pharmacyOrder');
const NurseBooking = () => require('../models/nurseBooking');
const LabOrder = () => require('../models/labOrder');
const idOf = (d) => d && (d._id || d.id);

module.exports = {
  pharmacyOrder: allCancelled(PharmacyOrder, (b) => [idOf(b.order)]),
  pharmacyCheckout: allCancelled(PharmacyOrder, (b) => (b.orders || []).map(idOf)),
  booking: allCancelled(NurseBooking, (b) => [idOf(b.booking)]),
  bookingPackage: allCancelled(NurseBooking, (b) => (b.sessions || []).map((s) => idOf(s) || s.bookingId)),
  labOrder: allCancelled(LabOrder, (b) => [idOf(b.order)])
};
