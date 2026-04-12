jest.mock('../../../services/applicationService', () => ({
  getMyApplications: jest.fn(),
  getApplicationStats: jest.fn(),
  getReceivedApplications: jest.fn(),
  getDutyApplications: jest.fn(),
  applyForDuty: jest.fn(),
  updateApplicationStatus: jest.fn(),
  withdrawApplication: jest.fn()
}));

jest.mock('../../../utils/responseHelper', () => ({
  sendCreated: jest.fn(),
  sendSuccess: jest.fn(),
  sendPaginated: jest.fn(),
  handleServiceError: jest.fn()
}));

const applicationService = require('../../../services/applicationService');
const responseHelper = require('../../../utils/responseHelper');
const applicationController = require('../../../controllers/applicationController');

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
};

describe('Application Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass req.user.id to getReceivedApplications and return applications array', async () => {
    const req = {
      query: { page: '2', limit: '15' },
      user: { id: 'admin123', role: 'admin' }
    };
    const res = createRes();
    const next = jest.fn();
    const result = {
      data: [{ _id: 'app1' }],
      pagination: { total: 1, page: 2, pages: 1, limit: 15 }
    };

    applicationService.getReceivedApplications.mockResolvedValue(result);

    await applicationController.getReceivedApplications(req, res, next);

    expect(applicationService.getReceivedApplications).toHaveBeenCalledWith('admin123', {
      page: 2,
      limit: 15,
      sort: { appliedAt: -1 }
    });
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { applications: result.data, pagination: result.pagination },
      'Applications fetched successfully'
    );
  });

  it('should normalize query status and forward pagination options for doctor applications', async () => {
    const req = {
      query: { page: '3', limit: '10', status: 'accepted' },
      user: { id: 'doctor123', role: 'doctor' }
    };
    const res = createRes();
    const next = jest.fn();
    const result = {
      data: [{ _id: 'app1', status: 'ACCEPTED' }],
      pagination: { total: 1, page: 3, pages: 1, limit: 10 }
    };

    applicationService.getMyApplications.mockResolvedValue(result);

    await applicationController.getMyApplications(req, res, next);

    expect(applicationService.getMyApplications).toHaveBeenCalledWith('doctor123', {
      page: 3,
      limit: 10,
      status: 'ACCEPTED',
      sort: { appliedAt: -1 }
    });
    expect(responseHelper.sendPaginated).toHaveBeenCalledWith(
      res,
      result.data,
      result.pagination,
      'Applications fetched successfully'
    );
  });

  it('should return application stats for the authenticated user', async () => {
    const req = {
      user: { id: 'doctor123', role: 'doctor' }
    };
    const res = createRes();
    const next = jest.fn();
    const stats = {
      total: 4,
      pending: 1,
      accepted: 2,
      rejected: 1,
      totalEarnings: 50000
    };

    applicationService.getApplicationStats.mockResolvedValue(stats);

    await applicationController.getApplicationStats(req, res, next);

    expect(applicationService.getApplicationStats).toHaveBeenCalledWith('doctor123');
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(res, { stats });
  });

  it('should normalize application status to uppercase and forward reason as notes', async () => {
    const req = {
      params: { id: 'app123' },
      body: { status: 'accepted', reason: 'Strong match' },
      user: { id: 'admin123', role: 'admin' }
    };
    const res = createRes();
    const next = jest.fn();
    const application = { _id: 'app123', status: 'ACCEPTED' };

    applicationService.updateApplicationStatus.mockResolvedValue(application);

    await applicationController.updateApplicationStatus(req, res, next);

    expect(applicationService.updateApplicationStatus).toHaveBeenCalledWith(
      'app123',
      'admin123',
      'ACCEPTED',
      'Strong match'
    );
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { application },
      'Application accepted successfully'
    );
  });
});
