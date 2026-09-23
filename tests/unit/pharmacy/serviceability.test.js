/**
 * Serviceability & geo primitives — pure logic, no DB.
 */

const { encodeGeohash, geohashForPoint } = require('../../../utils/geohash');
const { effectiveRadiusKm, estimateEta, toPoint } = require('../../../services/serviceabilityService');

describe('geohash', () => {
  it('matches the canonical reference vector', () => {
    // Reference: 57.64911, 10.40744 → u4pruydqqvj (geohash.org / Wikipedia)
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });

  it('is hierarchical: a shorter hash is the parent cell', () => {
    const fine = encodeGeohash(12.9352, 77.6245, 8);
    expect(encodeGeohash(12.9352, 77.6245, 5)).toBe(fine.slice(0, 5));
  });

  it('derives from a GeoJSON point and ignores missing locations', () => {
    expect(geohashForPoint({ type: 'Point', coordinates: [77.6245, 12.9352] })).toBe(encodeGeohash(12.9352, 77.6245, 7));
    expect(geohashForPoint(undefined)).toBeUndefined();
    expect(geohashForPoint({ type: 'Point' })).toBeUndefined();
  });
});

describe('effectiveRadiusKm', () => {
  const zone = (overrides = {}) => ({
    isActive: true,
    maxLastMileKm: 7,
    currentRadiusMultiplier: () => 1,
    ...overrides
  });

  it('uses the store radius when no zone is drawn (radial fallback)', () => {
    expect(effectiveRadiusKm({ serviceRadiusKm: 3 }, null)).toBe(3);
  });

  it('caps by the zone last-mile limit and applies the stress multiplier', () => {
    expect(effectiveRadiusKm({ serviceRadiusKm: 10 }, zone({ maxLastMileKm: 6 }))).toBe(6);
    expect(effectiveRadiusKm({ serviceRadiusKm: 5 }, zone({ currentRadiusMultiplier: () => 0.4 }))).toBe(2);
  });

  it('is zero in a paused zone', () => {
    expect(effectiveRadiusKm({ serviceRadiusKm: 5 }, zone({ isActive: false }))).toBe(0);
  });
});

describe('estimateEta', () => {
  const now = new Date('2026-09-23T10:00:00Z');

  it('overlaps assignment with prep, then adds last mile', () => {
    const eta = estimateEta({ avgPreparationMinutes: 10 }, 3, now);
    // last mile = ceil(3 km / 18 km/h * 60) + 4 = 14; total = max(3, 10) + 14 = 24
    expect(eta).toMatchObject({ prepMinutes: 10, assignmentMinutes: 3, lastMileMinutes: 14 });
    expect(eta.promisedAt.toISOString()).toBe('2026-09-23T10:24:00.000Z');
  });

  it('falls back to a default last mile without a delivery point', () => {
    expect(estimateEta({ avgPreparationMinutes: 15 }, undefined, now).lastMileMinutes).toBe(20);
  });
});

describe('toPoint', () => {
  it('builds [lng, lat] GeoJSON and rejects junk', () => {
    expect(toPoint('12.9', '77.6')).toEqual({ type: 'Point', coordinates: [77.6, 12.9] });
    expect(() => toPoint(91, 0)).toThrow('Valid lat/lng');
    expect(() => toPoint('abc', 0)).toThrow('Valid lat/lng');
  });
});
