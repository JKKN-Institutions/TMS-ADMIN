/**
 * Great-circle distance helpers. Pure, dependency-free, unit-testable.
 * Used by route-optimization stop matching once stops carry lat/long.
 */

export interface LatLong {
  lat: number;
  long: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in kilometres between two lat/long points. */
export function haversineKm(a: LatLong, b: LatLong): number {
  const R = 6371; // Earth radius, km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.long - a.long);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
