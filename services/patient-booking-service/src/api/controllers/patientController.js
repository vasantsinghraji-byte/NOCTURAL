/**
 * Patient Controller
 * Handles HTTP requests for patient operations
 */

const patientService = require('../../services/patientService');
const { createLogger } = require('@nocturnal/shared');

const logger = createLogger({ serviceName: 'patient-booking-service' });

class PatientController {
  /**
   * Register new patient
   * POST /api/patients/register
   */
  async register(req, res) {
    try {
      const { name, email, phone, password } = req.body;

      // Validate required fields
      if (!name || !email || !phone || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide all required fields: name, email, phone, password'
        });
      }

      const result = await patientService.register({ name, email, phone, password });

      logger.logAuth('patient_registration', email, true);

      res.status(201).json({
        success: true,
        message: 'Patient registered successfully',
        data: result
      });
    } catch (error) {
      logger.logAuth('patient_registration', req.body.email, false, error.message);

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Login patient
   * POST /api/patients/login
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide email and password'
        });
      }

      const result = await patientService.login(email, password);

      logger.logAuth('patient_login', email, true);

      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      logger.logAuth('patient_login', req.body.email, false, error.message);

      res.status(401).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get patient profile
   * GET /api/patients/profile
   */
  async getProfile(req, res) {
    try {
      const patient = await patientService.getPatientById(req.user.id);

      res.json({
        success: true,
        data: patient
      });
    } catch (error) {
      logger.error('Error fetching patient profile', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update patient profile
   * PUT /api/patients/profile
   */
  async updateProfile(req, res) {
    try {
      const patient = await patientService.updateProfile(req.user.id, req.body);

      logger.info('Patient profile updated', { patientId: req.user.id });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: patient
      });
    } catch (error) {
      logger.error('Error updating patient profile', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update password
   * PUT /api/patients/password
   */
  async updatePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Please provide current password and new password'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters'
        });
      }

      await patientService.updatePassword(req.user.id, currentPassword, newPassword);

      logger.info('Patient password updated', { patientId: req.user.id });

      res.json({
        success: true,
        message: 'Password updated successfully'
      });
    } catch (error) {
      logger.error('Error updating password', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Add saved address
   * POST /api/patients/addresses
   */
  async addAddress(req, res) {
    try {
      const patient = await patientService.addAddress(req.user.id, req.body);

      logger.info('Address added to patient profile', { patientId: req.user.id });

      res.status(201).json({
        success: true,
        message: 'Address added successfully',
        data: patient.savedAddresses
      });
    } catch (error) {
      logger.error('Error adding address', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get patient statistics
   * GET /api/patients/stats
   */
  async getStats(req, res) {
    try {
      const stats = await patientService.getPatientStats(req.user.id);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error fetching patient stats', {
        patientId: req.user?.id,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new PatientController();
