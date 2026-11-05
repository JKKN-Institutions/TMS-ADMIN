/**
 * rider-kind — who a bus rider was at the moment they were marked. Pure.
 *
 * Stored on every tms_attendance row (column rider_kind) at scan time, so a
 * learner who later gets a bus still reads "Hostel" for the months they rode
 * as a hosteller — the same "store it, never re-derive it" rule as is_walk_up.
 *
 *   transport      on a bus list (an allocated route) or booked a seat that day
 *   hosteller      not registered, but holds an active hostel allocation
 *   non_transport  not registered, not in the hostel ("Irregular")
 *
 * A hosteller with a bus or a booking is Transport: they are on a bus list and
 * the manual route marks them the same way, so the label never depends on HOW
 * they were marked. (The 2026-11-05 backfill used bus_required AND route; live
 * data then had 0 learners with a route but no bus_required, so they agree.)
 */

export type RiderKind = 'transport' | 'hosteller' | 'non_transport';

export const RIDER_KINDS: readonly RiderKind[] = ['transport', 'hosteller', 'non_transport'];

/** Owner-approved labels (2026-11-05). */
export const RIDER_KIND_LABEL: Record<RiderKind, string> = {
  transport: 'Transport',
  hosteller: 'Hostel',
  non_transport: 'Irregular',
};

export function classifyRider(input: {
  busRequired: boolean | null;
  allocatedRouteId: string | null;
  inHostel: boolean;
  /** Holds a booking on any bus for the trip date. */
  hasBooking?: boolean;
}): RiderKind {
  if (input.allocatedRouteId || input.hasBooking) return 'transport';
  if (input.inHostel) return 'hosteller';
  return 'non_transport';
}

export function parseRiderKind(value: unknown): RiderKind | null {
  return typeof value === 'string' && (RIDER_KINDS as readonly string[]).includes(value)
    ? (value as RiderKind)
    : null;
}

/** True for the riders the Hostel / Irregular badge is shown for. */
export function isOffRosterRider(kind: RiderKind | null | undefined): kind is 'hosteller' | 'non_transport' {
  return kind === 'hosteller' || kind === 'non_transport';
}
