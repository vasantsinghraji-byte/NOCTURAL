/**
 * Patient Service
 * Business logic for patient operations
 */

const jwt = require('jsonwebtoken');
const { Patient } = require('../models');
const config = require('../config');

class PatientService {
  /**
   * Register a new patient
   */
  async register(patientData) {
    const { name, email, phone, password } = patientData;

    // Check if patient already exists
    const existingPatient = await Patient.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingPatient) {
      if (existingPatient.email === email) {
        throw new Error('Email already registered');
      }
      if (existingPatient.phone === phone) {
        throw new Error('Phone number already registered');
      }
    }

    // Create patient
    const patient = await Patient.create({
      name,
      email,
      phone,
      password
    });

    // Generate JWT token
    const token = this.generateToken(patient._id);

    // Remove password from response
    const patientObj = patient.toObject();
    delete patientObj.password;

    return {
      patient: patientObj,
      token
    };
  }

  /**
   * Login patient
   */
  async login(email, password) {
    // Find patient with password field
    const patient = await Patient.findOne({ email }).select('+password');

    if (!patient) {
      throw new Error('Invalid email or password');
    }

    // Check if account is active
    if (!patient.isActive) {
      throw new Error('Account has been deactivated. Please contact support.');
    }

    // Verify password
    const isPasswordValid = await patient.comparePassword(password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Update last active
    patient.lastActive = new Date();
    await patient.save();

    // Generate token
    const token = this.generateToken(patient._id);

    // Remove password from response
    const patientObj = patient.toObject();
    delete patientObj.password;

    return {
      patient: patientObj,
      token
    };
  }

  /**
   * Get patient by ID
   */
  async getPatientById(patientId) {
    const patient = await Patient.findById(patientId);

    if (!patient) {
      throw new Error('Patient not found');
    }

    if (!patient.isActive) {
      throw new Error('Account has been deactivated');
    }

    return patient;
  }

  /**
   * Update patient profile
   */
  async updateProfile(patientId, updates) {
    // Prevent updating sensitive fields directly
    const allowedUpdates = [
      'name', 'phone', 'dateOfBirth', 'gender', 'bloodGroup',
      'address', 'savedAddresses', 'medicalHistory', 'emergencyContact',
      'insurance', 'preferences'
    ];

    const updateData = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updateData[key] = updates[key];
      }
    });

    const patient = await Patient.findByIdAndUpdate(
      patientId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!patient) {
      throw new Error('Patient not found');
    }

    return patient;
  }

  /**
   * Update password
   */
  async updatePassword(patientId, currentPassword, newPassword) {
    const patient = await Patient.findById(patientId).select('+password');

    if (!patient) {
      throw new Error('Patient not found');
    }

    // Verify current password
    const isValid = await patient.comparePassword(currentPassword);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Update password
    patient.password = newPassword;
    await patient.save();

    return { message: 'Password updated successfully' };
  }

  /**
   * Add saved address
   */
  async addAddress(patientId, addressData) {
    const patient = await Patient.findById(patientId);

    if (!patient) {
      throw new Error('Patient not found');
    }

    // If this is set as default, unset other defaults
    if (addressData.isDefault) {
      patient.savedAddresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    patient.savedAddresses.push(addressData);
    await patient.save();

    return patient;
  }

  /**
   * Get patient statistics
   */
  async getPatientStats(patientId) {
    const patient = await Patient.findById(patientId);

    if (!patient) {
      throw new Error('Patient not found');
    }

    return {
      totalBookings: patient.totalBookings,
      totalSpent: patient.totalSpent,
      memberSince: patient.createdAt,
      lastActive: patient.lastActive,
      isVerified: patient.isVerified,
      phoneVerified: patient.phoneVerified,
      emailVerified: patient.emailVerified
    };
  }

  /**
   * Generate JWT token
   */
  generateToken(patientId) {
    return jwt.sign(
      {
        id: patientId,
        type: 'patient'
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
}

module.exports = new PatientService();
