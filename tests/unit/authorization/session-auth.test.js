/**
 * Session Authorization Tests
 *
 * Verifies:
 * - AUTH-007: Patient password change calls save() (passwordChangedAt behavior)
 * - AUTH-008: Login lastActive save failure isolation
 */

// AUTH-008 mocks
jest.mock('../../../models/user');
jest.mock('../../../middleware/auth', () => ({
  generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
  protect: jest.fn()
}));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn(),
  logAuth: jest.fn()
}));

const User = require('../../../models/user');
const logger = require('../../../utils/logger');
const authService = require('../../../services/authService');

describe('Authorization Unit: session invalidation and login save isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AUTH-007: Patient password change (source analysis)', () => {
    it('source code updatePassword should call patient.save() after setting password', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patient-booking-service', 'src', 'services', 'patientService.js'),
        'utf8'
      );

      // Extract updatePassword method body
      const methodMatch = src.match(/async updatePassword\b[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      // Should set password and call save
      expect(methodBody).toContain('patient.password = newPassword');
      expect(methodBody).toContain('await patient.save()');
    });

    it('source code updatePassword should verify current password before changing', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patient-booking-service', 'src', 'services', 'patientService.js'),
        'utf8'
      );

      const methodMatch = src.match(/async updatePassword\b[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      // Should verify current password
      expect(methodBody).toContain('comparePassword');
    });
  });

  describe('AUTH-008: Login lastActive save failure isolation', () => {
    it('should return token even when user.save() throws during lastActive update', async () => {
      const mockUser = {
        _id: 'user1',
        email: 'test@example.com',
        role: 'nurse',
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockRejectedValue(new Error('DB write failed'))
      };

      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      const result = await authService.login({ email: 'test@example.com', password: 'password123' });

      // Login should succeed despite save failure
      expect(result).toBeDefined();
      expect(result).toHaveProperty('token');
      const { generateToken } = require('../../../middleware/auth');
      expect(generateToken).toHaveBeenCalled();
    });

    it('should log error when lastActive save fails', async () => {
      const mockUser = {
        _id: 'user1',
        email: 'test@example.com',
        role: 'nurse',
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockRejectedValue(new Error('DB write failed'))
      };

      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await authService.login({ email: 'test@example.com', password: 'password123' });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to update lastActive on login',
        expect.objectContaining({
          userId: 'user1'
        })
      );
    });
  });
});
