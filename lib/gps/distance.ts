import { haversineMeters, type LatLng } from './interpolate';

export type { LatLng };

/** Great-circle distance in kilometres (thin wrapper over the metres helper). */
export function haversineKm(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) / 1000;
}

/** Initial bearing from → to, in degrees clockwise from north, range [0,360). */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest absolute angle between two bearings, in [0,180]. */
export function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** True when `headingDeg` points within ±90° of the bearing to a target. */
export function isApproaching(headingDeg: number | null, bearingToTargetDeg: number): boolean {
  if (headingDeg == null || Number.isNaN(headingDeg)) return false;
  return angleDelta(headingDeg, bearingToTargetDeg) <= 90;
}

/** Below this speed (km/h) the bus is treated as idle and no ETA is estimated. */
const MIN_SPEED_KMH = 3;

/**
 * Deliberately rough ETA in whole minutes, or null when idle/unknown speed.
 * Straight-line distance × roadFactor ÷ speed. Always surfaced to users as "approx"
 * — it does not follow roads and trusts an instantaneous GPS speed.
 */
export function etaMinutes(
  distanceKm: number,
  speedKmh: number | null,
  roadFactor = 1.3,
): number | null {
  if (speedKmh == null || speedKmh < MIN_SPEED_KMH) return null;
  return Math.round(((distanceKm * roadFactor) / speedKmh) * 60);
}
