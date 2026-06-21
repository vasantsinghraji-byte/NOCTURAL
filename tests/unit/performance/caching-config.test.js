/**
 * Caching & Configuration Tests (Source Analysis)
 *
 * Verifies:
 * - PERF-011: Gemini model name configurable via environment variable
 */

const fs = require('fs');
const path = require('path');

describe('Phase 5 — Caching & Configuration', () => {
  describe('PERF-011: Gemini model configurable via environment variable', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'geminiAnalysisService.js'),
      'utf8'
    );

    it('should use process.env.GEMINI_MODEL with fallback', () => {
      expect(src).toMatch(/process\.env\.GEMINI_MODEL\s*\|\|\s*['"]gemini-1\.5-flash['"]/);
    });

    it('should not hardcode the model name without env fallback', () => {
      // Should NOT have just a hardcoded string without env variable
      const hardcoded = src.match(/model:\s*['"]gemini-1\.5-flash['"]\s*[,)]/);
      expect(hardcoded).toBeNull();
    });
  });
});
