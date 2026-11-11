/**
 * One plain answer for the driver while a trip runs: can learners see the bus right
 * now, and if not, what should the driver do?
 *
 * The capture state machine (tracking-controller) already knows about GPS and network
 * separately, but it showed them as small text. On 2026-11-11 a driver started three
 * trips that sent no position at all and nothing on screen made that obvious. This
 * folds every signal into ok / wait / bad so the page can show one large banner.
 *
 * Pure: no DOM, no timers.
 */
import type { NetworkStatus, TrackingStatus } from './tracking-controller';

export type SharingLevel = 'ok' | 'wait' | 'bad';

export interface SharingHealth {
  level: SharingLevel;
  title: string;
  body: string;
  /** What the driver should do, in order. Empty unless level is 'bad'. */
  steps: string[];
}

/** A position reached the server this recently → learners are seeing the bus. */
export const SENT_FRESH_MS = 30_000;
/** How long "getting your location" is allowed to last before it is called a problem. */
export const START_GRACE_MS = 60_000;
/** After a position WAS sent, how long a gap is tolerated before it is called a problem. */
export const GAP_GRACE_MS = 90_000;

const LOCATION_STEPS = [
  "Turn on Location in your phone's settings.",
  'Allow location for this site when the phone asks.',
  'Keep this screen open and the phone unlocked.',
];

export function sharingHealth(input: {
  status: TrackingStatus;
  network: NetworkStatus;
  /** ms epoch of the last position the server accepted this session, or null. */
  lastSentAt: number | null;
  /** ms epoch when this screen started trying to share (page open or trip start, whichever is later). */
  sinceMs: number;
  nowMs: number;
}): SharingHealth {
  const { status, network, lastSentAt, sinceMs, nowMs } = input;

  if (status === 'permission_denied') {
    return {
      level: 'bad',
      title: 'Learners cannot see the bus',
      body: 'Location is blocked for this site on your phone.',
      steps: [
        'Tap the lock icon next to the web address.',
        'Open Permissions and set Location to Allow.',
        'Come back to this screen and tap Try again.',
      ],
    };
  }
  if (status === 'os_location_off') {
    return {
      level: 'bad',
      title: 'Learners cannot see the bus',
      body: "Your phone's Location is switched off.",
      steps: LOCATION_STEPS,
    };
  }

  if (lastSentAt != null && nowMs - lastSentAt <= SENT_FRESH_MS) {
    return { level: 'ok', title: 'Sharing live', body: 'Learners can see the bus.', steps: [] };
  }

  if (lastSentAt == null) {
    if (nowMs - sinceMs <= START_GRACE_MS) {
      return { level: 'wait', title: 'Getting your location…', body: 'This takes a few seconds. Stay on this screen.', steps: [] };
    }
    return {
      level: 'bad',
      title: 'Learners cannot see the bus',
      body:
        network === 'reconnecting'
          ? 'Your location is found but it is not reaching us. Check mobile data.'
          : 'No location has come from this phone yet.',
      steps: network === 'reconnecting' ? ['Turn on mobile data or move to better signal.', 'Keep this screen open.'] : LOCATION_STEPS,
    };
  }

  // A position was sent earlier, but not recently.
  if (nowMs - lastSentAt <= GAP_GRACE_MS) {
    return { level: 'wait', title: 'Reconnecting…', body: 'The last position was sent a moment ago.', steps: [] };
  }
  return {
    level: 'bad',
    title: 'Learners cannot see the bus',
    body:
      network === 'reconnecting'
        ? 'Positions are not reaching us. Check mobile data.'
        : 'Your phone stopped sending its location.',
    steps:
      network === 'reconnecting'
        ? ['Turn on mobile data or move to better signal.', 'Keep this screen open.']
        : ['Keep this screen open and the phone unlocked.', "Check that Location is on in your phone's settings."],
  };
}
