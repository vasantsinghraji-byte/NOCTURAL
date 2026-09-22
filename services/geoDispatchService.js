/**
 * Geo-Dispatch Service
 *
 * Nearest-staff matching, ETA estimation, and automated dispatch cascading
 * for quick-commerce medical visits (bandages, injections, emergencies, lab pickups).
 */

const User = require('../models/user');
const EmergencyBooking = require('../models/emergencyBooking');
const logger = require('../utils/logger');

class GeoDispatchService {
  /**
   * Calculate distance in kilometers between two [lon, lat] coordinates (Haversine formula)
   * @param {Array<number>} coord1 [lon1, lat1]
   * @param {Array<number>} coord2 [lon2, lat2]
   * @returns {number} Distance in km rounded to 1 decimal
   */
  calculateDistanceKm(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round((R * c) * 10) / 10;
  }

  /**
   * Calculate estimated arrival time in minutes based on distance and urban traffic
   * @param {number} distanceKm Distance in kilometers
   * @returns {number} Minutes to arrival (minimum 5)
   */
  estimateArrivalMinutes(distanceKm) {
    // 3 minutes per km in typical city conditions + 2 minutes dispatch buffer
    return Math.max(5, Math.round(distanceKm * 3 + 2));
  }

  /**
   * Find available field staff ranked by proximity
   * @param {Object} options
   * @param {Array<number>} options.coordinates [longitude, latitude]
   * @param {number} [options.maxDistanceKm=15] Max search radius in km
   * @param {Array<string>} [options.roles] Allowed staff roles
   * @param {number} [options.limit=5] Max candidates to return
   * @returns {Promise<Array>} Ranked candidate staff
   */
  async findNearbyStaff({ coordinates, maxDistanceKm = 15, roles, limit = 5 }) {
    const [lon, lat] = coordinates;
    const maxDistanceMeters = maxDistanceKm * 1000;

    const query = {
      isOnline: true,
      availabilityStatus: 'AVAILABLE',
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          },
          $maxDistance: maxDistanceMeters
        }
      }
    };

    if (roles && roles.length > 0) {
      query.role = { $in: roles };
    }

    const candidates = await User.find(query)
      .select('name role rating completedDuties currentLocation phone')
      .limit(limit)
      .lean();

    return candidates.map(staff => {
      const distance = this.calculateDistanceKm(coordinates, staff.currentLocation.coordinates);
      const eta = this.estimateArrivalMinutes(distance);
      return {
        ...staff,
        distanceKm: distance,
        estimatedArrivalMinutes: eta
      };
    });
  }

  /**
   * Dispatch next closest candidate for an active emergency booking
   * @param {string} emergencyId Emergency booking document ID
   * @returns {Promise<Object>} Updated emergency document
   */
  async dispatchNextCandidate(emergencyId) {
    const emergency = await EmergencyBooking.findById(emergencyId);
    if (!emergency || !['TRIGGERED', 'DISPATCHING'].includes(emergency.status)) {
      return null;
    }

    const previousStaffIds = emergency.dispatchAttempts.map(a => a.staff.toString());
    const candidates = await this.findNearbyStaff({
      coordinates: emergency.patientLocation.coordinates,
      roles: ['medical_staff', 'nurse', 'doctor'],
      limit: 10
    });

    const nextStaff = candidates.find(c => !previousStaffIds.includes(c._id.toString()));

    if (!nextStaff) {
      logger.warn(`No additional available staff found for emergency ${emergency.emergencyNumber}`);
      return emergency;
    }

    emergency.assignedStaff = nextStaff._id;
    emergency.staffAssignedAt = new Date();
    emergency.staffLocationAtAssignment = nextStaff.currentLocation;
    emergency.estimatedArrivalMinutes = nextStaff.estimatedArrivalMinutes;
    emergency.status = 'STAFF_ASSIGNED';

    emergency.dispatchAttempts.push({
      staff: nextStaff._id,
      sentAt: new Date(),
      response: 'PENDING',
      distance: nextStaff.distanceKm
    });

    emergency.statusHistory.push({
      status: 'STAFF_ASSIGNED',
      timestamp: new Date(),
      notes: `Re-dispatched to next nearest staff ${nextStaff.name} (${nextStaff.distanceKm} km away)`
    });

    await emergency.save();
    return emergency;
  }
}

module.exports = new GeoDispatchService();
