const BookingCompletionOutbox = require('../models/bookingCompletionOutbox');
const NurseBooking = require('../models/nurseBooking');
const HealthMetric = require('../models/healthMetric');
const HealthRecord = require('../models/healthRecord');
const healthMetricService = require('./healthMetricService');
const healthRecordService = require('./healthRecordService');
const logger = require('../utils/logger');

const buildVitals = (serviceReport = {}) => {
  const checked = serviceReport.vitalsChecked || {};
  const vitals = [];
  if (checked.bloodPressure) {
    const [systolic, diastolic] = checked.bloodPressure.split('/').map(Number);
    if (systolic) vitals.push({ metricType: 'BP_SYSTOLIC', value: systolic, unit: 'mmHg' });
    if (diastolic) vitals.push({ metricType: 'BP_DIASTOLIC', value: diastolic, unit: 'mmHg' });
  }
  if (checked.heartRate) vitals.push({ metricType: 'HEART_RATE', value: checked.heartRate, unit: 'bpm' });
  if (checked.temperature) vitals.push({ metricType: 'TEMPERATURE', value: checked.temperature, unit: 'celsius' });
  if (checked.oxygenLevel) vitals.push({ metricType: 'OXYGEN_LEVEL', value: checked.oxygenLevel, unit: '%' });
  if (checked.bloodSugar) vitals.push({ metricType: 'BLOOD_SUGAR', value: checked.bloodSugar, unit: 'mg/dL' });
  return vitals;
};

const processOne = async (outboxId) => {
  const claimed = await BookingCompletionOutbox.findOneAndUpdate(
    {
      _id: outboxId,
      status: { $in: ['PENDING', 'RETRY_PENDING'] },
      nextAttemptAt: { $lte: new Date() }
    },
    {
      $set: { status: 'PROCESSING', lockedAt: new Date() },
      $inc: { attemptCount: 1 }
    },
    { new: true }
  );
  if (!claimed) return false;

  try {
    const booking = await NurseBooking.findById(claimed.booking);
    if (!booking || booking.status !== 'COMPLETED') {
      throw new Error('Completed booking no longer exists');
    }

    const report = booking.actualService?.serviceReport || {};
    const vitals = buildVitals(report);
    if (vitals.length > 0) {
      const existingTypes = await HealthMetric.find({
        'source.bookingId': booking._id
      }).distinct('metricType');
      const missingVitals = vitals.filter(vital => !existingTypes.includes(vital.metricType));
      if (missingVitals.length > 0) {
        await healthMetricService.recordMultipleMetrics(booking.patient, missingVitals, {
          type: 'BOOKING',
          bookingId: booking._id,
          providerId: booking.serviceProvider
        });
      }
    }

    if ((report.observations || report.recommendations) &&
        !await HealthRecord.exists({ 'source.bookingId': booking._id })) {
      await healthRecordService.captureBookingVitals(
        booking.patient,
        booking._id,
        report,
        booking.serviceProvider
      );
    }

    await BookingCompletionOutbox.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastError: null
        },
        $unset: { lockedAt: 1 }
      }
    );
    return true;
  } catch (error) {
    const deadLetter = claimed.attemptCount >= 10;
    await BookingCompletionOutbox.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: deadLetter ? 'DEAD_LETTER' : 'RETRY_PENDING',
          lastError: error.message,
          nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000)
        },
        $unset: { lockedAt: 1 }
      }
    );
    logger.error('Booking completion reconciliation failed', {
      bookingId: claimed.booking,
      error: error.message
    });
    return false;
  }
};

const processPending = async ({ limit = 100 } = {}) => {
  const pending = await BookingCompletionOutbox.find({
    status: { $in: ['PENDING', 'RETRY_PENDING'] },
    nextAttemptAt: { $lte: new Date() }
  })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();

  const results = await Promise.all(pending.map(item => processOne(item._id)));
  return {
    attempted: results.length,
    completed: results.filter(Boolean).length
  };
};

module.exports = { buildVitals, processOne, processPending };
