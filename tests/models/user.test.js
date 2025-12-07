const mongoose = require('mongoose');
const User = require('../../models/user');

describe('User Model Test', () => {
  beforeAll(async () => {
    await mongoose.connect(global.__MONGO_URI__, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('should hash password before saving', async () => {
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'TestPass123!',
      role: 'doctor'
    };

    const user = new User(userData);
    await user.save();

    // Password should be hashed
    expect(user.password).not.toBe(userData.password);
    expect(user.password).toMatch(/^\$2[aby]\$\d+\$/);
  });

  it('should validate password correctly', async () => {
    const user = new User({
      name: 'Test User',
      email: 'test2@example.com',
      password: 'TestPass123!',
      role: 'doctor'
    });
    await user.save();

    const isValid = await user.comparePassword('TestPass123!');
    const isInvalid = await user.comparePassword('WrongPass123!');

    expect(isValid).toBe(true);
    expect(isInvalid).toBe(false);
  });

  it('should calculate profile strength correctly', async () => {
    const user = new User({
      name: 'Complete User',
      email: 'complete@example.com',
      password: 'TestPass123!',
      role: 'doctor',
      phone: '+1234567890',
      profilePhoto: { url: 'https://example.com/photo.jpg' },
      professional: {
        mciNumber: 'MCI123',
        primarySpecialization: 'Internal Medicine',
        yearsOfExperience: 5,
        proceduralSkills: ['Skill1', 'Skill2']
      },
      documents: {
        mciCertificate: { url: 'https://example.com/mci.pdf', verified: true },
        photoId: { url: 'https://example.com/id.pdf', verified: true },
        mbbsDegree: { url: 'https://example.com/degree.pdf', verified: true }
      },
      bankDetails: {
        accountNumber: '1234567890',
        ifscCode: 'BANK0001'
      }
    });

    const strength = user.calculateProfileStrength();
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeLessThanOrEqual(100);
  });
});