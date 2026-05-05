const request = require('supertest');
const {
  jwt,
  generateToken,
  createPersistedUser,
  setupAuthIntegrationHarness
} = require('./auth-integration-helpers');

const { getApp } = setupAuthIntegrationHarness();

describe('Auth Integration: PUT /api/v1/auth/change-password', () => {
  it('should accept the dedicated change-password endpoint and invalidate old credentials', async () => {
    const doctor = createPersistedUser({
      _id: 'doctor-user-change-password',
      role: 'doctor',
      email: 'doctor.password.change@test.com',
      password: 'OldPassword@123'
    });
    const oldToken = generateToken(doctor._id);

    await global.testUtils.wait(1100);

    const changePasswordResponse = await request(getApp())
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({
        currentPassword: 'OldPassword@123',
        newPassword: 'NewPassword@123',
        confirmPassword: 'NewPassword@123'
      });

    expect(changePasswordResponse.status).toBe(200);
    expect(changePasswordResponse.body.success).toBe(true);
    expect(changePasswordResponse.body.message).toBe('Password updated successfully');

    const oldPasswordLoginResponse = await request(getApp())
      .post('/api/v1/auth/login')
      .send({
        email: doctor.email,
        password: 'OldPassword@123'
      });

    expect(oldPasswordLoginResponse.status).toBe(401);
    expect(oldPasswordLoginResponse.body.success).toBe(false);

    const newPasswordLoginResponse = await request(getApp())
      .post('/api/v1/auth/login')
      .send({
        email: doctor.email,
        password: 'NewPassword@123'
      });

    expect(newPasswordLoginResponse.status).toBe(200);
    expect(newPasswordLoginResponse.body.success).toBe(true);
    expect(newPasswordLoginResponse.body.token).toBeTruthy();

    const oldTokenProfileResponse = await request(getApp())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);

    expect(oldTokenProfileResponse.status).toBe(401);
    expect(oldTokenProfileResponse.body.success).toBe(false);
    expect(oldTokenProfileResponse.body.message).toBe('Password recently changed - please login again');
  });

  it('should reject the dedicated change-password endpoint when currentPassword is incorrect', async () => {
    const doctor = createPersistedUser({
      _id: 'doctor-user-change-password-invalid-current',
      role: 'doctor',
      email: 'doctor.password.invalid-current@test.com',
      password: 'OldPassword@123'
    });
    const token = generateToken(doctor._id);

    const changePasswordResponse = await request(getApp())
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'WrongPassword@123',
        newPassword: 'NewPassword@123',
        confirmPassword: 'NewPassword@123'
      });

    expect(changePasswordResponse.status).toBe(401);
    expect(changePasswordResponse.body.success).toBe(false);
    expect(changePasswordResponse.body.message).toBe('Current password is incorrect');

    const oldPasswordLoginResponse = await request(getApp())
      .post('/api/v1/auth/login')
      .send({
        email: doctor.email,
        password: 'OldPassword@123'
      });

    expect(oldPasswordLoginResponse.status).toBe(200);
    expect(oldPasswordLoginResponse.body.success).toBe(true);

    const newPasswordLoginResponse = await request(getApp())
      .post('/api/v1/auth/login')
      .send({
        email: doctor.email,
        password: 'NewPassword@123'
      });

    expect(newPasswordLoginResponse.status).toBe(401);
    expect(newPasswordLoginResponse.body.success).toBe(false);
  });

  it('should reject the dedicated change-password endpoint when confirmPassword does not match newPassword', async () => {
    const doctor = createPersistedUser({
      _id: 'doctor-user-change-password-confirm-mismatch',
      role: 'doctor',
      email: 'doctor.password.confirm-mismatch@test.com',
      password: 'OldPassword@123'
    });
    const token = generateToken(doctor._id);

    const changePasswordResponse = await request(getApp())
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'OldPassword@123',
        newPassword: 'NewPassword@123',
        confirmPassword: 'MismatchPassword@123'
      });

    expect(changePasswordResponse.status).toBe(400);
    expect(changePasswordResponse.body.success).toBe(false);
    expect(changePasswordResponse.body.error).toBe('Validation failed');
    expect(changePasswordResponse.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Passwords do not match'
        })
      ])
    );

    const oldPasswordLoginResponse = await request(getApp())
      .post('/api/v1/auth/login')
      .send({
        email: doctor.email,
        password: 'OldPassword@123'
      });

    expect(oldPasswordLoginResponse.status).toBe(200);
    expect(oldPasswordLoginResponse.body.success).toBe(true);

    const newPasswordLoginResponse = await request(getApp())
      .post('/api/v1/auth/login')
      .send({
        email: doctor.email,
        password: 'NewPassword@123'
      });

    expect(newPasswordLoginResponse.status).toBe(401);
    expect(newPasswordLoginResponse.body.success).toBe(false);
  });

  it('should reject the dedicated change-password endpoint without an Authorization header', async () => {
    const changePasswordResponse = await request(getApp())
      .put('/api/v1/auth/change-password')
      .send({
        currentPassword: 'OldPassword@123',
        newPassword: 'NewPassword@123',
        confirmPassword: 'NewPassword@123'
      });

    expect(changePasswordResponse.status).toBe(401);
    expect(changePasswordResponse.body.success).toBe(false);
    expect(changePasswordResponse.body.message).toBe('Not authorized - No token provided');
  });

  it('should reject the dedicated change-password endpoint with a malformed bearer token', async () => {
    const changePasswordResponse = await request(getApp())
      .put('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({
        currentPassword: 'OldPassword@123',
        newPassword: 'NewPassword@123',
        confirmPassword: 'NewPassword@123'
      });

    expect(changePasswordResponse.status).toBe(401);
    expect(changePasswordResponse.body.success).toBe(false);
    expect(changePasswordResponse.body.message).toBe('Invalid token - authentication failed');
  });

  it('should reject the dedicated change-password endpoint with an expired bearer token', async () => {
    const doctor = createPersistedUser({
      _id: 'doctor-user-change-password-expired-token',
      role: 'doctor'
    });
    const expiredToken = jwt.sign(
      { id: doctor._id },
      process.env.JWT_SECRET,
      { expiresIn: -1 }
    );

    const changePasswordResponse = await request(getApp())
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({
        currentPassword: 'OldPassword@123',
        newPassword: 'NewPassword@123',
        confirmPassword: 'NewPassword@123'
      });

    expect(changePasswordResponse.status).toBe(401);
    expect(changePasswordResponse.body.success).toBe(false);
    expect(changePasswordResponse.body.message).toBe('Token expired - please login again');
  });
});
