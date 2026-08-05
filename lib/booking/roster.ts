/**
 * Shared "who booked today" roster helper. Powers the boarding dashboard's
 * today's-bookings list and the driver Boardings view. `groupRosterByStop` is a
 * pure, unit-tested transform; `loadBookedRoster` is its DB companion.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { bookedCount, routeCapacity } from './repo';
// The ownership rule lives with the boarding domain that enforces it, so the
// roster's `can_edit` flag and the API routes' write gate can never disagree.
import { decideMark, type MarkStatus } from '@/lib/boarding/attendance-ownership';

export interface RosterRider {
  learner_id: string;
  name: string;
  roll: string | null;
  stop_id: string | null;
}

export interface OrderedStop {
  id: string;
  name: string;
  time: string | null;
  order: number | null;
}

export interface RosterStopGroup {
  stop_id: string | null;
  stop_name: string;
  stop_time: string | null;
  count: number;
  riders: RosterRider[];
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

/** Split an id list into ≤150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Today's booked riders for one route: reads tms_booking by route_id + travel_date,
 * denormalizes learner name/roll (chunked .in()), plus booked/capacity counts.
 * 42P01-safe: empty roster + zero counts if tms_booking is absent.
 */
export async function loadBookedRoster(
  svc: SupabaseClient,
  routeId: string,
  date: string
): Promise<{ counts: { booked: number; capacity: number }; riders: RosterRider[] }> {
  const { data: bookings, error } = await svc
    .from('tms_booking')
    .select('learner_id, stop_id')
    .eq('route_id', routeId)
    .eq('travel_date', date);
  if (error) {
    if (isMissingTable(error)) return { counts: { booked: 0, capacity: 0 }, riders: [] };
    throw error;
  }

  const stopByLearner = new Map<string, string | null>();
  for (const b of (bookings ?? []) as { learner_id: string; stop_id: string | null }[]) {
    stopByLearner.set(b.learner_id, b.stop_id ?? null);
  }
  const ids = [...stopByLearner.keys()];

  const info = new Map<string, { name: string; roll: string | null }>();
  for (const c of chunk(ids)) {
    const { data } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .in('id', c);
    for (const l of (data ?? []) as Array<{
      id: string; first_name: string | null; last_name: string | null; roll_number: string | null;
    }>) {
      info.set(l.id, {
        name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner',
        roll: l.roll_number,
      });
    }
  }

  const riders: RosterRider[] = ids.map((id) => ({
    learner_id: id,
    name: info.get(id)?.name ?? 'Learner',
    roll: info.get(id)?.roll ?? null,
    stop_id: stopByLearner.get(id) ?? null,
  }));

  const [booked, capacity] = await Promise.all([
    bookedCount(svc, routeId, date),
    routeCapacity(svc, routeId),
  ]);
  return { counts: { booked, capacity }, riders };
}

/**
 * Pure: group riders by stop in the route's pickup order. Stops with no riders are
 * skipped; riders whose stop_id is null or not in `orderedStops` fall into a trailing
 * "Stop not set" bucket. Riders within a stop are sorted by roll then name.
 */
export function groupRosterByStop(
  riders: RosterRider[],
  orderedStops: OrderedStop[]
): RosterStopGroup[] {
  const UNSET = '__unset__';
  const known = new Set(orderedStops.map((s) => s.id));
  const byStop = new Map<string, RosterRider[]>();
  for (const r of riders) {
    const key = r.stop_id && known.has(r.stop_id) ? r.stop_id : UNSET;
    const arr = byStop.get(key) ?? [];
    arr.push(r);
    byStop.set(key, arr);
  }

  const sortRiders = (a: RosterRider, b: RosterRider) =>
    (a.roll ?? a.name).localeCompare(b.roll ?? b.name, undefined, { numeric: true });

  const groups: RosterStopGroup[] = [];
  for (const s of [...orderedStops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const rs = byStop.get(s.id);
    if (!rs || rs.length === 0) continue;
    groups.push({ stop_id: s.id, stop_name: s.name, stop_time: s.time, count: rs.length, riders: rs.sort(sortRiders) });
  }
  const unset = byStop.get(UNSET);
  if (unset && unset.length > 0) {
    groups.push({ stop_id: null, stop_name: 'Stop not set', stop_time: null, count: unset.length, riders: unset.sort(sortRiders) });
  }
  return groups;
}

export interface RosterRow {
  learner_id: string;
  name: string;
  roll: string | null;
  route_id: string;
  route_number: string | null;
  stop_id: string | null;
  stop_name: string;
  stop_time: string | null;
  status: 'present' | 'absent' | 'unmarked';
  method: string | null;
  scanned_at: string | null;
  /** Who marked this row (tms_attendance.scanned_by); null when unmarked or orphaned. */
  marked_by_id: string | null;
  marked_by_name: string | null;
  /**
   * Whether THIS viewer may change the row. A rendering hint only — the write
   * routes re-decide server-side, so a client that ignores it is still denied.
   */
  can_edit: boolean;
  /** Set only when this mark replaced an earlier one (scan or transport-head override). */
  previous_status: 'present' | 'absent' | null;
  previous_by_name: string | null;
  previous_at: string | null;
}

/** One learner's attendance for the leg, with marker names already resolved. */
export interface RosterAttendance {
  status: string;
  method: string | null;
  scanned_at: string | null;
  scanned_by: string | null;
  marked_by_name: string | null;
  previous_status: string | null;
  previous_by_name: string | null;
  previous_at: string | null;
}

/** The signed-in staff member the rows are being rendered for. */
export interface RosterViewer {
  actorId: string;
  isOverrideHolder: boolean;
  isSuperAdmin: boolean;
}

/**
 * Pure: flatten one route's booked riders into attendance rows for a single leg.
 * The caller must pass `orderedStops` with `.time` already resolved to the leg
 * (stop_time onward / evening_time return) and `attendanceByLearner` already
 * filtered to that leg. Riders sort by stop order then roll/name (numeric-aware);
 * riders with a null/unknown stop fall into a trailing "Stop not set" bucket.
 *
 * `viewer` is REQUIRED rather than optional on purpose: an omitted viewer would
 * have to default to something, and any default that unlocks rows silently
 * disables the lock for every caller that forgets it.
 */
export function buildRosterRows(
  riders: RosterRider[],
  route: { id: string; route_number: string | null },
  orderedStops: OrderedStop[],
  attendanceByLearner: Map<string, RosterAttendance>,
  viewer: RosterViewer,
): RosterRow[] {
  const byId = new Map(orderedStops.map((s) => [s.id, s] as const));
  const orderOf = (stopId: string | null) =>
    stopId && byId.has(stopId) ? (byId.get(stopId)!.order ?? 0) : Number.MAX_SAFE_INTEGER;

  const rows: RosterRow[] = riders.map((rider) => {
    const stop = rider.stop_id && byId.has(rider.stop_id) ? byId.get(rider.stop_id)! : null;
    const att = attendanceByLearner.get(rider.learner_id);
    // Three-state: an attendance row is either 'present' or 'absent'; no row → 'unmarked'.
    const status: RosterRow['status'] =
      att?.status === 'present' ? 'present' : att?.status === 'absent' ? 'absent' : 'unmarked';
    const marked = status !== 'unmarked';

    // The row's toggle offers the OPPOSITE status, so that is the write whose
    // permission decides whether a control renders at all.
    const canEdit = !marked
      ? true
      : decideMark({
          existing: { status: status as MarkStatus, scannedBy: att!.scanned_by },
          requestedStatus: status === 'present' ? 'absent' : 'present',
          actorId: viewer.actorId,
          isOverrideHolder: viewer.isOverrideHolder,
          isSuperAdmin: viewer.isSuperAdmin,
          viaScan: false,
        }).action !== 'deny';

    const prev = marked && (att!.previous_status === 'present' || att!.previous_status === 'absent')
      ? (att!.previous_status as 'present' | 'absent')
      : null;

    return {
      learner_id: rider.learner_id,
      name: rider.name,
      roll: rider.roll,
      route_id: route.id,
      route_number: route.route_number,
      stop_id: stop ? stop.id : null,
      stop_name: stop ? stop.name : 'Stop not set',
      stop_time: stop ? stop.time : null,
      status,
      method: marked ? att!.method : null,
      scanned_at: marked ? att!.scanned_at : null,
      marked_by_id: marked ? att!.scanned_by : null,
      marked_by_name: marked ? att!.marked_by_name : null,
      can_edit: canEdit,
      previous_status: prev,
      previous_by_name: prev ? att!.previous_by_name : null,
      previous_at: prev ? att!.previous_at : null,
    };
  });

  rows.sort((a, b) => {
    const byStop = orderOf(a.stop_id) - orderOf(b.stop_id);
    if (byStop !== 0) return byStop;
    return (a.roll ?? a.name).localeCompare(b.roll ?? b.name, undefined, { numeric: true });
  });
  return rows;
}
