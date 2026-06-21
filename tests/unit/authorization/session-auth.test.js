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
    it('delegates password mutation to the shared transactional security service', () => {
      const fs = require('fs');
      const path = require('path');
      const patientServiceSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patientService.js'),
        'utf8'
      );
      const securityServiceSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'passwordSecurityService.js'),
        'utf8'
      );

      expect(patientServiceSrc).toContain('passwordSecurityService.changePassword');
      expect(securityServiceSrc).toContain('identity.password = newPassword');
      expect(securityServiceSrc).toContain('await identity.save');
      expect(securityServiceSrc).toContain('session.withTransaction');
    });

    it('shared password security service verifies the current password before changing it', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'passwordSecurityService.js'),
        'utf8'
      );

      expect(src).toContain('comparePassword(currentPassword)');
      expect(src.indexOf('comparePassword(currentPassword)')).toBeLessThan(src.indexOf('identity.password = newPassword'));
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
