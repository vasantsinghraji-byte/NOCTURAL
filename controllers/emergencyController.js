/**
 * Emergency Controller
 *
 * One-tap SOS emergency bookings, geo-proximity staff matching,
 * live status progression, and clinical intervention logs.
 */

const EmergencyBooking = require('../models/emergencyBooking');
const User = require('../models/user');
const Patient = require('../models/patient');
const responseHelper = require('../utils/responseHelper');

/**
 * Helper: Calculate distance in km between two [lng, lat] coordinates
 */
function calculateDistanceKm(coord1, coord2) {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371; // Radius of Earth in km
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
 * @desc    Trigger SOS Emergency booking
 * @route   POST /api/v1/emergency
 * @access  Private (Patient)
 */
exports.triggerEmergency = async (req, res, next) => {
  try {
    const patientId = req.user.id || req.user._id;
    const {
      emergencyType,
      description,
      urgencyLevel = 'EMERGENCY',
      patientLocation
    } = req.body;

    const patient = await Patient.findById(patientId);

    // Prepare notified contacts from patient's saved emergency contacts
    const contactsNotified = [];
    if (patient && patient.emergencyContacts && patient.emergencyContacts.length > 0) {
      for (const contact of patient.emergencyContacts) {
        if (contact.notifyOnEmergency) {
          contactsNotified.push({
            name: contact.name,
            phone: contact.phone,
            notifiedAt: new Date(),
            method: 'SMS'
          });
        }
      }
    }

    const [longitude, latitude] = patientLocation.coordinates;

    // Search nearest available medical staff within 15km
    const nearbyStaff = await User.find({
      isOnline: true,
      availabilityStatus: 'AVAILABLE',
      role: { $in: ['medical_staff', 'nurse', 'doctor'] },
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: 15000 // 15 km in meters
        }
      }
    }).limit(3);

    let assignedStaff = null;
    let estimatedArrivalMinutes = 15;
    const dispatchAttempts = [];

    if (nearbyStaff.length > 0) {
      const bestStaff = nearbyStaff[0];
      assignedStaff = bestStaff._id;

      const dist = calculateDistanceKm(
        [longitude, latitude],
        bestStaff.currentLocation.coordinates
      );
      // Rough estimation: 3 mins per km + 2 min prep
      estimatedArrivalMinutes = Math.max(5, Math.round(dist * 3 + 2));

      dispatchAttempts.push({
        staff: bestStaff._id,
        sentAt: new Date(),
        response: 'PENDING',
        distance: dist
      });
    }

    const emergency = await EmergencyBooking.create({
      patient: patientId,
      emergencyType,
      description,
      urgencyLevel,
      patientLocation,
      status: assignedStaff ? 'STAFF_ASSIGNED' : 'DISPATCHING',
      assignedStaff,
      staffAssignedAt: assignedStaff ? new Date() : undefined,
      staffLocationAtAssignment: assignedStaff ? nearbyStaff[0].currentLocation : undefined,
      estimatedArrivalMinutes,
      dispatchAttempts,
      contactsNotified,
      responseMetrics: {
        triggeredAt: new Date(),
        firstDispatchAt: assignedStaff ? new Date() : undefined
      },
      pricing: {
        serviceFee: 399,
        emergencySurcharge: 199,
        totalAmount: 598,
        currency: 'INR'
      },
      paymentStatus: 'PENDING'
    });

    return responseHelper.sendCreated(res, { emergency }, 'Emergency SOS dispatched');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get active emergency for patient or staff
 * @route   GET /api/v1/emergency/active
 * @access  Private (Patient / Staff)
 */
exports.getActiveEmergency = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const activeStatuses = ['TRIGGERED', 'DISPATCHING', 'STAFF_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

    const emergency = await EmergencyBooking.findOne({
      $or: [
        { patient: userId, status: { $in: activeStatuses } },
        { assignedStaff: userId, status: { $in: activeStatuses } }
      ]
    })
      .populate('patient', 'name phone bloodGroup emergencyContacts address')
      .populate('assignedStaff', 'name phone currentLocation role');

    if (!emergency) {
      return responseHelper.sendSuccess(res, { emergency: null }, 'No active emergency');
    }

    return responseHelper.sendSuccess(res, { emergency }, 'Active emergency retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get emergency by ID
 * @route   GET /api/v1/emergency/:id
 * @access  Private (Patient / Staff / Admin)
 */
exports.getEmergency = async (req, res, next) => {
  try {
    const emergency = await EmergencyBooking.findById(req.params.id)
      .populate('patient', 'name phone bloodGroup address emergencyContacts')
      .populate('assignedStaff', 'name phone currentLocation role specialty');

    if (!emergency) {
      return responseHelper.sendNotFound(res, 'Emergency booking not found');
    }

    return responseHelper.sendSuccess(res, { emergency }, 'Emergency details loaded');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Staff accepts emergency dispatch
 * @route   PATCH /api/v1/emergency/:id/accept
 * @access  Private (Staff)
 */
exports.acceptEmergency = async (req, res, next) => {
  try {
    const staffId = req.user.id || req.user._id;

    const emergency = await EmergencyBooking.findById(req.params.id);
    if (!emergency) {
      return responseHelper.sendNotFound(res, 'Emergency booking not found');
    }

    emergency.assignedStaff = staffId;
    emergency.status = 'STAFF_ASSIGNED';
    emergency.staffAcceptedAt = new Date();
    if (emergency.responseMetrics) {
      emergency.responseMetrics.staffAcceptedAt = new Date();
    }

    const attempt = emergency.dispatchAttempts.find(
      a => a.staff && a.staff.toString() === staffId.toString()
    );
    if (attempt) {
      attempt.response = 'ACCEPTED';
      attempt.respondedAt = new Date();
    }

    emergency.statusHistory.push({
      status: 'STAFF_ASSIGNED',
      timestamp: new Date(),
      updatedBy: staffId,
      notes: 'Medical staff accepted emergency dispatch'
    });

    await emergency.save();
    return responseHelper.sendSuccess(res, { emergency }, 'Emergency dispatch accepted');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update emergency status (EN_ROUTE, ARRIVED, etc.)
 * @route   PATCH /api/v1/emergency/:id/status
 * @access  Private (Staff / Admin)
 */
exports.updateEmergencyStatus = async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const userId = req.user.id || req.user._id;

    const emergency = await EmergencyBooking.findById(req.params.id);
    if (!emergency) {
      return responseHelper.sendNotFound(res, 'Emergency booking not found');
    }

    emergency.status = status;
    emergency.statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: userId,
      notes: notes || `Status transitioned to ${status}`
    });

    if (status === 'ARRIVED') {
      emergency.actualArrivalAt = new Date();
      if (emergency.responseMetrics && emergency.responseMetrics.triggeredAt) {
        emergency.responseMetrics.staffArrivedAt = emergency.actualArrivalAt;
        emergency.responseMetrics.totalResponseMinutes = Math.round(
          (emergency.actualArrivalAt - emergency.responseMetrics.triggeredAt) / 60000
        );
      }
    }

    await emergency.save();
    return responseHelper.sendSuccess(res, { emergency }, `Emergency status updated to ${status}`);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Record treatment & vitals after resolving emergency
 * @route   POST /api/v1/emergency/:id/service-report
 * @access  Private (Staff)
 */
exports.recordService = async (req, res, next) => {
  try {
    const {
      description,
      serviceType,
      vitalsRecorded,
      medicinesAdministered,
      photosDocumentation,
      hospitalReferralNeeded,
      referralHospital
    } = req.body;

    const emergency = await EmergencyBooking.findById(req.params.id);
    if (!emergency) {
      return responseHelper.sendNotFound(res, 'Emergency booking not found');
    }

    emergency.servicePerformed = {
      description,
      serviceType,
      vitalsRecorded,
      medicinesAdministered,
      photosDocumentation,
      hospitalReferralNeeded,
      referralHospital,
      completedAt: new Date()
    };

    emergency.status = 'RESOLVED';
    if (emergency.responseMetrics) {
      emergency.responseMetrics.serviceCompletedAt = new Date();
    }

    emergency.statusHistory.push({
      status: 'RESOLVED',
      timestamp: new Date(),
      updatedBy: req.user.id || req.user._id,
      notes: 'Emergency resolved and treatment documented'
    });

    await emergency.save();
    return responseHelper.sendSuccess(res, { emergency }, 'Emergency service recorded and resolved');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel emergency SOS
 * @route   PATCH /api/v1/emergency/:id/cancel
 * @access  Private (Patient / Staff / Admin)
 */
exports.cancelEmergency = async (req, res, next) => {
  try {
    const { reason, isFalseAlarm = false } = req.body;
    const userId = req.user.id || req.user._id;

    const emergency = await EmergencyBooking.findById(req.params.id);
    if (!emergency) {
      return responseHelper.sendNotFound(res, 'Emergency booking not found');
    }

    emergency.status = 'CANCELLED';
    emergency.cancelledAt = new Date();
    emergency.cancelledBy = userId;
    emergency.cancellationReason = reason || 'Cancelled by user';
    emergency.isFalseAlarm = isFalseAlarm;

    await emergency.save();
    return responseHelper.sendSuccess(res, { emergency }, 'Emergency cancelled');
  } catch (error) {
    next(error);
  }
};
