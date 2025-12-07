/**
 * Unit Tests for Duty Model
 * Tests all Duty model functionality including validation, methods, and hooks
 */

const mongoose = require('mongoose');
const Duty = require('../../../models/duty');
const User = require('../../../models/user');
const {
  connectTestDB,
  disconnectTestDB,
  clearCollection,
  createHospitalUser,
  createTestUser
} = require('../../helpers');
const { dutyFactory, doctorFactory, urgentDutyFactory } = require('../../factories');

// Connect to test database
beforeAll(async () => {
  await connectTestDB();
});

// Clean up after each test
afterEach(async () => {
  await clearCollection('duties');
  await clearCollection('users');
});

// Disconnect after all tests
afterAll(async () => {
  await disconnectTestDB();
});

describe('Duty Model - Schema Validation', () => {
  let hospital;

  beforeEach(async () => {
    hospital = await createHospitalUser();
  });

  describe('Required Fields', () => {
    test('should require title', async () => {
      const dutyData = dutyFactory(hospital._id, { title: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require hospital', async () => {
      const dutyData = dutyFactory(hospital._id, { hospital: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require hospitalName', async () => {
      const dutyData = dutyFactory(hospital._id, { hospitalName: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require department', async () => {
      const dutyData = dutyFactory(hospital._id, { department: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require specialty', async () => {
      const dutyData = dutyFactory(hospital._id, { specialty: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require description', async () => {
      const dutyData = dutyFactory(hospital._id, { description: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require date', async () => {
      const dutyData = dutyFactory(hospital._id, { date: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require startTime', async () => {
      const dutyData = dutyFactory(hospital._id, { startTime: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require endTime', async () => {
      const dutyData = dutyFactory(hospital._id, { endTime: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require duration', async () => {
      const dutyData = dutyFactory(hospital._id, { duration: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require hourlyRate', async () => {
      const dutyData = dutyFactory(hospital._id, { hourlyRate: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require location', async () => {
      const dutyData = dutyFactory(hospital._id, { location: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should require postedBy', async () => {
      const dutyData = dutyFactory(hospital._id, { postedBy: undefined });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });
  });

  describe('Enum Validation', () => {
    test('should only accept valid departments', async () => {
      const validDepartments = ['Emergency', 'ICU', 'OPD', 'Surgery', 'General Ward', 'Maternity', 'Pediatrics', 'Psychiatry', 'Other'];

      for (const dept of validDepartments) {
        const dutyData = dutyFactory(hospital._id, { department: dept });
        const duty = new Duty(dutyData);
        await expect(duty.validate()).resolves.not.toThrow();
      }
    });

    test('should reject invalid department', async () => {
      const dutyData = dutyFactory(hospital._id, { department: 'InvalidDept' });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should only accept valid specialties', async () => {
      const validSpecialties = [
        'Emergency Medicine',
        'Internal Medicine',
        'General Surgery',
        'Intensive Care / Critical Care Medicine'
      ];

      for (const specialty of validSpecialties) {
        const dutyData = dutyFactory(hospital._id, { specialty });
        const duty = new Duty(dutyData);
        await expect(duty.validate()).resolves.not.toThrow();
      }
    });

    test('should only accept valid status values', async () => {
      const validStatuses = ['OPEN', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

      for (const status of validStatuses) {
        const dutyData = dutyFactory(hospital._id, { status });
        const duty = new Duty(dutyData);
        await expect(duty.validate()).resolves.not.toThrow();
      }
    });

    test('should only accept valid urgency values', async () => {
      const validUrgencies = ['NORMAL', 'URGENT', 'EMERGENCY'];

      for (const urgency of validUrgencies) {
        const dutyData = dutyFactory(hospital._id, { urgency });
        const duty = new Duty(dutyData);
        await expect(duty.validate()).resolves.not.toThrow();
      }
    });

    test('should only accept valid payment status values', async () => {
      const validPaymentStatuses = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'];

      for (const paymentStatus of validPaymentStatuses) {
        const dutyData = dutyFactory(hospital._id, { paymentStatus });
        const duty = new Duty(dutyData);
        await expect(duty.validate()).resolves.not.toThrow();
      }
    });

    test('should only accept valid experience requirements', async () => {
      const validExperience = ['0-2 years', '2-5 years', '5+ years', 'Any'];

      for (const exp of validExperience) {
        const dutyData = dutyFactory(hospital._id, {
          requirements: { minimumExperience: exp }
        });
        const duty = new Duty(dutyData);
        await expect(duty.validate()).resolves.not.toThrow();
      }
    });

    test('should only accept valid expected patient load', async () => {
      const validLoads = ['Light', 'Moderate', 'Heavy'];

      for (const load of validLoads) {
        const dutyData = dutyFactory(hospital._id, {
          requirements: { expectedPatientLoad: load }
        });
        const duty = new Duty(dutyData);
        await expect(duty.validate()).resolves.not.toThrow();
      }
    });
  });

  describe('Default Values', () => {
    test('should set default values correctly', async () => {
      const dutyData = dutyFactory(hospital._id);
      const duty = await Duty.create(dutyData);

      expect(duty.status).toBe('OPEN');
      expect(duty.urgency).toBe('NORMAL');
      expect(duty.paymentStatus).toBe('PENDING');
      expect(duty.platformFee).toBe(5);
      expect(duty.positionsNeeded).toBe(1);
      expect(duty.positionsFilled).toBe(0);
      expect(duty.applicationsCount).toBe(0);
      expect(duty.viewCount).toBe(0);
      expect(duty.isRecurring).toBe(false);
      expect(duty.requirements.minimumExperience).toBe('Any');
      expect(duty.requirements.expectedPatientLoad).toBe('Moderate');
    });

    test('should set default payment timeline', async () => {
      const dutyData = dutyFactory(hospital._id);
      const duty = await Duty.create(dutyData);

      expect(duty.paymentTimeline).toBe('48 hours');
    });

    test('should set default cancellation policy', async () => {
      const dutyData = dutyFactory(hospital._id);
      const duty = await Duty.create(dutyData);

      expect(duty.cancellationPolicy).toContain('Free cancellation >24 hours');
    });
  });

  describe('Constraints', () => {
    test('should enforce minimum positionsNeeded of 1', async () => {
      const dutyData = dutyFactory(hospital._id, { positionsNeeded: 0 });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).rejects.toThrow();
    });

    test('should allow multiple positions needed', async () => {
      const dutyData = dutyFactory(hospital._id, { positionsNeeded: 5 });
      const duty = new Duty(dutyData);

      await expect(duty.validate()).resolves.not.toThrow();
    });
  });

  describe('Timestamps', () => {
    test('should automatically add createdAt and updatedAt', async () => {
      const dutyData = dutyFactory(hospital._id);
      const duty = await Duty.create(dutyData);

      expect(duty.createdAt).toBeDefined();
      expect(duty.updatedAt).toBeDefined();
      expect(duty.createdAt).toBeInstanceOf(Date);
      expect(duty.updatedAt).toBeInstanceOf(Date);
    });
  });
});

describe('Duty Model - Pre-save Hook Calculations', () => {
  let hospital;

  beforeEach(async () => {
    hospital = await createHospitalUser();
  });

  describe('Duration Calculation', () => {
    test('should calculate duration from start and end times (same day)', async () => {
      const dutyData = dutyFactory(hospital._id, {
        startTime: '09:00',
        endTime: '17:00',
        duration: undefined
      });
      const duty = new Duty(dutyData);
      await duty.save();

      expect(duty.duration).toBe(8);
    });

    test('should calculate duration across midnight', async () => {
      const dutyData = dutyFactory(hospital._id, {
        startTime: '22:00',
        endTime: '06:00',
        duration: undefined
      });
      const duty = new Duty(dutyData);
      await duty.save();

      expect(duty.duration).toBe(8); // 22:00 to 06:00 = 8 hours
    });

    test('should not recalculate duration if already set', async () => {
      const dutyData = dutyFactory(hospital._id, {
        startTime: '09:00',
        endTime: '17:00',
        duration: 12 // Manually set different duration
      });
      const duty = new Duty(dutyData);
      await duty.save();

      expect(duty.duration).toBe(12); // Should keep manual value
    });
  });

  describe('Compensation Calculation', () => {
    test('should calculate total compensation correctly', async () => {
      const dutyData = dutyFactory(hospital._id, {
        duration: 12,
        hourlyRate: 75,
        totalCompensation: undefined
      });
      const duty = new Duty(dutyData);
      await duty.save();

      expect(duty.totalCompensation).toBe(900); // 12 * 75
    });

    test('should recalculate compensation when duration changes', async () => {
      const dutyData = dutyFactory(hospital._id, {
        duration: 8,
        hourlyRate: 100
      });
      const duty = await Duty.create(dutyData);

      expect(duty.totalCompensation).toBe(800);

      duty.duration = 10;
      await duty.save();

      expect(duty.totalCompensation).toBe(1000);
    });

    test('should recalculate compensation when hourly rate changes', async () => {
      const dutyData = dutyFactory(hospital._id, {
        duration: 8,
        hourlyRate: 50
      });
      const duty = await Duty.create(dutyData);

      expect(duty.totalCompensation).toBe(400);

      duty.hourlyRate = 75;
      await duty.save();

      expect(duty.totalCompensation).toBe(600);
    });
  });

  describe('Net Payment Calculation', () => {
    test('should calculate net payment after platform fee', async () => {
      const dutyData = dutyFactory(hospital._id, {
        duration: 12,
        hourlyRate: 100,
        platformFee: 10 // 10%
      });
      const duty = new Duty(dutyData);
      await duty.save();

      expect(duty.totalCompensation).toBe(1200);
      expect(duty.netPayment).toBe(1080); // 1200 - (1200 * 0.10)
    });

    test('should use default platform fee of 5%', async () => {
      const dutyData = dutyFactory(hospital._id, {
        duration: 10,
        hourlyRate: 100
        // platformFee will default to 5
      });
      const duty = new Duty(dutyData);
      await duty.save();

      expect(duty.totalCompensation).toBe(1000);
      expect(duty.netPayment).toBe(950); // 1000 - (1000 * 0.05)
    });

    test('should recalculate net payment when compensation changes', async () => {
      const dutyData = dutyFactory(hospital._id, {
        duration: 8,
        hourlyRate: 100,
        platformFee: 5
      });
      const duty = await Duty.create(dutyData);

      expect(duty.netPayment).toBe(760); // 800 - 40

      duty.hourlyRate = 150;
      await duty.save();

      expect(duty.totalCompensation).toBe(1200);
      expect(duty.netPayment).toBe(1140); // 1200 - 60
    });
  });
});

describe('Duty Model - calculateMatchScore Method', () => {
  let hospital, doctor;

  beforeEach(async () => {
    hospital = await createHospitalUser();
    doctor = await createTestUser({
      role: 'doctor',
      professional: {
        primarySpecialization: 'Emergency Medicine',
        secondarySpecializations: ['Internal Medicine'],
        yearsOfExperience: 5,
        proceduralSkills: ['Intubation', 'Central Line', 'Chest Tube']
      },
      rating: 4.7
    });
  });

  test('should return 0 for null doctor', async () => {
    const dutyData = dutyFactory(hospital._id);
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(null);

    expect(score).toBe(0);
  });

  test('should return 0 for doctor without professional field', async () => {
    const basicDoctor = { name: 'Test', email: 'test@test.com' };
    const dutyData = dutyFactory(hospital._id);
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(basicDoctor);

    expect(score).toBe(0);
  });

  test('should give 40 points for primary specialty match', async () => {
    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: { requiredSkills: [], minimumExperience: 'Any' }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(doctor);

    expect(score).toBeGreaterThanOrEqual(40);
  });

  test('should give 25 points for secondary specialty match', async () => {
    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Internal Medicine',
      requirements: { requiredSkills: [], minimumExperience: 'Any' }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(doctor);

    // 25 (secondary specialty) + 30 (skills) + 20 (experience) + 10 (rating) = 85
    expect(score).toBe(85);
  });

  test('should calculate skill match percentage correctly', async () => {
    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: {
        requiredSkills: ['Intubation', 'Central Line'], // 2 out of 2 matched
        minimumExperience: 'Any'
      }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(doctor);

    // 40 (specialty) + 30 (100% skills) + 20 (experience) + 10 (rating) = 100
    expect(score).toBe(100);
  });

  test('should calculate partial skill match', async () => {
    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: {
        requiredSkills: ['Intubation', 'Suturing', 'ECMO', 'Pericardiocentesis'], // Only 1 out of 4 matched
        minimumExperience: 'Any'
      }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(doctor);

    // 40 (specialty) + 7.5 (25% skills) + 20 (experience) + 10 (rating) = 77.5 -> 78
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(80);
  });

  test('should give full skill points if no skills required', async () => {
    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: {
        requiredSkills: [],
        minimumExperience: 'Any'
      }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(doctor);

    // 40 + 30 + 20 + 10 = 100
    expect(score).toBe(100);
  });

  test('should match experience requirement correctly - 2-5 years', async () => {
    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: {
        requiredSkills: [],
        minimumExperience: '2-5 years'
      }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(doctor); // Doctor has 5 years

    expect(score).toBe(100); // Should get full experience points
  });

  test('should match experience requirement correctly - 5+ years', async () => {
    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: {
        requiredSkills: [],
        minimumExperience: '5+ years'
      }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(doctor); // Doctor has 5 years

    expect(score).toBe(100);
  });

  test('should give partial points for experience mismatch', async () => {
    const juniorDoctor = await createTestUser({
      role: 'doctor',
      professional: {
        primarySpecialization: 'Emergency Medicine',
        yearsOfExperience: 1,
        proceduralSkills: []
      },
      rating: 4.0
    });

    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: {
        requiredSkills: [],
        minimumExperience: '5+ years'
      }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(juniorDoctor);

    // 40 (specialty) + 30 (skills) + 10 (partial exp) + 7 (rating) = 87
    expect(score).toBeLessThan(100);
  });

  test('should give rating bonus for high-rated doctors', async () => {
    const highRatedDoctor = await createTestUser({
      role: 'doctor',
      professional: {
        primarySpecialization: 'Emergency Medicine',
        proceduralSkills: [],
        yearsOfExperience: 3
      },
      rating: 4.8
    });

    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: { requiredSkills: [], minimumExperience: 'Any' }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(highRatedDoctor);

    // Should get full 10 points for rating >= 4.5
    expect(score).toBe(100);
  });

  test('should give partial rating bonus for mid-rated doctors', async () => {
    const midRatedDoctor = await createTestUser({
      role: 'doctor',
      professional: {
        primarySpecialization: 'Emergency Medicine',
        proceduralSkills: [],
        yearsOfExperience: 3
      },
      rating: 4.2
    });

    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: { requiredSkills: [], minimumExperience: 'Any' }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(midRatedDoctor);

    // 40 + 30 + 20 + 7 = 97
    expect(score).toBe(97);
  });

  test('should cap score at 100', async () => {
    const dutyData = dutyFactory(hospital._id, {
      specialty: 'Emergency Medicine',
      requirements: { requiredSkills: [], minimumExperience: 'Any' }
    });
    const duty = new Duty(dutyData);

    const score = duty.calculateMatchScore(doctor);

    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('Duty Model - Integration Tests', () => {
  let hospital;

  beforeEach(async () => {
    hospital = await createHospitalUser();
  });

  test('should create a duty successfully', async () => {
    const dutyData = dutyFactory(hospital._id);
    const duty = await Duty.create(dutyData);

    expect(duty._id).toBeDefined();
    expect(duty.title).toBe(dutyData.title);
    expect(duty.status).toBe('OPEN');
    expect(duty.postedBy.toString()).toBe(hospital._id.toString());
  });

  test('should create an urgent duty', async () => {
    const dutyData = urgentDutyFactory(hospital._id);
    const duty = await Duty.create(dutyData);

    expect(duty.urgency).toBe('HIGH');
    expect(duty.date).toBeDefined();
  });

  test('should update duty status', async () => {
    const dutyData = dutyFactory(hospital._id);
    const duty = await Duty.create(dutyData);

    duty.status = 'FILLED';
    await duty.save();

    const updated = await Duty.findById(duty._id);
    expect(updated.status).toBe('FILLED');
  });

  test('should assign doctors to duty', async () => {
    const doctor = await createTestUser({ role: 'doctor' });
    const dutyData = dutyFactory(hospital._id);
    const duty = await Duty.create(dutyData);

    duty.assignedDoctors.push({
      doctor: doctor._id,
      assignedAt: new Date(),
      status: 'CONFIRMED'
    });
    duty.positionsFilled = 1;
    await duty.save();

    const updated = await Duty.findById(duty._id);
    expect(updated.assignedDoctors).toHaveLength(1);
    expect(updated.assignedDoctors[0].doctor.toString()).toBe(doctor._id.toString());
    expect(updated.positionsFilled).toBe(1);
  });

  test('should track view count', async () => {
    const dutyData = dutyFactory(hospital._id);
    const duty = await Duty.create(dutyData);

    duty.viewCount += 1;
    await duty.save();

    const updated = await Duty.findById(duty._id);
    expect(updated.viewCount).toBe(1);
  });

  test('should find duties by specialty', async () => {
    await Duty.create(dutyFactory(hospital._id, { specialty: 'Emergency Medicine' }));
    await Duty.create(dutyFactory(hospital._id, { specialty: 'Emergency Medicine' }));
    await Duty.create(dutyFactory(hospital._id, { specialty: 'Internal Medicine' }));

    const emergencyDuties = await Duty.find({ specialty: 'Emergency Medicine' });

    expect(emergencyDuties).toHaveLength(2);
  });

  test('should find duties by status', async () => {
    await Duty.create(dutyFactory(hospital._id, { status: 'OPEN' }));
    await Duty.create(dutyFactory(hospital._id, { status: 'OPEN' }));
    await Duty.create(dutyFactory(hospital._id, { status: 'FILLED' }));

    const openDuties = await Duty.find({ status: 'OPEN' });

    expect(openDuties).toHaveLength(2);
  });

  test('should delete duty successfully', async () => {
    const dutyData = dutyFactory(hospital._id);
    const duty = await Duty.create(dutyData);

    await Duty.findByIdAndDelete(duty._id);

    const deleted = await Duty.findById(duty._id);
    expect(deleted).toBeNull();
  });
});
