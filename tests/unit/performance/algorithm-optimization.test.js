/**
 * Algorithm Optimization Tests (Source Analysis)
 *
 * Verifies:
 * - PERF-002: O(n+m) Map-based BP reading matching (not O(n*m))
 * - PERF-006: Promise.all() parallel conflict detection + weekly hours check
 * - PERF-010: Per-field dedup key functions in health data merge
 */

const fs = require('fs');
const path = require('path');

describe('Phase 5 — Algorithm Optimization', () => {
  describe('PERF-002: O(n+m) Map-based BP reading matching', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'healthTrackerService.js'),
      'utf8'
    );

    it('should use Map for diastolic lookup by relatedMetricId', () => {
      expect(src).toMatch(/diastolicByRelatedId\s*=\s*new\s+Map/);
    });

    it('should use Map for time-bucketed proximity matching', () => {
      expect(src).toMatch(/diastolicByTime\s*=\s*new\s+Map/);
    });

    it('should fetch systolic and diastolic readings in parallel', () => {
      // getBPReadingsCombined uses Promise.all with both BP types
      expect(src).toMatch(/getBPReadingsCombined[\s\S]*?Promise\.all\s*\(\[/);
      expect(src).toMatch(/getBPReadingsCombined[\s\S]*?BP_SYSTOLIC/);
      expect(src).toMatch(/getBPReadingsCombined[\s\S]*?BP_DIASTOLIC/);
    });

    it('should NOT use nested O(n*m) loop for matching', () => {
      const methodMatch = src.match(/getBPReadingsCombined[\s\S]*?(?=\nconst |\nmodule\.exports)/);
      const methodBody = methodMatch[0];

      // Should not have nested for/forEach loops iterating diastolic inside systolic
      const nestedLoopPattern = /for\s*\(.*systolic[\s\S]*?for\s*\(.*diastolic/;
      expect(nestedLoopPattern.test(methodBody)).toBe(false);
    });
  });

  describe('PERF-006: Parallel conflict detection + weekly hours check', () => {
    const serviceSrc = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'calendarService.js'),
      'utf8'
    );

    it('createEvent should run detectConflicts and checkWeeklyHours in parallel', () => {
      const createMethod = serviceSrc.match(/async createEvent[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*)/);
      expect(createMethod).not.toBeNull();
      const methodBody = createMethod[0];

      expect(methodBody).toMatch(/Promise\.all\s*\(\[[\s\S]*?detectConflicts[\s\S]*?checkWeeklyHours/);
    });

    it('updateEvent should run detectConflicts and checkWeeklyHours in parallel', () => {
      const updateMethod = serviceSrc.match(/async updateEvent[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(updateMethod).not.toBeNull();
      const methodBody = updateMethod[0];

      expect(methodBody).toMatch(/Promise\.all\s*\(\[[\s\S]*?detectConflicts[\s\S]*?checkWeeklyHours/);
    });

    it('detectConflicts should NOT call this.save() prematurely', () => {
      const modelSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'models', 'calendarEvent.js'),
        'utf8'
      );

      const detectMethod = modelSrc.match(/detectConflicts\s*=\s*async\s+function[\s\S]*?(?=\n\w+Schema\.methods|\nmodule\.exports)/);
      expect(detectMethod).not.toBeNull();
      const methodBody = detectMethod[0];

      // Should NOT call this.save() inside detectConflicts
      expect(methodBody).not.toMatch(/this\.save\(\)/);
    });
  });

  describe('PERF-010: Per-field dedup key functions in health data merge', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'healthRecordService.js'),
      'utf8'
    );

    it('should define key functions for all array field categories', () => {
      // keyFns object should define dedup keys for each field
      expect(src).toMatch(/keyFns\s*=\s*\{/);
      expect(src).toMatch(/conditions:\s*item\s*=>/);
      expect(src).toMatch(/allergies:\s*item\s*=>.*allergen/);
      expect(src).toMatch(/currentMedications:\s*item\s*=>/);
      expect(src).toMatch(/surgeries:\s*item\s*=>/);
      expect(src).toMatch(/familyHistory:\s*item\s*=>.*relation.*condition/s);
      expect(src).toMatch(/immunizations:\s*item\s*=>/);
    });

    it('should use case-insensitive matching for dedup', () => {
      expect(src).toMatch(/toLowerCase\(\)\.trim\(\)/);
    });

    it('should update existing entries in place and append new entries', () => {
      // mergeHealthData should set updatedAt on existing and addedAt on new
      expect(src).toMatch(/mergeHealthData[\s\S]*?updatedAt/);
      expect(src).toMatch(/mergeHealthData[\s\S]*?addedAt/);
    });
  });
});
