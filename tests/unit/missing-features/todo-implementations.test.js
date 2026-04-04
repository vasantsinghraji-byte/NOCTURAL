/**
 * Phase 7 — TODO Implementations (TODO-001 to TODO-007)
 * Verifies that all TODO placeholders have been replaced with actual implementations.
 * Uses static source analysis (fs.readFileSync + regex).
 */
const fs = require('fs');
const path = require('path');

const intakeSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'services', 'healthIntakeService.js'),
  'utf8'
);

const notificationModelSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'models', 'notification.js'),
  'utf8'
);

// Find the patient-booking-service bookingService
const pbsBookingSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'services', 'patient-booking-service', 'src', 'services', 'bookingService.js'),
  'utf8'
);

describe('Phase 7 — TODO Implementations', () => {
  describe('TODO-001: Send notification to patient to complete intake', () => {
    it('should call notificationService.createNotification with INTAKE_REQUIRED', () => {
      expect(intakeSrc).toMatch(/createNotification\s*\(\s*\{[\s\S]*?type:\s*['"]INTAKE_REQUIRED['"]/);
    });

    it('should send HIGH priority notification', () => {
      // Match INTAKE_REQUIRED block having HIGH priority
      const intakeRequiredBlock = intakeSrc.match(/type:\s*['"]INTAKE_REQUIRED['"][\s\S]*?priority:\s*['"]HIGH['"]/);
      expect(intakeRequiredBlock).not.toBeNull();
    });

    it('should wrap notification in try/catch', () => {
      // The INTAKE_REQUIRED notification should be within a try block
      expect(intakeSrc).toMatch(/try\s*\{[\s\S]*?INTAKE_REQUIRED[\s\S]*?\}\s*catch/);
    });
  });

  describe('TODO-002: Notify admins of new pending intake', () => {
    it('should query active admins', () => {
      expect(intakeSrc).toMatch(/User\.find\(\s*\{[\s\S]*?role:\s*['"]admin['"][\s\S]*?isActive:\s*true/);
    });

    it('should send INTAKE_SUBMITTED notification to each admin', () => {
      expect(intakeSrc).toMatch(/createNotification\s*\(\s*\{[\s\S]*?type:\s*['"]INTAKE_SUBMITTED['"]/);
    });

    it('should use Promise.allSettled for multi-admin notification', () => {
      expect(intakeSrc).toMatch(/Promise\.allSettled/);
    });
  });

  describe('TODO-003: Notify assigned doctor', () => {
    it('should send INTAKE_ASSIGNED notification', () => {
      expect(intakeSrc).toMatch(/createNotification\s*\(\s*\{[\s\S]*?type:\s*['"]INTAKE_ASSIGNED['"]/);
    });

    it('should include assignedBy in metadata', () => {
      expect(intakeSrc).toMatch(/INTAKE_ASSIGNED[\s\S]*?metadata:\s*\{[\s\S]*?assignedBy/);
    });
  });

  describe('TODO-004: Notify patient of approval', () => {
    it('should send INTAKE_APPROVED notification with MEDIUM priority', () => {
      expect(intakeSrc).toMatch(/createNotification\s*\(\s*\{[\s\S]*?type:\s*['"]INTAKE_APPROVED['"]/);
      expect(intakeSrc).toMatch(/INTAKE_APPROVED[\s\S]*?priority:\s*['"]MEDIUM['"]/);
    });

    it('should include approvedBy in metadata', () => {
      expect(intakeSrc).toMatch(/INTAKE_APPROVED[\s\S]*?metadata:\s*\{[\s\S]*?approvedBy/);
    });
  });

  describe('TODO-005: Notify patient of required changes', () => {
    it('should send INTAKE_CHANGES_REQUIRED notification', () => {
      expect(intakeSrc).toMatch(/createNotification\s*\(\s*\{[\s\S]*?type:\s*['"]INTAKE_CHANGES_REQUIRED['"]/);
    });

    it('should include changesCount in metadata', () => {
      expect(intakeSrc).toMatch(/INTAKE_CHANGES_REQUIRED[\s\S]*?metadata:\s*\{[\s\S]*?changesCount/);
    });
  });

  describe('TODO-006: Notify patient of intake rejection', () => {
    it('should send INTAKE_REJECTED notification', () => {
      expect(intakeSrc).toMatch(/createNotification\s*\(\s*\{[\s\S]*?type:\s*['"]INTAKE_REJECTED['"]/);
    });

    it('should include rejectedBy and reason in metadata', () => {
      expect(intakeSrc).toMatch(/INTAKE_REJECTED[\s\S]*?metadata:\s*\{[\s\S]*?rejectedBy/);
      expect(intakeSrc).toMatch(/INTAKE_REJECTED[\s\S]*?metadata:\s*\{[\s\S]*?reason/);
    });
  });

  describe('Notification model enum includes all intake types', () => {
    it('should define INTAKE_REQUIRED in notification type enum', () => {
      expect(notificationModelSrc).toMatch(/['"]INTAKE_REQUIRED['"]/);
    });

    it('should define INTAKE_SUBMITTED in notification type enum', () => {
      expect(notificationModelSrc).toMatch(/['"]INTAKE_SUBMITTED['"]/);
    });

    it('should define INTAKE_ASSIGNED in notification type enum', () => {
      expect(notificationModelSrc).toMatch(/['"]INTAKE_ASSIGNED['"]/);
    });

    it('should define INTAKE_APPROVED in notification type enum', () => {
      expect(notificationModelSrc).toMatch(/['"]INTAKE_APPROVED['"]/);
    });

    it('should define INTAKE_CHANGES_REQUIRED in notification type enum', () => {
      expect(notificationModelSrc).toMatch(/['"]INTAKE_CHANGES_REQUIRED['"]/);
    });

    it('should define INTAKE_REJECTED in notification type enum', () => {
      expect(notificationModelSrc).toMatch(/['"]INTAKE_REJECTED['"]/);
    });
  });

  describe('TODO-007: Publish booking.created event to RabbitMQ', () => {
    it('should call eventPublisher.publishBookingCreated', () => {
      expect(pbsBookingSrc).toMatch(/eventPublisher\.publishBookingCreated\s*\(/);
    });

    it('should wrap publish call in try/catch', () => {
      expect(pbsBookingSrc).toMatch(/try\s*\{[\s\S]*?publishBookingCreated[\s\S]*?\}\s*catch/);
    });

    it('should log warning on publish failure (not throw)', () => {
      expect(pbsBookingSrc).toMatch(/publishBookingCreated[\s\S]*?logger\.warn\s*\(\s*['"]Failed to publish/);
    });
  });
});
