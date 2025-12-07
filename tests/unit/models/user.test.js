/**
 * Unit Tests for User Model
 * Tests all User model functionality including validation, methods, and hooks
 */

const mongoose = require('mongoose');
const User = require('../../../models/user');
const { encrypt, decrypt } = require('../../../utils/encryption');
const {
  connectTestDB,
  disconnectTestDB,
  clearCollection
} = require('../../helpers');
const { doctorFactory, userFactory } = require('../../factories');

// Connect to test database
beforeAll(async () => {
  await connectTestDB();
});

// Clean up after each test
afterEach(async () => {
  await clearCollection('users');
});

// Disconnect after all tests
afterAll(async () => {
  await disconnectTestDB();
});

describe('User Model - Schema Validation', () => {
  describe('Required Fields', () => {
    test('should require name', async () => {
      const userData = userFactory({ name: undefined });
      const user = new User(userData);

      await expect(user.validate()).rejects.toThrow('Please provide a name');
    });

    test('should require email', async () => {
      const userData = userFactory({ email: undefined });
      const user = new User(userData);

      await expect(user.validate()).rejects.toThrow('Please provide an email');
    });

    test('should require password', async () => {
      const userData = userFactory({ password: undefined });
      const user = new User(userData);

      await expect(user.validate()).rejects.toThrow('Please provide a password');
    });

    test('should require role', async () => {
      const userData = userFactory({ role: undefined });
      const user = new User(userData);

      await expect(user.validate()).rejects.toThrow();
    });
  });

  describe('Field Validation', () => {
    test('should validate email format', async () => {
      const userData = userFactory({ email: 'invalid-email' });
      const user = new User(userData);

      await expect(user.validate()).rejects.toThrow('Please provide a valid email');
    });

    test('should accept valid email formats', async () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'test123@test-domain.com'
      ];

      for (const email of validEmails) {
        const userData = userFactory({ email });
        const user = new User(userData);
        await expect(user.validate()).resolves.not.toThrow();
      }
    });

    test('should enforce password minimum length', async () => {
      const userData = userFactory({ password: '1234567' }); // 7 characters
      const user = new User(userData);

      await expect(user.validate()).rejects.toThrow('Password must be at least 8 characters');
    });

    test('should enforce name maximum length', async () => {
      const longName = 'a'.repeat(101); // 101 characters
      const userData = userFactory({ name: longName });
      const user = new User(userData);

      await expect(user.validate()).rejects.toThrow('Name cannot be more than 100 characters');
    });

    test('should only accept valid roles', async () => {
      const userData = userFactory({ role: 'invalid-role' });
      const user = new User(userData);

      await expect(user.validate()).rejects.toThrow();
    });

    test('should accept all valid roles', async () => {
      const validRoles = ['doctor', 'nurse', 'physiotherapist', 'admin'];

      for (const role of validRoles) {
        const userData = userFactory({ role });
        const user = new User(userData);
        await expect(user.validate()).resolves.not.toThrow();
      }
    });

    test('should convert email to lowercase', async () => {
      const userData = userFactory({ email: 'TEST@EXAMPLE.COM' });
      const user = await User.create(userData);

      expect(user.email).toBe('test@example.com');
    });

    test('should trim name whitespace', async () => {
      const userData = userFactory({ name: '  John Doe  ' });
      const user = new User(userData);
      await user.validate();

      expect(user.name).toBe('John Doe');
    });

    test('should enforce rating range (0-5)', async () => {
      const userData1 = userFactory({ rating: -1 });
      const user1 = new User(userData1);
      await expect(user1.validate()).rejects.toThrow();

      const userData2 = userFactory({ rating: 6 });
      const user2 = new User(userData2);
      await expect(user2.validate()).rejects.toThrow();
    });

    test('should enforce profileStrength range (0-100)', async () => {
      const userData1 = userFactory({ profileStrength: -1 });
      const user1 = new User(userData1);
      await expect(user1.validate()).rejects.toThrow();

      const userData2 = userFactory({ profileStrength: 101 });
      const user2 = new User(userData2);
      await expect(user2.validate()).rejects.toThrow();
    });
  });

  describe('Unique Constraints', () => {
    test('should not allow duplicate emails', async () => {
      const email = 'duplicate@test.com';
      const userData1 = userFactory({ email });
      const userData2 = userFactory({ email });

      await User.create(userData1);

      await expect(User.create(userData2)).rejects.toThrow();
    });

    test('should allow same email in different cases (case-insensitive)', async () => {
      const userData1 = userFactory({ email: 'test@example.com' });
      const userData2 = userFactory({ email: 'TEST@EXAMPLE.COM' });

      await User.create(userData1);

      // Should fail because email is case-insensitive
      await expect(User.create(userData2)).rejects.toThrow();
    });
  });

  describe('Default Values', () => {
    test('should set default values correctly', async () => {
      const userData = {
        name: 'Test User',
        email: global.testUtils.randomEmail(),
        password: 'Password@123',
        role: 'doctor'
      };
      const user = await User.create(userData);

      expect(user.isActive).toBe(true);
      expect(user.isVerified).toBe(false);
      expect(user.profileStrength).toBe(0);
      expect(user.onboardingCompleted).toBe(false);
      expect(user.onboardingStep).toBe(1);
      expect(user.rating).toBe(0);
      expect(user.totalReviews).toBe(0);
      expect(user.completedDuties).toBe(0);
      expect(user.completionRate).toBe(100);
      expect(user.isAvailableForShifts).toBe(true);
      expect(user.notificationSettings.email).toBe(true);
      expect(user.notificationSettings.sms).toBe(true);
      expect(user.notificationSettings.push).toBe(true);
    });
  });

  describe('Timestamps', () => {
    test('should automatically add createdAt and updatedAt', async () => {
      const userData = userFactory();
      const user = await User.create(userData);

      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    test('should update updatedAt on modification', async () => {
      const userData = userFactory();
      const user = await User.create(userData);

      const originalUpdatedAt = user.updatedAt;

      // Wait a bit to ensure timestamp changes
      await global.testUtils.wait(100);

      user.name = 'Updated Name';
      await user.save();

      expect(user.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});

describe('User Model - Password Handling', () => {
  test('should hash password before saving', async () => {
    const plainPassword = 'Password@123';
    const userData = userFactory({ password: plainPassword });
    const user = await User.create(userData);

    expect(user.password).not.toBe(plainPassword);
    expect(user.password).toHaveLength(60); // bcrypt hash length
    expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt format
  });

  test('should not hash password if not modified', async () => {
    const userData = userFactory();
    const user = await User.create(userData);
    const hashedPassword = user.password;

    user.name = 'Updated Name';
    await user.save();

    // Password should remain the same
    const updatedUser = await User.findById(user._id).select('+password');
    expect(updatedUser.password).toBe(hashedPassword);
  });

  test('should hash password when modified', async () => {
    const userData = userFactory();
    const user = await User.create(userData);
    const originalHash = user.password;

    user.password = 'NewPassword@123';
    await user.save();

    const updatedUser = await User.findById(user._id).select('+password');
    expect(updatedUser.password).not.toBe(originalHash);
  });

  test('should not select password by default', async () => {
    const userData = userFactory();
    await User.create(userData);

    const user = await User.findOne({ email: userData.email });

    expect(user.password).toBeUndefined();
  });

  test('should select password when explicitly requested', async () => {
    const userData = userFactory();
    await User.create(userData);

    const user = await User.findOne({ email: userData.email }).select('+password');

    expect(user.password).toBeDefined();
    expect(typeof user.password).toBe('string');
  });
});

describe('User Model - comparePassword Method', () => {
  test('should return true for correct password', async () => {
    const plainPassword = 'Password@123';
    const userData = userFactory({ password: plainPassword });
    const user = await User.create(userData);

    const userWithPassword = await User.findById(user._id).select('+password');
    const isMatch = await userWithPassword.comparePassword(plainPassword);

    expect(isMatch).toBe(true);
  });

  test('should return false for incorrect password', async () => {
    const plainPassword = 'Password@123';
    const userData = userFactory({ password: plainPassword });
    const user = await User.create(userData);

    const userWithPassword = await User.findById(user._id).select('+password');
    const isMatch = await userWithPassword.comparePassword('WrongPassword');

    expect(isMatch).toBe(false);
  });

  test('should handle empty password comparison', async () => {
    const userData = userFactory({ password: 'Password@123' });
    const user = await User.create(userData);

    const userWithPassword = await User.findById(user._id).select('+password');
    const isMatch = await userWithPassword.comparePassword('');

    expect(isMatch).toBe(false);
  });
});

describe('User Model - Bank Details Encryption', () => {
  test('should encrypt account number when saving', async () => {
    const accountNumber = '1234567890';
    const userData = userFactory({
      bankDetails: {
        accountNumber,
        ifscCode: 'SBIN0001234',
        accountHolderName: 'John Doe'
      }
    });
    const user = await User.create(userData);

    expect(user.bankDetails.accountNumber).not.toBe(accountNumber);
    expect(user.bankDetails.accountNumber).toContain(':'); // Encrypted format
  });

  test('should encrypt PAN card when saving', async () => {
    const panCard = 'ABCDE1234F';
    const userData = userFactory({
      bankDetails: {
        panCard,
        accountNumber: '1234567890',
        ifscCode: 'SBIN0001234'
      }
    });
    const user = await User.create(userData);

    expect(user.bankDetails.panCard).not.toBe(panCard);
    expect(user.bankDetails.panCard).toContain(':'); // Encrypted format
  });

  test('should not re-encrypt already encrypted values', async () => {
    const accountNumber = '1234567890';
    const userData = userFactory({
      bankDetails: {
        accountNumber,
        ifscCode: 'SBIN0001234'
      }
    });
    const user = await User.create(userData);
    const encryptedAccount = user.bankDetails.accountNumber;

    // Update other field
    user.name = 'Updated Name';
    await user.save();

    // Account number should remain the same
    expect(user.bankDetails.accountNumber).toBe(encryptedAccount);
  });

  test('should decrypt bank details correctly', async () => {
    const accountNumber = '1234567890';
    const panCard = 'ABCDE1234F';
    const userData = userFactory({
      bankDetails: {
        accountNumber,
        panCard,
        ifscCode: 'SBIN0001234',
        accountHolderName: 'John Doe',
        bankName: 'State Bank',
        branchName: 'Test Branch'
      }
    });
    const user = await User.create(userData);

    const decrypted = user.getDecryptedBankDetails();

    expect(decrypted).toBeDefined();
    expect(decrypted.accountNumber).toBe(accountNumber);
    expect(decrypted.panCard).toBe(panCard);
    expect(decrypted.ifscCode).toBe('SBIN0001234');
    expect(decrypted.accountHolderName).toBe('John Doe');
  });

  test('should handle missing bank details gracefully', async () => {
    const userData = userFactory({ bankDetails: undefined });
    const user = await User.create(userData);

    const decrypted = user.getDecryptedBankDetails();

    expect(decrypted).toBeNull();
  });
});

describe('User Model - Profile Strength Calculation', () => {
  test('should calculate basic profile strength correctly', async () => {
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password@123',
      phone: '+1234567890',
      role: 'doctor'
    };
    const user = new User(userData);
    const strength = user.calculateProfileStrength();

    // name (5) + email (5) + phone (5) = 15%
    expect(strength).toBe(15);
  });

  test('should include profile photo in calculation', async () => {
    const userData = userFactory({
      profilePhoto: {
        url: 'https://example.com/photo.jpg',
        uploadedAt: new Date()
      }
    });
    const user = new User(userData);
    const strength = user.calculateProfileStrength();

    expect(strength).toBeGreaterThanOrEqual(25); // Basic + photo
  });

  test('should calculate doctor profile strength with all fields', async () => {
    const userData = doctorFactory({
      profilePhoto: { url: 'https://example.com/photo.jpg' },
      professional: {
        mciNumber: 'MCI12345',
        primarySpecialization: 'Emergency Medicine',
        yearsOfExperience: 5,
        proceduralSkills: ['Intubation', 'Central Line']
      },
      documents: {
        mciCertificate: { url: 'https://example.com/mci.pdf' },
        photoId: { url: 'https://example.com/id.pdf' },
        mbbsDegree: { url: 'https://example.com/degree.pdf' }
      },
      bankDetails: {
        accountNumber: '1234567890',
        ifscCode: 'SBIN0001234'
      }
    });
    const user = new User(userData);
    const strength = user.calculateProfileStrength();

    // Should be 100% with all fields filled
    expect(strength).toBe(100);
  });

  test('should cap profile strength at 100%', async () => {
    const userData = doctorFactory({
      profilePhoto: { url: 'https://example.com/photo.jpg' },
      professional: {
        mciNumber: 'MCI12345',
        primarySpecialization: 'Emergency Medicine',
        yearsOfExperience: 5,
        proceduralSkills: ['Skill1', 'Skill2'],
        preferredShiftTimes: ['Morning', 'Night']
      },
      documents: {
        mciCertificate: { url: 'https://example.com/mci.pdf' },
        photoId: { url: 'https://example.com/id.pdf' },
        mbbsDegree: { url: 'https://example.com/degree.pdf' }
      },
      bankDetails: {
        accountNumber: '1234567890',
        ifscCode: 'SBIN0001234'
      }
    });
    const user = new User(userData);
    const strength = user.calculateProfileStrength();

    expect(strength).toBe(100);
    expect(strength).toBeLessThanOrEqual(100);
  });
});

describe('User Model - getMissingFields Method', () => {
  test('should return empty array for complete profile', async () => {
    const userData = doctorFactory({
      profilePhoto: { url: 'https://example.com/photo.jpg' },
      professional: {
        mciNumber: 'MCI12345',
        primarySpecialization: 'Emergency Medicine',
        yearsOfExperience: 5,
        proceduralSkills: ['Skill1']
      },
      documents: {
        mciCertificate: { url: 'https://example.com/mci.pdf' },
        photoId: { url: 'https://example.com/id.pdf' },
        mbbsDegree: { url: 'https://example.com/degree.pdf' }
      },
      bankDetails: {
        accountNumber: '1234567890',
        ifscCode: 'SBIN0001234'
      }
    });
    const user = new User(userData);
    const missing = user.getMissingFields();

    expect(missing).toEqual([]);
  });

  test('should identify missing profile photo', async () => {
    const userData = doctorFactory({ profilePhoto: undefined });
    const user = new User(userData);
    const missing = user.getMissingFields();

    expect(missing).toContain('Profile Photo');
  });

  test('should identify all missing doctor fields', async () => {
    const userData = {
      name: 'Test Doctor',
      email: 'doctor@test.com',
      password: 'Password@123',
      role: 'doctor'
    };
    const user = new User(userData);
    const missing = user.getMissingFields();

    expect(missing).toContain('Profile Photo');
    expect(missing).toContain('MCI Registration Number');
    expect(missing).toContain('Primary Specialization');
    expect(missing).toContain('Years of Experience');
    expect(missing).toContain('MCI Certificate');
    expect(missing).toContain('Photo ID');
    expect(missing).toContain('MBBS Degree');
    expect(missing).toContain('Bank Account Details');
    expect(missing).toContain('Procedural Skills');
  });

  test('should only check doctor-specific fields for doctor role', async () => {
    const userData = userFactory({
      role: 'admin',
      profilePhoto: undefined
    });
    const user = new User(userData);
    const missing = user.getMissingFields();

    expect(missing).toHaveLength(1);
    expect(missing).toContain('Profile Photo');
    expect(missing).not.toContain('MCI Registration Number');
  });
});

describe('User Model - Indexes', () => {
  test('should have email index (unique)', async () => {
    const indexes = User.schema.indexes();
    const emailIndex = indexes.find(idx => idx[0].email === 1);

    expect(emailIndex).toBeDefined();
  });

  test('should have role index', async () => {
    const indexes = User.schema.indexes();
    const roleIndex = indexes.find(idx => idx[0].role === 1);

    expect(roleIndex).toBeDefined();
  });

  test('should have compound index for doctor search', async () => {
    const indexes = User.schema.indexes();
    const compoundIndex = indexes.find(idx =>
      idx[0].role === 1 &&
      idx[0]['professional.primarySpecialization'] === 1 &&
      idx[0].isActive === 1
    );

    expect(compoundIndex).toBeDefined();
  });
});

describe('User Model - Integration Tests', () => {
  test('should create a complete doctor profile', async () => {
    const userData = doctorFactory();
    const user = await User.create(userData);

    expect(user._id).toBeDefined();
    expect(user.role).toBe('doctor');
    expect(user.professional).toBeDefined();
    expect(user.professional.primarySpecialization).toBe('Emergency Medicine');
    expect(user.createdAt).toBeDefined();
  });

  test('should find users by role', async () => {
    await User.create(doctorFactory({ name: 'Doctor 1' }));
    await User.create(doctorFactory({ name: 'Doctor 2' }));
    await User.create(userFactory({ name: 'Nurse 1', role: 'nurse' }));

    const doctors = await User.find({ role: 'doctor' });

    expect(doctors).toHaveLength(2);
    expect(doctors.every(d => d.role === 'doctor')).toBe(true);
  });

  test('should update user fields correctly', async () => {
    const userData = doctorFactory();
    const user = await User.create(userData);

    user.rating = 4.5;
    user.completedDuties = 10;
    await user.save();

    const updated = await User.findById(user._id);
    expect(updated.rating).toBe(4.5);
    expect(updated.completedDuties).toBe(10);
  });

  test('should delete user successfully', async () => {
    const userData = doctorFactory();
    const user = await User.create(userData);

    await User.findByIdAndDelete(user._id);

    const deleted = await User.findById(user._id);
    expect(deleted).toBeNull();
  });
});
