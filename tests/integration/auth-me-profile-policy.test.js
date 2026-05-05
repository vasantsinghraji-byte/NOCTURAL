const request = require('supertest');
const {
  generateToken,
  createPersistedUser,
  setupAuthIntegrationHarness
} = require('./auth-integration-helpers');

const { getApp } = setupAuthIntegrationHarness();

describe('Auth Integration: PUT /api/v1/auth/me', () => {
  it('should allow provider-only fields for doctors and reject admin-only fields over HTTP', async () => {
    const doctor = createPersistedUser({
      _id: 'doctor-user-001',
      role: 'doctor'
    });
    const token = generateToken(doctor._id);

    const updateResponse = await request(getApp())
      .put('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        specialty: 'General Medicine',
        licenseNumber: 'DOC-NEW-002',
        onboardingCompleted: true,
        professional: {
          primarySpecialization: 'General Medicine',
          yearsOfExperience: 7
        },
        location: {
          city: 'Bengaluru',
          state: 'KA'
        }
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.user.specialty).toBe('General Medicine');
    expect(updateResponse.body.user.licenseNumber).toBe('DOC-NEW-002');
    expect(updateResponse.body.user.onboardingCompleted).toBe(true);
    expect(updateResponse.body.user.location).toEqual({
      city: 'Bengaluru',
      state: 'KA'
    });

    const profileResponse = await request(getApp())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.user.specialty).toBe('General Medicine');
    expect(profileResponse.body.user.professional).toEqual({
      primarySpecialization: 'General Medicine',
      yearsOfExperience: 7
    });

    const forbiddenUpdateResponse = await request(getApp())
      .put('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        hospital: 'Provider Should Not Set Hospital'
      });

    expect(forbiddenUpdateResponse.status).toBe(400);
    expect(forbiddenUpdateResponse.body.success).toBe(false);
    expect(forbiddenUpdateResponse.body.error).toBe('Validation failed');
    expect(forbiddenUpdateResponse.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Hospital cannot be modified for your account type'
        })
      ])
    );
  });

  it('should allow admin-only fields for admins and reject provider-only fields over HTTP', async () => {
    const admin = createPersistedUser({
      _id: 'admin-user-001',
      role: 'admin',
      hospital: 'Old Hospital'
    });
    const token = generateToken(admin._id);

    const updateResponse = await request(getApp())
      .put('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        hospital: 'New Hospital',
        name: 'Admin User',
        location: {
          city: 'Mumbai',
          state: 'MH'
        }
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.user.hospital).toBe('New Hospital');
    expect(updateResponse.body.user.location).toEqual({
      city: 'Mumbai',
      state: 'MH'
    });

    const forbiddenUpdateResponse = await request(getApp())
      .put('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        specialty: 'Critical Care'
      });

    expect(forbiddenUpdateResponse.status).toBe(400);
    expect(forbiddenUpdateResponse.body.success).toBe(false);
    expect(forbiddenUpdateResponse.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Specialty cannot be modified for your account type'
        })
      ])
    );
  });

  it('should reject explicitly blocked privilege fields over HTTP and preserve the existing profile', async () => {
    const doctor = createPersistedUser({
      _id: 'doctor-user-privilege-check',
      role: 'doctor',
      email: 'doctor.original@test.com',
      isVerified: true
    });
    const token = generateToken(doctor._id);

    const forbiddenUpdateResponse = await request(getApp())
      .put('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'admin',
        email: 'attacker@test.com',
        isVerified: false
      });

    expect(forbiddenUpdateResponse.status).toBe(400);
    expect(forbiddenUpdateResponse.body.success).toBe(false);
    expect(forbiddenUpdateResponse.body.error).toBe('Validation failed');
    expect(forbiddenUpdateResponse.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Role cannot be modified via profile update'
        }),
        expect.objectContaining({
          message: 'Email cannot be changed via profile update'
        }),
        expect.objectContaining({
          message: 'Verification status cannot be modified'
        })
      ])
    );

    const profileResponse = await request(getApp())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.user.role).toBe('doctor');
    expect(profileResponse.body.user.email).toBe('doctor.original@test.com');
    expect(profileResponse.body.user.isVerified).toBe(true);
  });

  it('should reject password updates over HTTP and require the dedicated change-password flow', async () => {
    const doctor = createPersistedUser({
      _id: 'doctor-user-password-check',
      role: 'doctor'
    });
    const token = generateToken(doctor._id);

    const forbiddenUpdateResponse = await request(getApp())
      .put('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        password: 'NewPassword@123'
      });

    expect(forbiddenUpdateResponse.status).toBe(400);
    expect(forbiddenUpdateResponse.body.success).toBe(false);
    expect(forbiddenUpdateResponse.body.error).toBe('Validation failed');
    expect(forbiddenUpdateResponse.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Use the change-password endpoint to update your password'
        })
      ])
    );

    const profileResponse = await request(getApp())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.user.name).toBe(doctor.name);
    expect(profileResponse.body.user.role).toBe('doctor');
  });
});
