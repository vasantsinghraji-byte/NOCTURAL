/**
 * Auth Middleware Security Tests
 *
 * Covers Phase 1 fixes:
 * - SEC-001: JWT signature validation
 * - SEC-002: Token expiry (reduced to 7d)
 * - SEC-003: Password change invalidation
 * - SEC-004: Role authorization validation
 * - SEC-014: Error handling (no stack trace leakage)
 */

const jwt = require('jsonwebtoken');

// Mock dependencies before requiring the module
jest.mock('../../../models/user');
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));

const User = require('../../../models/user');
const { protect, authorize, generateToken } = require('../../../middleware/auth');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

const JWT_SECRET = process.env.JWT_SECRET;

describe('Auth Middleware - Security Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('protect() - JWT Authentication', () => {
    const mockUser = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Test User',
      email: 'test@test.com',
      role: 'doctor',
      isActive: true,
      passwordChangedAt: null
    };

    it('should authenticate with a valid JWT token', async () => {
      const token = jwt.sign({ id: mockUser._id }, JWT_SECRET, { expiresIn: '1h' });
      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const res = mockResponse();
      const next = mockNext();

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await protect(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
      expect(req.user.id).toBe(mockUser._id);
    });

    it('should reject request with no token (SEC-001)', async () => {
      const req = mockRequest({ headers: {} });
      const res = mockResponse();
      const next = mockNext();

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('No token') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject tampered/invalid JWT signature (SEC-001)', async () => {
      const token = jwt.sign({ id: mockUser._id }, 'wrong-secret', { expiresIn: '1h' });
      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const res = mockResponse();
      const next = mockNext();

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Invalid token') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject expired token (SEC-002)', async () => {
      const token = jwt.sign({ id: mockUser._id }, JWT_SECRET, { expiresIn: '-1s' });
      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const res = mockResponse();
      const next = mockNext();

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('expired') })
      );
    });

    it('should reject token when user not found in database', async () => {
      const token = jwt.sign({ id: mockUser._id }, JWT_SECRET, { expiresIn: '1h' });
      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const res = mockResponse();
      const next = mockNext();

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('not found') })
      );
    });

    it('should reject deactivated user account', async () => {
      const token = jwt.sign({ id: mockUser._id }, JWT_SECRET, { expiresIn: '1h' });
      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const res = mockResponse();
      const next = mockNext();

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, isActive: false })
      });

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('deactivated') })
      );
    });

    it('should reject token issued before password change (SEC-003)', async () => {
      // Token issued at time T
      const iat = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const token = jwt.sign({ id: mockUser._id, iat }, JWT_SECRET, { expiresIn: '7d' });

      // Password changed after token was issued
      const passwordChangedAt = new Date(Date.now() - 1800 * 1000); // 30 min ago

      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const res = mockResponse();
      const next = mockNext();

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, passwordChangedAt })
      });

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Password recently changed') })
      );
    });

    it('should allow token issued after password change', async () => {
      // Password changed 2 hours ago
      const passwordChangedAt = new Date(Date.now() - 7200 * 1000);

      // Token issued 1 hour ago (after password change)
      const iat = Math.floor(Date.now() / 1000) - 3600;
      const token = jwt.sign({ id: mockUser._id, iat }, JWT_SECRET, { expiresIn: '7d' });

      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const res = mockResponse();
      const next = mockNext();

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, passwordChangedAt })
      });

      await protect(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });

    it('should not leak error details in JWT error responses (SEC-014)', async () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer completely.invalid.token' }
      });
      const res = mockResponse();
      const next = mockNext();

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody).not.toHaveProperty('stack');
      expect(responseBody).not.toHaveProperty('error');
      expect(JSON.stringify(responseBody)).not.toMatch(/at\s+\w+\s+\(/); // No stack trace patterns
    });

    it('should reject malformed Authorization header', async () => {
      const req = mockRequest({
        headers: { authorization: 'NotBearer some-token' }
      });
      const res = mockResponse();
      const next = mockNext();

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('authorize() - Role-Based Access Control (SEC-004)', () => {
    it('should allow access for matching role', () => {
      const middleware = authorize('doctor', 'admin');
      const req = mockRequest({
        user: { _id: '123', role: 'doctor' }
      });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access for non-matching role', () => {
      const middleware = authorize('admin');
      const req = mockRequest({
        user: { _id: '123', role: 'doctor' }
      });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('doctor')
        })
      );
    });

    it('should return 401 when no user in request', () => {
      const middleware = authorize('admin');
      const req = mockRequest({ user: null });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle patient userType when no role field', () => {
      const middleware = authorize('patient');
      const req = mockRequest({
        user: { _id: '123' },
        userType: 'patient'
      });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 403 when user role cannot be determined', () => {
      const middleware = authorize('admin');
      const req = mockRequest({
        user: { _id: '123' } // No role, no userType
      });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Unable to determine') })
      );
    });

    it('should support multiple allowed roles', () => {
      const middleware = authorize('doctor', 'nurse', 'admin');
      const req = mockRequest({
        user: { _id: '123', role: 'nurse' }
      });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('generateToken() - Token Security (SEC-002)', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken('507f1f77bcf86cd799439011');
      const decoded = jwt.verify(token, JWT_SECRET);

      expect(decoded.id).toBe('507f1f77bcf86cd799439011');
      expect(decoded.exp).toBeDefined();
    });

    it('should set token expiry to 7d by default (not 30d)', () => {
      const originalExpire = process.env.JWT_EXPIRE;
      delete process.env.JWT_EXPIRE;

      // Need to re-require to get the default
      jest.resetModules();
      jest.mock('../../../models/user');
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn(), logSecurity: jest.fn()
      }));
      const { generateToken: genToken } = require('../../../middleware/auth');

      const token = genToken('507f1f77bcf86cd799439011');
      const decoded = jwt.decode(token);

      const expiryDays = (decoded.exp - decoded.iat) / (60 * 60 * 24);
      expect(expiryDays).toBe(7);

      // Restore
      if (originalExpire) process.env.JWT_EXPIRE = originalExpire;
    });

    it('should include user ID in token payload', () => {
      const userId = '507f1f77bcf86cd799439011';
      const token = generateToken(userId);
      const decoded = jwt.decode(token);

      expect(decoded.id).toBe(userId);
    });
  });
});
