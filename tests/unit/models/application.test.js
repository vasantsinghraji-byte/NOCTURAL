/**
 * Unit Tests for Application Model
 * Tests all Application model functionality including validation and constraints
 */

const mongoose = require('mongoose');
const Application = require('../../../models/application');
const Duty = require('../../../models/duty');
const User = require('../../../models/user');
const {
  connectTestDB,
  disconnectTestDB,
  clearCollection,
  createHospitalUser,
  createTestUser,
  createTestDuty
} = require('../../helpers');
const { applicationFactory } = require('../../factories');

// Connect to test database
beforeAll(async () => {
  await connectTestDB();
});

// Clean up after each test
afterEach(async () => {
  await clearCollection('applications');
  await clearCollection('duties');
  await clearCollection('users');
});

// Disconnect after all tests
afterAll(async () => {
  await disconnectTestDB();
});

describe('Application Model - Schema Validation', () => {
  let hospital, doctor, duty;

  beforeEach(async () => {
    hospital = await createHospitalUser();
    doctor = await createTestUser({ role: 'doctor' });
    duty = await createTestDuty(hospital);
  });

  describe('Required Fields', () => {
    test('should require duty', async () => {
      const appData = applicationFactory(duty._id, doctor._id, { duty: undefined });
      const application = new Application(appData);

      await expect(application.validate()).rejects.toThrow();
    });

    test('should require applicant', async () => {
      const appData = applicationFactory(duty._id, doctor._id, { applicant: undefined });
      const application = new Application(appData);

      await expect(application.validate()).rejects.toThrow();
    });

    test('should require coverLetter', async () => {
      const appData = applicationFactory(duty._id, doctor._id, { coverLetter: undefined });
      const application = new Application(appData);

      await expect(application.validate()).rejects.toThrow();
    });

    test('should allow empty string for coverLetter (required but can be empty)', async () => {
      const appData = applicationFactory(duty._id, doctor._id, { coverLetter: '' });
      const application = new Application(appData);

      // Empty string passes required check
      await expect(application.validate()).resolves.not.toThrow();
    });
  });

  describe('Enum Validation', () => {
    test('should only accept valid status values', async () => {
      const validStatuses = ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];

      for (const status of validStatuses) {
        const appData = applicationFactory(duty._id, doctor._id, { status });
        const application = new Application(appData);
        await expect(application.validate()).resolves.not.toThrow();
      }
    });

    test('should reject invalid status', async () => {
      const appData = applicationFactory(duty._id, doctor._id, { status: 'INVALID_STATUS' });
      const application = new Application(appData);

      await expect(application.validate()).rejects.toThrow();
    });
  });

  describe('Default Values', () => {
    test('should set default status to PENDING', async () => {
      const appData = {
        duty: duty._id,
        applicant: doctor._id,
        coverLetter: 'Test cover letter'
      };
      const application = await Application.create(appData);

      expect(application.status).toBe('PENDING');
    });

    test('should set default appliedAt to current date', async () => {
      const before = new Date();
      const appData = applicationFactory(duty._id, doctor._id);
      const application = await Application.create(appData);
      const after = new Date();

      expect(application.appliedAt).toBeDefined();
      expect(application.appliedAt).toBeInstanceOf(Date);
      expect(application.appliedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(application.appliedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Timestamps', () => {
    test('should automatically add createdAt and updatedAt', async () => {
      const appData = applicationFactory(duty._id, doctor._id);
      const application = await Application.create(appData);

      expect(application.createdAt).toBeDefined();
      expect(application.updatedAt).toBeDefined();
      expect(application.createdAt).toBeInstanceOf(Date);
      expect(application.updatedAt).toBeInstanceOf(Date);
    });

    test('should update updatedAt on modification', async () => {
      const appData = applicationFactory(duty._id, doctor._id);
      const application = await Application.create(appData);

      const originalUpdatedAt = application.updatedAt;

      // Wait a bit to ensure timestamp changes
      await global.testUtils.wait(100);

      application.status = 'ACCEPTED';
      await application.save();

      expect(application.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});

describe('Application Model - Unique Constraints', () => {
  let hospital, doctor, duty;

  beforeEach(async () => {
    hospital = await createHospitalUser();
    doctor = await createTestUser({ role: 'doctor' });
    duty = await createTestDuty(hospital);
  });

  test('should not allow duplicate applications for same duty and applicant', async () => {
    const appData1 = applicationFactory(duty._id, doctor._id);
    await Application.create(appData1);

    const appData2 = applicationFactory(duty._id, doctor._id);

    await expect(Application.create(appData2)).rejects.toThrow();
  });

  test('should allow same doctor to apply to different duties', async () => {
    const duty2 = await createTestDuty(hospital);

    const appData1 = applicationFactory(duty._id, doctor._id);
    const app1 = await Application.create(appData1);

    const appData2 = applicationFactory(duty2._id, doctor._id);
    const app2 = await Application.create(appData2);

    expect(app1._id).toBeDefined();
    expect(app2._id).toBeDefined();
    expect(app1._id.toString()).not.toBe(app2._id.toString());
  });

  test('should allow different doctors to apply to same duty', async () => {
    const doctor2 = await createTestUser({ role: 'doctor', email: 'doctor2@test.com' });

    const appData1 = applicationFactory(duty._id, doctor._id);
    const app1 = await Application.create(appData1);

    const appData2 = applicationFactory(duty._id, doctor2._id);
    const app2 = await Application.create(appData2);

    expect(app1._id).toBeDefined();
    expect(app2._id).toBeDefined();
    expect(app1._id.toString()).not.toBe(app2._id.toString());
  });

  test('should allow same doctor to reapply after withdrawing', async () => {
    const appData1 = applicationFactory(duty._id, doctor._id);
    const app1 = await Application.create(appData1);

    // Withdraw application
    await Application.findByIdAndDelete(app1._id);

    // Reapply
    const appData2 = applicationFactory(duty._id, doctor._id);
    const app2 = await Application.create(appData2);

    expect(app2._id).toBeDefined();
  });
});

describe('Application Model - Status Transitions', () => {
  let hospital, doctor, duty;

  beforeEach(async () => {
    hospital = await createHospitalUser();
    doctor = await createTestUser({ role: 'doctor' });
    duty = await createTestDuty(hospital);
  });

  test('should update status from PENDING to ACCEPTED', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    const application = await Application.create(appData);

    expect(application.status).toBe('PENDING');

    application.status = 'ACCEPTED';
    await application.save();

    const updated = await Application.findById(application._id);
    expect(updated.status).toBe('ACCEPTED');
  });

  test('should update status from PENDING to REJECTED', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    const application = await Application.create(appData);

    application.status = 'REJECTED';
    await application.save();

    const updated = await Application.findById(application._id);
    expect(updated.status).toBe('REJECTED');
  });

  test('should update status from PENDING to WITHDRAWN', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    const application = await Application.create(appData);

    application.status = 'WITHDRAWN';
    await application.save();

    const updated = await Application.findById(application._id);
    expect(updated.status).toBe('WITHDRAWN');
  });

  test('should allow status change from ACCEPTED back to PENDING', async () => {
    const appData = applicationFactory(duty._id, doctor._id, { status: 'ACCEPTED' });
    const application = await Application.create(appData);

    application.status = 'PENDING';
    await application.save();

    const updated = await Application.findById(application._id);
    expect(updated.status).toBe('PENDING');
  });
});

describe('Application Model - Population', () => {
  let hospital, doctor, duty;

  beforeEach(async () => {
    hospital = await createHospitalUser();
    doctor = await createTestUser({
      role: 'doctor',
      name: 'Dr. John Doe',
      email: 'drjohn@test.com'
    });
    duty = await createTestDuty(hospital, {
      title: 'Night Shift - Emergency',
      specialty: 'Emergency Medicine'
    });
  });

  test('should populate duty information', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    await Application.create(appData);

    const application = await Application.findOne({ applicant: doctor._id }).populate('duty');

    expect(application.duty).toBeDefined();
    expect(application.duty.title).toBe('Night Shift - Emergency');
    expect(application.duty.specialty).toBe('Emergency Medicine');
  });

  test('should populate applicant information', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    await Application.create(appData);

    const application = await Application.findOne({ duty: duty._id }).populate('applicant');

    expect(application.applicant).toBeDefined();
    expect(application.applicant.name).toBe('Dr. John Doe');
    expect(application.applicant.email).toBe('drjohn@test.com');
  });

  test('should populate both duty and applicant', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    await Application.create(appData);

    const application = await Application
      .findOne({ duty: duty._id })
      .populate('duty applicant');

    expect(application.duty).toBeDefined();
    expect(application.applicant).toBeDefined();
    expect(application.duty.title).toBe('Night Shift - Emergency');
    expect(application.applicant.name).toBe('Dr. John Doe');
  });
});

describe('Application Model - Query Operations', () => {
  let hospital, doctor1, doctor2, duty1, duty2;

  beforeEach(async () => {
    hospital = await createHospitalUser();
    doctor1 = await createTestUser({ role: 'doctor', email: 'doctor1@test.com' });
    doctor2 = await createTestUser({ role: 'doctor', email: 'doctor2@test.com' });
    duty1 = await createTestDuty(hospital, { title: 'Duty 1' });
    duty2 = await createTestDuty(hospital, { title: 'Duty 2' });
  });

  test('should find all applications for a duty', async () => {
    await Application.create(applicationFactory(duty1._id, doctor1._id));
    await Application.create(applicationFactory(duty1._id, doctor2._id));

    const applications = await Application.find({ duty: duty1._id });

    expect(applications).toHaveLength(2);
  });

  test('should find all applications by a doctor', async () => {
    await Application.create(applicationFactory(duty1._id, doctor1._id));
    await Application.create(applicationFactory(duty2._id, doctor1._id));

    const applications = await Application.find({ applicant: doctor1._id });

    expect(applications).toHaveLength(2);
  });

  test('should filter applications by status', async () => {
    await Application.create(applicationFactory(duty1._id, doctor1._id, { status: 'PENDING' }));
    await Application.create(applicationFactory(duty1._id, doctor2._id, { status: 'ACCEPTED' }));

    const pendingApps = await Application.find({ duty: duty1._id, status: 'PENDING' });
    const acceptedApps = await Application.find({ duty: duty1._id, status: 'ACCEPTED' });

    expect(pendingApps).toHaveLength(1);
    expect(acceptedApps).toHaveLength(1);
  });

  test('should count applications for a duty', async () => {
    await Application.create(applicationFactory(duty1._id, doctor1._id));
    await Application.create(applicationFactory(duty1._id, doctor2._id));

    const count = await Application.countDocuments({ duty: duty1._id });

    expect(count).toBe(2);
  });

  test('should find pending applications for a doctor', async () => {
    await Application.create(applicationFactory(duty1._id, doctor1._id, { status: 'PENDING' }));
    await Application.create(applicationFactory(duty2._id, doctor1._id, { status: 'ACCEPTED' }));

    const pendingApps = await Application.find({
      applicant: doctor1._id,
      status: 'PENDING'
    });

    expect(pendingApps).toHaveLength(1);
  });

  test('should sort applications by appliedAt date', async () => {
    const app1 = await Application.create(
      applicationFactory(duty1._id, doctor1._id, {
        appliedAt: new Date('2024-01-01')
      })
    );
    const app2 = await Application.create(
      applicationFactory(duty1._id, doctor2._id, {
        appliedAt: new Date('2024-01-02')
      })
    );

    const applications = await Application.find({ duty: duty1._id }).sort({ appliedAt: 1 });

    expect(applications[0]._id.toString()).toBe(app1._id.toString());
    expect(applications[1]._id.toString()).toBe(app2._id.toString());
  });
});

describe('Application Model - Integration Tests', () => {
  let hospital, doctor, duty;

  beforeEach(async () => {
    hospital = await createHospitalUser();
    doctor = await createTestUser({ role: 'doctor' });
    duty = await createTestDuty(hospital);
  });

  test('should create an application successfully', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    const application = await Application.create(appData);

    expect(application._id).toBeDefined();
    expect(application.duty.toString()).toBe(duty._id.toString());
    expect(application.applicant.toString()).toBe(doctor._id.toString());
    expect(application.status).toBe('PENDING');
  });

  test('should update application status', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    const application = await Application.create(appData);

    application.status = 'ACCEPTED';
    await application.save();

    const updated = await Application.findById(application._id);
    expect(updated.status).toBe('ACCEPTED');
  });

  test('should delete application', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    const application = await Application.create(appData);

    await Application.findByIdAndDelete(application._id);

    const deleted = await Application.findById(application._id);
    expect(deleted).toBeNull();
  });

  test('should handle ObjectId references correctly', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    const application = await Application.create(appData);

    expect(mongoose.Types.ObjectId.isValid(application.duty)).toBe(true);
    expect(mongoose.Types.ObjectId.isValid(application.applicant)).toBe(true);
  });

  test('should find application by both duty and applicant', async () => {
    const appData = applicationFactory(duty._id, doctor._id);
    await Application.create(appData);

    const found = await Application.findOne({
      duty: duty._id,
      applicant: doctor._id
    });

    expect(found).toBeDefined();
    expect(found.duty.toString()).toBe(duty._id.toString());
    expect(found.applicant.toString()).toBe(doctor._id.toString());
  });
});

describe('Application Model - Indexes', () => {
  test('should have compound unique index on duty and applicant', () => {
    const indexes = Application.schema.indexes();
    const uniqueIndex = indexes.find(
      idx => idx[0].duty === 1 && idx[0].applicant === 1 && idx[1]?.unique === true
    );

    expect(uniqueIndex).toBeDefined();
  });

  test('should have index on applicant and status', () => {
    const indexes = Application.schema.indexes();
    const applicantStatusIndex = indexes.find(
      idx => idx[0].applicant === 1 && idx[0].status === 1
    );

    expect(applicantStatusIndex).toBeDefined();
  });

  test('should have index on duty and status', () => {
    const indexes = Application.schema.indexes();
    const dutyStatusIndex = indexes.find(
      idx => idx[0].duty === 1 && idx[0].status === 1
    );

    expect(dutyStatusIndex).toBeDefined();
  });
});

describe('Application Model - Edge Cases', () => {
  let hospital, doctor, duty;

  beforeEach(async () => {
    hospital = await createHospitalUser();
    doctor = await createTestUser({ role: 'doctor' });
    duty = await createTestDuty(hospital);
  });

  test('should handle long cover letters', async () => {
    const longCoverLetter = 'a'.repeat(5000);
    const appData = applicationFactory(duty._id, doctor._id, {
      coverLetter: longCoverLetter
    });
    const application = await Application.create(appData);

    expect(application.coverLetter).toHaveLength(5000);
  });

  test('should handle special characters in cover letter', async () => {
    const specialCoverLetter = 'I can work 24/7! Expertise in A&E, ICU, etc. Email: test@example.com';
    const appData = applicationFactory(duty._id, doctor._id, {
      coverLetter: specialCoverLetter
    });
    const application = await Application.create(appData);

    expect(application.coverLetter).toBe(specialCoverLetter);
  });

  test('should handle past appliedAt dates', async () => {
    const pastDate = new Date('2023-01-01');
    const appData = applicationFactory(duty._id, doctor._id, {
      appliedAt: pastDate
    });
    const application = await Application.create(appData);

    expect(application.appliedAt).toEqual(pastDate);
  });

  test('should not allow invalid ObjectId for duty', async () => {
    const appData = {
      duty: 'invalid-object-id',
      applicant: doctor._id,
      coverLetter: 'Test'
    };

    await expect(Application.create(appData)).rejects.toThrow();
  });

  test('should not allow invalid ObjectId for applicant', async () => {
    const appData = {
      duty: duty._id,
      applicant: 'invalid-object-id',
      coverLetter: 'Test'
    };

    await expect(Application.create(appData)).rejects.toThrow();
  });
});
