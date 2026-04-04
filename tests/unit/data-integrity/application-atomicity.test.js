/**
 * Application Atomicity Tests
 *
 * Verifies TXN-002 / RACE-002: updateApplicationStatus('ACCEPTED')
 * uses atomic findOneAndUpdate with guard on Duty to prevent
 * concurrent double-assignment.
 */

jest.mock('../../../models/application');
jest.mock('../../../models/duty');
jest.mock('../../../utils/pagination', () => ({ paginate: jest.fn() }));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));

const Application = require('../../../models/application');
const Duty = require('../../../models/duty');
const applicationService = require('../../../services/applicationService');

describe('Phase 2 — Application Atomicity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockApplication = (overrides = {}) => ({
    _id: 'app123',
    applicant: 'doctor456',
    status: 'PENDING',
    notes: null,
    statusHistory: [],
    duty: {
      _id: 'duty789',
      postedBy: { toString: () => 'hospital001' },
      status: 'OPEN'
    },
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  });

  describe('TXN-002 / RACE-002: ACCEPTED status uses atomic guard', () => {
    it('should call Duty.findOneAndUpdate with status and assignedDoctors guard', async () => {
      const app = mockApplication();
      Application.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(app)
      });

      const updatedDuty = {
        _id: 'duty789',
        positionsFilled: 1,
        positionsNeeded: 3
      };
      Duty.findOneAndUpdate.mockResolvedValue(updatedDuty);

      await applicationService.updateApplicationStatus('app123', 'hospital001', 'ACCEPTED');

      expect(Duty.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update, options] = Duty.findOneAndUpdate.mock.calls[0];

      // Guard: duty must be OPEN and doctor not already assigned
      expect(filter).toEqual(expect.objectContaining({
        _id: 'duty789',
        status: 'OPEN',
        'assignedDoctors.doctor': { $ne: 'doctor456' }
      }));

      // Update should push to assignedDoctors and increment positionsFilled
      expect(update).toHaveProperty('$push');
      expect(update.$push).toHaveProperty('assignedDoctors');
      expect(update).toHaveProperty('$inc', expect.objectContaining({ positionsFilled: 1 }));

      expect(options).toEqual(expect.objectContaining({ new: true }));
    });

    it('should throw CONFLICT (409) when duty is no longer available', async () => {
      const app = mockApplication();
      Application.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(app)
      });

      // findOneAndUpdate returns null — guard failed
      Duty.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        applicationService.updateApplicationStatus('app123', 'hospital001', 'ACCEPTED')
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('no longer available')
      });
    });

    it('should auto-reject remaining PENDING applications when all positions filled', async () => {
      const app = mockApplication();
      Application.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(app)
      });

      // All positions filled
      const updatedDuty = {
        _id: 'duty789',
        positionsFilled: 3,
        positionsNeeded: 3
      };
      Duty.findOneAndUpdate.mockResolvedValue(updatedDuty);
      Duty.findByIdAndUpdate.mockResolvedValue(updatedDuty);
      Application.updateMany.mockResolvedValue({ modifiedCount: 5 });

      await applicationService.updateApplicationStatus('app123', 'hospital001', 'ACCEPTED');

      // Should mark duty as FILLED
      expect(Duty.findByIdAndUpdate).toHaveBeenCalledWith('duty789', { status: 'FILLED' });

      // Should auto-reject remaining pending applications
      expect(Application.updateMany).toHaveBeenCalledTimes(1);
      const [rejectFilter, rejectUpdate] = Application.updateMany.mock.calls[0];
      expect(rejectFilter).toEqual(expect.objectContaining({
        duty: 'duty789',
        status: 'PENDING',
        _id: { $ne: 'app123' }
      }));
      expect(rejectUpdate).toEqual(expect.objectContaining({
        status: 'REJECTED'
      }));
    });
  });
});
