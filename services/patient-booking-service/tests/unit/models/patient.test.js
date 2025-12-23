/**
 * Unit Tests - Patient Model
 */

const mongoose = require('mongoose');
const { Patient } = require('../../../src/models');

describe('Patient Model', () => {
  // Clear database before each test
  beforeEach(async () => {
    await Patient.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Patient Creation', () => {
    it('should create a patient with valid data', async () => {
      const patientData = {
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123'
      };

      const patient = await Patient.create(patientData);

      expect(patient).toBeDefined();
      expect(patient.name).toBe(patientData.name);
      expect(patient.email).toBe(patientData.email);
      expect(patient.phone).toBe(patientData.phone);
      expect(patient.password).not.toBe(patientData.password); // Should be hashed
      expect(patient.referralCode).toBeDefined();
      expect(patient.referralCode).toMatch(/^PAT/);
    });

    it('should fail to create patient without required fields', async () => {
      const patientData = {
        name: 'Test Patient'
        // Missing email, phone, password
      };

      await expect(Patient.create(patientData)).rejects.toThrow();
    });

    it('should fail with invalid email format', async () => {
      const patientData = {
        name: 'Test Patient',
        email: 'invalid-email',
        phone: '9876543210',
        password: 'password123'
      };

      await expect(Patient.create(patientData)).rejects.toThrow();
    });

    it('should fail with invalid phone number', async () => {
      const patientData = {
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '12345', // Invalid Indian mobile number
        password: 'password123'
      };

      await expect(Patient.create(patientData)).rejects.toThrow();
    });

    it('should fail with duplicate email', async () => {
      const patientData = {
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123'
      };

      await Patient.create(patientData);

      const duplicateData = {
        name: 'Another Patient',
        email: 'test@example.com', // Duplicate email
        phone: '9876543211',
        password: 'password456'
      };

      await expect(Patient.create(duplicateData)).rejects.toThrow();
    });

    it('should fail with duplicate phone number', async () => {
      const patientData = {
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123'
      };

      await Patient.create(patientData);

      const duplicateData = {
        name: 'Another Patient',
        email: 'another@example.com',
        phone: '9876543210', // Duplicate phone
        password: 'password456'
      };

      await expect(Patient.create(duplicateData)).rejects.toThrow();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const plainPassword = 'password123';

      const patient = await Patient.create({
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: plainPassword
      });

      expect(patient.password).toBeDefined();
      expect(patient.password).not.toBe(plainPassword);
      expect(patient.password.length).toBeGreaterThan(plainPassword.length);
    });

    it('should compare passwords correctly', async () => {
      const plainPassword = 'password123';

      const patient = await Patient.create({
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: plainPassword
      });

      // Need to fetch patient with password field (it's select: false by default)
      const patientWithPassword = await Patient.findById(patient._id).select('+password');

      const isMatch = await patientWithPassword.comparePassword(plainPassword);
      expect(isMatch).toBe(true);

      const isWrongMatch = await patientWithPassword.comparePassword('wrongpassword');
      expect(isWrongMatch).toBe(false);
    });
  });

  describe('Referral Code Generation', () => {
    it('should generate unique referral code', async () => {
      const patient1 = await Patient.create({
        name: 'Patient 1',
        email: 'patient1@example.com',
        phone: '9876543210',
        password: 'password123'
      });

      const patient2 = await Patient.create({
        name: 'Patient 2',
        email: 'patient2@example.com',
        phone: '9876543211',
        password: 'password123'
      });

      expect(patient1.referralCode).toBeDefined();
      expect(patient2.referralCode).toBeDefined();
      expect(patient1.referralCode).not.toBe(patient2.referralCode);
    });

    it('should start with PAT prefix', async () => {
      const patient = await Patient.create({
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123'
      });

      expect(patient.referralCode).toMatch(/^PAT/);
    });
  });

  describe('Default Values', () => {
    it('should set default values correctly', async () => {
      const patient = await Patient.create({
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123'
      });

      expect(patient.isActive).toBe(true);
      expect(patient.isVerified).toBe(false);
      expect(patient.phoneVerified).toBe(false);
      expect(patient.emailVerified).toBe(false);
      expect(patient.totalBookings).toBe(0);
      expect(patient.totalSpent).toBe(0);
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt and updatedAt timestamps', async () => {
      const patient = await Patient.create({
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123'
      });

      expect(patient.createdAt).toBeDefined();
      expect(patient.updatedAt).toBeDefined();
      expect(patient.createdAt).toBeInstanceOf(Date);
      expect(patient.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on modification', async () => {
      const patient = await Patient.create({
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123'
      });

      const originalUpdatedAt = patient.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      patient.name = 'Updated Name';
      await patient.save();

      expect(patient.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Address Management', () => {
    it('should add saved addresses', async () => {
      const patient = await Patient.create({
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123'
      });

      patient.savedAddresses.push({
        label: 'Home',
        street: '123 Main St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isDefault: true
      });

      await patient.save();

      const updatedPatient = await Patient.findById(patient._id);
      expect(updatedPatient.savedAddresses).toHaveLength(1);
      expect(updatedPatient.savedAddresses[0].label).toBe('Home');
      expect(updatedPatient.savedAddresses[0].isDefault).toBe(true);
    });
  });

  describe('Medical History', () => {
    it('should store medical history', async () => {
      const patient = await Patient.create({
        name: 'Test Patient',
        email: 'test@example.com',
        phone: '9876543210',
        password: 'password123',
        medicalHistory: {
          conditions: [{
            name: 'Diabetes',
            diagnosedDate: new Date('2020-01-01'),
            severity: 'Moderate'
          }],
          allergies: [{
            allergen: 'Penicillin',
            reaction: 'Rash',
            severity: 'Moderate'
          }]
        }
      });

      expect(patient.medicalHistory.conditions).toHaveLength(1);
      expect(patient.medicalHistory.conditions[0].name).toBe('Diabetes');
      expect(patient.medicalHistory.allergies).toHaveLength(1);
      expect(patient.medicalHistory.allergies[0].allergen).toBe('Penicillin');
    });
  });
});
