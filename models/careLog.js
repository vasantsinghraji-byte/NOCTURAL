/**
 * Care Log Model
 *
 * What happened during a home visit or shift, written by the professional as
 * it happens: meals, medicines given, readings (BP, sugar, pulse, SpO2,
 * temperature), activity and notes. The customer and their Care Circle see
 * it live. One log per visit.
 */
const mongoose = require('mongoose');

const KINDS = ['MEAL', 'MEDICINE', 'VITALS', 'ACTIVITY', 'NOTE'];

const EntrySchema = new mongoose.Schema({
  kind: { type: String, enum: KINDS, required: true },
  text: { type: String, maxlength: 300 },
  vitals: {
    bpSys: { type: Number, min: 40, max: 260 },
    bpDia: { type: Number, min: 20, max: 180 },
    sugar: { type: Number, min: 20, max: 700 }, // mg/dL
    pulse: { type: Number, min: 20, max: 250 },
    spo2: { type: Number, min: 50, max: 100 },
    temp: { type: Number, min: 90, max: 110 } // °F
  },
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const CareLogSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'NurseBooking', required: true, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan', index: true },
  caregiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  entries: { type: [EntrySchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.models.CareLog || mongoose.model('CareLog', CareLogSchema);
module.exports.KINDS = KINDS;
