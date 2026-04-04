/**
 * Phase 7 — Audit Logging (AUDIT-001, AUDIT-002)
 * Verifies that audit logging has been implemented for critical operations.
 * Uses static source analysis (fs.readFileSync + regex).
 */
const fs = require('fs');
const path = require('path');

const applicationSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'services', 'applicationService.js'),
  'utf8'
);

const applicationModelSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'models', 'application.js'),
  'utf8'
);

const healthRecordSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'services', 'healthRecordService.js'),
  'utf8'
);

const healthConstantsSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'constants', 'healthConstants.js'),
  'utf8'
);

describe('Phase 7 — Audit Logging', () => {
  describe('AUDIT-001: Application status change history', () => {
    it('should define statusHistory array in Application model schema', () => {
      expect(applicationModelSrc).toMatch(/statusHistory:\s*\[\s*\{/);
    });

    it('should include fromStatus and toStatus in statusHistory schema', () => {
      expect(applicationModelSrc).toMatch(/fromStatus:\s*\{/);
      expect(applicationModelSrc).toMatch(/toStatus:\s*\{/);
    });

    it('should include changedBy and changedAt in statusHistory schema', () => {
      expect(applicationModelSrc).toMatch(/changedBy:\s*\{/);
      expect(applicationModelSrc).toMatch(/changedAt:\s*\{/);
    });

    it('should include changedFields array in statusHistory schema', () => {
      expect(applicationModelSrc).toMatch(/changedFields:\s*\[String\]/);
    });

    it('should capture oldStatus before mutation in updateApplicationStatus', () => {
      expect(applicationSrc).toMatch(/oldStatus\s*=\s*application\.status/);
    });

    it('should build changedFields array', () => {
      expect(applicationSrc).toMatch(/changedFields\s*=\s*\[/);
    });

    it('should push to statusHistory on status change', () => {
      expect(applicationSrc).toMatch(/statusHistory\.push\s*\(\s*\{/);
    });

    it('should include fromStatus and toStatus in history entry', () => {
      expect(applicationSrc).toMatch(/statusHistory\.push\s*\(\s*\{[\s\S]*?fromStatus:\s*oldStatus/);
    });
  });

  describe('AUDIT-002: HIPAA-style audit logging for health operations', () => {
    describe('healthConstants AUDIT_ACTIONS enum', () => {
      it('should define SUBMIT action', () => {
        expect(healthConstantsSrc).toMatch(/AUDIT_ACTIONS[\s\S]*?SUBMIT:\s*['"]SUBMIT['"]/);
      });

      it('should define ASSIGN action', () => {
        expect(healthConstantsSrc).toMatch(/AUDIT_ACTIONS[\s\S]*?ASSIGN:\s*['"]ASSIGN['"]/);
      });

      it('should define APPROVE action', () => {
        expect(healthConstantsSrc).toMatch(/AUDIT_ACTIONS[\s\S]*?APPROVE:\s*['"]APPROVE['"]/);
      });

      it('should define REJECT action', () => {
        expect(healthConstantsSrc).toMatch(/AUDIT_ACTIONS[\s\S]*?REJECT:\s*['"]REJECT['"]/);
      });

      it('should define REQUEST_CHANGES action', () => {
        expect(healthConstantsSrc).toMatch(/AUDIT_ACTIONS[\s\S]*?REQUEST_CHANGES:\s*['"]REQUEST_CHANGES['"]/);
      });
    });

    describe('submitIntake() audit logging', () => {
      it('should call HealthDataAccessLog.logAccess in submitIntake', () => {
        expect(healthRecordSrc).toMatch(/submitIntake[\s\S]*?HealthDataAccessLog\.logAccess/);
      });

      it('should use AUDIT_ACTIONS.SUBMIT for intake submission', () => {
        expect(healthRecordSrc).toMatch(/submitIntake[\s\S]*?action:\s*AUDIT_ACTIONS\.SUBMIT/);
      });
    });

    describe('assignIntakeReviewer() audit logging', () => {
      it('should call HealthDataAccessLog.logAccess in assignIntakeReviewer', () => {
        expect(healthRecordSrc).toMatch(/assignIntakeReviewer[\s\S]*?HealthDataAccessLog\.logAccess/);
      });

      it('should use AUDIT_ACTIONS.ASSIGN for reviewer assignment', () => {
        expect(healthRecordSrc).toMatch(/assignIntakeReviewer[\s\S]*?action:\s*AUDIT_ACTIONS\.ASSIGN/);
      });
    });

    describe('reviewIntake() audit logging', () => {
      it('should call HealthDataAccessLog.logAccess in reviewIntake', () => {
        expect(healthRecordSrc).toMatch(/reviewIntake[\s\S]*?HealthDataAccessLog\.logAccess/);
      });

      it('should use AUDIT_ACTIONS.APPROVE for approval decision', () => {
        expect(healthRecordSrc).toMatch(/AUDIT_ACTIONS\.APPROVE/);
      });

      it('should use AUDIT_ACTIONS.REJECT for rejection decision', () => {
        expect(healthRecordSrc).toMatch(/AUDIT_ACTIONS\.REJECT[^_]/);
      });

      it('should use AUDIT_ACTIONS.REQUEST_CHANGES for changes decision', () => {
        expect(healthRecordSrc).toMatch(/AUDIT_ACTIONS\.REQUEST_CHANGES/);
      });
    });

    describe('All audit calls are wrapped in try/catch', () => {
      it('should wrap submitIntake audit log in try/catch', () => {
        expect(healthRecordSrc).toMatch(/try\s*\{[\s\S]*?AUDIT_ACTIONS\.SUBMIT[\s\S]*?\}\s*catch/);
      });

      it('should wrap assignIntakeReviewer audit log in try/catch', () => {
        expect(healthRecordSrc).toMatch(/try\s*\{[\s\S]*?AUDIT_ACTIONS\.ASSIGN[\s\S]*?\}\s*catch/);
      });
    });
  });
});
