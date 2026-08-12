/**
 * Pure capture state machine for the driver live-sharing page. No DOM, no timers —
 * the `useLiveTracking` hook feeds it events (fix / geoError / visibility / tick) and
 * renders the resulting status + banner. Modelled as reduce(state, event) so every
 * lifecycle transition (OS-location-off, screen-lock pause, heartbeat stall,
 * permission-denied) is deterministically unit-testable.
 */
import { GEO_PERMISSION_DENIED, GEO_POSITION_UNAVAILABLE } from './geo';

export type TrackingStatus =
  | 'idle'
  | 'starting'
  | 'live'
  | 'paused'
  | 'os_location_off'
  | 'permission_denied'
  | 'no_active_trip'
  | 'stopped';

/**
 * Whether the SERVER is receiving our fixes. Deliberately independent of the GPS
 * status above: a phone can hold a perfect fix with no signal, or have full bars and
 * no satellites. The driver needs to see which one is broken, so they are two
 * separate indicators rather than one merged "status".
 */
export type NetworkStatus = 'idle' | 'connected' | 'reconnecting';

export interface TrackingBanner {
  tone: 'info' | 'warn' | 'error';
  title: string;
  body: string;
}

export interface TrackingState {
  status: TrackingStatus;
  /** ms epoch of the last GPS fix received this session. */
  lastFixAt: number | null;
  /** Have we EVER received a fix this session (distinguishes "location off" from "signal lost"). */
  everFixed: boolean;
  /** Consecutive POSITION_UNAVAILABLE errors (reset by any fix). */
  unavailableStreak: number;
  /** Whether our pings are reaching the server. Independent of `status`. */
  network: NetworkStatus;
  banner: TrackingBanner | null;
}

export type TrackingEvent =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'fix'; atMs: number }
  | { type: 'geoError'; code: number }
  | { type: 'visibility'; visible: boolean }
  | { type: 'tick'; nowMs: number }
  | { type: 'sendOk' }
  | { type: 'sendFail' }
  | { type: 'noActiveTrip' };

/** No fresh fix for this long while sharing → paused + loud banner. */
export const PAUSE_AFTER_MS = 25_000;
/** POSITION_UNAVAILABLE this many times with no fix ever → device location is likely OFF. */
export const OS_OFF_STREAK = 3;

export const initialTrackingState: TrackingState = {
  status: 'idle',
  lastFixAt: null,
  everFixed: false,
  unavailableStreak: 0,
  network: 'idle',
  banner: null,
};

/** Session is alive (capturing or trying to) — used to keep the watch + timers running. */
export function isSharing(status: TrackingStatus): boolean {
  return status === 'starting' || status === 'live' || status === 'paused';
}

const ACQUIRING: TrackingBanner = {
  tone: 'info',
  title: 'Acquiring GPS…',
  body: 'Keep a clear view of the sky. Sharing starts as soon as we get a fix.',
};
const OS_OFF: TrackingBanner = {
  tone: 'error',
  title: 'Turn on Location',
  body: "Your phone's location service looks off. Enable Location in your phone settings (Android: Settings → Location; iPhone: Settings → Privacy & Security → Location Services), then tap Go On Duty again.",
};
const DENIED: TrackingBanner = {
  tone: 'error',
  title: 'Location permission denied',
  body: 'Allow location access for this site in your browser settings, then try again.',
};
const pausedBanner = (reason: string): TrackingBanner => ({
  tone: 'warn',
  title: 'Tracking paused',
  body: `${reason} Keep this screen on and don't lock the phone while driving.`,
});

const NO_TRIP: TrackingBanner = {
  tone: 'warn',
  title: 'No active trip',
  body: 'Your trip has ended or expired. Tap START TRIP to begin sharing again.',
};

const isTerminal = (s: TrackingStatus) =>
  s === 'permission_denied' || s === 'stopped' || s === 'idle' || s === 'no_active_trip';

export function reduceTracking(state: TrackingState, event: TrackingEvent): TrackingState {
  // start/stop are always honoured, even from a terminal state.
  if (event.type === 'start') {
    return {
      status: 'starting',
      lastFixAt: null,
      everFixed: false,
      unavailableStreak: 0,
      network: 'idle',
      banner: ACQUIRING,
    };
  }
  if (event.type === 'stop') {
    return { ...initialTrackingState, status: 'stopped' };
  }
  // Terminal states (permission_denied / stopped / idle) absorb every other event —
  // no stray fix/geoError/tick/visibility can resurrect a denied or ended session.
  if (isTerminal(state.status)) return state;

  switch (event.type) {
    case 'fix':
      // network is carried through, not reset: a fresh GPS fix says nothing about
      // whether the last ping reached the server.
      return {
        status: 'live',
        lastFixAt: event.atMs,
        everFixed: true,
        unavailableStreak: 0,
        network: state.network,
        banner: null,
      };

    case 'sendOk':
      return { ...state, network: 'connected' };

    case 'sendFail':
      return { ...state, network: 'reconnecting' };

    // The server has told us there is no active trip (409). Terminal: stop claiming
    // to be live and tell the driver how to resume.
    case 'noActiveTrip':
      return { ...state, status: 'no_active_trip', banner: NO_TRIP };

    case 'geoError': {
      if (event.code === GEO_PERMISSION_DENIED) {
        return { ...state, status: 'permission_denied', banner: DENIED };
      }
      if (event.code === GEO_POSITION_UNAVAILABLE) {
        const streak = state.unavailableStreak + 1;
        if (!state.everFixed) {
          return streak >= OS_OFF_STREAK
            ? { ...state, unavailableStreak: streak, status: 'os_location_off', banner: OS_OFF }
            : { ...state, unavailableStreak: streak, status: 'starting', banner: ACQUIRING };
        }
        // Had a fix before → this is a transient drop, not a disabled service.
        return { ...state, unavailableStreak: streak, status: 'paused', banner: pausedBanner('GPS signal lost.') };
      }
      // TIMEOUT / unknown: keep whatever we were (acquiring or live); don't demote hard.
      return state.everFixed ? state : { ...state, status: 'starting', banner: ACQUIRING };
    }

    case 'visibility':
      if (!event.visible) {
        return { ...state, status: 'paused', banner: pausedBanner('The screen went to the background.') };
      }
      // Back to foreground: hold paused until the next fix flips us live.
      return state.status === 'paused'
        ? { ...state, banner: { tone: 'info', title: 'Resuming…', body: 'Re-acquiring your location.' } }
        : state;

    case 'tick':
      if (state.status !== 'live') return state;
      if (state.lastFixAt !== null && event.nowMs - state.lastFixAt > PAUSE_AFTER_MS) {
        return { ...state, status: 'paused', banner: pausedBanner('No GPS update recently.') };
      }
      return state;

    default:
      return state;
  }
}
