/**
 * Patient-health v1 router (restructure Phase 3 — dev/validation only).
 *
 * Mirrors the patient-health subset of the monolith's routes/v1/index.js:
 * same mount paths, same ordering, same B2C payment feature flag. Root-owned
 * routes (mobile-devices, webauthn) and duty-shift routes are intentionally
 * absent — they stay in the monolith per the blueprint's ownership decisions.
 */

const express = require('express');
const router = express.Router();
const logger = require('@nocturnal/shared').logger;

const patientRoutes = require('./patient');
const bookingRoutes = require('./booking');
const patientDashboardRoutes = require('./patientDashboard');
const healthDataRoutes = require('./healthData');
const healthAnalyticsRoutes = require('./healthAnalytics');
const healthIntakeRoutes = require('./healthIntake');
const doctorAccessRoutes = require('./doctorAccess');
const patientAnalyticsRoutes = require('./patientAnalytics');

// Version-specific middleware (mirrors routes/v1/index.js)
router.use((req, res, next) => {
  req.apiVersion = 'v1';
  res.setHeader('X-API-Version', 'v1');
  next();
});

// B2C routes (same paths as the monolith)
router.use('/patients', patientRoutes);
router.use('/bookings', bookingRoutes);

// B2C payment feature flag — mirrors routes/v1/index.js exactly
const hasRazorpayCredentials = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const isB2CPaymentEnabled = hasRazorpayCredentials && process.env.RAZORPAY_ENABLED !== 'false';

if (process.env.RAZORPAY_ENABLED === 'true' && !hasRazorpayCredentials) {
  logger.warn('RAZORPAY_ENABLED is set but RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are missing — B2C payment routes will not be loaded');
}

if (isB2CPaymentEnabled) {
  const b2cPaymentRoutes = require('./payment');
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

// Health check (patient-health app variant)
router.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    app: 'patient-health (dev/validation entrypoint)',
    version: 'v1',
    database: { status: dbStatus },
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
