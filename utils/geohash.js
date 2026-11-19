/**
 * Geohash encoding (base32, interleaved lng/lat bits).
 *
 * Quick-commerce platforms key hyperlocal data by a hierarchical cell id
 * (Swiggy: geohash; Uber: H3) so "which cell is this point in?" is a string
 * prefix lookup instead of a geo query — good for cache keys, demand/supply
 * heatmaps and analytics group-bys. Precision 6 ≈ 1.2 km × 0.6 km cells,
 * 7 ≈ 150 m; a shorter prefix is the parent cell.
 *
 * Geo *queries* (nearby vendors, serviceability) still use MongoDB 2dsphere.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(lat, lng, precision = 7) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new RangeError('encodeGeohash needs a valid lat/lng');
  }

  let latMin = -90; let latMax = 90;
  let lngMin = -180; let lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let evenBit = true; // start with longitude

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngMin = mid; } else { ch <<= 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch <<= 1; latMax = mid; }
    }
    evenBit = !evenBit;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Geohash for a GeoJSON Point ({ coordinates: [lng, lat] }) or undefined. */
function geohashForPoint(point, precision = 7) {
  const coords = point && point.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return undefined;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return encodeGeohash(lat, lng, precision);
}

module.exports = { encodeGeohash, geohashForPoint };
