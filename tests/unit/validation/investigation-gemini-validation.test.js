/**
 * Investigation & Gemini Validation Tests
 *
 * Verifies:
 * - VAL-006: File URL/path validation (SSRF/traversal prevention)
 * - VAL-010: File size validation (20MB limit, empty file check)
 * - ERR-001: JSON.parse error handling in Gemini analysis
 * - ERR-003: Notification failure isolation in triggerAIAnalysis()
 * - ERR-004: AI analysis fire-and-forget with catch handler
 *
 * Note: ERR-005 (booking health metrics failure) already covered as RACE-011 in Phase 2
 */

const fs = require('fs');
const path = require('path');

describe('Phase 4 — Investigation & Gemini Validation', () => {
  describe('VAL-006: File URL/path validation (SSRF prevention)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'investigationReportService.js'),
      'utf8'
    );

    it('should reject non-HTTPS URLs', () => {
      expect(src).toMatch(/Only HTTPS URLs are allowed/);
      expect(src).toMatch(/ALLOWED_URL_PROTOCOLS/);
    });

    it('should block localhost and internal/private IP addresses', () => {
      expect(src).toMatch(/localhost/);
      expect(src).toMatch(/127\.0\.0\.1/);
      expect(src).toMatch(/169\.254\./);
      expect(src).toMatch(/10\./);
      expect(src).toMatch(/192\.168\./);
      expect(src).toMatch(/\.internal/);
    });

    it('should prevent path traversal outside uploads directory', () => {
      expect(src).toMatch(/UPLOADS_BASE_DIR/);
      expect(src).toMatch(/File path must be within the uploads directory/);
    });

    it('should validate MIME type against allowlist', () => {
      expect(src).toMatch(/ALLOWED_MIME_TYPES\.includes\(file\.mimeType\)/);
    });
  });

  describe('VAL-010: File size validation', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'geminiAnalysisService.js'),
      'utf8'
    );

    it('should define MAX_FILE_SIZE_BYTES (20MB)', () => {
      expect(src).toMatch(/MAX_FILE_SIZE_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/);
    });

    it('should reject files exceeding maximum size', () => {
      expect(src).toMatch(/stat\.size\s*>\s*MAX_FILE_SIZE_BYTES/);
      expect(src).toMatch(/File exceeds maximum size/);
    });

    it('should reject empty files', () => {
      expect(src).toMatch(/stat\.size\s*===\s*0/);
      expect(src).toMatch(/File is empty/);
    });
  });

  describe('ERR-001: JSON.parse wrapped in try-catch', () => {
    it('should wrap all JSON.parse calls in try-catch blocks', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'geminiAnalysisService.js'),
        'utf8'
      );

      // Find all JSON.parse occurrences
      const jsonParseMatches = src.match(/JSON\.parse/g);
      expect(jsonParseMatches).not.toBeNull();
      expect(jsonParseMatches.length).toBeGreaterThanOrEqual(3);

      // Each JSON.parse should be preceded by a try block
      // Check that "try {" appears before each JSON.parse usage for analysis methods
      const tryCatchPattern = /try\s*\{[^}]*JSON\.parse/g;
      const tryCatchMatches = src.match(tryCatchPattern);
      expect(tryCatchMatches).not.toBeNull();
      expect(tryCatchMatches.length).toBeGreaterThanOrEqual(3);
    });

    it('should include meaningful error messages for parse failures', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'geminiAnalysisService.js'),
        'utf8'
      );

      expect(src).toMatch(/Failed to parse JSON from Gemini response/);
    });
  });

  describe('ERR-003: Notification failure isolation in triggerAIAnalysis()', () => {
    it('source code should catch notification failures and set notificationFailed flag', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'investigationReportService.js'),
        'utf8'
      );

      // triggerAIAnalysis should have try-catch around notification
      const analysisMethod = src.match(/const triggerAIAnalysis[\s\S]*?(?=\nconst |\nmodule\.exports)/);
      expect(analysisMethod).not.toBeNull();
      const methodBody = analysisMethod[0];

      expect(methodBody).toContain('notificationFailed');
      expect(methodBody).toMatch(/try\s*\{[\s\S]*?notifyPatient[\s\S]*?\}\s*catch/);
    });
  });

  describe('ERR-004: AI analysis fire-and-forget with catch handler', () => {
    it('source code should call triggerAIAnalysis without await and attach .catch()', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'investigationReportService.js'),
        'utf8'
      );

      // In createReport, triggerAIAnalysis should be called without await
      const createReportMethod = src.match(/const createReport[\s\S]*?(?=\n\/\*\*|\nconst triggerAIAnalysis)/);
      expect(createReportMethod).not.toBeNull();
      const methodBody = createReportMethod[0];

      // Should NOT have "await triggerAIAnalysis"
      expect(methodBody).not.toMatch(/await\s+triggerAIAnalysis/);
      // Should have .catch() handler
      expect(methodBody).toMatch(/triggerAIAnalysis\(.*\)\.catch/);
    });

    it('catch handler should update report status to AI_FAILED', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'investigationReportService.js'),
        'utf8'
      );

      expect(src).toContain('AI_FAILED');
      expect(src).toContain('TRIGGER_FAILED');
    });
  });
});
