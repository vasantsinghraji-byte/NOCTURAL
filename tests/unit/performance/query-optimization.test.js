/**
 * Query Optimization Tests (Source Analysis)
 *
 * Verifies:
 * - PERF-001: Field-selected populate in getMyApplications()
 * - PERF-003: $unionWith aggregation pipeline in getMedicalTimeline()
 * - PERF-004: userRole param eliminates User.findById in updateStatus/cancelBooking
 * - PERF-005: Indexes on relatedDuty/relatedApplication in notification model
 * - PERF-007: $group aggregation in getHealthAlerts()
 * - PERF-008: Optional field selection in getLatestByType()
 *
 * Note: PERF-004 overlaps with Phase 3 AUTH-003 (duty-booking-auth.test.js)
 */

const fs = require('fs');
const path = require('path');

describe('Phase 5 — Query Optimization', () => {
  describe('PERF-001: Field-selected populate in applicationService', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'applicationService.js'),
      'utf8'
    );

    it('should use field selection in duty populate', () => {
      expect(src).toMatch(/populate.*duty.*select/s);
      expect(src).toMatch(/title\s+hospitalName\s+date\s+startTime\s+endTime/);
    });

    it('should use object-form populate with path and select for paginated query', () => {
      // The paginated query should use { path: 'duty', select: '...' }
      expect(src).toMatch(/populate:\s*\{\s*path:\s*['"]duty['"],\s*select:/);
    });
  });

  describe('PERF-003: $unionWith aggregation in patientDashboardService', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'patientDashboardService.js'),
      'utf8'
    );

    it('should use $unionWith for cross-collection aggregation', () => {
      expect(src).toMatch(/\$unionWith/);
    });

    it('should perform DB-level sort and pagination', () => {
      const timelineMethod = src.match(/async getMedicalTimeline[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(timelineMethod).not.toBeNull();
      const methodBody = timelineMethod[0];

      expect(methodBody).toMatch(/\$sort/);
      expect(methodBody).toMatch(/\$skip/);
      expect(methodBody).toMatch(/\$limit/);
    });

    it('should union across multiple collections (healthrecords, doctornotes)', () => {
      expect(src).toMatch(/coll:\s*['"]healthrecords['"]/);
      expect(src).toMatch(/coll:\s*['"]doctornotes['"]/);
    });
  });

  describe('PERF-004: No extra DB query for role check in bookingService', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
      'utf8'
    );

    it('updateStatus should accept userRole parameter and not call User.findById', () => {
      const methodMatch = src.match(/async updateStatus[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*)/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      expect(methodBody).toMatch(/userRole/);
      expect(methodBody).not.toMatch(/User\.findById/);
    });

    it('cancelBooking should accept userRole parameter and not call User.findById', () => {
      const methodMatch = src.match(/async cancelBooking[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      expect(methodBody).toMatch(/userRole/);
      expect(methodBody).not.toMatch(/User\.findById/);
    });
  });

  describe('PERF-005: Indexes on notification foreign keys', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'models', 'notification.js'),
      'utf8'
    );

    it('should have index on relatedDuty', () => {
      expect(src).toMatch(/\.index\(\s*\{\s*relatedDuty:\s*1\s*\}/);
    });

    it('should have index on relatedApplication', () => {
      expect(src).toMatch(/\.index\(\s*\{\s*relatedApplication:\s*1\s*\}/);
    });
  });

  describe('PERF-007: $group aggregation in healthMetricService', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'healthMetricService.js'),
      'utf8'
    );

    it('should use $group aggregation for abnormal metrics', () => {
      const alertsMethod = src.match(/async getHealthAlerts[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(alertsMethod).not.toBeNull();
      const methodBody = alertsMethod[0];

      expect(methodBody).toMatch(/\$group/);
      expect(methodBody).toMatch(/\$match/);
      expect(methodBody).toContain('isAbnormal');
    });

    it('should compute occurrences count via $sum in aggregation', () => {
      expect(src).toMatch(/occurrences.*\$sum.*1/s);
    });

    it('should get latest value per type via $first', () => {
      expect(src).toMatch(/latestValue.*\$first/s);
    });
  });

  describe('PERF-008: Optional field selection in getLatestByType', () => {
    const modelSrc = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'models', 'healthMetric.js'),
      'utf8'
    );

    it('getLatestByType should accept optional fields parameter', () => {
      expect(modelSrc).toMatch(/getLatestByType\s*=\s*async\s+function\s*\(\s*patientId\s*,\s*fields\s*\)/);
    });

    it('should apply .select(fields) when fields parameter is provided', () => {
      const methodMatch = modelSrc.match(/getLatestByType[\s\S]*?(?=\n\w|\n\/\/\s*Static|\nmodule\.exports)/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      expect(methodBody).toMatch(/if\s*\(fields\)/);
      expect(methodBody).toMatch(/\.select\(fields\)/);
    });

    it('dashboard should call getLatestByType with field selection', () => {
      const dashSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patientDashboardService.js'),
        'utf8'
      );

      expect(dashSrc).toMatch(/getLatestByType\(patientId,\s*['"]value unit/);
    });
  });
});
