/**
 * Caching & Configuration Tests (Source Analysis)
 *
 * Verifies:
 * - PERF-009: In-memory cache with TTL for service catalog pricing
 * - PERF-011: Gemini model name configurable via environment variable
 */

const fs = require('fs');
const path = require('path');

describe('Phase 5 — Caching & Configuration', () => {
  describe('PERF-009: In-memory cache for service catalog pricing', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'services', 'patient-booking-service', 'src', 'services', 'serviceCatalogService.js'),
      'utf8'
    );

    it('should define a cache with TTL constant', () => {
      expect(src).toMatch(/SERVICE_CACHE_TTL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
    });

    it('should use Map for in-memory cache storage', () => {
      expect(src).toMatch(/serviceCache\s*=\s*new\s+Map/);
    });

    it('should check cache before querying database in getServicePricing', () => {
      const pricingMethod = src.match(/async getServicePricing[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(pricingMethod).not.toBeNull();
      const methodBody = pricingMethod[0];

      // Should check cache first
      expect(methodBody).toMatch(/serviceCache\.get\(/);
      // Should validate TTL
      expect(methodBody).toMatch(/Date\.now\(\)\s*-\s*cached\.timestamp\s*<\s*SERVICE_CACHE_TTL_MS/);
    });

    it('should update cache after database fetch', () => {
      expect(src).toMatch(/serviceCache\.set\(/);
    });
  });

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
