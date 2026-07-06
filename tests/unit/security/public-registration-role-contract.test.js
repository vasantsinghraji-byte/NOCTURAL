const express = require('express');
const request = require('supertest');

const { REGISTRATION_ROLES, STAFF_ROLES } = require('../../../constants/enums');
const { validateRegister } = require('../../../validators/authValidator');

function createRegistrationApp() {
  const app = express();
  app.use(express.json());
  app.post('/auth/register', validateRegister, (_req, res) => {
    res.status(201).json({ success: true });
  });
  return app;
}

function validRegistrationPayload(overrides = {}) {
  return {
    name: 'Test Doctor',
    email: 'doctor@example.com',
    password: 'TestPass1!',
    confirmPassword: 'TestPass1!',
    phone: '+919876543210',
    role: 'doctor',
    agreeToTerms: true,
    ...overrides
  };
}

describe('public staff registration role contract', () => {
  it('keeps /auth/register roles aligned with User staff roles', () => {
    expect(REGISTRATION_ROLES).toEqual(['doctor', 'nurse', 'physiotherapist']);
    expect(REGISTRATION_ROLES.every(role => STAFF_ROLES.includes(role))).toBe(true);
    expect(REGISTRATION_ROLES).not.toContain('patient');
  });

  it('rejects patient role before reaching User model creation', async () => {
    const app = createRegistrationApp();

    const response = await request(app)
      .post('/auth/register')
      .send(validRegistrationPayload({
        role: 'patient',
        email: 'patient@example.com'
      }))
      .expect(400);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: 'Validation failed'
    }));
    expect(JSON.stringify(response.body.errors)).toContain('/api/v1/patients/register');
  });

  it('still accepts valid staff self-registration roles at validation layer', async () => {
    const app = createRegistrationApp();

    await request(app)
      .post('/auth/register')
      .send(validRegistrationPayload({ role: 'doctor' }))
      .expect(201);
  });
});
