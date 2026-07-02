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
  | 'stopped';

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
  /** ms epoch when the CURRENT continuous paused stretch began (null unless paused).
   *  Drives the 2-hour background auto-stop. Reset to null the moment we go live. */
  pausedSince: number | null;
  banner: TrackingBanner | null;
}

export type TrackingEvent =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'fix'; atMs: number }
  | { type: 'geoError'; code: number }
  | { type: 'visibility'; visible: boolean; atMs: number }
  | { type: 'tick'; nowMs: number };

/** No fresh fix for this long while sharing → paused + loud banner. */
export const PAUSE_AFTER_MS = 25_000;
/** POSITION_UNAVAILABLE this many times with no fix ever → device location is likely OFF. */
export const OS_OFF_STREAK = 3;
/**
 * A session left PAUSED (screen off / app backgrounded, so watchPosition is
 * suspended) continuously for this long auto-stops. On the foreground-only web
 * path a phone that's locked and pocketed would otherwise sit "paused" forever;
 * after 2 hours we end the session so it doesn't linger as a stale broadcaster.
 * Evaluated whenever a heartbeat tick fires OR the screen returns (both carry a
 * real wall-clock time, so the window is measured correctly even though no timer
 * runs while the screen is off).
 */
export const AUTO_STOP_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours

export const initialTrackingState: TrackingState = {
  status: 'idle',
  lastFixAt: null,
  everFixed: false,
  unavailableStreak: 0,
  pausedSince: null,
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
const AUTO_STOPPED: TrackingBanner = {
  tone: 'warn',
  title: 'Sharing stopped',
  body: 'Location sharing was paused for 2 hours (screen off or app in the background), so it was turned off automatically. Tap Go On Duty to start sharing again.',
};

const isTerminal = (s: TrackingStatus) => s === 'permission_denied' || s === 'stopped' || s === 'idle';

export function reduceTracking(state: TrackingState, event: TrackingEvent): TrackingState {
  // start/stop are always honoured, even from a terminal state.
  if (event.type === 'start') {
    return { status: 'starting', lastFixAt: null, everFixed: false, unavailableStreak: 0, pausedSince: null, banner: ACQUIRING };
  }
  if (event.type === 'stop') {
    return { ...initialTrackingState, status: 'stopped' };
  }
  // Terminal states (permission_denied / stopped / idle) absorb every other event —
  // no stray fix/geoError/tick/visibility can resurrect a denied or ended session.
  if (isTerminal(state.status)) return state;

  switch (event.type) {
    case 'fix':
      // A fresh fix means we're live again — clear the paused-since clock.
      return { status: 'live', lastFixAt: event.atMs, everFixed: true, unavailableStreak: 0, pausedSince: null, banner: null };

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
        // Screen off / app backgrounded → pause, and stamp WHEN the pause began
        // (preserving an existing stamp so a re-hide doesn't reset the 2h clock)
        // so the session can auto-stop if it stays backgrounded too long.
        return {
          ...state,
          status: 'paused',
          pausedSince: state.status === 'paused' ? state.pausedSince ?? event.atMs : event.atMs,
          banner: pausedBanner('The screen went to the background.'),
        };
      }
      // Back to foreground. If it was paused past the auto-stop window, end it now
      // (this catches the phone-locked case where no tick could fire meanwhile).
      if (state.status === 'paused' && state.pausedSince !== null && event.atMs - state.pausedSince >= AUTO_STOP_AFTER_MS) {
        return { ...initialTrackingState, status: 'stopped', banner: AUTO_STOPPED };
      }
      // Otherwise hold paused until the next fix flips us live.
      return state.status === 'paused'
        ? { ...state, banner: { tone: 'info', title: 'Resuming…', body: 'Re-acquiring your location.' } }
        : state;

    case 'tick':
      // A session paused (screen off / backgrounded) beyond the window auto-stops.
      if (state.status === 'paused') {
        const since = state.pausedSince ?? event.nowMs;
        if (event.nowMs - since >= AUTO_STOP_AFTER_MS) {
          return { ...initialTrackingState, status: 'stopped', banner: AUTO_STOPPED };
        }
        // First tick of a paused stretch (e.g. entered via signal-loss) stamps it.
        return state.pausedSince === null ? { ...state, pausedSince: since } : state;
      }
      if (state.status !== 'live') return state;
      if (state.lastFixAt !== null && event.nowMs - state.lastFixAt > PAUSE_AFTER_MS) {
        return { ...state, status: 'paused', pausedSince: event.nowMs, banner: pausedBanner('No GPS update recently.') };
      }
      return state;

    default:
      return state;
  }
}
