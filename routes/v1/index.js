/**
 * API Version 1 Router
 * Aggregates all v1 routes and provides version-specific middleware
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

// Import existing routes (they are now v1 routes)
const authRoutes = require('../auth');
const dutyRoutes = require('../duties');
const applicationRoutes = require('../applications');
const calendarRoutes = require('../calendar');
const earningsRoutes = require('../earnings');
const certificationsRoutes = require('../certifications');
const reviewsRoutes = require('../reviews');
const achievementsRoutes = require('../achievements');
const messagingRoutes = require('../messaging');
const analyticsRoutes = require('../analyticsOptimized');
const shiftSeriesRoutes = require('../shiftSeries');
const hospitalSettingsRoutes = require('../hospitalSettings');
const uploadsRoutes = require('../uploads');
const notificationsRoutes = require('../notifications');
const paymentsRoutes = require('../payments');
const metricsRouter = require('../admin/metrics');
const patientRoutes = require('../patient');
const bookingRoutes = require('../booking');
const hospitalWaitlistRoutes = require('../hospitalWaitlist');
const funnelEventsRoutes = require('../funnelEvents');

// Health Dashboard routes (Patient Analytics & Health History)
const patientDashboardRoutes = require('../patientDashboard');
const healthDataRoutes = require('../healthData');
const healthAnalyticsRoutes = require('../healthAnalytics');
const healthIntakeRoutes = require('../healthIntake');
const doctorAccessRoutes = require('../doctorAccess');
const patientAnalyticsRoutes = require('../patientAnalytics');

// Security monitoring routes
const securityRoutes = require('../security');

// Version-specific middleware (can be customized per version)
router.use((req, res, next) => {
  // Add API version to request object
  req.apiVersion = 'v1';

  // Add version header to response
  res.setHeader('X-API-Version', 'v1');

  next();
});

// Mount routes with their respective paths
router.use('/auth', authRoutes);
router.use('/duties', dutyRoutes);
router.use('/applications', applicationRoutes);
router.use('/calendar', calendarRoutes);
router.use('/earnings', earningsRoutes);
router.use('/certifications', certificationsRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/achievements', achievementsRoutes);
router.use('/messages', messagingRoutes);
router.use('/analytics', analyticsRoutes);

// Admin routes
router.use('/admin/metrics', metricsRouter.router);
router.use('/shift-series', shiftSeriesRoutes);
router.use('/hospital-settings', hospitalSettingsRoutes);
router.use('/uploads', uploadsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/payments', paymentsRoutes);

// Security monitoring dashboard (Admin only)
router.use('/security', securityRoutes);

// B2C routes
router.use('/patients', patientRoutes);
router.use('/bookings', bookingRoutes);
router.use('/hospital-waitlist', hospitalWaitlistRoutes);
router.use('/funnel-events', funnelEventsRoutes);

const hasRazorpayCredentials = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const isB2CPaymentEnabled = hasRazorpayCredentials && process.env.RAZORPAY_ENABLED !== 'false';

if (process.env.RAZORPAY_ENABLED === 'true' && !hasRazorpayCredentials) {
  logger.warn('RAZORPAY_ENABLED is set but RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are missing — B2C payment routes will not be loaded');
}

if (isB2CPaymentEnabled) {
  const b2cPaymentRoutes = require('../payment');
  router.use('/payments-b2c', b2cPaymentRoutes);
} else {
  logger.info('Skipping B2C payment route registration because Razorpay is disabled or unconfigured');
}

// Patient Health Dashboard routes
router.use('/patient-dashboard', patientDashboardRoutes);
router.use('/health-records', healthDataRoutes);
router.use('/health-analytics', healthAnalyticsRoutes);
router.use('/health-intake', healthIntakeRoutes);
router.use('/doctor-access', doctorAccessRoutes);
router.use('/patient-analytics', patientAnalyticsRoutes);

// Health check (version-specific) - Used by Uptime Robot and monitoring services
router.get('/health', async (req, res) => {
  const mongoose = require('mongoose');
  const os = require('os');

  // Check database connection
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  // Memory usage
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  // Uptime
  const uptime = process.uptime();

  const health = {
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    version: 'v1',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
    },
    database: {
      status: dbStatus,
      name: mongoose.connection.name || 'unknown'
    },
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      systemFree: `${Math.round(freeMem / 1024 / 1024)}MB`,
      systemTotal: `${Math.round(totalMem / 1024 / 1024)}MB`
    },
    environment: process.env.NODE_ENV || 'development'
  };

  // Return 503 if database is down (for monitoring alerts)
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

module.exports = router;
