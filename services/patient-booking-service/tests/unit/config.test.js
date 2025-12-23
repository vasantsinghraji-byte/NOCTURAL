/**
 * Unit Tests - Configuration
 */

describe('Configuration', () => {
  let config;

  beforeEach(() => {
    // Clear module cache to get fresh config
    jest.resetModules();
    config = require('../../src/config');
  });

  describe('Service Configuration', () => {
    it('should have service name defined', () => {
      expect(config.service.name).toBe('patient-booking-service');
    });

    it('should have service version defined', () => {
      expect(config.service.version).toBeDefined();
    });

    it('should use default port if not specified', () => {
      expect(config.service.port).toBe(3001);
    });

    it('should detect test environment', () => {
      expect(config.service.env).toBe('test');
    });
  });

  describe('Database Configuration', () => {
    it('should have MongoDB URI configured', () => {
      expect(config.database.uri).toContain('mongodb://');
    });

    it('should have connection options defined', () => {
      expect(config.database.options).toBeDefined();
      expect(config.database.options.maxPoolSize).toBeGreaterThan(0);
    });
  });

  describe('JWT Configuration', () => {
    it('should have JWT secret defined', () => {
      expect(config.jwt.secret).toBeDefined();
    });

    it('should have token expiration defined', () => {
      expect(config.jwt.expiresIn).toBeDefined();
    });
  });

  describe('External Services Configuration', () => {
    it('should have main API URL defined', () => {
      expect(config.services.mainApi.url).toBeDefined();
    });

    it('should have timeout configured for external calls', () => {
      expect(config.services.mainApi.timeout).toBeGreaterThan(0);
    });
  });

  describe('CORS Configuration', () => {
    it('should have allowed origins defined', () => {
      expect(config.cors.origins).toBeDefined();
      expect(Array.isArray(config.cors.origins)).toBe(true);
    });
  });

  describe('Pagination Configuration', () => {
    it('should have default limit defined', () => {
      expect(config.pagination.defaultLimit).toBeGreaterThan(0);
    });

    it('should have max limit defined', () => {
      expect(config.pagination.maxLimit).toBeGreaterThan(config.pagination.defaultLimit);
    });
  });
});
