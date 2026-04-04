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
const User = require('../models/user');
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

    // Get latest metrics (only fields needed for vitals display)
    const latestMetrics = await HealthMetric.getLatestByType(patientId, 'value unit measuredAt isAbnormal abnormalityLevel');

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
   * Uses $unionWith aggregation to sort and paginate across collections at the DB level
   */
  async getMedicalTimeline(patientId, options = {}) {
    const { page = 1, limit = 20, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    const mongoose = require('mongoose');
    const patientObjectId = new mongoose.Types.ObjectId(patientId);

    // Build date filters per collection
    const bookingDateFilter = {};
    const recordDateFilter = {};
    if (startDate) {
      bookingDateFilter['statusTimestamps.completedAt'] = { $gte: new Date(startDate) };
      recordDateFilter.createdAt = { $gte: new Date(startDate) };
    }
    if (endDate) {
      bookingDateFilter['statusTimestamps.completedAt'] = {
        ...bookingDateFilter['statusTimestamps.completedAt'],
        $lte: new Date(endDate)
      };
      recordDateFilter.createdAt = {
        ...recordDateFilter.createdAt,
        $lte: new Date(endDate)
      };
    }

    // Count totals in parallel (fast with indexes, accurate pagination)
    const [bookingCount, recordCount, noteCount] = await Promise.all([
      NurseBooking.countDocuments({
        patient: patientObjectId,
        status: 'COMPLETED',
        ...bookingDateFilter
      }),
      HealthRecord.countDocuments({
        patient: patientObjectId,
        status: 'APPROVED',
        ...recordDateFilter
      }),
      DoctorNote.countDocuments({
        patient: patientObjectId,
        isConfidential: false,
        isActive: true,
        ...recordDateFilter
      })
    ]);

    const total = bookingCount + recordCount + noteCount;

    // Single aggregation pipeline with $unionWith for DB-level sort + paginate
    const events = await NurseBooking.aggregate([
      // Bookings: completed for this patient
      {
        $match: {
          patient: patientObjectId,
          status: 'COMPLETED',
          ...bookingDateFilter
        }
      },
      {
        $project: {
          type: { $literal: 'BOOKING' },
          date: { $ifNull: ['$statusTimestamps.completedAt', '$scheduledDate'] },
          title: { $concat: ['$serviceType', ' Service'] },
          description: { $ifNull: ['$actualService.serviceReport.observations', 'Service completed'] },
          data: {
            bookingId: '$_id',
            serviceType: '$serviceType',
            hasVitals: {
              $cond: [{ $ifNull: ['$actualService.serviceReport.vitalsChecked', false] }, true, false]
            }
          }
        }
      },
      // Union with health records
      {
        $unionWith: {
          coll: 'healthrecords',
          pipeline: [
            {
              $match: {
                patient: patientObjectId,
                status: 'APPROVED',
                ...recordDateFilter
              }
            },
            {
              $project: {
                type: { $literal: 'HEALTH_RECORD' },
                date: '$createdAt',
                title: {
                  $cond: [
                    { $eq: ['$recordType', 'BASELINE'] },
                    'Initial Health Record',
                    'Health Record Update'
                  ]
                },
                description: { $concat: ['Version ', { $toString: '$version' }] },
                data: {
                  recordId: '$_id',
                  version: '$version',
                  recordType: '$recordType'
                }
              }
            }
          ]
        }
      },
      // Union with doctor notes
      {
        $unionWith: {
          coll: 'doctornotes',
          pipeline: [
            {
              $match: {
                patient: patientObjectId,
                isConfidential: false,
                isActive: true,
                ...recordDateFilter
              }
            },
            {
              $project: {
                type: { $literal: 'DOCTOR_NOTE' },
                date: '$createdAt',
                title: '$title',
                description: '$noteType',
                data: {
                  noteId: '$_id',
                  noteType: '$noteType',
                  doctorId: '$doctor'
                }
              }
            }
          ]
        }
      },
      { $sort: { date: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Hydrate doctor names for DOCTOR_NOTE events
    const doctorIds = events
      .filter(e => e.type === 'DOCTOR_NOTE' && e.data?.doctorId)
      .map(e => e.data.doctorId);

    if (doctorIds.length > 0) {
      const doctors = await User.find(
        { _id: { $in: doctorIds } },
        { name: 1 }
      ).lean();

      const doctorMap = new Map(doctors.map(d => [d._id.toString(), d.name]));

      for (const event of events) {
        if (event.type === 'DOCTOR_NOTE' && event.data?.doctorId) {
          event.data.doctorName = doctorMap.get(event.data.doctorId.toString()) || null;
          delete event.data.doctorId;
        }
      }
    }

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
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
