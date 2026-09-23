// The two marks an inspector sees per learner. Pure, no I/O.
// Fee uses the SAME Term-1 rule as the 48h timer and the portal gate
// (term1PaidLearnerIds), not the roster badge, which counts not-yet-due instalments.
export type FeeMark = 'paid' | 'override' | 'unpaid' | 'none' | 'unknown';
export type BookingMark = 'this_route' | 'other_route' | 'none';

export function feeMark(i: { known: boolean; paid: boolean; overridden: boolean; hasBill: boolean }): FeeMark {
  if (!i.known) return 'unknown';
  if (i.overridden) return 'override';
  if (i.paid) return 'paid';
  if (!i.hasBill) return 'none';
  return 'unpaid';
}

export function bookingMark(bookingRouteIds: string[], routeId: string): BookingMark {
  if (bookingRouteIds.includes(routeId)) return 'this_route';
  return bookingRouteIds.length > 0 ? 'other_route' : 'none';
}

/** Collapse to the four states the counters and filters understand. */
export function countableFeeState(m: FeeMark): 'paid' | 'unpaid' | 'none' | 'unknown' {
  return m === 'override' ? 'paid' : m;
}
