const geoDispatchService = require('../../../services/geoDispatchService');

describe('GeoDispatchService', () => {
  describe('calculateDistanceKm', () => {
    test('calculates accurate distance between coordinates', () => {
      // Mumbai CST to Bandra: approx 12-14 km
      const cst = [72.8358, 18.9401];
      const bandra = [72.8407, 19.0596];

      const distance = geoDispatchService.calculateDistanceKm(cst, bandra);
      expect(distance).toBeGreaterThan(12);
      expect(distance).toBeLessThan(15);
    });

    test('returns 0 for identical points', () => {
      const point = [77.2090, 28.6139]; // Delhi
      const distance = geoDispatchService.calculateDistanceKm(point, point);
      expect(distance).toBe(0);
    });
  });

  describe('estimateArrivalMinutes', () => {
    test('calculates ETA with floor of 5 minutes', () => {
      expect(geoDispatchService.estimateArrivalMinutes(0.5)).toBe(5);
      expect(geoDispatchService.estimateArrivalMinutes(1)).toBe(5);
      expect(geoDispatchService.estimateArrivalMinutes(5)).toBe(17); // 5*3 + 2 = 17 min
      expect(geoDispatchService.estimateArrivalMinutes(10)).toBe(32); // 10*3 + 2 = 32 min
    });
  });
});
