/**
 * Dispatch maths (services/dispatchEngine.js): heat-map grid, just-in-time
 * rider assignment, rider scoring, automatic surge, learned ETA medians.
 */
const engine = require('../../../services/dispatchEngine');

const C_SCHEME = { lat: 26.9110, lng: 75.8010 };
const VAISHALI = { lat: 26.9118, lng: 75.7433 };
// The centre of C-Scheme's cell: points a few metres away stay in the same cell
// (C-Scheme's own coordinates sit close to a cell edge).
const CENTRE = (() => { const c = engine.cellOf(engine.geohash(C_SCHEME.lat, C_SCHEME.lng, 6)); return { lat: c.lat, lng: c.lng }; })();

describe('geohash grid (heat map cells)', () => {
  it('matches the standard geohash for a known point', () => {
    // Reference value for (57.64911, 10.40744) from the geohash spec examples.
    expect(engine.geohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });

  it('decodes a cell that contains the original point, about 1.2 km wide at precision 6', () => {
    const cell = engine.cellOf(engine.geohash(C_SCHEME.lat, C_SCHEME.lng, 6));
    expect(C_SCHEME.lat).toBeGreaterThanOrEqual(cell.south);
    expect(C_SCHEME.lat).toBeLessThanOrEqual(cell.north);
    expect(C_SCHEME.lng).toBeGreaterThanOrEqual(cell.west);
    expect(C_SCHEME.lng).toBeLessThanOrEqual(cell.east);
    const widthKm = engine.km({ lat: cell.lat, lng: cell.west }, { lat: cell.lat, lng: cell.east });
    expect(widthKm).toBeGreaterThan(0.9);
    expect(widthKm).toBeLessThan(1.3);
  });

  it('nearby points share a cell; another neighbourhood does not', () => {
    const a = engine.geohash(CENTRE.lat, CENTRE.lng);
    expect(engine.geohash(CENTRE.lat + 0.0005, CENTRE.lng + 0.0005)).toBe(a);
    expect(engine.geohash(VAISHALI.lat, VAISHALI.lng)).not.toBe(a);
  });
});

describe('just-in-time assignment (rider reaches the store as packing ends)', () => {
  it('waits while the rider would arrive well before packing is done', () => {
    expect(engine.shouldAssignNow({ remainingPrepMinutes: 12, travelMinutes: 4 })).toBe(false);
  });
  it('assigns once the ride takes about as long as the packing left', () => {
    expect(engine.shouldAssignNow({ remainingPrepMinutes: 8, travelMinutes: 6 })).toBe(true);
    expect(engine.shouldAssignNow({ remainingPrepMinutes: 3, travelMinutes: 9 })).toBe(true);
  });
  it('assigns ready and cold-chain orders at once', () => {
    expect(engine.shouldAssignNow({ remainingPrepMinutes: 20, travelMinutes: 2, ready: true })).toBe(true);
    expect(engine.shouldAssignNow({ remainingPrepMinutes: 20, travelMinutes: 2, coldChain: true })).toBe(true);
  });
});

describe('rider scoring', () => {
  it('prefers the nearer rider when everything else is equal', () => {
    const best = engine.pickRider([{ id: 'far', travelMinutes: 9 }, { id: 'near', travelMinutes: 4 }]);
    expect(best.id).toBe('near');
  });
  it('shares work: a rider idle for 30 minutes beats one who just finished, if only slightly further', () => {
    const best = engine.pickRider([
      { id: 'just-delivered', travelMinutes: 5, idleMinutes: 0 },
      { id: 'waiting-30min', travelMinutes: 8, idleMinutes: 30 }
    ]);
    expect(best.id).toBe('waiting-30min');
  });
  it('fairness is capped: a far idle rider does not beat a near one', () => {
    const best = engine.pickRider([
      { id: 'near', travelMinutes: 3, idleMinutes: 0 },
      { id: 'far-idle', travelMinutes: 15, idleMinutes: 300 }
    ]);
    expect(best.id).toBe('near');
  });
  it('riders who keep releasing jobs drop down the list', () => {
    const best = engine.pickRider([
      { id: 'releases', travelMinutes: 4, releasesToday: 3 },
      { id: 'reliable', travelMinutes: 7, releasesToday: 0 }
    ]);
    expect(best.id).toBe('reliable');
  });
  it('no candidates: no rider', () => {
    expect(engine.pickRider([])).toBeNull();
  });
});

describe('automatic surge from demand vs supply', () => {
  it('stays normal when riders keep up', () => {
    expect(engine.stressFor({ waiting: 3, free: 4 }).level).toBe('NORMAL');
    expect(engine.stressFor({ waiting: 1, free: 0 }).level).toBe('NORMAL');
  });
  it('goes HIGH at two orders per free rider, SEVERE at four', () => {
    expect(engine.stressFor({ waiting: 6, free: 3 })).toMatchObject({ level: 'HIGH', radiusMultiplier: 0.85 });
    expect(engine.stressFor({ waiting: 8, free: 2 })).toMatchObject({ level: 'SEVERE', radiusMultiplier: 0.7 });
    expect(engine.stressFor({ waiting: 5, free: 0 }).level).toBe('SEVERE');
  });
});

describe('heat map cells and busy areas', () => {
  const near = (dLat, dLng) => ({ lat: CENTRE.lat + dLat, lng: CENTRE.lng + dLng });
  const demand = [near(0, 0), near(0.0004, 0.0003), near(0.0002, 0), { ...VAISHALI }];
  const supply = [{ ...VAISHALI }, { ...VAISHALI }];
  const cells = engine.heatCells(demand, supply);

  it('counts demand and supply per cell and ranks the biggest shortfall first', () => {
    expect(cells[0]).toMatchObject({ demand: 3, supply: 0, gap: 3, heat: 4 });
    const vaishali = cells.find((c) => c.hash === engine.geohash(VAISHALI.lat, VAISHALI.lng));
    expect(vaishali).toMatchObject({ demand: 1, supply: 2, gap: -1, heat: 0 });
  });

  it('busy areas near a partner list only cells that need people, within range', () => {
    const areas = engine.busyAreasNear(cells, VAISHALI, { maxKm: 10 });
    expect(areas.length).toBe(1);
    expect(areas[0].demand).toBe(3);
    expect(areas[0].distanceKm).toBeGreaterThan(4);
    expect(engine.busyAreasNear(cells, VAISHALI, { maxKm: 2 })).toEqual([]);
  });

  it('ignores points without coordinates', () => {
    expect(engine.heatCells([{ lat: null, lng: 1 }, {}], [])).toEqual([]);
  });
});

describe('learned ETA helpers', () => {
  it('median of packing times ignores bad values', () => {
    expect(engine.median([12, 8, 10, NaN])).toBe(10);
    expect(engine.median([5, 7])).toBe(6);
    expect(engine.median([])).toBeNull();
  });
  it('ride minutes use the road factor', () => {
    expect(engine.rideMinutes(3, 18)).toBe(13); // 3.9 road km at 18 km/h
  });
});
