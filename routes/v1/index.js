/**
 * API Version 1 Router
 * Aggregates all v1 routes and provides version-specific middleware
 */

const express = require('express');
const router = express.Router();

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
const b2cPaymentRoutes = require('../payment');

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
router.use('/payments-b2c', b2cPaymentRoutes);

// Health check (version-specific)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: 'v1',
    message: 'API v1 is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
