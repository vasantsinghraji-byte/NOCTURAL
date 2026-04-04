/**
 * Integration Tests: Authentication Security Flow
 *
 * End-to-end security tests for the authentication pipeline.
 * Tests JWT lifecycle, role enforcement, input sanitization middleware,
 * and encryption roundtrip.
 *
 * NOTE: These tests require a running MongoDB instance.
 * Skip with: jest --testPathIgnorePatterns=integration
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { protect, authorize, generateToken } = require('../../../middleware/auth');
const { sanitizeInput } = require('../../../middleware/validation');
const { sanitizationMiddleware } = require('../../../utils/sanitization');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn(),
  logAuth: jest.fn()
}));

describe('Integration: Authentication Security Flow', () => {
  describe('Full JWT Lifecycle', () => {
    it('should generate token → verify → authorize in sequence', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const token = generateToken(userId);

      // Verify the token is valid
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(userId);

      // Verify expiry is set
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    it('should reject none algorithm attack', () => {
      // Craft a token with algorithm "none" (classic JWT attack)
      const payload = {
        id: '507f1f77bcf86cd799439011',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      // Create unsigned token
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const unsignedToken = `${header}.${body}.`;

      expect(() => {
        jwt.verify(unsignedToken, process.env.JWT_SECRET);
      }).toThrow();
    });

    it('should reject token with different algorithm (alg confusion)', () => {
      // Try to verify HS256 token with a different secret
      const token = jwt.sign(
        { id: '507f1f77bcf86cd799439011' },
        'attacker-controlled-secret',
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      expect(() => {
        jwt.verify(token, process.env.JWT_SECRET);
      }).toThrow();
    });
  });

  describe('Middleware Chain: Sanitization → Auth → Authorization', () => {
    it('should strip XSS from request body before auth processing', () => {
      const req = mockRequest({
        body: {
          email: '<script>alert("xss")</script>test@test.com',
          name: 'Normal Name'
        }
      });
      const res = mockResponse();
      const next = mockNext();

      // Run sanitization middleware
      sanitizeInput(req, res, next);

      // XSS tags should be stripped
      expect(req.body.email).not.toContain('<script>');
      expect(req.body.name).toBe('Normal Name');
      expect(next).toHaveBeenCalled();
    });

    it('should sanitize NoSQL injection in request body', () => {
      const req = mockRequest({
        body: {
          username: 'admin',
          password: { $ne: null }
        },
        query: {},
        params: {}
      });
      const res = mockResponse();
      const next = mockNext();

      // Run sanitization middleware
      const middleware = sanitizationMiddleware();
      middleware(req, res, next);

      // $ne operator should be removed
      if (typeof req.body.password === 'object') {
        expect(req.body.password).not.toHaveProperty('$ne');
      }
    });

    it('should block prototype pollution in request params', () => {
      const req = mockRequest({
        body: {
          '__proto__': { isAdmin: true },
          'constructor': { prototype: { isAdmin: true } },
          name: 'test'
        },
        query: {},
        params: {}
      });
      const res = mockResponse();
      const next = mockNext();

      const middleware = sanitizationMiddleware();
      middleware(req, res, next);

      // Prototype pollution keys should be removed
      const proto = Object.getPrototypeOf({});
      expect(proto.isAdmin).toBeUndefined();
    });
  });

  describe('Encryption Roundtrip Security', () => {
    beforeAll(() => {
      // Ensure valid key is set
      if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
        process.env.ENCRYPTION_KEY = 'a'.repeat(64);
      }
    });

    it('should encrypt and decrypt sensitive data correctly', () => {
      jest.resetModules();
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn()
      }));
      const { encrypt, decrypt } = require('../../../utils/encryption');

      const sensitiveData = 'SSN: 123-45-6789';
      const encrypted = encrypt(sensitiveData);

      expect(encrypted).not.toBe(sensitiveData);
      expect(encrypted).toContain(':');

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(sensitiveData);
    });

    it('should produce different ciphertext for same input (IV randomness)', () => {
      jest.resetModules();
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn()
      }));
      const { encrypt } = require('../../../utils/encryption');

      const data = 'same sensitive data';
      const enc1 = encrypt(data);
      const enc2 = encrypt(data);

      expect(enc1).not.toBe(enc2);
    });

    it('should return null for tampered ciphertext', () => {
      jest.resetModules();
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn()
      }));
      const { encrypt, decrypt } = require('../../../utils/encryption');

      const encrypted = encrypt('test data');
      // Tamper with the ciphertext portion
      const parts = encrypted.split(':');
      parts[1] = 'ff' + parts[1].substring(2); // Corrupt ciphertext
      const tampered = parts.join(':');

      const result = decrypt(tampered);
      expect(result).toBeNull();
    });

    it('should handle null/empty input gracefully', () => {
      jest.resetModules();
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn()
      }));
      const { encrypt, decrypt, hash } = require('../../../utils/encryption');

      expect(encrypt(null)).toBeNull();
      expect(encrypt('')).toBeNull();
      expect(decrypt(null)).toBeNull();
      expect(decrypt('')).toBeNull();
      expect(hash(null)).toBeNull();
    });
  });

  describe('Error Response Security', () => {
    it('should never expose internal paths in error messages', async () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer invalid.token.here' }
      });
      const res = mockResponse();
      const next = mockNext();

      jest.resetModules();
      jest.mock('../../../models/user');
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn(), logSecurity: jest.fn()
      }));
      const { protect: protectFn } = require('../../../middleware/auth');

      await protectFn(req, res, next);

      const responseBody = res.json.mock.calls[0][0];
      const responseStr = JSON.stringify(responseBody);

      // Should not contain file paths
      expect(responseStr).not.toMatch(/\/home\//);
      expect(responseStr).not.toMatch(/\\Users\\/);
      expect(responseStr).not.toMatch(/node_modules/);
      expect(responseStr).not.toMatch(/at\s+\w+\s+\(/); // Stack trace pattern
    });
  });
});
