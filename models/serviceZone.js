/**
 * Service Zone Model
 *
 * An ops-drawn delivery polygon (Swiggy-style "cluster"): a customer point is
 * resolved to its zone by point-in-polygon, and the zone decides how far
 * stores may deliver right now. Where no zone is drawn yet, serviceability
 * falls back to each store's own radius (see services/serviceabilityService.js).
 *
 * Stress lever: when riders are short or it rains, ops raise `stress.level`,
 * which shrinks every store's effective radius in the zone (multiplier) —
 * fewer, closer orders instead of broken delivery promises. `isActive:false`
 * pauses the zone entirely.
 */

const mongoose = require('mongoose');
const { ZONE_STRESS_LEVELS } = require('../constants/enums');

const ServiceZoneSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9_-]{2,40}$/, 'Zone code must be 2-40 chars: A-Z, 0-9, _ or -']
  },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  city: { type: String, required: true, trim: true, index: true },

  // GeoJSON Polygon / MultiPolygon, [lng, lat] rings, first point == last.
  boundary: {
    type: {
      type: String,
      enum: ['Polygon', 'MultiPolygon'],
      required: true
    },
    coordinates: { type: Array, required: true }
  },

  isActive: { type: Boolean, default: true },

  // Hard cap on last-mile distance in this zone, before stress scaling.
  maxLastMileKm: { type: Number, default: 7, min: 0.5, max: 50 },

  stress: {
    level: { type: String, enum: ZONE_STRESS_LEVELS, default: 'NORMAL' },
    radiusMultiplier: { type: Number, default: 1, min: 0.1, max: 1 },
    reason: String, // "Heavy rain", "Rider shortage"
    until: Date, // auto-expiry of the stress override
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: Date
  }
}, {
  timestamps: true
});

ServiceZoneSchema.index({ boundary: '2dsphere' });
ServiceZoneSchema.index({ isActive: 1, city: 1 });

/** Effective radius multiplier right now (expired stress reverts to normal). */
ServiceZoneSchema.methods.currentRadiusMultiplier = function currentRadiusMultiplier(now = new Date()) {
  const stress = this.stress || {};
  if (!stress.level || stress.level === 'NORMAL') return 1;
  if (stress.until && stress.until <= now) return 1;
  return stress.radiusMultiplier || 1;
};

module.exports = mongoose.models.ServiceZone
  || mongoose.model('ServiceZone', ServiceZoneSchema);
