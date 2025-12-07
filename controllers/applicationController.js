const Application = require('../models/Application');
const Duty = require('../models/Duty');
const { paginate, sendPaginatedResponse } = require('../utils/pagination');

// Get my applications with pagination
exports.getMyApplications = async (req, res, next) => {
  try {
    const result = await paginate(
      Application,
      { applicant: req.user.id },
      {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sort: req.query.sort || { appliedAt: -1 },
        populate: 'duty'
      }
    );

    sendPaginatedResponse(res, result);
  } catch (error) {
    next(error);
  }
};

// Get applications for a duty with pagination (admin only)
exports.getDutyApplications = async (req, res, next) => {
  try {
    const duty = await Duty.findById(req.params.dutyId);

    if (!duty) {
      return res.status(404).json({
        success: false,
        message: 'Duty not found'
      });
    }

    if (duty.postedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const result = await paginate(
      Application,
      { duty: req.params.dutyId },
      {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sort: req.query.sort || { appliedAt: -1 },
        populate: 'applicant:name specialty rating completedDuties'
      }
    );

    sendPaginatedResponse(res, result);
  } catch (error) {
    next(error);
  }
};

// Apply for duty
exports.applyForDuty = async (req, res, next) => {
  try {
    const { duty, coverLetter } = req.body;

    const dutyExists = await Duty.findById(duty);
    
    if (!dutyExists) {
      return res.status(404).json({
        success: false,
        message: 'Duty not found'
      });
    }

    if (dutyExists.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'This duty is no longer accepting applications'
      });
    }

    const existingApplication = await Application.findOne({
      duty,
      applicant: req.user.id
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'You have already applied for this duty'
      });
    }

    const application = await Application.create({
      duty,
      applicant: req.user.id,
      coverLetter
    });

    await Duty.findByIdAndUpdate(duty, {
      $inc: { applicationsCount: 1 }
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application
    });
  } catch (error) {
    next(error);
  }
};

// Update application status (admin only)
exports.updateApplicationStatus = async (req, res, next) => {
  try {
    const { status, notes } = req.body;

    const application = await Application.findById(req.params.id).populate('duty');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.duty.postedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    application.status = status;
    await application.save();

    if (status === 'ACCEPTED') {
      await Duty.findByIdAndUpdate(application.duty._id, {
        status: 'FILLED'
      });
    }

    res.status(200).json({
      success: true,
      message: `Application ${status.toLowerCase()} successfully`,
      application
    });
  } catch (error) {
    next(error);
  }
};

// Withdraw application
exports.withdrawApplication = async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.applicant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Can only withdraw pending applications'
      });
    }

    application.status = 'WITHDRAWN';
    await application.save();

    await Duty.findByIdAndUpdate(application.duty, {
      $inc: { applicationsCount: -1 }
    });

    res.status(200).json({
      success: true,
      message: 'Application withdrawn successfully'
    });
  } catch (error) {
    next(error);
  }
};