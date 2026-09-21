/**
 * One route, one date, one leg: the attendance roster as the admin screen
 * shows it. Shared by the admin roster API and the route-checker screens so
 * both read the same rows and the same counts.
 *
 * Reuses the SAME pure helpers the boarding staff screen uses
 * (loadRouteAttendanceRoster + buildRosterRows), so present/absent/unmarked,
 * walk-up badges and ownership read identically on every screen. Any date is
 * allowed: viewing history is not marking it.
 *
 * Returns null when the route does not exist. A failed read of the route, its
 * stops or its attendance THROWS a RouteRosterReadError (never an empty
 * roster), so callers can map it to a 500.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMarkerNames } from '@/lib/boarding/identity';
import { withOtherBuses } from '@/lib/boarding/other-bus-roster';
import { loadRosterFees, UNKNOWN_FEE } from '@/lib/boarding/fee-roster';
import {
  loadRouteAttendanceRoster, buildRosterRows,
  type OrderedStop, type RosterRow, type RosterAttendance,
} from '@/lib/booking/roster';

interface StopRow {
  id: string; route_id: string; stop_name: string;
  stop_time: string | null; evening_time: string | null; sequence_order: number | null;
}
interface AttRow {
  learner_id: string; stop_id: string | null; status: string | null; method: string | null;
  scanned_at: string | null; scanned_by: string | null; is_walk_up: boolean | null;
  previous_status: string | null; previous_scanned_by: string | null; previous_scanned_at: string | null;
}

export type RouteRosterReadStage = 'route' | 'stops' | 'attendance';

/** A read the roster cannot be built without failed. `cause` is the DB error. */
export class RouteRosterReadError extends Error {
  readonly stage: RouteRosterReadStage;
  readonly cause: unknown;
  constructor(stage: RouteRosterReadStage, cause: unknown) {
    super(`route roster: failed to load ${stage}`);
    this.name = 'RouteRosterReadError';
    this.stage = stage;
    this.cause = cause;
  }
}

export interface RouteRosterView {
  route: { id: string; route_number: string | null; route_name: string | null };
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number; auto: number };
}

export interface RouteRosterViewer {
  actorId: string;
  isOverrideHolder: boolean;
  isSuperAdmin: boolean;
}

export async function loadRouteRosterView(
  svc: SupabaseClient,
  opts: {
    routeId: string;
    date: string;
    direction: 'onward' | 'return';
    viewer: RouteRosterViewer;
    /** true → fill row.fee via loadRosterFees (fail-soft: a failed read leaves 'unknown'). */
    withFees?: boolean;
  },
): Promise<RouteRosterView | null> {
  const { routeId, date, direction, viewer, withFees = false } = opts;

  const { data: routeData, error: routeError } = await svc
    .from('tms_route').select('id, route_number, route_name').eq('id', routeId).maybeSingle();
  if (routeError) throw new RouteRosterReadError('route', routeError);
  if (!routeData) return null;
  const route = routeData as { id: string; route_number: string | null; route_name: string | null };

  const { data: stopData, error: stopError } = await svc
    .from('tms_route_stop')
    .select('id, route_id, stop_name, stop_time, evening_time, sequence_order')
    .eq('route_id', routeId).eq('is_active', true)
    .order('sequence_order', { ascending: true });
  if (stopError) throw new RouteRosterReadError('stops', stopError);
  const orderedStops: OrderedStop[] = ((stopData ?? []) as StopRow[]).map((s) => ({
    id: s.id,
    name: s.stop_name,
    time: direction === 'return' ? s.evening_time : s.stop_time,
    order: s.sequence_order,
  }));

  // A failed attendance read must NOT render as "nobody is marked" — on this
  // screen that invites an admin to re-mark a bus that was already done.
  const { data: attData, error: attError } = await svc
    .from('tms_attendance')
    .select(
      'learner_id, stop_id, status, method, scanned_at, scanned_by, is_walk_up, previous_status, previous_scanned_by, previous_scanned_at',
    )
    .eq('route_id', routeId).eq('trip_date', date).eq('direction', direction);
  if (attError) throw new RouteRosterReadError('attendance', attError);
  const attRows = (attData ?? []) as AttRow[];

  const markerNames = await loadMarkerNames(svc, [
    ...attRows.map((a) => a.scanned_by),
    ...attRows.map((a) => a.previous_scanned_by),
  ]);

  const attByLearner = new Map<string, RosterAttendance>();
  for (const a of attRows) {
    if (!a.status) continue;
    attByLearner.set(a.learner_id, {
      status: a.status,
      method: a.method,
      scanned_at: a.scanned_at,
      scanned_by: a.scanned_by,
      marked_by_name: a.scanned_by ? markerNames.get(a.scanned_by) ?? null : null,
      is_walk_up: a.is_walk_up === true,
      previous_status: a.previous_status,
      previous_by_name: a.previous_scanned_by ? markerNames.get(a.previous_scanned_by) ?? null : null,
      previous_at: a.previous_scanned_at,
    });
  }

  // Same as the staff roster: the bus's own list, plus which of them booked or
  // boarded another bus, plus learners from other buses recorded on this one.
  // Without it a stranger's mark is counted in the coverage grid but missing
  // here, and a learner who boarded elsewhere reads as a plain "Unmarked".
  // Best-effort: a failed lookup returns the list untagged.
  const riders = await withOtherBuses(svc, routeId, await loadRouteAttendanceRoster(svc, routeId, date), {
    date,
    direction,
    recordedHere: attRows,
  });

  // The viewer's override flag is decided by the CALLER. On the admin screen:
  // an admin is the correction path by definition — they hold
  // tms.attendance.view, and the write route re-decides every gate server-side
  // anyway, so an over-permissive can_edit hint cannot grant anything.
  const rows: RosterRow[] = buildRosterRows(
    riders,
    { id: route.id, route_number: route.route_number },
    orderedStops,
    attByLearner,
    { actorId: viewer.actorId, isOverrideHolder: viewer.isOverrideHolder, isSuperAdmin: viewer.isSuperAdmin },
  );

  if (withFees) {
    // Fee position for everyone on the produced rows, in ONE call per 500 ids
    // (same as the boarding roster). Display only; a failed read leaves rows
    // 'unknown' and never fails the roster.
    const feeByLearner = await loadRosterFees(svc, [...new Set(rows.map((r) => r.learner_id))]);
    for (const r of rows) r.fee = feeByLearner.get(r.learner_id) ?? { ...UNKNOWN_FEE };
  }

  let present = 0, absent = 0, unmarked = 0, auto = 0;
  for (const r of rows) {
    if (r.status === 'present') present += 1;
    else if (r.status === 'absent') absent += 1;
    else unmarked += 1;
    if (r.method === 'auto') auto += 1;
  }

  return {
    route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
    rows,
    counts: { total: rows.length, present, absent, unmarked, auto },
  };
}
