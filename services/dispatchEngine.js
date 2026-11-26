/**
 * Dispatch maths for quick delivery, modelled on how Blinkit, Zepto and
 * Flipkart Minutes describe their systems. Pure functions, no database:
 * services/riderService.js, heatmapService.js and the tick use them.
 *
 *   grid          geohash cells (precision 6 = about 1.2 km x 0.6 km) to count
 *                 demand and supply per small area: the heat map
 *   just in time  assign the rider while the store packs, timed so they reach
 *                 the store as packing ends (not at "ready", not too early)
 *   rider score   minutes to the store, plus fairness for riders who have been
 *                 idle longest, minus riders who keep releasing jobs
 *   surge         a zone's stress level from orders waiting vs riders free
 *   learned ETA   medians of real packing times and riding speeds
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Geohash of a point (standard algorithm). Precision 6 ~ 1.2 km x 0.6 km. */
function geohash(lat, lng, precision = 6) {
  let latLo = -90; let latHi = 90; let lngLo = -180; let lngHi = 180;
  let hash = ''; let bit = 0; let ch = 0; let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngLo = mid; } else { ch <<= 1; lngHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latLo = mid; } else { ch <<= 1; latHi = mid; }
    }
    even = !even;
    bit += 1;
    if (bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

/** Bounds and centre of a geohash cell. */
function cellOf(hash) {
  let latLo = -90; let latHi = 90; let lngLo = -180; let lngHi = 180; let even = true;
  for (const c of hash) {
    const v = BASE32.indexOf(c);
    for (let b = 4; b >= 0; b -= 1) {
      const on = (v >> b) & 1;
      if (even) { const mid = (lngLo + lngHi) / 2; if (on) lngLo = mid; else lngHi = mid; } else { const mid = (latLo + latHi) / 2; if (on) latLo = mid; else latHi = mid; }
      even = !even;
    }
  }
  return { hash, south: latLo, north: latHi, west: lngLo, east: lngHi, lat: (latLo + latHi) / 2, lng: (lngLo + lngHi) / 2 };
}

/** Straight-line km between two {lat, lng}. */
function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Minutes to ride `straightKm` at `speedKmph`, with the city road factor. */
function rideMinutes(straightKm, speedKmph = 18, roadFactor = 1.3) {
  return Math.ceil(((straightKm * roadFactor) / Math.max(speedKmph, 1)) * 60);
}

/**
 * Just-in-time assignment: hand the order to a rider once their ride to the
 * store takes at least as long as the packing still left (minus a small
 * buffer), so they arrive as it's packed. Ready orders, cold chain and orders
 * whose rider would arrive late anyway are assigned at once.
 */
function shouldAssignNow({ remainingPrepMinutes, travelMinutes, bufferMinutes = 2, coldChain = false, ready = false }) {
  if (ready || coldChain) return true;
  return travelMinutes >= Math.max(0, remainingPrepMinutes - bufferMinutes);
}

/**
 * Lower is better. Minutes to the store dominate; a rider idle longer gets up
 * to 6 minutes of credit (work is shared, like Zepto's fairness rule), and
 * each job released today costs 3 minutes (reliability).
 */
function riderScore({ travelMinutes, idleMinutes = 0, releasesToday = 0 }) {
  const fairness = Math.min(Math.max(idleMinutes, 0), 30) * 0.2;
  return Math.round((travelMinutes - fairness + 3 * Math.max(releasesToday, 0)) * 100) / 100;
}

/** The best rider: lowest score, ties to the nearer one. */
function pickRider(candidates) {
  return [...candidates].sort((a, b) => (riderScore(a) - riderScore(b)) || (a.travelMinutes - b.travelMinutes))[0] || null;
}

/**
 * Zone stress from demand vs supply over the last few minutes. `waiting` =
 * orders needing a rider, `free` = online riders with nothing on hand.
 * Returns the level and the radius multiplier the surge rules use.
 */
function stressFor({ waiting, free }) {
  if (waiting <= 1) return { level: 'NORMAL', radiusMultiplier: 1 };
  const ratio = waiting / Math.max(free, 0.5);
  if (ratio >= 4) return { level: 'SEVERE', radiusMultiplier: 0.7, ratio };
  if (ratio >= 2) return { level: 'HIGH', radiusMultiplier: 0.85, ratio };
  return { level: 'NORMAL', radiusMultiplier: 1, ratio };
}

/** Median of numbers (null when empty). */
function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Heat map cells from demand points and supply points ({lat, lng}).
 * Each cell: demand, supply, gap (demand - supply) and a 0-4 heat level.
 */
function heatCells(demandPoints, supplyPoints, precision = 6) {
  const cells = new Map();
  const bump = (p, field) => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    const h = geohash(p.lat, p.lng, precision);
    if (!cells.has(h)) cells.set(h, { ...cellOf(h), demand: 0, supply: 0 });
    cells.get(h)[field] += 1;
  };
  demandPoints.forEach((p) => bump(p, 'demand'));
  supplyPoints.forEach((p) => bump(p, 'supply'));
  const rows = [...cells.values()].map((c) => ({ ...c, gap: c.demand - c.supply }));
  const maxGap = Math.max(1, ...rows.map((c) => c.gap));
  return rows
    .map((c) => ({ ...c, heat: c.gap <= 0 ? 0 : Math.min(4, Math.ceil((c.gap / maxGap) * 4)) }))
    .sort((a, b) => b.gap - a.gap || b.demand - a.demand);
}

/** Busy areas near a partner: cells needing people, nearest strong ones first. */
function busyAreasNear(cells, here, { maxKm = 8, limit = 5 } = {}) {
  return cells
    .filter((c) => c.gap > 0)
    .map((c) => ({ ...c, distanceKm: Math.round(km(here, c) * 10) / 10 }))
    .filter((c) => c.distanceKm <= maxKm)
    .sort((a, b) => (b.heat - a.heat) || (a.distanceKm - b.distanceKm))
    .slice(0, limit);
}

module.exports = { geohash, cellOf, km, rideMinutes, shouldAssignNow, riderScore, pickRider, stressFor, median, heatCells, busyAreasNear };
