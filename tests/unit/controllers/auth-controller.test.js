jest.mock('../../../services/authService', () => ({
  register: jest.fn(),
  login: jest.fn(),
  getUserProfile: jest.fn(),
  updateProfile: jest.fn()
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
const responseHelper = require('../../../utils/responseHelper');
const authController = require('../../../controllers/authController');
const { SUCCESS_MESSAGE } = require('../../../constants');

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
    const res = {};
    const next = jest.fn();
    const result = {
      token: 'jwt-token',
      user: { id: 'user123', role: 'doctor' }
    };

    authService.register.mockResolvedValue(result);

    await authController.register(req, res, next);

    expect(authService.register).toHaveBeenCalledWith(req.body);
    expect(responseHelper.sendCreated).toHaveBeenCalledWith(
      res,
      {
      token: 'jwt-token',
      user: result.user
      },
      SUCCESS_MESSAGE.USER_REGISTERED
    );
  });

  it('should pass req.body to login and return the expected success response', async () => {
    const req = {
      body: {
        email: 'doctor@example.com',
        password: 'Password123!'
      }
    };
    const res = {};
    const next = jest.fn();
    const result = {
      token: 'jwt-token',
      user: { id: 'user123', role: 'doctor' }
    };

    authService.login.mockResolvedValue(result);

    await authController.login(req, res, next);

    expect(authService.login).toHaveBeenCalledWith(req.body);
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      {
      token: 'jwt-token',
      user: result.user
      },
      SUCCESS_MESSAGE.LOGIN_SUCCESS
    );
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
