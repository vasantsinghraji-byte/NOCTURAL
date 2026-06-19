const request = require('supertest');

const patientId = '507f1f77bcf86cd799439011';
const doctorId = '507f1f77bcf86cd799439012';
const adminId = '507f1f77bcf86cd799439013';

jest.mock('../../../middleware/auth', () => {
  const actual = jest.requireActual('../../../middleware/auth');
  return {
    ...actual,
    protect: (req, res, next) => {
      const role = req.get('x-test-role') || 'doctor';
      req.user = {
        _id: role === 'admin' ? adminId : doctorId,
        id: role === 'admin' ? adminId : doctorId,
        role,
        name: 'Route Test User'
      };
      next();
    },
    authorize: (...roles) => (req, res, next) => (
      roles.includes(req.user?.role)
        ? next()
        : res.status(403).json({ success: false, message: 'Access denied' })
    )
  };
});

jest.mock('../../../middleware/healthDataAccess', () => ({
  validateHealthAccess: () => (req, res, next) => {
    req.healthAccess = {
      type: 'TOKEN',
      patientId: req.params.patientId,
      accessLevel: 'READ_ONLY',
      allowedResources: [],
      accessTokenId: 'token-id'
    };
    next();
  },
  checkNotePermission: (req, res, next) => next(),
  checkIntakeAssignment: (req, res, next) => next(),
  verifyPatientSelfAccess: (req, res, next) => next(),
  auditHealthAccess: () => (req, res, next) => next(),
  rateLimitHealthAccess: () => (req, res, next) => next()
}));

jest.mock('../../../validators/healthDataValidator', () => {
  const actual = jest.requireActual('../../../validators/healthDataValidator');
  return {
    ...actual,
    validatePatientId: (req, res, next) => {
      if (!/^[a-f\d]{24}$/i.test(String(req.params.patientId || ''))) {
        return res.status(400).json({ success: false, message: 'Invalid patient id' });
      }
      return next();
    },
    validateDoctorNote: (req, res, next) => next()
  };
});

jest.mock('../../../services/doctorAccessService', () => ({
  getMyAccessTokens: jest.fn(),
  getPatientDataForDoctor: jest.fn(),
  getPatientAccessTokens: jest.fn(),
  revokeAccessByPatient: jest.fn(),
  grantAccess: jest.fn(),
  revokeAccessByAdmin: jest.fn(),
  logAccess: jest.fn()
}));

jest.mock('../../../models/healthDataAccessLog', () => ({
  getPatientAccessHistory: jest.fn(),
  getAccessorHistory: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('../../../models/doctorNote', () => ({
  create: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn(),
  logAuth: jest.fn()
}));

const doctorAccessService = require('../../../services/doctorAccessService');
const HealthDataAccessLog = require('../../../models/healthDataAccessLog');
const app = require('../../../app');

describe('Doctor access POST routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    doctorAccessService.getPatientDataForDoctor.mockResolvedValue({ id: patientId, records: [] });
    HealthDataAccessLog.getPatientAccessHistory.mockResolvedValue({
      logs: [{ _id: 'log-1', patient: patientId }],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 }
    });
  });

  it('serves patient data through POST body instead of legacy GET URL', async () => {
    const response = await request(app)
      .post('/api/v1/doctor-access/patients/read')
      .set('x-test-role', 'doctor')
      .send({ patientId });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(doctorAccessService.getPatientDataForDoctor).toHaveBeenCalledWith(
      doctorId,
      expect.objectContaining({}),
      'HEALTH_RECORD',
      expect.any(String)
    );

    const legacyResponse = await request(app)
      .get(`/api/v1/doctor-access/patients/${patientId}`)
      .set('x-test-role', 'doctor');

    expect(legacyResponse.status).toBe(404);
  });

  it('serves records and metrics through POST body routes', async () => {
    const recordsResponse = await request(app)
      .post('/api/v1/doctor-access/patients/records')
      .set('x-test-role', 'nurse')
      .send({ patientId });

    expect(recordsResponse.status).toBe(200);

    const metricsResponse = await request(app)
      .post('/api/v1/doctor-access/patients/metrics')
      .set('x-test-role', 'physiotherapist')
      .send({ patientId });

    expect(metricsResponse.status).toBe(200);
    expect(doctorAccessService.getPatientDataForDoctor).toHaveBeenLastCalledWith(
      doctorId,
      expect.objectContaining({}),
      'HEALTH_METRIC',
      expect.any(String)
    );
  });

  it('serves audit log search through POST body and removes legacy GET query route', async () => {
    const response = await request(app)
      .post('/api/v1/doctor-access/audit-logs/search')
      .set('x-test-role', 'admin')
      .send({ patientId, page: 1, limit: 25 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(HealthDataAccessLog.getPatientAccessHistory).toHaveBeenCalledWith(
      expect.objectContaining({}),
      expect.objectContaining({ page: 1, limit: 25 })
    );

    const legacyResponse = await request(app)
      .get(`/api/v1/doctor-access/audit-logs?patientId=${patientId}`)
      .set('x-test-role', 'admin');

    expect(legacyResponse.status).toBe(404);
  });
});
