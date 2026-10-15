/**
 * Slot Reservation Model
 *
 * One row per shop resource and 15-minute slot ("<store>|CLINIC|2026-10-09|17:30").
 * `count` goes up with an atomic conditional $inc capped at `capacity`, so two
 * customers can never take the last place at the same time (careSlotService).
 */
const mongoose = require('mongoose');

const SlotReservationSchema = new mongoose.Schema({
  key: { type: String, required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'CareStore', required: true },
  resource: { type: String, required: true }, // CLINIC | HOME | PRACTITIONER
  date: { type: String, required: true }, // YYYY-MM-DD (IST)
  time: { type: String, required: true }, // HH:MM (IST)
  capacity: { type: Number, required: true, min: 1 },
  count: { type: Number, default: 0, min: 0 },
  holders: [{ type: String }] // booking ids (or a temporary hold id)
}, { timestamps: true });

SlotReservationSchema.index({ key: 1 }, { unique: true });
SlotReservationSchema.index({ store: 1, date: 1 });

module.exports = mongoose.models.SlotReservation || mongoose.model('SlotReservation', SlotReservationSchema);
