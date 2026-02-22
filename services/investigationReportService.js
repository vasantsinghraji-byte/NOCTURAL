/**
 * Investigation Report Service
 *
 * Handles the full workflow for investigation reports:
 * - Upload and storage
 * - AI analysis (via Gemini)
 * - Doctor assignment and review
 */

const InvestigationReport = require('../models/investigationReport');
const User = require('../models/user');
const geminiService = require('./geminiAnalysisService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');
const path = require('path');
const {
  INVESTIGATION_REPORT_STATUS,
  INVESTIGATION_REPORT_TYPES,
  REPORT_ASSIGNMENT_TYPE
} = require('../constants/healthConstants');

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_URL_PROTOCOLS = ['https:'];
const UPLOADS_BASE_DIR = path.resolve('./uploads');

/**
 * Validate file URL/path before sending to AI analysis
 * Prevents SSRF, path traversal, and invalid file types
 */
const validateFileForAnalysis = (file) => {
  if (!file.url || typeof file.url !== 'string') {
    throw new Error('File URL is missing or invalid');
  }

  if (!file.mimeType || !ALLOWED_MIME_TYPES.includes(file.mimeType)) {
    throw new Error(`Invalid file type: ${file.mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }

  if (file.url.startsWith('http')) {
    let parsed;
    try {
      parsed = new URL(file.url);
    } catch {
      throw new Error('Invalid file URL format');
    }
    if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error(`Only HTTPS URLs are allowed, got: ${parsed.protocol}`);
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0' || parsed.hostname.startsWith('169.254.') || parsed.hostname.startsWith('10.') || parsed.hostname.startsWith('192.168.') || parsed.hostname.endsWith('.internal')) {
      throw new Error('URLs pointing to internal/private addresses are not allowed');
    }
  } else {
    const resolvedPath = path.resolve(file.url.startsWith('/') ? `.${file.url}` : file.url);
    if (!resolvedPath.startsWith(UPLOADS_BASE_DIR)) {
      throw new Error('File path must be within the uploads directory');
    }
  }
};

/**
 * Create a new investigation report
 */
const createReport = async (patientId, reportData, files) => {
  const report = new InvestigationReport({
    patient: patientId,
    title: reportData.title,
    description: reportData.description,
    reportType: reportData.reportType,
    reportDate: new Date(reportData.reportDate),
    files: files.map(file => ({
      originalName: file.originalname,
      fileName: file.filename || file.key,
      mimeType: file.mimetype,
      size: file.size,
      url: file.location || `/uploads/investigation-reports/${file.filename}`,
      publicId: file.key // For S3
    })),
    tags: reportData.tags || [],
    linkedBooking: reportData.linkedBooking
  });

  await report.save();

  // Trigger async AI analysis
  triggerAIAnalysis(report._id).catch(err => {
    logger.error('Failed to trigger AI analysis', { reportId: report._id, error: err.message });
  });

  return report;
};

/**
 * Trigger AI analysis for a report
 */
const triggerAIAnalysis = async (reportId) => {
  const report = await InvestigationReport.findById(reportId);
  if (!report) {
    throw new Error('Report not found');
  }

  // Check if AI is available
  if (!geminiService.isAvailable()) {
    logger.warn('AI analysis skipped - GEMINI_API_KEY not configured', { reportId });
    report.status = INVESTIGATION_REPORT_STATUS.AI_FAILED;
    report.aiAnalysis = {
      status: 'FAILED',
      error: {
        code: 'AI_NOT_CONFIGURED',
        message: 'AI analysis is not available. Please configure GEMINI_API_KEY or request a doctor review directly.',
        retryable: false
      }
    };
    await report.save();
    return report;
  }

  // Update status to analyzing
  report.status = INVESTIGATION_REPORT_STATUS.AI_ANALYZING;
  report.aiAnalysis = {
    status: 'IN_PROGRESS',
    startedAt: new Date()
  };
  await report.save();

  try {
    // Validate all file URLs/paths before sending to AI
    for (const file of report.files) {
      validateFileForAnalysis(file);
    }

    let analysisResult;

    // Analyze based on file storage type
    if (report.files.length === 1) {
      const file = report.files[0];
      if (file.url.startsWith('http')) {
        analysisResult = await geminiService.analyzeFromUrl(file.url, file.mimeType);
      } else {
        const filePath = file.url.startsWith('/')
          ? `.${file.url}`
          : file.url;
        analysisResult = await geminiService.analyzeReport(filePath, file.mimeType);
      }
    } else {
      // Multiple files
      const files = report.files.map(f => ({
        path: f.url.startsWith('http') ? f.url : `.${f.url}`,
        mimeType: f.mimeType
      }));
      analysisResult = await geminiService.analyzeMultipleFiles(files);
    }

    // Format and save analysis
    const formattedAnalysis = geminiService.formatAnalysisForStorage(analysisResult);

    report.aiAnalysis = {
      ...report.aiAnalysis,
      ...formattedAnalysis,
      status: formattedAnalysis.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED'
    };

    if (formattedAnalysis.status === 'COMPLETED') {
      report.status = INVESTIGATION_REPORT_STATUS.AI_ANALYZED;
    } else {
      report.status = INVESTIGATION_REPORT_STATUS.AI_FAILED;
    }

    await report.save();

    // Notify patient of analysis completion
    if (report.status === INVESTIGATION_REPORT_STATUS.AI_ANALYZED) {
      await notifyPatientAnalysisComplete(report);
    }

    return report;
  } catch (error) {
    logger.error('AI analysis failed', { reportId, error: error.message });

    report.status = INVESTIGATION_REPORT_STATUS.AI_FAILED;
    report.aiAnalysis = {
      ...report.aiAnalysis,
      status: 'FAILED',
      error: {
        code: 'ANALYSIS_ERROR',
        message: error.message,
        retryable: true
      }
    };
    await report.save();

    throw error;
  }
};

/**
 * Retry failed AI analysis
 */
const retryAIAnalysis = async (reportId, patientId) => {
  const report = await InvestigationReport.findOne({
    _id: reportId,
    patient: patientId,
    status: INVESTIGATION_REPORT_STATUS.AI_FAILED
  });

  if (!report) {
    throw new Error('Report not found or not in failed state');
  }

  return triggerAIAnalysis(reportId);
};

/**
 * Request doctor review - supports all three assignment types
 */
const requestDoctorReview = async (reportId, patientId, options) => {
  const { assignmentType, doctorId, specialization } = options;

  const report = await InvestigationReport.findOne({
    _id: reportId,
    patient: patientId,
    status: { $in: [INVESTIGATION_REPORT_STATUS.AI_ANALYZED, INVESTIGATION_REPORT_STATUS.AI_FAILED] }
  });

  if (!report) {
    throw new Error('Report not found or not ready for review');
  }

  // Build doctor review object
  const doctorReview = {
    assignmentType,
    assignedAt: new Date(),
    status: 'PENDING'
  };

  switch (assignmentType) {
    case REPORT_ASSIGNMENT_TYPE.MANUAL:
      // Admin assigns specific doctor
      if (!doctorId) {
        throw new Error('Doctor ID required for manual assignment');
      }
      const doctor = await User.findOne({ _id: doctorId, role: 'doctor', isActive: true });
      if (!doctor) {
        throw new Error('Doctor not found');
      }
      doctorReview.assignedTo = doctorId;
      doctorReview.assignedBy = options.assignedBy;
      break;

    case REPORT_ASSIGNMENT_TYPE.PATIENT_CHOICE:
      // Patient chooses doctor
      if (!doctorId) {
        throw new Error('Doctor ID required for patient choice');
      }
      const chosenDoctor = await User.findOne({ _id: doctorId, role: 'doctor', isActive: true });
      if (!chosenDoctor) {
        throw new Error('Doctor not found');
      }
      doctorReview.assignedTo = doctorId;
      doctorReview.assignedBy = patientId;
      break;

    case REPORT_ASSIGNMENT_TYPE.AUTO_QUEUE:
      // Goes to specialization queue
      if (!specialization) {
        throw new Error('Specialization required for auto-queue');
      }
      doctorReview.requiredSpecialization = specialization;
      break;

    default:
      throw new Error('Invalid assignment type');
  }

  report.doctorReview = doctorReview;
  report.status = INVESTIGATION_REPORT_STATUS.PENDING_DOCTOR_REVIEW;
  await report.save();

  // Notify assigned doctor if applicable
  if (doctorReview.assignedTo) {
    await notifyDoctorNewReview(report, doctorReview.assignedTo);
  }

  return report;
};

/**
 * Doctor picks report from auto-queue
 */
const pickReportFromQueue = async (reportId, doctorId) => {
  const doctor = await User.findById(doctorId);
  if (!doctor || doctor.role !== 'doctor') {
    throw new Error('Invalid doctor');
  }

  const report = await InvestigationReport.findOneAndUpdate(
    {
      _id: reportId,
      'doctorReview.assignmentType': REPORT_ASSIGNMENT_TYPE.AUTO_QUEUE,
      'doctorReview.assignedTo': { $exists: false },
      status: INVESTIGATION_REPORT_STATUS.PENDING_DOCTOR_REVIEW
    },
    {
      $set: {
        'doctorReview.assignedTo': doctorId,
        'doctorReview.assignedAt': new Date()
      }
    },
    { new: true }
  );

  if (!report) {
    throw new Error('Report not available or already picked');
  }

  return report;
};

/**
 * Submit doctor review
 */
const submitDoctorReview = async (reportId, doctorId, reviewData) => {
  const report = await InvestigationReport.findOne({
    _id: reportId,
    'doctorReview.assignedTo': doctorId,
    status: { $in: [INVESTIGATION_REPORT_STATUS.PENDING_DOCTOR_REVIEW, INVESTIGATION_REPORT_STATUS.DOCTOR_REVIEWING] }
  });

  if (!report) {
    throw new Error('Report not found or not assigned to this doctor');
  }

  // Update review data
  report.doctorReview = {
    ...report.doctorReview,
    status: 'COMPLETED',
    completedAt: new Date(),
    interpretation: reviewData.interpretation,
    findings: reviewData.findings || [],
    recommendations: reviewData.recommendations || [],
    followUpRequired: reviewData.followUpRequired || false,
    followUpNotes: reviewData.followUpNotes,
    followUpDate: reviewData.followUpDate ? new Date(reviewData.followUpDate) : null,
    aiAccuracyFeedback: reviewData.aiAccuracyFeedback,
    privateNotes: reviewData.privateNotes,
    patientNotes: reviewData.patientNotes
  };

  report.status = INVESTIGATION_REPORT_STATUS.REVIEWED;
  await report.save();

  // Notify patient
  await notifyPatientReviewComplete(report);

  return report;
};

/**
 * Reject report (doctor declines to review)
 */
const rejectReport = async (reportId, doctorId, reason) => {
  const report = await InvestigationReport.findOne({
    _id: reportId,
    'doctorReview.assignedTo': doctorId,
    status: INVESTIGATION_REPORT_STATUS.PENDING_DOCTOR_REVIEW
  });

  if (!report) {
    throw new Error('Report not found or not assigned to this doctor');
  }

  report.doctorReview.status = 'REJECTED';
  report.doctorReview.privateNotes = reason;
  report.status = INVESTIGATION_REPORT_STATUS.REJECTED;

  // If it was auto-queue, put it back in queue
  if (report.doctorReview.assignmentType === REPORT_ASSIGNMENT_TYPE.AUTO_QUEUE) {
    report.doctorReview.assignedTo = undefined;
    report.status = INVESTIGATION_REPORT_STATUS.PENDING_DOCTOR_REVIEW;
  }

  await report.save();
  return report;
};

/**
 * Get report details with populated fields
 */
const getReportDetails = async (reportId, patientId) => {
  const report = await InvestigationReport.findOne({
    _id: reportId,
    patient: patientId,
    isActive: true
  })
    .populate('doctorReview.assignedTo', 'name email specialization profilePhoto')
    .populate('patientQuestions.answeredBy', 'name');

  if (!report) {
    throw new Error('Report not found');
  }

  return report;
};

/**
 * Patient asks question about reviewed report
 */
const askQuestion = async (reportId, patientId, question) => {
  const report = await InvestigationReport.findOne({
    _id: reportId,
    patient: patientId,
    status: INVESTIGATION_REPORT_STATUS.REVIEWED
  });

  if (!report) {
    throw new Error('Report not found or not yet reviewed');
  }

  report.patientQuestions.push({
    question,
    askedAt: new Date()
  });

  await report.save();

  // Notify doctor of new question
  if (report.doctorReview?.assignedTo) {
    await notifyDoctorNewQuestion(report, report.doctorReview.assignedTo);
  }

  return report;
};

/**
 * Doctor answers patient question
 */
const answerQuestion = async (reportId, questionId, doctorId, answer) => {
  const report = await InvestigationReport.findOne({
    _id: reportId,
    'doctorReview.assignedTo': doctorId
  });

  if (!report) {
    throw new Error('Report not found or not assigned to this doctor');
  }

  const question = report.patientQuestions.id(questionId);
  if (!question) {
    throw new Error('Question not found');
  }

  question.answer = answer;
  question.answeredBy = doctorId;
  question.answeredAt = new Date();

  await report.save();

  // Notify patient
  await notifyPatientQuestionAnswered(report, question);

  return report;
};

/**
 * Get available doctors for patient choice
 */
const getAvailableDoctors = async (specialization) => {
  const query = {
    role: 'doctor',
    isActive: true,
    isAvailable: true
  };

  if (specialization) {
    query.specialization = specialization;
  }

  return User.find(query)
    .select('name email specialization profilePhoto rating reviewCount')
    .sort({ rating: -1 })
    .limit(20);
};

/**
 * Get specializations for auto-queue
 */
const getSpecializations = async () => {
  const specializations = await User.distinct('specialization', {
    role: 'doctor',
    isActive: true,
    specialization: { $exists: true, $ne: '' }
  });

  return specializations.sort();
};

/**
 * Patient acknowledges reviewed report
 */
const acknowledgeReport = async (reportId, patientId) => {
  const report = await InvestigationReport.findOneAndUpdate(
    {
      _id: reportId,
      patient: patientId,
      status: INVESTIGATION_REPORT_STATUS.REVIEWED,
      patientAcknowledged: false
    },
    {
      patientAcknowledged: true,
      patientAcknowledgedAt: new Date()
    },
    { new: true }
  );

  if (!report) {
    throw new Error('Report not found or already acknowledged');
  }

  return report;
};

/**
 * Delete report (soft delete)
 */
const deleteReport = async (reportId, patientId) => {
  const report = await InvestigationReport.findOneAndUpdate(
    {
      _id: reportId,
      patient: patientId,
      isActive: true
    },
    {
      isActive: false,
      deletedAt: new Date(),
      deletedBy: patientId,
      deletedByModel: 'Patient'
    },
    { new: true }
  );

  if (!report) {
    throw new Error('Report not found');
  }

  return report;
};

// Notification helpers
const notifyPatientAnalysisComplete = async (report) => {
  try {
    await notificationService.createNotification({
      recipient: report.patient,
      recipientModel: 'Patient',
      type: 'REPORT_ANALYZED',
      title: 'Report Analysis Complete',
      message: `AI analysis of your ${report.title} is complete. You can now request a doctor review.`,
      data: { reportId: report._id }
    });
  } catch (err) {
    logger.error('Failed to send analysis complete notification', { error: err.message });
  }
};

const notifyDoctorNewReview = async (report, doctorId) => {
  try {
    await notificationService.createNotification({
      recipient: doctorId,
      recipientModel: 'User',
      type: 'NEW_REPORT_REVIEW',
      title: 'New Report to Review',
      message: `A patient has requested your review for their investigation report.`,
      data: { reportId: report._id }
    });
  } catch (err) {
    logger.error('Failed to send new review notification', { error: err.message });
  }
};

const notifyPatientReviewComplete = async (report) => {
  try {
    await notificationService.createNotification({
      recipient: report.patient,
      recipientModel: 'Patient',
      type: 'REPORT_REVIEWED',
      title: 'Doctor Review Complete',
      message: `Dr. review of your ${report.title} is complete. Check the findings and recommendations.`,
      data: { reportId: report._id }
    });
  } catch (err) {
    logger.error('Failed to send review complete notification', { error: err.message });
  }
};

const notifyDoctorNewQuestion = async (report, doctorId) => {
  try {
    await notificationService.createNotification({
      recipient: doctorId,
      recipientModel: 'User',
      type: 'PATIENT_QUESTION',
      title: 'New Patient Question',
      message: `A patient has a question about their reviewed report.`,
      data: { reportId: report._id }
    });
  } catch (err) {
    logger.error('Failed to send question notification', { error: err.message });
  }
};

const notifyPatientQuestionAnswered = async (report, question) => {
  try {
    await notificationService.createNotification({
      recipient: report.patient,
      recipientModel: 'Patient',
      type: 'QUESTION_ANSWERED',
      title: 'Your Question Answered',
      message: `The doctor has answered your question about ${report.title}.`,
      data: { reportId: report._id, questionId: question._id }
    });
  } catch (err) {
    logger.error('Failed to send answer notification', { error: err.message });
  }
};

module.exports = {
  createReport,
  triggerAIAnalysis,
  retryAIAnalysis,
  requestDoctorReview,
  pickReportFromQueue,
  submitDoctorReview,
  rejectReport,
  getReportDetails,
  askQuestion,
  answerQuestion,
  getAvailableDoctors,
  getSpecializations,
  acknowledgeReport,
  deleteReport
};
