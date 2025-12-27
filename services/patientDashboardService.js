/**
 * Patient Dashboard Service
 *
 * Business logic for the patient analytics dashboard.
 * Aggregates data from multiple sources for dashboard display.
 */

const Patient = require('../models/patient');
const NurseBooking = require('../models/nurseBooking');
const HealthRecord = require('../models/healthRecord');
const HealthMetric = require('../models/healthMetric');
const DoctorNote = require('../models/doctorNote');
const EmergencySummary = require('../models/emergencySummary');
const healthMetricService = require('./healthMetricService');
const emergencySummaryService = require('./emergencySummaryService');
const logger = require('../utils/logger');
const { ANALYTICS_PERIODS } = require('../constants/healthConstants');
const { NotFoundError } = require('../utils/errors');

class PatientDashboardService {
  /**
   * Get complete dashboard overview
   */
  async getDashboardOverview(patientId) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Fetch all dashboard data in parallel
    const [
      healthSummary,
      activeBookings,
      recentBookings,
      healthAlerts,
      intakeStatus
    ] = await Promise.all([
      this.getHealthSummary(patientId),
      this.getActiveBookings(patientId),
      this.getRecentBookings(patientId, 5),
      healthMetricService.getHealthAlerts(patientId),
      this.getIntakeStatus(patient)
    ]);

    return {
      patient: {
        name: patient.name,
        profilePhoto: patient.profilePhoto,
        dateOfBirth: patient.dateOfBirth,
        bloodGroup: patient.bloodGroup,
        totalBookings: patient.totalBookings,
        totalSpent: patient.totalSpent,
        memberSince: patient.createdAt
      },
      healthSummary,
      activeBookings,
      recentBookings,
      healthAlerts,
      intakeStatus,
      hasAbnormalMetrics: patient.hasAbnormalMetrics
    };
  }

  /**
   * Get health summary
   */
  async getHealthSummary(patientId) {
    // Get latest health record
    const healthRecord = await HealthRecord.getLatestApproved(patientId);

    // Get latest metrics
    const latestMetrics = await HealthMetric.getLatestByType(patientId);

    // Count active conditions and allergies
    const snapshot = healthRecord?.healthSnapshot || {};
    const activeConditions = (snapshot.conditions || []).filter(c => c.isActive !== false);
    const activeAllergies = (snapshot.allergies || []).filter(a => a.isActive !== false);
    const activeMedications = (snapshot.currentMedications || []).filter(m => m.isActive !== false);

    return {
      hasHealthRecord: !!healthRecord,
      recordVersion: healthRecord?.version,
      lastUpdated: healthRecord?.updatedAt,
      conditions: {
        count: activeConditions.length,
        items: activeConditions.slice(0, 3) // Top 3 for summary
      },
      allergies: {
        count: activeAllergies.length,
        hasCritical: activeAllergies.some(a => ['SEVERE', 'LIFE_THREATENING'].includes(a.severity)),
        items: activeAllergies.slice(0, 3)
      },
      medications: {
        count: activeMedications.length,
        items: activeMedications.slice(0, 3)
      },
      latestVitals: this.formatLatestVitals(latestMetrics),
      habits: snapshot.habits || {}
    };
  }

  /**
   * Format latest vitals for display
   */
  formatLatestVitals(latestMetrics) {
    const vitals = {};

    for (const [metricType, metric] of Object.entries(latestMetrics)) {
      vitals[metricType] = {
        value: metric.value,
        unit: metric.unit,
        measuredAt: metric.measuredAt,
        isAbnormal: metric.isAbnormal,
        abnormalityLevel: metric.abnormalityLevel
      };
    }

    return vitals;
  }

  /**
   * Get intake status for dashboard
   */
  getIntakeStatus(patient) {
    return {
      status: patient.intakeStatus,
      isComplete: patient.intakeStatus === 'APPROVED',
      isPending: ['PENDING_PATIENT', 'PENDING_REVIEW'].includes(patient.intakeStatus),
      completedAt: patient.intakeCompletedAt
    };
  }

  /**
   * Get active/upcoming bookings
   */
  async getActiveBookings(patientId) {
    const activeStatuses = ['REQUESTED', 'SEARCHING', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];

    const bookings = await NurseBooking.find({
      patient: patientId,
      status: { $in: activeStatuses }
    })
      .sort({ scheduledDate: 1, scheduledTime: 1 })
      .limit(5)
      .populate('serviceProvider', 'name phone rating profilePhoto')
      .lean();

    return bookings.map(booking => ({
      id: booking._id,
      serviceType: booking.serviceType,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime,
      status: booking.status,
      provider: booking.serviceProvider ? {
        name: booking.serviceProvider.name,
        phone: booking.serviceProvider.phone,
        rating: booking.serviceProvider.rating,
        profilePhoto: booking.serviceProvider.profilePhoto
      } : null,
      location: booking.serviceLocation,
      pricing: booking.pricing
    }));
  }

  /**
   * Get recent bookings
   */
  async getRecentBookings(patientId, limit = 5) {
    const bookings = await NurseBooking.find({
      patient: patientId,
      status: { $in: ['COMPLETED', 'CANCELLED'] }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('serviceProvider', 'name rating')
      .lean();

    return bookings.map(booking => ({
      id: booking._id,
      serviceType: booking.serviceType,
      scheduledDate: booking.scheduledDate,
      status: booking.status,
      completedAt: booking.statusTimestamps?.completedAt,
      provider: booking.serviceProvider?.name,
      rating: booking.patientRating?.overall,
      amount: booking.pricing?.payableAmount
    }));
  }

  /**
   * Get booking history with pagination
   */
  async getBookingHistory(patientId, options = {}) {
    const { page = 1, limit = 10, status, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    const query = { patient: patientId };

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    const [bookings, total] = await Promise.all([
      NurseBooking.find(query)
        .sort({ scheduledDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('serviceProvider', 'name phone rating')
        .lean(),
      NurseBooking.countDocuments(query)
    ]);

    return {
      bookings: bookings.map(b => this.formatBookingForHistory(b)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Format booking for history display
   */
  formatBookingForHistory(booking) {
    return {
      id: booking._id,
      serviceType: booking.serviceType,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime,
      status: booking.status,
      provider: booking.serviceProvider ? {
        name: booking.serviceProvider.name,
        rating: booking.serviceProvider.rating
      } : null,
      location: {
        city: booking.serviceLocation?.address?.city,
        type: booking.serviceLocation?.type
      },
      pricing: {
        total: booking.pricing?.totalAmount,
        paid: booking.payment?.status === 'PAID'
      },
      rating: booking.patientRating?.overall,
      serviceReport: booking.actualService?.serviceReport ? {
        hasVitals: !!(booking.actualService.serviceReport.vitalsChecked),
        hasObservations: !!(booking.actualService.serviceReport.observations)
      } : null,
      createdAt: booking.createdAt,
      completedAt: booking.statusTimestamps?.completedAt
    };
  }

  /**
   * Get medical timeline
   */
  async getMedicalTimeline(patientId, options = {}) {
    const { page = 1, limit = 20, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    // Get events from multiple sources
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const [bookings, healthRecords, doctorNotes] = await Promise.all([
      // Completed bookings
      NurseBooking.find({
        patient: patientId,
        status: 'COMPLETED',
        ...(Object.keys(dateFilter).length ? { 'statusTimestamps.completedAt': dateFilter } : {})
      })
        .sort({ 'statusTimestamps.completedAt': -1 })
        .limit(50)
        .lean(),

      // Health record versions
      HealthRecord.find({
        patient: patientId,
        status: 'APPROVED',
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),

      // Doctor notes (non-confidential)
      DoctorNote.find({
        patient: patientId,
        isConfidential: false,
        isActive: true,
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('doctor', 'name')
        .lean()
    ]);

    // Merge into unified timeline
    const events = [];

    // Add bookings
    for (const booking of bookings) {
      events.push({
        type: 'BOOKING',
        date: booking.statusTimestamps?.completedAt || booking.scheduledDate,
        title: `${booking.serviceType} Service`,
        description: booking.actualService?.serviceReport?.observations || 'Service completed',
        data: {
          bookingId: booking._id,
          serviceType: booking.serviceType,
          hasVitals: !!(booking.actualService?.serviceReport?.vitalsChecked)
        }
      });
    }

    // Add health records
    for (const record of healthRecords) {
      events.push({
        type: 'HEALTH_RECORD',
        date: record.createdAt,
        title: record.recordType === 'BASELINE' ? 'Initial Health Record' : 'Health Record Update',
        description: `Version ${record.version}`,
        data: {
          recordId: record._id,
          version: record.version,
          recordType: record.recordType
        }
      });
    }

    // Add doctor notes
    for (const note of doctorNotes) {
      events.push({
        type: 'DOCTOR_NOTE',
        date: note.createdAt,
        title: note.title,
        description: note.noteType,
        data: {
          noteId: note._id,
          noteType: note.noteType,
          doctorName: note.doctor?.name
        }
      });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Paginate
    const paginatedEvents = events.slice(skip, skip + limit);

    return {
      events: paginatedEvents,
      pagination: {
        page,
        limit,
        total: events.length,
        pages: Math.ceil(events.length / limit)
      }
    };
  }

  /**
   * Get health trends for charts
   */
  async getHealthTrends(patientId, metricTypes = [], period = ANALYTICS_PERIODS.MONTH) {
    if (metricTypes.length === 0) {
      // Default to primary metrics
      metricTypes = ['BP_SYSTOLIC', 'BP_DIASTOLIC', 'HEART_RATE', 'BLOOD_SUGAR'];
    }

    const dateRange = healthMetricService.getDateRangeForPeriod(period);
    const trends = {};

    for (const metricType of metricTypes) {
      const trendData = await healthMetricService.getTrends(patientId, metricType, dateRange);
      if (trendData.metrics.length > 0) {
        trends[metricType] = {
          data: trendData.metrics,
          stats: trendData.stats
        };
      }
    }

    return {
      period,
      dateRange,
      trends
    };
  }

  /**
   * Get emergency card data
   */
  async getEmergencyCard(patientId) {
    try {
      const summary = await emergencySummaryService.getEmergencySummary(patientId);
      const tokenStatus = await emergencySummaryService.getQRTokenStatus(patientId);

      return {
        summary: {
          patientName: summary.patientName,
          bloodGroup: summary.bloodGroup,
          age: summary.age,
          gender: summary.gender,
          criticalConditions: summary.criticalConditions,
          criticalAllergies: summary.criticalAllergies,
          currentMedications: summary.currentMedications,
          emergencyContacts: summary.emergencyContacts,
          primaryPhysician: summary.primaryPhysician,
          insurance: summary.insurance,
          specialInstructions: summary.specialInstructions,
          lastUpdated: summary.lastUpdated
        },
        qrToken: tokenStatus
      };
    } catch (error) {
      logger.warn('Failed to get emergency card', {
        patientId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Generate emergency QR code
   */
  async generateEmergencyQR(patientId, expiryHours = 24) {
    return emergencySummaryService.generateQRToken(patientId, expiryHours);
  }

  /**
   * Get patient statistics
   */
  async getPatientStats(patientId) {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    // Get booking statistics
    const [completedCount, cancelledCount, totalSpent] = await Promise.all([
      NurseBooking.countDocuments({ patient: patientId, status: 'COMPLETED' }),
      NurseBooking.countDocuments({ patient: patientId, status: 'CANCELLED' }),
      NurseBooking.aggregate([
        { $match: { patient: patient._id, 'payment.status': 'PAID' } },
        { $group: { _id: null, total: { $sum: '$pricing.payableAmount' } } }
      ])
    ]);

    // Get health metrics count
    const metricsCount = await HealthMetric.countDocuments({ patient: patientId });

    // Get doctor notes count
    const notesCount = await DoctorNote.countDocuments({
      patient: patientId,
      isActive: true,
      isConfidential: false
    });

    return {
      bookings: {
        total: patient.totalBookings,
        completed: completedCount,
        cancelled: cancelledCount
      },
      spending: {
        total: totalSpent[0]?.total || 0,
        average: completedCount > 0 ? Math.round((totalSpent[0]?.total || 0) / completedCount) : 0
      },
      health: {
        metricsRecorded: metricsCount,
        doctorNotes: notesCount,
        hasAbnormalMetrics: patient.hasAbnormalMetrics
      },
      memberSince: patient.createdAt,
      lastActive: patient.lastActive
    };
  }
}

module.exports = new PatientDashboardService();
