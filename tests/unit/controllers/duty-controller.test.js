jest.mock('../../../services/dutyService', () => ({
  getAllDuties: jest.fn(),
  getDutiesByHospital: jest.fn(),
  getDutyById: jest.fn(),
  createDuty: jest.fn(),
  updateDuty: jest.fn(),
  deleteDuty: jest.fn()
}));

jest.mock('../../../utils/responseHelper', () => ({
  sendCreated: jest.fn(),
  sendSuccess: jest.fn(),
  handleServiceError: jest.fn()
}));

const dutyService = require('../../../services/dutyService');
const responseHelper = require('../../../utils/responseHelper');
const dutyController = require('../../../controllers/dutyController');

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
};

describe('Duty Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass req.user.id to getMyDuties and return duties array', async () => {
    const req = {
      query: {},
      user: { id: 'admin123', role: 'admin' }
    };
    const res = createRes();
    const next = jest.fn();
    const result = {
      duties: [{ _id: 'duty1' }],
      pagination: { total: 1, page: 1, pages: 1, limit: 100 }
    };

    dutyService.getDutiesByHospital.mockResolvedValue(result);

    await dutyController.getMyDuties(req, res, next);

    expect(dutyService.getDutiesByHospital).toHaveBeenCalledWith('admin123', {
      page: 1,
      limit: 100
    });
    expect(responseHelper.sendSuccess).toHaveBeenCalledWith(
      res,
      { count: 1, duties: result.duties, pagination: result.pagination }
    );
  });
});
