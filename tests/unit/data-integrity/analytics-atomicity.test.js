/**
 * Analytics Atomicity Tests
 *
 * Verifies TXN-001 / RACE-001: recordRating uses atomic aggregation pipeline
 * via findOneAndUpdate instead of read-modify-write pattern.
 */

const fs = require('fs');
const path = require('path');

// Mocks
jest.mock('../../../models/analytics');
jest.mock('../../../models/application');
jest.mock('../../../models/duty');
jest.mock('../../../models/user');
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));

const { DoctorAnalytics } = require('../../../models/analytics');
const analyticsService = require('../../../services/analyticsService');

describe('Phase 2 — Analytics Atomicity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TXN-001 / RACE-001: recordRating atomic pipeline', () => {
    it('should call findOneAndUpdate with an aggregation pipeline array (not a plain object)', async () => {
      const mockResult = {
        ratingStats: {
          averageRating: 4.5,
          totalRatings: 10,
          ratingSum: 45
        }
      };
      DoctorAnalytics.findOneAndUpdate.mockResolvedValue(mockResult);

      await analyticsService.recordRating('user123', 5);

      expect(DoctorAnalytics.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update, options] = DoctorAnalytics.findOneAndUpdate.mock.calls[0];

      // Filter should match user
      expect(filter).toEqual({ user: 'user123' });

      // Update must be an array (aggregation pipeline), NOT a plain object
      expect(Array.isArray(update)).toBe(true);
      expect(update.length).toBeGreaterThanOrEqual(2);

      // First stage should use $set with $add for atomic increment
      expect(update[0]).toHaveProperty('$set');

      // Options should include upsert and new
      expect(options).toEqual(expect.objectContaining({ new: true, upsert: true }));
    });

    it('should return the updated analytics document', async () => {
      const mockResult = {
        ratingStats: {
          averageRating: 4.0,
          totalRatings: 5,
          ratingSum: 20
        }
      };
      DoctorAnalytics.findOneAndUpdate.mockResolvedValue(mockResult);

      const result = await analyticsService.recordRating('user123', 4);

      expect(result).toBe(mockResult);
      expect(result.ratingStats.averageRating).toBe(4.0);
      expect(result.ratingStats.totalRatings).toBe(5);
    });

    it('should use $add and $divide operators in the pipeline for atomic computation', async () => {
      DoctorAnalytics.findOneAndUpdate.mockResolvedValue({
        ratingStats: { averageRating: 4, totalRatings: 1, ratingSum: 4 }
      });

      await analyticsService.recordRating('user123', 4);

      const pipeline = DoctorAnalytics.findOneAndUpdate.mock.calls[0][1];

      // Stringify pipeline to check for atomic operators
      const pipelineStr = JSON.stringify(pipeline);
      expect(pipelineStr).toContain('$add');
      expect(pipelineStr).toContain('$divide');
    });

    it('source code should not use separate read-then-write for rating updates', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'analyticsService.js'),
        'utf8'
      );

      // Extract the recordRating method body
      const methodMatch = src.match(/async recordRating\b[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      // Should NOT use .save() for rating — that would be read-modify-write
      expect(methodBody).not.toMatch(/analytics\.save\(\)/);
      // Should NOT do a separate findOne then save
      expect(methodBody).not.toMatch(/findOne\(\s*\{[^}]*user/);
    });
  });
});
