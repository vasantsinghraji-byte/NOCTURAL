/**
 * Patient Service
 *
 * Business logic layer for patient operations (B2C customers)
 * Handles patient registration, authentication, profile management, and medical history
 */

const Patient = require('../models/patient');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { HTTP_STATUS, SUCCESS_MESSAGE, ERROR_MESSAGE } = require('../constants');

class PatientService {
  /**
   * Register a new patient
   * @param {Object} patientData - Patient registration data
   * @returns {Promise<Object>} Created patient and token
   */
  async register(patientData) {
    const { name, email, password, phone } = patientData;

    // Check if patient exists by email
    const existingPatientByEmail = await Patient.findOne({ email });
    if (existingPatientByEmail) {
      logger.logAuth('patient_register', email, false, ERROR_MESSAGE.USER_EXISTS);
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Email already registered'
      };
    }

    // Check if patient exists by phone
    const existingPatientByPhone = await Patient.findOne({ phone });
    if (existingPatientByPhone) {
      logger.logAuth('patient_register', email, false, 'Phone already registered');
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Phone number already registered'
      };
    }

    // Create patient
    let patient;
    try {
      patient = await Patient.create({
        name,
        email,
        password,
        phone
      });
    } catch (error) {
      logger.error('Patient creation error', { email, error: error.message, stack: error.stack });
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Error creating patient account'
      };
    }

    // Generate token
    const token = generateToken(patient._id);

    logger.logAuth('patient_register', email, true);
    logger.info('New Patient Registered', {
      patientId: patient._id,
      email: patient.email,
      phone: patient.phone
    });

    return {
      token,
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email,
        phone: patient.phone,
        isVerified: patient.isVerified,
        phoneVerified: patient.phoneVerified,
        emailVerified: patient.emailVerified
      }
    };
  }

  /**
   * Authenticate patient login
   * @param {Object} credentials - Login credentials
   * @returns {Promise<Object>} Patient and token
   */
  async login(credentials) {
    const { email, password } = credentials;

    if (!email || !password) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGE.EMAIL_REQUIRED
      };
    }

    // Find patient and include password
    const patient = await Patient.findOne({ email }).select('+password');

    if (!patient) {
      logger.logAuth('patient_login', email, false, ERROR_MESSAGE.USER_NOT_FOUND);
      logger.logSecurity('failed_patient_login', { email, reason: ERROR_MESSAGE.USER_NOT_FOUND });
      throw {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: ERROR_MESSAGE.INVALID_CREDENTIALS
      };
    }

    // Check if account is active
    if (!patient.isActive) {
      logger.logAuth('patient_login', email, false, 'Account deactivated');
      throw {
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: 'Your account has been deactivated. Please contact support.'
      };
    }

    // Check password
    const isPasswordValid = await patient.comparePassword(password);

    if (!isPasswordValid) {
      logger.logAuth('patient_login', email, false, 'Invalid password');
      logger.logSecurity('failed_patient_login', { email, reason: 'Invalid password' });
      throw {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: ERROR_MESSAGE.INVALID_CREDENTIALS
      };
    }

    // Generate token
    const token = generateToken(patient._id);

    // Update last active
    patient.lastActive = new Date();
    await patient.save();

    logger.logAuth('patient_login', email, true);
    logger.info('Patient Login', {
      patientId: patient._id,
      email: patient.email
    });

    return {
      token,
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email,
        phone: patient.phone,
        isVerified: patient.isVerified,
        phoneVerified: patient.phoneVerified,
        emailVerified: patient.emailVerified,
        profilePhoto: patient.profilePhoto
      }
    };
  }

  /**
   * Get patient profile by ID
   * @param {String} patientId - Patient ID
   * @returns {Promise<Object>} Patient profile
   */
  async getProfile(patientId) {
    const patient = await Patient.findById(patientId).select('-password');

    if (!patient) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Patient not found'
      };
    }

    return patient;
  }

  /**
   * Update patient profile
   * @param {String} patientId - Patient ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated patient
   */
  async updateProfile(patientId, updateData) {
    const patient = await Patient.findById(patientId);

    if (!patient) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Patient not found'
      };
    }

    // Allowlist: only these fields can be updated by the patient
    const ALLOWED_FIELDS = [
      'name', 'dateOfBirth', 'gender', 'bloodGroup',
      'profilePhoto', 'address', 'emergencyContact',
      'insurance', 'preferences'
    ];

    // Update only allowed fields
    Object.keys(updateData).forEach(key => {
      if (ALLOWED_FIELDS.includes(key)) {
        patient[key] = updateData[key];
      }
    });

    await patient.save();

    logger.info('Patient Profile Updated', {
      patientId: patient._id,
      email: patient.email
    });

    return patient;
  }

  /**
   * Add a new address for patient
   * @param {String} patientId - Patient ID
   * @param {Object} addressData - Address data
   * @returns {Promise<Object>} Updated patient
   */
  async addAddress(patientId, addressData) {
    const patient = await Patient.findById(patientId);

    if (!patient) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Patient not found'
      };
    }

    const shouldBeDefault = addressData.isDefault || patient.savedAddresses.length === 0;
    addressData.isDefault = shouldBeDefault;

    let updatedPatient;
    if (shouldBeDefault) {
      // Atomically clear all existing defaults and push new address
      await Patient.findByIdAndUpdate(patientId, {
        $set: { 'savedAddresses.$[].isDefault': false }
      });
    }

    updatedPatient = await Patient.findByIdAndUpdate(
      patientId,
      { $push: { savedAddresses: addressData } },
      { new: true }
    );

    logger.info('Patient Address Added', {
      patientId: updatedPatient._id,
      addressLabel: addressData.label
    });

    return updatedPatient;
  }

  /**
   * Update an existing address
   * @param {String} patientId - Patient ID
   * @param {String} addressId - Address ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated patient
   */
  async updateAddress(patientId, addressId, updateData) {
    // Verify patient and address exist
    const patient = await Patient.findOne({
      _id: patientId,
      'savedAddresses._id': addressId
    });

    if (!patient) {
      const exists = await Patient.findById(patientId);
      if (!exists) {
        throw {
          statusCode: HTTP_STATUS.NOT_FOUND,
          message: 'Patient not found'
        };
      }
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Address not found'
      };
    }

    // If setting as default, atomically unset other defaults first
    if (updateData.isDefault) {
      await Patient.findByIdAndUpdate(patientId, {
        $set: { 'savedAddresses.$[other].isDefault': false }
      }, {
        arrayFilters: [{ 'other._id': { $ne: addressId } }]
      });
    }

    // Build atomic $set for the matched address fields
    const setFields = {};
    for (const key of Object.keys(updateData)) {
      setFields[`savedAddresses.$.${key}`] = updateData[key];
    }

    const updatedPatient = await Patient.findOneAndUpdate(
      { _id: patientId, 'savedAddresses._id': addressId },
      { $set: setFields },
      { new: true }
    );

    logger.info('Patient Address Updated', {
      patientId: updatedPatient._id,
      addressId
    });

    return updatedPatient;
  }

  /**
   * Delete an address
   * @param {String} patientId - Patient ID
   * @param {String} addressId - Address ID
   * @returns {Promise<Object>} Updated patient
   */
  async deleteAddress(patientId, addressId) {
    const patient = await Patient.findById(patientId);

    if (!patient) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Patient not found'
      };
    }

    const address = patient.savedAddresses.id(addressId);
    if (!address) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Address not found'
      };
    }

    const wasDefault = address.isDefault;
    address.deleteOne();

    // If deleted address was default, make first remaining address default
    if (wasDefault && patient.savedAddresses.length > 0) {
      patient.savedAddresses[0].isDefault = true;
    }

    await patient.save();

    logger.info('Patient Address Deleted', {
      patientId: patient._id,
      addressId
    });

    return patient;
  }

  /**
   * Add medical history entry
   * @param {String} patientId - Patient ID
   * @param {String} category - Category (conditions, allergies, medications, surgeries)
   * @param {Object} entryData - Medical history entry data
   * @returns {Promise<Object>} Updated patient
   */
  async addMedicalHistory(patientId, category, entryData) {
    const patient = await Patient.findById(patientId);

    if (!patient) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Patient not found'
      };
    }

    const validCategories = ['conditions', 'allergies', 'currentMedications', 'surgeries', 'familyHistory'];
    if (!validCategories.includes(category)) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Invalid medical history category'
      };
    }

    // Validate entryData structure per category
    this._validateMedicalHistoryEntry(category, entryData);

    if (!patient.medicalHistory) {
      patient.medicalHistory = {};
    }

    if (!patient.medicalHistory[category]) {
      patient.medicalHistory[category] = [];
    }

    patient.medicalHistory[category].push(entryData);
    await patient.save();

    logger.info('Patient Medical History Added', {
      patientId: patient._id,
      category
    });

    return patient;
  }

  /**
   * Update medical history habits
   * @param {String} patientId - Patient ID
   * @param {Object} habitsData - Habits data
   * @returns {Promise<Object>} Updated patient
   */
  async updateMedicalHabits(patientId, habitsData) {
    const patient = await Patient.findById(patientId);

    if (!patient) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Patient not found'
      };
    }

    if (!patient.medicalHistory) {
      patient.medicalHistory = {};
    }

    patient.medicalHistory.habits = {
      ...patient.medicalHistory.habits,
      ...habitsData
    };

    await patient.save();

    logger.info('Patient Medical Habits Updated', {
      patientId: patient._id
    });

    return patient;
  }

  /**
   * Verify password for sensitive operations
   * @param {String} patientId - Patient ID
   * @param {String} password - Password to verify
   * @returns {Promise<Boolean>} Verification result
   */
  async verifyPassword(patientId, password) {
    const patient = await Patient.findById(patientId).select('+password');

    if (!patient) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Patient not found'
      };
    }

    return await patient.comparePassword(password);
  }

  /**
   * Get patient booking statistics
   * @param {String} patientId - Patient ID
   * @returns {Promise<Object>} Booking statistics
   */
  async getBookingStats(patientId) {
    const patient = await Patient.findById(patientId).select('totalBookings totalSpent');

    if (!patient) {
      throw {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'Patient not found'
      };
    }

    return {
      totalBookings: patient.totalBookings || 0,
      totalSpent: patient.totalSpent || 0,
      averageBookingValue: patient.totalBookings > 0
        ? Math.round(patient.totalSpent / patient.totalBookings)
        : 0
    };
  }

  /**
   * Validate medical history entry structure per category
   */
  _validateMedicalHistoryEntry(category, data) {
    if (!data || typeof data !== 'object') {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: 'Entry data must be a non-empty object'
      };
    }

    const rules = {
      conditions: {
        required: ['name'],
        allowed: ['name', 'diagnosedDate', 'severity', 'notes']
      },
      allergies: {
        required: ['allergen', 'severity'],
        allowed: ['allergen', 'reaction', 'severity']
      },
      currentMedications: {
        required: ['name', 'dosage', 'frequency'],
        allowed: ['name', 'dosage', 'frequency', 'startDate', 'prescribedBy']
      },
      surgeries: {
        required: ['name'],
        allowed: ['name', 'date', 'hospital', 'surgeon', 'complications']
      },
      familyHistory: {
        required: ['relation', 'condition'],
        allowed: ['relation', 'condition', 'notes']
      }
    };

    const rule = rules[category];
    if (!rule) return;

    const missing = rule.required.filter(field => !data[field]);
    if (missing.length > 0) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: `Missing required fields for ${category}: ${missing.join(', ')}`
      };
    }

    const unknownFields = Object.keys(data).filter(key => !rule.allowed.includes(key));
    if (unknownFields.length > 0) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: `Unknown fields for ${category}: ${unknownFields.join(', ')}. Allowed: ${rule.allowed.join(', ')}`
      };
    }
  }
}

module.exports = new PatientService();
