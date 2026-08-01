/**
 * Why a route is or is not being tracked right now.
 *
 * Ordered by what an admin should do about it, not by severity:
 *   live/recent  — nothing to do
 *   paused       — wait, the driver's phone will probably resume
 *   stuck        — clear the flag; the driver's session is gone but says otherwise
 *   off          — remind the driver to go on duty
 *   no_*         — fix the route's configuration
 */
export type TrackingState =
  | 'live'
  | 'recent'
  | 'paused'
  | 'stuck'
  | 'off'
  | 'no_vehicle'
  | 'no_driver'
  | 'unconfigured';

/**
 * Minutes of silence, while still flagged as sharing, after which we stop calling it
 * a pause and call it a dead session. Nothing in the app clears
 * `tms_driver.location_sharing_enabled` except an explicit "Go Off Duty" tap, so a
 * driver who closes the browser leaves the flag true forever — the common case, not
 * an edge case.
 */
export const STUCK_AFTER_MIN = 30;

export interface RouteStatusInput {
  hasDriver: boolean;
  hasVehicle: boolean;
  sharing: boolean;
  /** tms_vehicle.last_gps_update — server-receipt time, not device time. */
  lastFixAt: string | null;
  /** Injected so tests are deterministic. Callers pass Date.now(). */
  nowMs: number;
}

export interface RouteStatus {
  state: TrackingState;
  /** Short chip text, e.g. "Live". */
  label: string;
  /** One-line explanation, e.g. "Updated 12 min ago". */
  reason: string;
  tone: 'green' | 'amber' | 'red' | 'gray';
  canNudge: boolean;
}

/** "45s" / "12 min" / "3 h" / "28 days" — the coarsest unit that stays honest. */
export function humanizeAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

export function classifyRouteStatus(input: RouteStatusInput): RouteStatus {
  const { hasDriver, hasVehicle, sharing, lastFixAt, nowMs } = input;

  // 1-3. Configuration problems outrank any sharing flag. A route with no vehicle
  // cannot be tracked even by a willing driver: POST /api/driver/location returns
  // 422 "No vehicle assigned to this route".
  if (!hasDriver && !hasVehicle) {
    return {
      state: 'unconfigured',
      label: 'Not set up',
      reason: 'No driver or vehicle assigned to this route',
      tone: 'gray',
      canNudge: false,
    };
  }
  if (!hasVehicle) {
    return {
      state: 'no_vehicle',
      label: "Can't track",
      reason: "No vehicle assigned — the driver's app will refuse to broadcast",
      tone: 'gray',
      canNudge: false,
    };
  }
  if (!hasDriver) {
    return {
      state: 'no_driver',
      label: "Can't track",
      reason: 'No driver assigned to this route',
      tone: 'gray',
      canNudge: false,
    };
  }

  // 4. Configured but the driver has not started a session.
  if (!sharing) {
    return {
      state: 'off',
      label: 'Not sharing',
      reason: "Driver hasn't gone on duty",
      tone: 'gray',
      canNudge: true,
    };
  }

  // 5-8. Sharing is on, so the only question left is how fresh the fix is.
  // Delegate the 2- and 5-minute boundaries to gpsFreshness so this module can
  // never drift from the student, boarding and driver readers.
  const fixMs = lastFixAt ? Date.parse(lastFixAt) : NaN;
  if (!Number.isFinite(fixMs)) {
    return {
      state: 'stuck',
      label: 'Session stuck',
      reason: 'On duty but has never reported a position — driver never went off duty',
      tone: 'red',
      canNudge: true,
    };
  }

  const ageMs = nowMs - fixMs;

  // These are the SAME 2-/5-minute boundaries as lib/gps/freshness.ts, deliberately
  // re-declared rather than imported. gpsFreshness() reads Date.now() internally, so
  // calling it here would make this function impure and its boundary tests
  // non-deterministic. Keep these two constants in step with that file.
  const ONLINE_MAX_MS = 2 * 60_000;
  const RECENT_MAX_MS = 5 * 60_000;

  if (ageMs <= ONLINE_MAX_MS) {
    return {
      state: 'live',
      label: 'Live',
      reason: `Updated ${humanizeAge(ageMs)} ago`,
      tone: 'green',
      canNudge: false,
    };
  }
  if (ageMs <= RECENT_MAX_MS) {
    return {
      state: 'recent',
      label: 'Live',
      reason: `Updated ${humanizeAge(ageMs)} ago`,
      tone: 'green',
      canNudge: false,
    };
  }

  if (ageMs <= STUCK_AFTER_MIN * 60_000) {
    return {
      state: 'paused',
      label: 'Paused',
      reason: `Phone stopped sending ${humanizeAge(ageMs)} ago — screen may be locked`,
      tone: 'amber',
      canNudge: false,
    };
  }

  return {
    state: 'stuck',
    label: 'Session stuck',
    reason: `On duty but silent for ${humanizeAge(ageMs)} — driver never went off duty`,
    tone: 'red',
    canNudge: true,
  };
}
