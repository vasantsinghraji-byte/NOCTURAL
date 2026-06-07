jest.mock('../../../services/authService', () => ({
  register: jest.fn(),
  login: jest.fn(),
  getUserProfile: jest.fn(),
  updateProfile: jest.fn()
}));

jest.mock('../../../services/patientService', () => ({
  getProfile: jest.fn()
}));

jest.mock('../../../services/refreshSessionService', () => ({
  create: jest.fn(),
  rotate: jest.fn(),
  revoke: jest.fn()
}));

jest.mock('../../../utils/responseHelper', () => ({
  sendCreated: jest.fn(),
  sendSuccess: jest.fn(),
  handleServiceError: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn(),
  logAuth: jest.fn()
}));

const authService = require('../../../services/authService');
const refreshSessionService = require('../../../services/refreshSessionService');
const responseHelper = require('../../../utils/responseHelper');
const authController = require('../../../controllers/authController');
const { SUCCESS_MESSAGE } = require('../../../constants');
const { generateRefreshToken } = require('../../../middleware/auth');

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass req.body to register and return the expected success response', async () => {
    const req = {
      body: {
        name: 'Doctor Example',
        email: 'doctor@example.com',
        password: 'Password123!',
        role: 'doctor'
      }
    };
    const res = {
      cookie: jest.fn()
    };
    const next = jest.fn();
    const result = {
      token: 'jwt-token',
      refreshToken: 'refresh-token',
      user: { id: 'user123', role: 'doctor' }
    };

    authService.register.mockResolvedValue(result);

    await authController.register(req, res, next);

    expect(authService.register).toHaveBeenCalledWith(req.body);
    expect(refreshSessionService.create).toHaveBeenCalledWith({
      token: 'refresh-token',
      userId: 'user123',
      userType: 'user',
      req
    });
    expect(responseHelper.sendCreated).toHaveBeenCalledWith(
      res,
      {
        user: result.user
      },
      SUCCESS_MESSAGE.USER_REGISTERED
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'accessToken',
      'jwt-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict'
      })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict'
      })
    );
  });

  it('should pass req.body to login and return the expected success response', async () => {
    const req = {
      body: {
        email: 'doctor@example.com',
        password: 'Password123!'
      }
    };
    const res = {
      cookie: jest.fn()
    };
    const next = jest.fn();
    const result = {
      token: 'jwt-token',
      refreshToken: 'refresh-token',
      user: { id: 'user123', role: 'doctor' }
    };

    authService.login.mockResolvedValue(result);

    await authController.login(req, res, next);

    expect(authService.login).toHaveBeenCalledWith(req.body);
    expect(refreshSessionService.create).toHaveBeenCalledWith({
      token: 'refresh-token',
      userId: 'user123',
      userType: 'user',
      req
    });
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      {
        user: result.user
      },
      SUCCESS_MESSAGE.LOGIN_SUCCESS
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'accessToken',
      'jwt-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict'
      })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict'
      })
    );
  });

  it('should rotate refresh sessions and set replacement cookies on refresh', async () => {
    const refreshToken = generateRefreshToken('user123');
    const req = {
      headers: {
        cookie: `refreshToken=${encodeURIComponent(refreshToken)}`
      }
    };
    const res = {
      cookie: jest.fn()
    };
    const next = jest.fn();
    const user = { id: 'user123', role: 'doctor' };

    refreshSessionService.rotate.mockResolvedValue({
      userType: 'user'
    });
    authService.getUserProfile.mockResolvedValue(user);

    await authController.refresh(req, res, next);

    expect(refreshSessionService.rotate).toHaveBeenCalledWith(
      expect.objectContaining({
        currentToken: refreshToken,
        req
      })
    );
    expect(authService.getUserProfile).toHaveBeenCalledWith('user123');
    expect(res.cookie).toHaveBeenCalledWith(
      'accessToken',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' })
    );
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(res, { user }, 'Session refreshed');
  });

  it('should revoke refresh session on logout', async () => {
    const req = {
      headers: {
        cookie: 'refreshToken=refresh-token'
      }
    };
    const res = {
      clearCookie: jest.fn()
    };
    const next = jest.fn();

    await authController.logout(req, res, next);

    expect(refreshSessionService.revoke).toHaveBeenCalledWith('refresh-token');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'accessToken',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' })
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' })
    );
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(res, {}, 'Logged out successfully');
  });

  it('should pass req.user.id to getMe and return the user payload', async () => {
    const req = {
      user: { id: 'user123' }
    };
    const res = {};
    const next = jest.fn();
    const user = { _id: 'user123', name: 'Doctor Example' };

    authService.getUserProfile.mockResolvedValue(user);

    await authController.getMe(req, res, next);

    expect(authService.getUserProfile).toHaveBeenCalledWith('user123');
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(res, { user });
  });

  it('should pass req.user.id and req.body to updateMe and return the updated user payload', async () => {
    const req = {
      user: { id: 'user123' },
      body: {
        name: 'Updated Doctor',
        phone: '9999999999'
      }
    };
    const res = {};
    const next = jest.fn();
    const user = { _id: 'user123', name: 'Updated Doctor', phone: '9999999999' };

    authService.updateProfile.mockResolvedValue(user);

    await authController.updateMe(req, res, next);

    expect(authService.updateProfile).toHaveBeenCalledWith('user123', req.body);
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { user },
      SUCCESS_MESSAGE.PROFILE_UPDATED
    );
  });
});
