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

/** Compass bearing of the straight line from→to: degrees clockwise from north, 0–360. */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** A move shorter than this between two fixes is GPS jitter, not travel. */
export const MIN_COURSE_M = 8;

/**
 * Which way the bus is facing, for a marker that turns with it.
 *
 * The phone's own heading when it sent one; otherwise the direction it moved since
 * the last fix (about a third of fixes carry no heading); otherwise whatever it was
 * facing before, so a bus waiting at a stop does not swing back to north.
 */
export function courseOf(
  heading: number | null | undefined,
  from: LatLng,
  to: LatLng,
  previous: number | null,
): number | null {
  if (heading != null && !Number.isNaN(heading)) return ((heading % 360) + 360) % 360;
  if (haversineMeters(from, to) >= MIN_COURSE_M) return bearingDeg(from, to);
  return previous;
}

/**
 * The angle to turn to, measured so the turn from `current` is the short way round.
 * 350° → 10° comes back as 370°, not a 340° spin backwards.
 */
export function shortestTurn(current: number, target: number): number {
  const delta = ((((target - current) % 360) + 540) % 360) - 180;
  return current + delta;
}
