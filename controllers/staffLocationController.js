/**
 * Staff Location & Availability Controller
 *
 * Real-time GPS tracking and online/offline status management for medical staff
 */

const User = require('../models/user');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Update staff current GPS coordinates
 * @route   PATCH /api/v1/staff/location
 * @access  Private (Medical Staff / Nurse / Phlebotomist / Doctor)
 */
exports.updateLocation = async (req, res, next) => {
  try {
    const { coordinates } = req.body;
    const userId = req.user.id || req.user._id;

    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      return responseHelper.sendBadRequest(res, 'Coordinates must be an array of [longitude, latitude]');
    }

    const [longitude, latitude] = coordinates;
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return responseHelper.sendBadRequest(res, 'Invalid longitude or latitude values');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        currentLocation: {
          type: 'Point',
          coordinates: [Number(longitude), Number(latitude)],
          updatedAt: new Date()
        }
      },
      { new: true }
    ).select('name role isOnline availabilityStatus currentLocation');

    if (!user) {
      return responseHelper.sendNotFound(res, 'User not found');
    }

    return responseHelper.sendSuccess(res, { user }, 'Location updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle online/offline and availability status
 * @route   PATCH /api/v1/staff/availability
 * @access  Private (Medical Staff / Nurse / Phlebotomist / Doctor)
 */
exports.updateAvailability = async (req, res, next) => {
  try {
    const { isOnline, availabilityStatus } = req.body;
    const userId = req.user.id || req.user._id;

    const updateData = {};
    if (typeof isOnline === 'boolean') {
      updateData.isOnline = isOnline;
      if (!isOnline) {
        updateData.availabilityStatus = 'OFFLINE';
      }
    }

    if (availabilityStatus) {
      const validStatuses = ['AVAILABLE', 'BUSY', 'ON_BREAK', 'OFFLINE'];
      if (!validStatuses.includes(availabilityStatus)) {
        return responseHelper.sendBadRequest(res, `Status must be one of: ${validStatuses.join(', ')}`);
      }
      updateData.availabilityStatus = availabilityStatus;
      if (availabilityStatus !== 'OFFLINE') {
        updateData.isOnline = true;
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('name role isOnline availabilityStatus currentLocation');

    if (!user) {
      return responseHelper.sendNotFound(res, 'User not found');
    }

    return responseHelper.sendSuccess(res, { user }, 'Availability updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Find nearby active medical staff
 * @route   GET /api/v1/staff/nearby
 * @access  Public / Authenticated
 */
exports.getNearbyStaff = async (req, res, next) => {
  try {
    const {
      lat,
      lng,
      radiusKm = 10,
      role = 'medical_staff'
    } = req.query;

    if (!lat || !lng) {
      return responseHelper.sendBadRequest(res, 'Latitude (lat) and Longitude (lng) query parameters are required');
    }

    const maxDistanceMeters = Number(radiusKm) * 1000;
    const query = {
      isOnline: true,
      availabilityStatus: 'AVAILABLE',
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [Number(lng), Number(lat)]
          },
          $maxDistance: maxDistanceMeters
        }
      }
    };

    if (role) {
      query.role = role;
    }

    const staff = await User.find(query)
      .select('name role rating specialty isOnline availabilityStatus currentLocation')
      .limit(15)
      .lean();

    return responseHelper.sendSuccess(res, { staff }, 'Nearby staff retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current staff member status and location
 * @route   GET /api/v1/staff/me/status
 * @access  Private (Staff)
 */
exports.getMyStatus = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId)
      .select('name role isOnline availabilityStatus currentLocation servicesOffered rating')
      .populate('servicesOffered', 'name category basePrice');

    if (!user) {
      return responseHelper.sendNotFound(res, 'User not found');
    }

    return responseHelper.sendSuccess(res, { status: user }, 'Staff status loaded');
  } catch (error) {
    next(error);
  }
};
