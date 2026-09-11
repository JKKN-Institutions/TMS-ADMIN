/**
 * The wire contract between the offline outbox on the phone and the two mark
 * endpoints (POST /api/boarding/attendance, POST /api/boarding/scan).
 *
 * Types and constants only, so both the server routes and the browser bundle
 * can import it without pulling in either side's dependencies.
 */

/** Why the server refused a mark because of WHEN it was tapped, or for which trip. */
export type TapRejectReason =
  | 'invalid'
  | 'future'
  | 'stale'
  | 'outside_window'
  | 'wrong_trip'
  | 'evening_off';

/** Every reason a queued mark can be refused. */
export type MarkRejectReason =
  | TapRejectReason
  | 'not_on_route'
  | 'not_assigned'
  | 'not_your_share'
  | 'not_booked'
  | 'scan_refused';

export type SavedOutcome = 'inserted' | 'updated_own' | 'overridden' | 'noop_same_status';

/** The server's answer for ONE mark, keyed by the id the phone generated. */
export type MarkResult =
  | { clientId: string; outcome: SavedOutcome; walkUp: boolean }
  | { clientId: string; outcome: 'locked'; markedByName: string }
  | { clientId: string; outcome: 'rejected'; reason: MarkRejectReason; message?: string };

/** A phone clock may run this far ahead of the server before a tap is refused. */
export const TAP_FUTURE_SKEW_MS = 2 * 60_000;
/** Marks per POST /api/boarding/attendance request from the outbox. */
export const SYNC_BATCH_SIZE = 25;
/** Wait after the 1st, 2nd, and every later failed send. */
export const SYNC_BACKOFF_MS = [5_000, 15_000, 60_000] as const;
/** How often the outbox is drained while the phone is online. */
export const SYNC_INTERVAL_MS = 15_000;

/** Plain-words reason shown to the staffer for a refused mark. */
export const REJECT_REASON_TEXT: Record<MarkRejectReason, string> = {
  invalid: 'The phone sent an unreadable time or trip for this mark.',
  future: "The phone's clock is ahead. Check the phone's date and time settings.",
  stale: 'It reached the server after midnight, so it no longer counts.',
  outside_window: 'It was tapped outside the attendance hours.',
  wrong_trip: 'The trip hours were changed, so it no longer matches the trip it was tapped on.',
  evening_off: 'Evening attendance was switched off.',
  not_on_route: 'This student is no longer on the route.',
  not_assigned: 'You are not assigned to this route.',
  not_your_share: 'This student belongs to another in-charge.',
  not_booked: 'Not booked. Scan again with signal to add them as travelled without booking.',
  scan_refused: 'The scan was refused.',
};

export function isSavedOutcome(o: string): o is SavedOutcome {
  return o === 'inserted' || o === 'updated_own' || o === 'overridden' || o === 'noop_same_status';
}
