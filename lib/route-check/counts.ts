/**
 * Pure roster tallying + filter matching for the Route Check screen. No I/O.
 *
 * `notOnRoute` on a row is computed by the caller from the roster's
 * `other_bus` marker: true when `other_bus?.kind === 'from'` (the rider was
 * seen boarding a different bus today), or when the rider is neither
 * allocated to this route nor booked on it today.
 */
import { finesRaisedByNote } from './fine-rules';

export interface CheckRowLite {
  booked: boolean;
  status: 'present' | 'absent' | 'unmarked';
  feeState: 'paid' | 'unpaid' | 'none' | 'unknown';
  notOnRoute: boolean;
}

export type CheckFilter = 'all' | 'unpaid' | 'without_booking' | 'not_on_route';

export function checkCounts(rows: CheckRowLite[]): {
  total: number;
  booked: number;
  present: number;
  unpaid: number;
  withoutBooking: number;
  notOnRoute: number;
} {
  let booked = 0, present = 0, unpaid = 0, withoutBooking = 0, notOnRoute = 0;
  for (const r of rows) {
    if (r.booked) booked += 1; else withoutBooking += 1;
    if (r.status === 'present') present += 1;
    if (r.feeState === 'unpaid') unpaid += 1;
    if (r.notOnRoute) notOnRoute += 1;
  }
  return { total: rows.length, booked, present, unpaid, withoutBooking, notOnRoute };
}

export function matchesFilter(r: CheckRowLite, f: CheckFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'unpaid': return r.feeState === 'unpaid';
    case 'without_booking': return !r.booked;
    case 'not_on_route': return r.notOnRoute;
  }
}

/** The fields of one recorded check line that the "on this bus" counters need. */
export interface ScannedPersonLite {
  kind: 'learner' | 'staff' | 'manual' | 'unknown';
  outcome: string;
  feeState: string | null;
  bookingState: string | null;
  fineNote: string | null;
}

/**
 * Counters over the people the inspector actually SCANNED on this check — as
 * opposed to the submit snapshot (registered/booked/unpaid/...), which covers
 * the whole route roster, most of whom may not have travelled that day.
 */
export function scannedCounts(rows: ScannedPersonLite[]): {
  checked: number;
  unpaid: number;
  noBooking: number;
  notOnRoute: number;
  unknownCards: number;
  /** People this check fined (a person fined under both rules counts once). */
  finesRaised: number;
} {
  let checked = 0, unpaid = 0, noBooking = 0, notOnRoute = 0, unknownCards = 0, finesRaised = 0;
  for (const r of rows) {
    if (r.kind === 'unknown') { unknownCards += 1; continue; }
    checked += 1;
    if (r.feeState === 'unpaid') unpaid += 1;
    if (r.kind === 'learner' && r.bookingState === 'none') noBooking += 1;
    if (r.outcome === 'not_on_route') notOnRoute += 1;
    if (finesRaisedByNote(r.fineNote) > 0) finesRaised += 1;
  }
  return { checked, unpaid, noBooking, notOnRoute, unknownCards, finesRaised };
}
