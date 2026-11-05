/**
 * rider-kind — who a bus rider was at the moment they were marked. Pure.
 *
 * Stored on every tms_attendance row (column rider_kind) at scan time, so a
 * learner who later gets a bus still reads "Hostel" for the months they rode
 * as a hosteller — the same "store it, never re-derive it" rule as is_walk_up.
 *
 *   transport      registered for the bus: bus_required AND an allocated route
 *   hosteller      not registered, but holds an active hostel allocation
 *   non_transport  not registered, not in the hostel ("Irregular")
 *
 * A registered hosteller (bus_required + route) is Transport: they are on a bus
 * list and get auto-absences like any other rider. Keep this rule identical to
 * the backfill in supabase/migrations/20261105100000_attendance_rider_kind.sql.
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
}): RiderKind {
  if (input.busRequired === true && input.allocatedRouteId) return 'transport';
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
