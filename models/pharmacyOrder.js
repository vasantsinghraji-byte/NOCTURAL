/**
 * Pharmacy Order Model
 *
 * A patient's medicine order routed to a single pharmacy vendor.
 * Prices are snapshotted at order time so later inventory edits don't
 * mutate historical orders.
 */

const mongoose = require('mongoose');
const {
  PHARMACY_ORDER_STATUSES,
  PHARMACY_FULFILMENT_TYPES,
  DELIVERY_STATUSES
} = require('../constants/enums');
const { geohashForPoint } = require('../utils/geohash');

const OrderItemSchema = new mongoose.Schema({
  medicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true
  },
  name: { type: String, required: true }, // snapshot
  form: String, // snapshot
  packSize: String, // snapshot
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 }, // snapshot of sellingPrice
  mrp: { type: Number, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
  requiresPrescription: { type: Boolean, default: false }
}, { _id: false });

const TimelineEntrySchema = new mongoose.Schema({
  status: { type: String, enum: PHARMACY_ORDER_STATUSES },
  at: { type: Date, default: Date.now },
  note: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const PharmacyOrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    index: true
  },

  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PharmacyVendor',
    required: true
  },

  items: {
    type: [OrderItemSchema],
    validate: [(v) => Array.isArray(v) && v.length > 0, 'Order must contain at least one item']
  },

  // Prescription upload (required when any item requiresPrescription)
  requiresPrescription: { type: Boolean, default: false },
  prescription: {
    // Storage key (S3/GCS/local) under prescriptions/<patientId>/. Files are
    // private; read them via GET /pharmacy/**/orders/:id/prescription.
    key: String,
    url: String, // legacy — unused
    uploadedAt: Date,
    // Vendor/admin verification of the uploaded prescription
    verified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date
  },

  // Fulfilment status
  status: {
    type: String,
    enum: PHARMACY_ORDER_STATUSES,
    default: 'PLACED',
    index: true
  },
  timeline: [TimelineEntrySchema],
  rejectionReason: String,
  cancellationReason: String,
  cancelledBy: {
    type: String,
    enum: ['PATIENT', 'VENDOR', 'ADMIN', 'SYSTEM']
  },

  // Delivery
  deliveryAddress: {
    label: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    contactPhone: String
  },
  // No `default` on `type` — see the geo note on the models above; a partial
  // { type:'Point' } without coordinates breaks the 2dsphere index on insert.
  deliveryLocation: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] } // [lng, lat]
  },
  deliveryGeohash: String, // derived from deliveryLocation (demand heatmaps)

  // How the goods reach the patient. STAFF_PICKUP orders are supplies for a
  // home-care visit: the nurse collects them from the store (no rider, no fee).
  fulfilment: { type: String, enum: PHARMACY_FULFILMENT_TYPES, default: 'DELIVERY' },
  careVisit: {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'NurseBooking' },
    serviceType: String,
    scheduledDate: Date,
    scheduledTime: String
  },
  zone: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceZone' },
  distanceKm: { type: Number, min: 0 }, // store → customer (straight line)

  // Promise made to the customer at checkout, split into legs (Swiggy's
  // ETA model: assignment + first mile vs prep, then last mile) so each leg
  // can be measured against `milestones` and the model tuned.
  eta: {
    promisedAt: Date,
    prepMinutes: Number,
    assignmentMinutes: Number,
    lastMileMinutes: Number
  },
  // First time each stage was reached (write-once; `timeline` keeps the full log).
  milestones: {
    placedAt: Date,
    paidAt: Date,
    acceptedAt: Date,
    readyAt: Date,
    riderAssignedAt: Date,
    pickedUpAt: Date,
    deliveredAt: Date,
    cancelledAt: Date
  },
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // role: delivery_partner
  },
  deliveryStatus: {
    type: String,
    enum: DELIVERY_STATUSES
  },
  estimatedDeliveryAt: Date,
  deliveredAt: Date,

  // Amounts (snapshot in INR)
  amounts: {
    itemsSubtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 }
  },
  currency: { type: String, default: 'INR' },
  // How the delivery fee was built (config/revenue.js): shown on the receipt.
  feeBreakdown: {
    base: Number,
    surgeMultiplier: Number,
    surgeAmount: Number,
    nightSurcharge: Number,
    waiver: { type: String, enum: ['MEMBER', 'FREE_ABOVE', 'STAFF_PICKUP', null] }
  },

  // Payment
  paymentMode: {
    type: String,
    enum: ['PREPAID', 'COD'],
    default: 'PREPAID'
  },
  // PREPAID orders stay invisible to the vendor until PAID (see pharmacyService).
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED'],
    default: 'PENDING'
  },
  // Unpaid PREPAID orders are auto-cancelled (and restocked) after this.
  paymentExpiresAt: Date,
  // Razorpay references for PREPAID orders. The legacy `Payment` model is for
  // staff payouts (duty/doctor/hospital), so gateway refs live on the order.
  razorpay: {
    orderId: String,
    paymentId: String,
    paidAt: Date,
    failureReason: String,
    refundId: String,
    refundedAt: Date,
    refundError: String
  }
}, {
  timestamps: true
});

PharmacyOrderSchema.index({ patient: 1, createdAt: -1 });
PharmacyOrderSchema.index({ 'careVisit.booking': 1 }, { sparse: true });
PharmacyOrderSchema.index({ vendor: 1, status: 1, createdAt: -1 });
PharmacyOrderSchema.index({ rider: 1, deliveryStatus: 1 });
PharmacyOrderSchema.index({ deliveryLocation: '2dsphere' });
// Unpaid-order expiry sweep (services/pharmacyPaymentService.js)
PharmacyOrderSchema.index({ paymentMode: 1, paymentStatus: 1, paymentExpiresAt: 1 });
PharmacyOrderSchema.index({ 'razorpay.orderId': 1 }, { sparse: true });
PharmacyOrderSchema.index({ zone: 1, status: 1, createdAt: -1 });
PharmacyOrderSchema.index({ deliveryGeohash: 1, createdAt: -1 });

// Generate a human-friendly order number + seed the timeline on first save.
// Synchronous (no `next`) hook — matches the codebase convention.
PharmacyOrderSchema.pre('save', function initOrder() {
  if (this.isNew) {
    if (!this.milestones || !this.milestones.placedAt) {
      this.set('milestones.placedAt', new Date());
    }
    if (this.deliveryLocation && !this.deliveryGeohash) {
      this.deliveryGeohash = geohashForPoint(this.deliveryLocation);
    }
    if (!this.orderNumber) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      this.orderNumber = `MR${Date.now().toString(36).toUpperCase()}${rand}`;
    }
    if (!this.timeline || this.timeline.length === 0) {
      this.timeline = [{ status: this.status || 'PLACED', at: new Date() }];
    }
  }
});

module.exports = mongoose.models.PharmacyOrder
  || mongoose.model('PharmacyOrder', PharmacyOrderSchema);
