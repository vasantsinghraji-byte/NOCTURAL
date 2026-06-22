/**
 * Auth Middleware Security Tests
 *
 * Covers Phase 1 fixes:
 * - SEC-001: JWT signature validation
 * - SEC-002: Short-lived cookie-backed access token expiry
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
const {
  protect,
  authorize,
  generateToken,
  JWT_ACCESS_SIGN_OPTIONS,
  JWT_ACCESS_VERIFY_OPTIONS
} = require('../../../middleware/auth');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

const JWT_SECRET = process.env.JWT_SECRET;

describe('Security Unit: auth middleware JWT and RBAC enforcement', () => {
  const signAccessToken = (payload, options = {}) => jwt.sign({
    identityType: 'user',
    tokenVersion: 1,
    ...payload
  }, JWT_SECRET, {
    ...JWT_ACCESS_SIGN_OPTIONS,
    ...options
  });

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
      const token = signAccessToken({ id: mockUser._id }, { expiresIn: '1h' });
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

    it('should authenticate with a valid accessToken cookie', async () => {
      const token = signAccessToken({ id: mockUser._id }, { expiresIn: '15m' });
      const req = mockRequest({
        headers: { cookie: `accessToken=${encodeURIComponent(token)}` }
      });
      const res = mockResponse();
      const next = mockNext();

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await protect(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
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
      const token = jwt.sign({ id: mockUser._id }, 'wrong-secret', {
        ...JWT_ACCESS_SIGN_OPTIONS,
        expiresIn: '1h'
      });
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

    it('should reject signed tokens missing the required issuer and audience', async () => {
      const token = jwt.sign({ id: mockUser._id }, JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '1h'
      });
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
      expect(User.findById).not.toHaveBeenCalled();
    });

    it('should reject expired token (SEC-002)', async () => {
      const token = signAccessToken({ id: mockUser._id }, { expiresIn: '-1s' });
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
      const token = signAccessToken({ id: mockUser._id }, { expiresIn: '1h' });
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
      const token = signAccessToken({ id: mockUser._id }, { expiresIn: '1h' });
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
      const token = signAccessToken({ id: mockUser._id, iat }, { expiresIn: '7d' });

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
      const token = signAccessToken({ id: mockUser._id, iat }, { expiresIn: '7d' });

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

    it('should reject a token with an obsolete account session version', async () => {
      const token = signAccessToken({ id: mockUser._id, sessionVersion: 3 }, { expiresIn: '1h' });
      const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
      const res = mockResponse();
      const next = mockNext();

      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, sessionVersion: 4 })
      });

      await protect(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Session has been invalidated') })
      );
      expect(next).not.toHaveBeenCalled();
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
      const decoded = jwt.verify(token, JWT_SECRET, JWT_ACCESS_VERIFY_OPTIONS);

      expect(decoded.id).toBe('507f1f77bcf86cd799439011');
      expect(decoded.exp).toBeDefined();
      expect(decoded.iss).toBe('nocturnal-api');
      expect(decoded.aud).toBe('nocturnal:user');
      expect(decoded.identityType).toBe('user');
      expect(decoded.tokenVersion).toBe(1);
    });

    it('should set access token expiry to 15m by default', () => {
      const originalExpire = process.env.JWT_ACCESS_EXPIRE;
      delete process.env.JWT_ACCESS_EXPIRE;

      // Need to re-require to get the default
      jest.resetModules();
      jest.mock('../../../models/user');
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn(), logSecurity: jest.fn()
      }));
      const { generateToken: genToken } = require('../../../middleware/auth');

      const token = genToken('507f1f77bcf86cd799439011');
      const decoded = jwt.decode(token);

      const expiryMinutes = (decoded.exp - decoded.iat) / 60;
      expect(expiryMinutes).toBe(15);

      // Restore
      if (originalExpire) process.env.JWT_ACCESS_EXPIRE = originalExpire;
    });

    it('should include user ID in token payload', () => {
      const userId = '507f1f77bcf86cd799439011';
      const token = generateToken(userId);
      const decoded = jwt.decode(token);

      expect(decoded.id).toBe(userId);
    });
  });
});
