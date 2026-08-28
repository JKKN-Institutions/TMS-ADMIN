/**
 * Shared "who is on the bus today" roster helpers.
 *
 * Two different questions live here, and they must not be confused:
 *   - loadBookedRoster            → who BOOKED a seat today (driver Boardings,
 *                                   boarding dashboard, in-charge enforcement).
 *   - loadRouteAttendanceRoster   → who is ALLOCATED to the bus, whether or not
 *                                   they booked (the boarding Attendance screen).
 *
 * `groupRosterByStop`, `buildRosterRows` and `mergeAttendanceRoster` are pure,
 * unit-tested transforms; the `load*` functions are their DB companions.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';
// The arbitration rule lives with the boarding domain that enforces it, so the
// roster's can_edit flag and the API routes' write gate can never disagree.
import { decideMark, canClearMark, type MarkStatus } from '@/lib/boarding/attendance-ownership';
import { bookedCount, routeCapacity } from './repo';

export interface RosterRider {
  learner_id: string;
  name: string;
  roll: string | null;
  stop_id: string | null;
  /**
   * Did this rider book a seat for the day? Optional so the booking-only callers
   * (driver Boardings, boarding dashboard) stay unchanged — an absent flag means
   * "came from the booking list", i.e. booked. Only the attendance roster, which
   * lists the whole ALLOCATED bus, sets it to false.
   */
  booked?: boolean;
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
  /** false = on the bus roster but holds no ticket (no booking) for this day. */
  booked: boolean;
  /**
   * True when this mark records a boarding with NO booking for the day -- the
   * "travelled without a ticket" record. Distinct from `!booked`, and the
   * difference is the whole point: `!booked` means the learner did not book,
   * which most days simply means they stayed home. `is_walk_up` means someone
   * actually saw them on the bus and said so.
   *
   * Always implies status === 'present'; there is no absent-without-a-ticket.
   */
  is_walk_up: boolean;
  /**
   * The in-charge who owns this learner's attendance, or null when the route
   * has no in-charges (three routes) or the allocation has not been computed.
   * Ownership is INDEPENDENT of ticket state and attendance state.
   */
  owner_email: string | null;
  owner_name: string | null;
  /** True when the requesting staff owns this learner, or covers their owner today. */
  is_mine: boolean;
  /** Who actually marked this row, resolved to a name; null when unmarked or orphaned. */
  marked_by_name: string | null;
  /**
   * Whether THIS viewer may change the row, folding BOTH gates: scope (is this
   * learner mine?) and arbitration (is this row someone else's?). A rendering
   * hint only — the write routes re-decide server-side, so a client that
   * ignores it is still denied.
   *
   * Deliberately a single flag. Two independent booleans for "can I press this
   * button" is exactly the drift this change exists to prevent.
   */
  can_edit: boolean;
  /**
   * Why can_edit is false, so the UI can say which gate closed.
   *
   * 'no_ticket' is deliberately NOT a value here. Holding no ticket used to
   * lock the row ahead of both real gates, which is exactly what made an
   * unticketed rider impossible to record. An unticketed row now runs the same
   * scope and arbitration gates as any other; what its ticket state changes is
   * which ACTION is offered (present-only), not whether it is editable.
   */
  lock_reason: 'not_my_share' | 'locked' | null;
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
  is_walk_up: boolean;
  previous_status: string | null;
  previous_by_name: string | null;
  previous_at: string | null;
}

/**
 * Everything the row-level gates need about the signed-in staff member.
 *
 * `viewer` is REQUIRED rather than optional on purpose: an omitted viewer would
 * have to default to something, and any default that unlocks rows silently
 * disables the lock for every caller that forgets it. `ownership` stays
 * optional because its absence has a real, safe meaning — no allocation exists,
 * so Gate A does not apply.
 */
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
 */
export function buildRosterRows(
  riders: RosterRider[],
  route: { id: string; route_number: string | null },
  orderedStops: OrderedStop[],
  attendanceByLearner: Map<string, RosterAttendance>,
  viewer: RosterViewer,
  ownership?: {
    /** learner_id -> owning in-charge. */
    ownerByLearner: Map<string, { staff_email: string; name: string }>;
    /** Emails whose learners belong to the caller (their own + any covered today). */
    mine: Set<string>;
    /** The caller's OWN email, to tell owning a learner from merely covering them. */
    myEmail: string | null;
  },
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
    const owner = ownership?.ownerByLearner.get(rider.learner_id) ?? null;
    const booked = rider.booked !== false;

    // ── Gate A: scope. Is this learner mine to touch at all? ──
    // No ownership data (flag off, or the allocation is empty) means the
    // pre-shares behaviour: everything on the route is in scope. An UNOWNED
    // learner is in scope for everyone on the route too — that is the fallback
    // that keeps the ~11% the allocation has not reached markable.
    const inScope =
      !ownership || !owner
        ? true
        : ownership.mine.has(owner.staff_email) || viewer.isOverrideHolder || viewer.isSuperAdmin;
    // Owning a learner is narrower than having them in scope: a coverer has
    // them in scope but does not own them, and that difference decides who may
    // replace whose mark below.
    const isLearnerOwner = Boolean(
      owner && ownership?.myEmail && owner.staff_email === ownership.myEmail,
    );

    // ── Gate B: arbitration. Is this row already someone else's? ──
    // Permission has to be asked about the action the UI will actually OFFER,
    // and that differs by ticket state. Asking decideMark about a present→absent
    // flip on a no-ticket row would gate its button on a write that can never
    // be requested.
    //
    //   booked, marked      → a status toggle       → decideMark (opposite status)
    //   no ticket, unmarked → "Boarded (no ticket)" → a plain write, nothing to arbitrate
    //   no ticket, marked   → "Undo"                → a delete → canClearMark
    const notLocked = !marked
      ? true
      : !booked
        ? canClearMark({
            existing: { status: status as MarkStatus, scannedBy: att!.scanned_by },
            actorId: viewer.actorId,
            isOverrideHolder: viewer.isOverrideHolder,
            isSuperAdmin: viewer.isSuperAdmin,
          })
        : decideMark({
            existing: { status: status as MarkStatus, scannedBy: att!.scanned_by },
            requestedStatus: status === 'present' ? 'absent' : 'present',
            actorId: viewer.actorId,
            isOverrideHolder: viewer.isOverrideHolder,
            isSuperAdmin: viewer.isSuperAdmin,
            viaScan: false,
            isLearnerOwner,
          }).action !== 'deny';

    // Precedence matches the write routes: scope before arbitration. "Ask
    // Priya, they own this student" is more actionable than "someone locked
    // this row", and it leaks less about who marked what.
    //
    // Ticket state is NOT a gate here. It used to short-circuit ahead of both
    // of these, which meant the ~1,000 riders a day who board without booking
    // could be SEEN on this screen and never recorded. The one action a
    // no-ticket row offers is "boarded", and the write route enforces that.
    const lock_reason: RosterRow['lock_reason'] = !inScope
      ? 'not_my_share'
      : !notLocked
        ? 'locked'
        : null;

    const prev =
      marked && (att!.previous_status === 'present' || att!.previous_status === 'absent')
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
      // Ticket state is INDEPENDENT of attendance state: a rider with no booking
      // can still carry a real manual mark, and must keep showing it.
      booked,
      // Read from the stored row, NOT derived from `!booked`. A booking made
      // after the mark (or cancelled after it) must not silently rewrite what
      // the in-charge recorded at the time they saw the student board.
      is_walk_up: marked ? att!.is_walk_up : false,
      owner_email: owner?.staff_email ?? null,
      owner_name: owner?.name ?? null,
      is_mine: inScope,
      marked_by_name: marked ? att!.marked_by_name : null,
      can_edit: lock_reason === null,
      lock_reason,
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

/**
 * Pure: fold the day's BOOKED riders into the route's ALLOCATED riders, tagging
 * each with its ticket state. The allocated list is the spine — every student on
 * the bus appears, booked or not — and the booking list only decorates it:
 *
 *   - allocated ∩ booked → booked: true, and the BOOKING's stop wins (a student
 *     may board somewhere other than their profile stop on a given day; a null
 *     booking stop falls back to the allocated one).
 *   - allocated only     → booked: false ("Without ticket").
 *   - booked only        → kept and appended. A booking on a route the student is
 *     not allocated to is a data oddity, but dropping it would make a real rider
 *     vanish from the very screen used to account for them.
 *
 * Identity fields prefer whichever side actually has them, so a booking row with
 * an unresolved name never overwrites the allocated profile's real one.
 */
export function mergeAttendanceRoster(
  allocated: RosterRider[],
  booked: RosterRider[],
): RosterRider[] {
  const byId = new Map<string, RosterRider>();
  for (const a of allocated) byId.set(a.learner_id, { ...a, booked: false });

  for (const b of booked) {
    const a = byId.get(b.learner_id);
    if (!a) {
      byId.set(b.learner_id, { ...b, booked: true });
      continue;
    }
    byId.set(b.learner_id, {
      ...a,
      // Fall back to the allocated value whenever the booking side is blank.
      name: a.name && a.name !== 'Learner' ? a.name : b.name,
      roll: a.roll ?? b.roll,
      stop_id: b.stop_id ?? a.stop_id,
      booked: true,
    });
  }
  return [...byId.values()];
}

/** Page size for the allocated-learner scan (see countRouteRoster on why we page). */
const ALLOC_PAGE = 1000;

/**
 * Every student the Attendance screen must account for on one route + date:
 * the route's ALLOCATED learners unioned with that day's BOOKINGS, each tagged
 * `booked`. Allocation matches lib/passengers/route-roster.ts exactly
 * (bus_required + active lifecycle) so the boarding, driver and admin screens
 * can never disagree on who belongs to a route. 42P01-safe on both tables.
 *
 * Staff riders are deliberately NOT included: tms_attendance is keyed by
 * learner_id, so a staff row could be listed but never marked.
 */
export async function loadRouteAttendanceRoster(
  svc: SupabaseClient,
  routeId: string,
  date: string,
): Promise<RosterRider[]> {
  const allocated: RosterRider[] = [];
  for (let from = 0; ; from += ALLOC_PAGE) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, transport_stop_id')
      .eq('transport_route_id', routeId)
      .eq('bus_required', true)
      .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES])
      .range(from, from + ALLOC_PAGE - 1);
    if (error) {
      if (isMissingTable(error)) break;
      throw error;
    }
    const page = (data ?? []) as Array<{
      id: string; first_name: string | null; last_name: string | null;
      roll_number: string | null; transport_stop_id: string | null;
    }>;
    for (const l of page) {
      allocated.push({
        learner_id: l.id,
        name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner',
        roll: l.roll_number,
        stop_id: l.transport_stop_id ?? null,
      });
    }
    if (page.length < ALLOC_PAGE) break;
  }

  const { riders: booked } = await loadBookedRoster(svc, routeId, date);
  return mergeAttendanceRoster(allocated, booked);
}
