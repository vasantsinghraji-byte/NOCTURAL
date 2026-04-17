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

describe('Security Unit: auth service profile-field lockdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject privileged or unsupported profile fields', async () => {
    const mockUser = {
      _id: 'user1',
      role: 'doctor',
      isVerified: false,
      name: 'Original Name',
      calculateProfileStrength: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };

    User.findById = jest.fn().mockResolvedValue(mockUser);

    await expect(authService.updateProfile('user1', {
      name: 'Updated Name',
      role: 'admin',
      isVerified: true,
      hospital: 'Other Hospital'
    })).rejects.toMatchObject({
      statusCode: 403
    });

    expect(mockUser.name).toBe('Original Name');
    expect(mockUser.isVerified).toBe(false);
    expect(mockUser.calculateProfileStrength).not.toHaveBeenCalled();
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  it('should update only the provider-specific allowlisted profile fields for providers', async () => {
    const mockUser = {
      _id: 'user1',
      role: 'doctor',
      name: 'Original Name',
      phone: '1111111111',
      location: { city: 'Old City' },
      professional: { primarySpecialization: 'Emergency Medicine' },
      notificationSettings: { email: true },
      isAvailableForShifts: true,
      specialty: 'Emergency Medicine',
      licenseNumber: 'OLD-LICENSE',
      bankDetails: { accountHolderName: 'Old Name' },
      onboardingCompleted: false,
      calculateProfileStrength: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };

    User.findById = jest.fn().mockResolvedValue(mockUser);

    const result = await authService.updateProfile('user1', {
      name: 'Updated Name',
      phone: '9999999999',
      location: { city: 'New City' },
      professional: { primarySpecialization: 'General Medicine' },
      notificationSettings: { email: false },
      isAvailableForShifts: false,
      specialty: 'General Medicine',
      licenseNumber: 'NEW-LICENSE',
      bankDetails: { accountHolderName: 'Updated Name' },
      onboardingCompleted: true
    });

    expect(result.name).toBe('Updated Name');
    expect(result.phone).toBe('9999999999');
    expect(result.location).toEqual({ city: 'New City' });
    expect(result.professional).toEqual({ primarySpecialization: 'General Medicine' });
    expect(result.notificationSettings).toEqual({ email: false });
    expect(result.isAvailableForShifts).toBe(false);
    expect(result.specialty).toBe('General Medicine');
    expect(result.licenseNumber).toBe('NEW-LICENSE');
    expect(result.bankDetails).toEqual({ accountHolderName: 'Updated Name' });
    expect(result.onboardingCompleted).toBe(true);
    expect(mockUser.calculateProfileStrength).toHaveBeenCalledTimes(1);
    expect(mockUser.save).toHaveBeenCalledTimes(1);
  });

  it('should allow admins to update hospital-scoped profile fields', async () => {
    const mockUser = {
      _id: 'admin1',
      role: 'admin',
      hospital: 'Old Hospital',
      location: { city: 'Old City' },
      name: 'Admin Name',
      phone: '1111111111',
      calculateProfileStrength: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };

    User.findById = jest.fn().mockResolvedValue(mockUser);

    const result = await authService.updateProfile('admin1', {
      hospital: 'New Hospital',
      location: { city: 'New City' },
      name: 'Updated Admin',
      phone: '9999999999'
    });

    expect(result.hospital).toBe('New Hospital');
    expect(result.location).toEqual({ city: 'New City' });
    expect(result.name).toBe('Updated Admin');
    expect(result.phone).toBe('9999999999');
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

  it('should decrypt bank details when loading the authenticated user profile', async () => {
    const mockUser = {
      _id: 'user1',
      name: 'Doctor',
      bankDetails: { accountNumber: 'encrypted-value' },
      toObject: jest.fn().mockReturnValue({
        _id: 'user1',
        name: 'Doctor',
        bankDetails: { accountNumber: 'encrypted-value' }
      }),
      getDecryptedBankDetails: jest.fn().mockReturnValue({
        accountHolderName: 'Doctor',
        accountNumber: '1234567890'
      })
    };

    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(mockUser)
    });

    const profile = await authService.getUserProfile('user1');

    expect(profile.bankDetails).toEqual({
      accountHolderName: 'Doctor',
      accountNumber: '1234567890'
    });
    expect(mockUser.getDecryptedBankDetails).toHaveBeenCalledTimes(1);
  });
});
