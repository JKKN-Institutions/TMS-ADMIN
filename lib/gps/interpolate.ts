/**
 * Pure geo-interpolation helpers for smooth live-marker animation.
 *
 * Readers poll the bus position every few seconds; without animation the marker
 * teleports between samples. These helpers let each map GLIDE a marker from its
 * current position to the newest fix over the poll gap — except when the jump is
 * implausibly large (first fix, a reconnect after being offline), where a straight
 * glide would streak across the map and we snap instead.
 *
 * Kept free of Leaflet/React so the maths is unit-testable in the node test env.
 */
export type LatLng = { lat: number; lng: number };

/** Linear blend of a→b by t, with t clamped to [0,1] so the marker never overshoots. */
export function lerp(a: number, b: number, t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return a + (b - a) * c;
}

/** A point on the segment from→to at fraction t (clamped). */
export function interpolateLatLng(from: LatLng, to: LatLng, t: number): LatLng {
  return { lat: lerp(from.lat, to.lat, t), lng: lerp(from.lng, to.lng, t) };
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two coordinates, in metres. */
export function haversineMeters(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distance beyond which we place the marker instantly rather than gliding. A bus
 * covers well under a kilometre between 5 s polls even at speed, so a gap this large
 * means "first fix" or "teleport" — glide it and you draw a streak across the map.
 */
export const SNAP_THRESHOLD_M = 2_000;

export function shouldSnap(from: LatLng, to: LatLng, thresholdMeters = SNAP_THRESHOLD_M): boolean {
  return haversineMeters(from, to) > thresholdMeters;
}
