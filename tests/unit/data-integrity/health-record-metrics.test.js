/**
 * Health Record & Metrics Tests
 *
 * Verifies:
 * - TXN-007: recordMultipleMetrics validates all before insertMany
 * - TXN-008 / RACE-010: appendUpdate uses optimistic concurrency with version guard
 * - RACE-006: getTrackerSummary uses single aggregation pipeline
 */

jest.mock('../../../models/healthMetric');
jest.mock('../../../models/healthRecord');
jest.mock('../../../models/emergencySummary');
jest.mock('../../../models/patient');
jest.mock('../../../models/user');
jest.mock('../../../models/healthTarget');
jest.mock('../../../models/healthDataAccessLog', () => ({
  logAccess: jest.fn()
}));
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));
jest.mock('../../../utils/errors', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(m) { super(m); this.name = 'ValidationError'; }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(t, id) { super(`${t} not found`); this.name = 'NotFoundError'; }
  },
  AuthorizationError: class AuthorizationError extends Error {
    constructor(m) { super(m); this.name = 'AuthorizationError'; }
  }
}));

const HealthMetric = require('../../../models/healthMetric');
const HealthRecord = require('../../../models/healthRecord');
const HealthTarget = require('../../../models/healthTarget');
const Patient = require('../../../models/patient');
const EmergencySummary = require('../../../models/emergencySummary');
const healthMetricService = require('../../../services/healthMetricService');
const healthRecordService = require('../../../services/healthRecordService');

describe('Phase 2 — Health Record & Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TXN-007: recordMultipleMetrics validates all then batch inserts', () => {
    it('should NOT call insertMany when any metric has invalid type', async () => {
      Patient.findById.mockResolvedValue({ _id: 'patient1' });

      await expect(
        healthMetricService.recordMultipleMetrics('patient1', [
          { metricType: 'BP_SYSTOLIC', value: 120, unit: 'mmHg' },
          { metricType: 'INVALID_TYPE', value: 99, unit: 'foo' }  // Invalid
        ])
      ).rejects.toThrow(/Invalid metric type/);

      expect(HealthMetric.insertMany).not.toHaveBeenCalled();
    });

    it('should use insertMany for atomic batch insert when all metrics are valid', async () => {
      Patient.findById.mockResolvedValue({ _id: 'patient1' });
      HealthMetric.insertMany.mockResolvedValue([
        { metricType: 'BP_SYSTOLIC', value: 120, isAbnormal: false },
        { metricType: 'HEART_RATE', value: 72, isAbnormal: false }
      ]);
      Patient.findByIdAndUpdate.mockResolvedValue(true);

      const result = await healthMetricService.recordMultipleMetrics('patient1', [
        { metricType: 'BP_SYSTOLIC', value: 120 },
        { metricType: 'HEART_RATE', value: 72 }
      ]);

      expect(HealthMetric.insertMany).toHaveBeenCalledTimes(1);
      const docs = HealthMetric.insertMany.mock.calls[0][0];
      expect(docs).toHaveLength(2);
      expect(docs[0]).toEqual(expect.objectContaining({ patient: 'patient1', metricType: 'BP_SYSTOLIC' }));
      expect(docs[1]).toEqual(expect.objectContaining({ patient: 'patient1', metricType: 'HEART_RATE' }));
    });
  });

  describe('TXN-008 / RACE-010: appendUpdate optimistic concurrency', () => {
    it('should include version guard in Patient.findOneAndUpdate', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        currentHealthRecordVersion: 3
      });

      HealthRecord.getLatestApproved = jest.fn().mockResolvedValue({
        healthSnapshot: { toObject: () => ({ allergies: [] }) }
      });

      const mockRecord = {
        _id: 'record1',
        version: 4,
        previousVersion: 'record0',
        save: jest.fn().mockResolvedValue(true),
        computeChanges: jest.fn().mockResolvedValue(null)
      };
      // Mock HealthRecord constructor
      jest.spyOn(HealthRecord.prototype || HealthRecord, 'constructor').mockImplementation(() => {});
      // Since HealthRecord is mocked, mock the creation
      const HealthRecordOriginal = jest.requireActual('../../../models/healthRecord');
      // We need to mock the `new HealthRecord()` call — use a different approach
      // Mock HealthRecord as a constructor that returns mockRecord
      HealthRecord.mockImplementation(() => mockRecord);

      HealthRecord.findByIdAndUpdate = jest.fn().mockResolvedValue(true);

      Patient.findOneAndUpdate.mockResolvedValue({
        _id: 'patient1',
        currentHealthRecordVersion: 4
      });

      EmergencySummary.updateFromHealthRecord = jest.fn().mockResolvedValue(true);

      await healthRecordService.appendUpdate('patient1', { allergies: [{ allergen: 'Pollen' }] });

      expect(Patient.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter] = Patient.findOneAndUpdate.mock.calls[0];

      // Version guard: must match expected version
      expect(filter).toEqual(expect.objectContaining({
        _id: 'patient1',
        $or: expect.arrayContaining([
          expect.objectContaining({ currentHealthRecordVersion: 3 })
        ])
      }));
    });

    it('should roll back record and throw when concurrent update detected', async () => {
      Patient.findById.mockResolvedValue({
        _id: 'patient1',
        currentHealthRecordVersion: 3
      });

      HealthRecord.getLatestApproved = jest.fn().mockResolvedValue(null);

      const mockRecord = {
        _id: 'record1',
        version: 4,
        previousVersion: 'record0',
        save: jest.fn().mockResolvedValue(true),
        computeChanges: jest.fn().mockResolvedValue(null)
      };
      HealthRecord.mockImplementation(() => mockRecord);
      HealthRecord.findByIdAndUpdate = jest.fn().mockResolvedValue(true);

      // Version mismatch — returns null
      Patient.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        healthRecordService.appendUpdate('patient1', { allergies: [] })
      ).rejects.toThrow(/Concurrent health record update detected/);

      // Should roll back the orphaned record
      expect(HealthRecord.findByIdAndUpdate).toHaveBeenCalledWith(
        'record1',
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: false })
        })
      );
    });
  });

  describe('RACE-006: getTrackerSummary uses single aggregation pipeline', () => {
    it('should call HealthMetric.aggregate with $match, $group containing $sum and $cond', async () => {
      const { getTrackerSummary } = require('../../../services/healthTrackerService');

      HealthTarget.getOrCreateTracker = jest.fn().mockResolvedValue({
        isEnabled: true,
        targets: [],
        reminders: {}
      });

      HealthMetric.getLatestByType = jest.fn().mockResolvedValue({});
      HealthMetric.getTrends = jest.fn().mockResolvedValue({ stats: {} });
      HealthMetric.aggregate = jest.fn().mockResolvedValue([
        { _id: null, totalCount: 10, abnormalCount: 2 }
      ]);

      await getTrackerSummary('aaaaaaaaaaaaaaaaaaaaaaaa', 'DIABETES');

      expect(HealthMetric.aggregate).toHaveBeenCalledTimes(1);
      const pipeline = HealthMetric.aggregate.mock.calls[0][0];

      // Should have $match and $group stages
      const matchStage = pipeline.find(s => s.$match);
      const groupStage = pipeline.find(s => s.$group);

      expect(matchStage).toBeDefined();
      expect(groupStage).toBeDefined();

      // $group should use $sum for totalCount and $cond for abnormalCount
      expect(groupStage.$group).toHaveProperty('totalCount');
      expect(groupStage.$group).toHaveProperty('abnormalCount');

      const abnormalCountDef = JSON.stringify(groupStage.$group.abnormalCount);
      expect(abnormalCountDef).toContain('$cond');
      expect(abnormalCountDef).toContain('$sum');
    });
  });
});
