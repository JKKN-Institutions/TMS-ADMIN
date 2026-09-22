/**
 * Pure outcome classification for a Route Check scan/entry. No I/O.
 */
export type CheckOutcome = 'ok' | 'not_on_route' | 'no_booking' | 'fee_unpaid' | 'unknown_card' | 'manual';

/** First match wins, in this order: unknown -> not_on_route -> no_booking -> fee_unpaid -> ok. */
export function learnerCheckOutcome(i: { known: boolean; onRoute: boolean; booked: boolean; feeUnpaid: boolean }): CheckOutcome {
  if (!i.known) return 'unknown_card';
  if (!i.onRoute) return 'not_on_route';
  if (!i.booked) return 'no_booking';
  if (i.feeUnpaid) return 'fee_unpaid';
  return 'ok';
}

/** An active in-charge of the route is exempt from both not_on_route and fee_unpaid. */
export function staffCheckOutcome(i: { onRoute: boolean; isIncharge: boolean; hasOutstandingBill: boolean }): CheckOutcome {
  if (!i.onRoute && !i.isIncharge) return 'not_on_route';
  if (i.hasOutstandingBill && !i.isIncharge) return 'fee_unpaid';
  return 'ok';
}
