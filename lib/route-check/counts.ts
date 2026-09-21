/**
 * Pure roster tallying + filter matching for the Route Check screen. No I/O.
 *
 * `notOnRoute` on a row is computed by the caller from the roster's
 * `other_bus` marker: true when `other_bus?.kind === 'from'` (the rider was
 * seen boarding a different bus today), or when the rider is neither
 * allocated to this route nor booked on it today.
 */
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
