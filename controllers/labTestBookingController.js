/**
 * Lab Test Booking Controller
 *
 * Handles patient booking creation, phlebotomist assignment,
 * sample status lifecycle tracking, and diagnostic report delivery.
 */

const LabTestBooking = require('../models/labTestBooking');
const LabTest = require('../models/labTest');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Create new lab test order (home sample collection)
 * @route   POST /api/v1/lab-test-bookings
 * @access  Private (Patient)
 */
exports.createBooking = async (req, res, next) => {
  try {
    const patientId = req.user.id || req.user._id;
    const {
      tests: testItems,
      scheduledDate,
      scheduledSlot,
      collectionAddress,
      isUrgent = false,
      prescribedBy,
      consultationRef,
      prescriptionImage,
      paymentMethod = 'COD'
    } = req.body;

    const testIds = testItems.map(t => t.testId);
    const catalogTests = await LabTest.find({ _id: { $in: testIds }, 'availability.isActive': true });

    if (catalogTests.length === 0) {
      return responseHelper.sendBadRequest(res, 'No valid lab tests selected');
    }

    const testMap = new Map(catalogTests.map(t => [t._id.toString(), t]));
    let subtotal = 0;
    const resolvedTests = [];

    for (const item of testItems) {
      const catalogTest = testMap.get(item.testId.toString());
      if (catalogTest) {
        const price = catalogTest.pricing.sellingPrice;
        subtotal += price;
        resolvedTests.push({
          test: catalogTest._id,
          name: catalogTest.displayName || catalogTest.name,
          sampleType: catalogTest.sampleType,
          price
        });
      }
    }

    const collectionCharge = subtotal >= 1000 ? 0 : 150;
    const urgentCharge = isUrgent ? 200 : 0;
    const totalAmount = subtotal + collectionCharge + urgentCharge;

    const booking = await LabTestBooking.create({
      patient: patientId,
      tests: resolvedTests,
      prescribedBy,
      consultationRef,
      prescriptionImage,
      collectionAddress,
      scheduledDate,
      scheduledSlot,
      isUrgent,
      sampleStatus: 'SCHEDULED',
      sampleStatusHistory: [{
        status: 'SCHEDULED',
        timestamp: new Date(),
        updatedBy: patientId,
        notes: 'Booking placed by patient'
      }],
      pricing: {
        subtotal,
        collectionCharge,
        urgentCharge,
        totalAmount,
        currency: 'INR'
      },
      paymentStatus: paymentMethod === 'COD' ? 'PENDING' : 'PAID',
      paymentMethod
    });

    await LabTest.updateMany(
      { _id: { $in: testIds } },
      { $inc: { 'stats.totalOrders': 1 } }
    );

    return responseHelper.sendCreated(res, { booking }, 'Lab test booked successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get booking details by ID
 * @route   GET /api/v1/lab-test-bookings/:id
 * @access  Private (Patient / Phlebotomist / Admin)
 */
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await LabTestBooking.findById(req.params.id)
      .populate('patient', 'name phone email bloodGroup')
      .populate('phlebotomist', 'name phone email currentLocation')
      .populate('prescribedBy', 'name specialty');

    if (!booking) {
      return responseHelper.sendNotFound(res, 'Booking not found');
    }

    const userId = (req.user.id || req.user._id).toString();
    const isPatient = booking.patient && booking.patient._id.toString() === userId;
    const isPhleb = booking.phlebotomist && booking.phlebotomist._id.toString() === userId;
    const isAdmin = ['admin', 'platform_admin'].includes(req.user.role);

    if (!isPatient && !isPhleb && !isAdmin) {
      return responseHelper.sendForbidden(res, 'Access denied to this booking');
    }

    return responseHelper.sendSuccess(res, { booking }, 'Booking fetched successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get patient's lab bookings
 * @route   GET /api/v1/lab-test-bookings/my-bookings
 * @access  Private (Patient)
 */
exports.getMyBookings = async (req, res, next) => {
  try {
    const patientId = req.user.id || req.user._id;
    const { page = 1, limit = 10, status } = req.query;

    const query = { patient: patientId };
    if (status) query.sampleStatus = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [bookings, total] = await Promise.all([
      LabTestBooking.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('phlebotomist', 'name phone')
        .lean(),
      LabTestBooking.countDocuments(query)
    ]);

    const pagination = {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      totalResults: total
    };

    return responseHelper.sendPaginated(res, bookings, pagination, 'Bookings loaded');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get phlebotomist's assigned tasks
 * @route   GET /api/v1/lab-test-bookings/phlebotomist-tasks
 * @access  Private (Phlebotomist / Medical Staff)
 */
exports.getPhlebotomistBookings = async (req, res, next) => {
  try {
    const phlebotomistId = req.user.id || req.user._id;
    const { date, status } = req.query;

    const query = { phlebotomist: phlebotomistId };
    if (status) query.sampleStatus = status;
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.scheduledDate = { $gte: startOfDay, $lte: endOfDay };
    }

    const bookings = await LabTestBooking.find(query)
      .sort({ scheduledDate: 1 })
      .populate('patient', 'name phone address coordinates')
      .lean();

    return responseHelper.sendSuccess(res, { bookings }, 'Assigned tasks loaded');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign phlebotomist to booking
 * @route   PATCH /api/v1/lab-test-bookings/:id/assign
 * @access  Private (Admin / Platform Admin)
 */
exports.assignPhlebotomist = async (req, res, next) => {
  try {
    const { phlebotomistId } = req.body;
    const booking = await LabTestBooking.findByIdAndUpdate(
      req.params.id,
      {
        phlebotomist: phlebotomistId,
        phlebotomistAssignedAt: new Date(),
        $push: {
          sampleStatusHistory: {
            status: 'SCHEDULED',
            timestamp: new Date(),
            updatedBy: req.user.id || req.user._id,
            notes: 'Phlebotomist assigned'
          }
        }
      },
      { new: true }
    ).populate('phlebotomist', 'name phone email');

    if (!booking) {
      return responseHelper.sendNotFound(res, 'Booking not found');
    }

    return responseHelper.sendSuccess(res, { booking }, 'Phlebotomist assigned successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update sample status along tracking pipeline
 * @route   PATCH /api/v1/lab-test-bookings/:id/status
 * @access  Private (Phlebotomist / Admin)
 */
exports.updateSampleStatus = async (req, res, next) => {
  try {
    const { sampleStatus, notes, barcodeId, numberOfTubes, temperature, handoffTo } = req.body;
    const userId = req.user.id || req.user._id;

    const booking = await LabTestBooking.findById(req.params.id);
    if (!booking) {
      return responseHelper.sendNotFound(res, 'Booking not found');
    }

    booking.sampleStatus = sampleStatus;
    booking.sampleStatusHistory.push({
      status: sampleStatus,
      timestamp: new Date(),
      updatedBy: userId,
      notes: notes || `Sample status changed to ${sampleStatus}`
    });

    if (sampleStatus === 'COLLECTED') {
      booking.sampleDetails = {
        collectedAt: new Date(),
        numberOfTubes: numberOfTubes || 1,
        barcodeId: barcodeId || `SMP-${Date.now().toString(36).toUpperCase()}`,
        temperature: temperature || 'Ambient'
      };
    }

    if (sampleStatus === 'AT_LAB' && handoffTo) {
      booking.sampleDetails.handoffConfirmed = true;
      booking.sampleDetails.handoffAt = new Date();
      booking.sampleDetails.handoffTo = handoffTo;
    }

    await booking.save();
    return responseHelper.sendSuccess(res, { booking }, `Sample status updated to ${sampleStatus}`);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload diagnostic test report
 * @route   POST /api/v1/lab-test-bookings/:id/report
 * @access  Private (Admin / Platform Admin / Pathlab)
 */
exports.uploadReport = async (req, res, next) => {
  try {
    const { reportUrl, isAbnormal = false, doctorNotes } = req.body;
    const userId = req.user.id || req.user._id;

    const booking = await LabTestBooking.findById(req.params.id);
    if (!booking) {
      return responseHelper.sendNotFound(res, 'Booking not found');
    }

    booking.report = {
      url: reportUrl,
      uploadedAt: new Date(),
      uploadedBy: userId,
      isAbnormal,
      doctorNotes
    };
    booking.sampleStatus = 'REPORT_READY';
    booking.sampleStatusHistory.push({
      status: 'REPORT_READY',
      timestamp: new Date(),
      updatedBy: userId,
      notes: 'Diagnostic report uploaded and ready for viewing'
    });

    await booking.save();
    return responseHelper.sendSuccess(res, { booking }, 'Report uploaded successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel booking
 * @route   PATCH /api/v1/lab-test-bookings/:id/cancel
 * @access  Private (Patient / Admin)
 */
exports.cancelBooking = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const userId = req.user.id || req.user._id;

    const booking = await LabTestBooking.findById(req.params.id);
    if (!booking) {
      return responseHelper.sendNotFound(res, 'Booking not found');
    }

    if (['COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'REPORT_READY'].includes(booking.sampleStatus)) {
      return responseHelper.sendBadRequest(res, 'Cannot cancel booking after sample has been collected');
    }

    booking.cancellation = {
      cancelledAt: new Date(),
      cancelledBy: userId,
      reason: reason || 'Cancelled by user',
      refundStatus: booking.paymentStatus === 'PAID' ? 'PENDING' : 'DENIED'
    };

    await booking.save();
    return responseHelper.sendSuccess(res, { booking }, 'Booking cancelled successfully');
  } catch (error) {
    next(error);
  }
};
