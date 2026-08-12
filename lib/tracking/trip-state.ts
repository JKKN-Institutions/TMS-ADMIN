/**
 * Pure trip logic. No DB, no Date.now(), no I/O — every function takes the clock as
 * an argument so the boundaries are deterministically testable, the same discipline
 * lib/gps/route-status.ts follows.
 */
import { hmToMinutes } from '@/lib/boarding/attendance-window';
import { haversineKm, type LatLng } from '@/lib/gps/distance';

export type { LatLng };

export type TripStatus = 'active' | 'completed' | 'expired' | 'cancelled';
export type TripDirection = 'onward' | 'return';

/** The vocabulary the driver, admin and student UIs display. */
export type LiveStatus = 'LIVE' | 'CONNECTING' | 'STALE' | 'OFFLINE' | 'TRIP_COMPLETED';

/**
 * Minutes after a route's arrival_time during which a newly started trip is still
 * considered the onward leg — covers a late-running morning run.
 */
export const ONWARD_GRACE_MIN = 120;

/** Pivot used when a route has no arrival_time recorded. */
const NOON_MINUTES = 12 * 60;

/** Kilometres of movement below which a fix is treated as GPS jitter, not travel. */
export const MIN_MOVE_KM = 0.02;

/**
 * Which leg is this? Derived from IST time-of-day against the route's arrival_time.
 * `tms_attendance` only ever holds 'onward' because the transport office retired the
 * return ATTENDANCE leg — but buses still run both ways (all 24 routes carry evening
 * stop times), so trips support both. The driver may override this.
 */
export function deriveDirection(
  nowMinutesIst: number,
  arrivalTime: string | null
): TripDirection {
  const pivot = arrivalTime ? hmToMinutes(arrivalTime) + ONWARD_GRACE_MIN : NOON_MINUTES;
  return nowMinutesIst <= pivot ? 'onward' : 'return';
}

/**
 * Should this fix be written at all? A wildly inaccurate fix would teleport the marker
 * and corrupt trip distance. A fix with UNKNOWN accuracy is accepted — some devices
 * report null, and rejecting those would break capture entirely.
 */
export function shouldAcceptFix(accuracyM: number | null, minAccuracyM: number): boolean {
  if (accuracyM === null || !Number.isFinite(accuracyM)) return true;
  return accuracyM <= minAccuracyM;
}

export interface LiveStatusInput {
  tripStatus: TripStatus;
  /** Server-receipt time of the newest fix — never a device clock. */
  lastFixAt: string | null;
  nowMs: number;
  liveMaxSec: number;
  staleMaxSec: number;
}

export function liveStatus(input: LiveStatusInput): LiveStatus {
  if (input.tripStatus !== 'active') return 'TRIP_COMPLETED';
  if (!input.lastFixAt) return 'CONNECTING';
  const t = Date.parse(input.lastFixAt);
  if (Number.isNaN(t)) return 'CONNECTING';
  const ageSec = (input.nowMs - t) / 1000;
  if (ageSec <= input.liveMaxSec) return 'LIVE';
  if (ageSec <= input.staleMaxSec) return 'STALE';
  return 'OFFLINE';
}

/**
 * Has an active trip gone silent long enough to be auto-ended?
 *
 * Measured from the last fix, or from started_at when no fix ever arrived — a trip
 * started next to a dead GPS must still expire. A future timestamp yields a negative
 * age and therefore never expires, so a skewed phone clock cannot end a live trip.
 */
export function isTripExpired(
  lastFixAt: string | null,
  startedAt: string,
  nowMs: number,
  tripExpiryMin: number
): boolean {
  const raw = lastFixAt ?? startedAt;
  const ref = Date.parse(raw);
  if (Number.isNaN(ref)) return false;
  return nowMs - ref > tripExpiryMin * 60_000;
}

/**
 * Kilometres to add to a trip's odometer for this fix. Movement below MIN_MOVE_KM is
 * discarded: a parked bus jitters by several metres per fix, which over a 3-hour trip
 * would otherwise accumulate into kilometres of phantom distance.
 */
export function distanceIncrementKm(prev: LatLng | null, next: LatLng): number {
  if (!prev) return 0;
  const km = haversineKm(prev, next);
  return km < MIN_MOVE_KM ? 0 : km;
}
