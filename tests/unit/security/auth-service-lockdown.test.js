jest.mock('../../../models/user');
jest.mock('../../../middleware/auth', () => ({
  generateToken: jest.fn().mockReturnValue('mock-jwt-token')
}));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn(),
  logAuth: jest.fn()
}));

const User = require('../../../models/user');
const authService = require('../../../services/authService');

describe('Auth Service Lockdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update only allowlisted profile fields', async () => {
    const mockUser = {
      _id: 'user1',
      role: 'doctor',
      isVerified: false,
      name: 'Original Name',
      phone: '1111111111',
      location: { city: 'Old City' },
      professional: { primarySpecialization: 'Emergency Medicine' },
      bankDetails: { accountHolderName: 'Original Name' },
      onboardingCompleted: false,
      notificationSettings: { email: true },
      isAvailableForShifts: true,
      specialty: 'Emergency Medicine',
      calculateProfileStrength: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };

    User.findById = jest.fn().mockResolvedValue(mockUser);

    const result = await authService.updateProfile('user1', {
      name: 'Updated Name',
      phone: '9999999999',
      role: 'admin',
      isVerified: true,
      location: { city: 'New City' },
      professional: { primarySpecialization: 'General Medicine' },
      bankDetails: {
        accountHolderName: 'Updated Name',
        accountNumber: '123456789012',
        ifscCode: 'HDFC0001234',
        bankName: 'HDFC Bank'
      },
      onboardingCompleted: true,
      notificationSettings: { email: false },
      isAvailableForShifts: false,
      specialty: 'General Medicine'
    });

    expect(result.name).toBe('Updated Name');
    expect(result.phone).toBe('9999999999');
    expect(result.location).toEqual({ city: 'New City' });
    expect(result.professional).toEqual({ primarySpecialization: 'General Medicine' });
    expect(result.bankDetails).toEqual({
      accountHolderName: 'Updated Name',
      accountNumber: '123456789012',
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank'
    });
    expect(result.onboardingCompleted).toBe(true);
    expect(result.notificationSettings).toEqual({ email: false });
    expect(result.isAvailableForShifts).toBe(false);
    expect(result.specialty).toBe('General Medicine');

    expect(result.role).toBe('doctor');
    expect(result.isVerified).toBe(false);
    expect(mockUser.calculateProfileStrength).toHaveBeenCalledTimes(1);
    expect(mockUser.save).toHaveBeenCalledTimes(1);
  });

  it('should use own-properties only when applying profile updates', async () => {
    const mockUser = {
      _id: 'user1',
      role: 'doctor',
      name: 'Original Name',
      calculateProfileStrength: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };

    const protoPayload = { name: 'Inherited Name' };
    const updateData = Object.create(protoPayload);

    User.findById = jest.fn().mockResolvedValue(mockUser);

    await authService.updateProfile('user1', updateData);

    expect(mockUser.name).toBe('Original Name');
    expect(mockUser.save).toHaveBeenCalledTimes(1);
  });
});
