/**
 * Consultation Controller
 *
 * Doctor-patient telemedicine consultations, real-time messaging,
 * and digital prescription generation.
 */

const Consultation = require('../models/consultation');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Request a doctor consultation
 * @route   POST /api/v1/consultations
 * @access  Private (Patient)
 */
exports.requestConsultation = async (req, res, next) => {
  try {
    const patientId = req.user.id || req.user._id;
    const {
      type = 'CHAT',
      requestedSpecialization = 'General Medicine',
      chiefComplaint,
      symptoms = [],
      symptomDuration,
      attachments = [],
      isScheduled = false,
      scheduledAt
    } = req.body;

    const consultationFee = type === 'VIDEO' ? 500 : (type === 'AUDIO' ? 350 : 250);
    const platformFee = 50;
    const totalAmount = consultationFee + platformFee;

    const consultation = await Consultation.create({
      patient: patientId,
      type,
      requestedSpecialization,
      chiefComplaint,
      symptoms,
      symptomDuration,
      attachments,
      isScheduled,
      scheduledAt: isScheduled ? scheduledAt : undefined,
      pricing: {
        consultationFee,
        platformFee,
        totalAmount,
        currency: 'INR'
      },
      status: 'REQUESTED'
    });

    return responseHelper.sendCreated(res, { consultation }, 'Consultation requested successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get consultation by ID
 * @route   GET /api/v1/consultations/:id
 * @access  Private (Patient / Doctor / Admin)
 */
exports.getConsultation = async (req, res, next) => {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate('patient', 'name phone email age gender bloodGroup medicalHistory')
      .populate('doctor', 'name email specialty qualification ratings')
      .populate('prescription.labTests.test', 'name category pricing reportTurnaroundHours');

    if (!consultation) {
      return responseHelper.sendNotFound(res, 'Consultation not found');
    }

    const userId = (req.user.id || req.user._id).toString();
    const isPatient = consultation.patient && consultation.patient._id.toString() === userId;
    const isDoctor = consultation.doctor && consultation.doctor._id.toString() === userId;
    const isAdmin = ['admin', 'platform_admin'].includes(req.user.role);

    // If it's REQUESTED, any doctor in the specialization can view it to accept
    const isAvailableDoctor = req.user.role === 'doctor' && consultation.status === 'REQUESTED';

    if (!isPatient && !isDoctor && !isAdmin && !isAvailableDoctor) {
      return responseHelper.sendForbidden(res, 'Access denied to this consultation');
    }

    return responseHelper.sendSuccess(res, { consultation }, 'Consultation details loaded');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get patient's consultations
 * @route   GET /api/v1/consultations/my-consultations
 * @access  Private (Patient)
 */
exports.getMyConsultations = async (req, res, next) => {
  try {
    const patientId = req.user.id || req.user._id;
    const { page = 1, limit = 10, status } = req.query;

    const query = { patient: patientId };
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [consultations, total] = await Promise.all([
      Consultation.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('doctor', 'name specialty qualification')
        .lean(),
      Consultation.countDocuments(query)
    ]);

    const pagination = {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      totalResults: total
    };

    return responseHelper.sendPaginated(res, consultations, pagination, 'Consultations loaded');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get doctor queue (unassigned consultation requests)
 * @route   GET /api/v1/consultations/doctor-queue
 * @access  Private (Doctor)
 */
exports.getDoctorQueue = async (req, res, next) => {
  try {
    const { specialization } = req.query;
    const query = { status: 'REQUESTED' };

    if (specialization) {
      query.requestedSpecialization = specialization;
    }

    const queue = await Consultation.find(query)
      .sort({ requestedAt: 1 })
      .populate('patient', 'name age gender bloodGroup')
      .lean();

    return responseHelper.sendSuccess(res, { queue }, 'Consultation queue retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get doctor's active & past consultations
 * @route   GET /api/v1/consultations/doctor-history
 * @access  Private (Doctor)
 */
exports.getDoctorConsultations = async (req, res, next) => {
  try {
    const doctorId = req.user.id || req.user._id;
    const { status } = req.query;

    const query = { doctor: doctorId };
    if (status) query.status = status;

    const consultations = await Consultation.find(query)
      .sort({ createdAt: -1 })
      .populate('patient', 'name age gender phone')
      .lean();

    return responseHelper.sendSuccess(res, { consultations }, 'Consultations retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Doctor accepts a requested consultation
 * @route   PATCH /api/v1/consultations/:id/accept
 * @access  Private (Doctor)
 */
exports.acceptConsultation = async (req, res, next) => {
  try {
    const doctorId = req.user.id || req.user._id;

    const consultation = await Consultation.findOneAndUpdate(
      { _id: req.params.id, status: 'REQUESTED' },
      {
        doctor: doctorId,
        status: 'ACCEPTED',
        acceptedAt: new Date()
      },
      { new: true }
    ).populate('doctor', 'name specialty');

    if (!consultation) {
      return responseHelper.sendBadRequest(res, 'Consultation is no longer available or was already accepted');
    }

    return responseHelper.sendSuccess(res, { consultation }, 'Consultation accepted');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Start consultation session
 * @route   PATCH /api/v1/consultations/:id/start
 * @access  Private (Doctor)
 */
exports.startConsultation = async (req, res, next) => {
  try {
    const doctorId = req.user.id || req.user._id;
    const { sessionId } = req.body;

    const consultation = await Consultation.findOneAndUpdate(
      { _id: req.params.id, doctor: doctorId, status: 'ACCEPTED' },
      {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        sessionId: sessionId || `session_${Date.now()}`
      },
      { new: true }
    );

    if (!consultation) {
      return responseHelper.sendNotFound(res, 'Consultation not found or not in accepted state');
    }

    return responseHelper.sendSuccess(res, { consultation }, 'Consultation session started');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Complete consultation with diagnosis and prescription
 * @route   PATCH /api/v1/consultations/:id/complete
 * @access  Private (Doctor)
 */
exports.completeConsultation = async (req, res, next) => {
  try {
    const doctorId = req.user.id || req.user._id;
    const { assessment, prescription } = req.body;

    const consultation = await Consultation.findOne({
      _id: req.params.id,
      doctor: doctorId
    });

    if (!consultation) {
      return responseHelper.sendNotFound(res, 'Consultation not found');
    }

    if (consultation.status === 'COMPLETED') {
      return responseHelper.sendBadRequest(res, 'Consultation already completed');
    }

    consultation.status = 'COMPLETED';
    consultation.endedAt = new Date();
    if (consultation.startedAt) {
      consultation.duration = Math.round((consultation.endedAt - consultation.startedAt) / 60000);
    }

    if (assessment) {
      consultation.assessment = { ...consultation.assessment, ...assessment };
    }

    if (prescription) {
      consultation.prescription = {
        ...consultation.prescription,
        ...prescription,
        issuedAt: new Date()
      };
    }

    await consultation.save();

    return responseHelper.sendSuccess(res, { consultation }, 'Consultation completed and prescription saved');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send chat message inside consultation
 * @route   POST /api/v1/consultations/:id/messages
 * @access  Private (Patient / Doctor)
 */
exports.sendChatMessage = async (req, res, next) => {
  try {
    const { message, attachmentUrl } = req.body;
    const userId = req.user.id || req.user._id;
    const userRole = req.user.role || req.userType || 'patient';
    const senderType = userRole === 'doctor' ? 'doctor' : 'patient';

    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) {
      return responseHelper.sendNotFound(res, 'Consultation not found');
    }

    if (['COMPLETED', 'CANCELLED'].includes(consultation.status)) {
      return responseHelper.sendBadRequest(res, 'Cannot send messages to closed consultation');
    }

    const chatMessage = {
      sender: senderType,
      senderId: userId,
      message,
      attachmentUrl,
      timestamp: new Date()
    };

    consultation.chatMessages.push(chatMessage);
    await consultation.save();

    return responseHelper.sendCreated(res, { message: chatMessage }, 'Message sent');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel consultation
 * @route   PATCH /api/v1/consultations/:id/cancel
 * @access  Private (Patient / Doctor / Admin)
 */
exports.cancelConsultation = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const userRole = req.user.role || req.userType || 'patient';
    const cancelledBy = userRole === 'doctor' ? 'doctor' : (userRole === 'patient' ? 'patient' : 'system');

    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) {
      return responseHelper.sendNotFound(res, 'Consultation not found');
    }

    if (consultation.status === 'COMPLETED') {
      return responseHelper.sendBadRequest(res, 'Cannot cancel a completed consultation');
    }

    consultation.status = 'CANCELLED';
    consultation.cancellation = {
      cancelledBy,
      reason: reason || 'Cancelled by user',
      cancelledAt: new Date()
    };

    await consultation.save();
    return responseHelper.sendSuccess(res, { consultation }, 'Consultation cancelled');
  } catch (error) {
    next(error);
  }
};
