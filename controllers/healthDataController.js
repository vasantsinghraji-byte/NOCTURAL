/**
 * Health Data Controller
 *
 * HTTP request handlers for health records and metrics endpoints.
 * Thin layer that delegates to healthRecordService and healthMetricService.
 */

const healthRecordService = require('../services/healthRecordService');
const healthMetricService = require('../services/healthMetricService');
const DoctorNote = require('../models/doctorNote');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Get latest health record
 * @route   GET /api/v1/health-records/latest
 * @access  Private (Patient)
 */
exports.getLatestRecord = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;
    const record = await healthRecordService.getLatestRecord(patientId);

    responseHelper.sendSuccess(res, { record }, 'Health record loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get health record history
 * @route   GET /api/v1/health-records/history
 * @access  Private (Patient)
 */
exports.getRecordHistory = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;
    const { page, limit } = req.query;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10
    };

    const result = await healthRecordService.getRecordHistory(patientId, options);

    responseHelper.sendPaginated(
      res,
      result.records,
      result.pagination,
      'Record history loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get record by version
 * @route   GET /api/v1/health-records/version/:version
 * @access  Private (Patient)
 */
exports.getRecordByVersion = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;
    const version = parseInt(req.params.version);

    const record = await healthRecordService.getRecordByVersion(patientId, version);

    responseHelper.sendSuccess(res, { record }, 'Record version loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Append health record update
 * @route   POST /api/v1/health-records
 * @access  Private (Patient)
 */
exports.appendHealthUpdate = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const updates = req.body;

    const record = await healthRecordService.appendUpdate(patientId, updates, {
      type: 'PATIENT_ENTRY'
    });

    responseHelper.sendCreated(res, { record }, 'Health record updated');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get health metrics
 * @route   GET /api/v1/health-metrics
 * @access  Private (Patient)
 */
exports.getMetrics = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;
    const { metricType, startDate, endDate, abnormalOnly, page, limit } = req.query;

    const filters = {};
    if (metricType) filters.metricType = metricType;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (abnormalOnly === 'true') filters.isAbnormal = true;

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    };

    const result = await healthMetricService.getMetrics(patientId, filters, options);

    responseHelper.sendPaginated(
      res,
      result.metrics,
      result.pagination,
      'Metrics loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get latest metrics by type
 * @route   GET /api/v1/health-metrics/latest
 * @access  Private (Patient)
 */
exports.getLatestMetrics = async (req, res, next) => {
  try {
    const patientId = req.healthAccess?.patientId || req.user._id;
    const HealthMetric = require('../models/healthMetric');

    const metrics = await HealthMetric.getLatestByType(patientId);

    responseHelper.sendSuccess(res, { metrics }, 'Latest metrics loaded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Record a health metric
 * @route   POST /api/v1/health-metrics
 * @access  Private (Patient)
 */
exports.recordMetric = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const metricData = req.body;

    const metric = await healthMetricService.recordMetric(patientId, metricData, {
      type: 'MANUAL'
    });

    responseHelper.sendCreated(res, { metric }, 'Metric recorded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Record multiple metrics
 * @route   POST /api/v1/health-metrics/batch
 * @access  Private (Patient)
 */
exports.recordMultipleMetrics = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { metrics } = req.body;

    const result = await healthMetricService.recordMultipleMetrics(patientId, metrics, {
      type: 'MANUAL'
    });

    responseHelper.sendCreated(res, { metrics: result }, 'Metrics recorded');
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

/**
 * @desc    Get patient's visible doctor notes
 * @route   GET /api/v1/health-records/notes
 * @access  Private (Patient)
 */
exports.getPatientNotes = async (req, res, next) => {
  try {
    const patientId = req.user._id;
    const { page, limit } = req.query;

    const skip = ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20);

    const [notes, total] = await Promise.all([
      DoctorNote.find({
        patient: patientId,
        isConfidential: false,
        isActive: true
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit) || 20)
        .populate('doctor', 'name professional.primarySpecialization')
        .lean(),
      DoctorNote.countDocuments({
        patient: patientId,
        isConfidential: false,
        isActive: true
      })
    ]);

    responseHelper.sendPaginated(
      res,
      notes,
      {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        total,
        pages: Math.ceil(total / (parseInt(limit) || 20))
      },
      'Notes loaded'
    );
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
