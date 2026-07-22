/**
 * The full assigned passenger roster for a set of routes — the single source of
 * truth shared by the DRIVER portal (/api/driver/passengers) and the BOARDING
 * portal (/api/boarding/passengers). Both portals resolve their assigned routes
 * differently (driver → tms_route.driver_id; boarding → tms_staff_route_assignment
 * by email) but a "passenger" means exactly the same thing to both: a bus-required,
 * actively-enrolled LEARNER or an active bus-required STAFF member allocated to the
 * route. Centralising the merge here means the two portals can never disagree.
 *
 * Staff carry the same transport wiring as learners (bus_required +
 * transport_route_id / transport_stop_id), so both flatten into one row shape
 * tagged with `type`. Staff reuse the register-number slot for their staff id and
 * add a `designation`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import {
  LEARNER_SELECT,
  STAFF_SELECT,
  ACTIVE_LIFECYCLE_STATUSES,
  countRosterByRoute,
  mapLearner,
  mapStaff,
  type LearnerRow,
  type StaffRow,
} from '@/lib/passengers/types';

/**
 * Active, bus-required staff assigned to any of the given routes — the staff half
 * of a route's passenger roster. `is_active = true` is the staff analog of the
 * learner "active pipeline" filter (is_active is nullable, so `.eq(...,true)`
 * excludes both false and NULL). Returns [] if the MyJKKN `staff` table is absent
 * in this environment (Postgres 42P01) so callers stay resilient.
 */
export async function getRouteStaffRows(
  svc: SupabaseClient,
  routeIds: string[]
): Promise<StaffRow[]> {
  if (routeIds.length === 0) return [];
  const { data, error } = await svc
    .from('staff')
    .select(STAFF_SELECT)
    .in('transport_route_id', routeIds)
    .eq('bus_required', true)
    .eq('is_active', true);
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return (data ?? []) as unknown as StaffRow[];
}

// A single PostgREST response is capped at 1000 rows (db-max-rows), so any
// full-table scan must page or it silently truncates.
const PAGE = 1000;

/**
 * Allocated rider count per route: active bus-required LEARNERS + STAFF holding
 * that transport_route_id — the same roster definition loadRoutePassengers uses,
 * so the admin, driver and boarding screens can never disagree on a route's load.
 *
 * `tms_route.current_passengers` deliberately is NOT used: it is a dead
 * denormalized column (created `default 0`, never written), so it reads 0 for
 * every route. Learners are PAGED because the bus-required roster is already
 * ~995 rows against a 1000-row response cap — an unpaged fetch would begin
 * undercounting, silently, as soon as transport grows past the cap.
 *
 * Returns a sparse map: a route with no riders is absent, so read it as
 * `counts.get(id) ?? 0`.
 */
export async function countRouteRoster(
  svc: SupabaseClient,
  routeIds: string[]
): Promise<Map<string, number>> {
  if (routeIds.length === 0) return new Map();

  const learnerRows: Array<{ transport_route_id: string | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select('transport_route_id')
      .in('transport_route_id', routeIds)
      .eq('bus_required', true)
      .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES])
      .range(from, from + PAGE - 1);
    if (error) {
      if (error.code === '42P01') break; // table absent in this env → no learners
      throw error;
    }
    const page = (data ?? []) as Array<{ transport_route_id: string | null }>;
    learnerRows.push(...page);
    if (page.length < PAGE) break;
  }

  return countRosterByRoute(learnerRows, await getRouteStaffRows(svc, routeIds));
}

/** One flattened passenger (learner OR staff), tagged by `type`. */
export interface RoutePassenger {
  id: string;
  type: 'learner' | 'staff';
  name: string;
  rollNumber: string | null;
  registerNumber: string | null; // staff id reuses this slot
  designation: string | null; // staff only
  email: string | null;
  mobile: string | null;
  routeId: string | null;
  routeLabel: string | null;
  stopLabel: string | null;
  stopOrder: number | null;
}

/**
 * Load the merged learner + staff passenger roster for `routeIds`, flattened and
 * tagged by type. `stopOrder` maps stop id → boarding sequence for the caller to
 * sort by; pass an empty Map to skip stop ordering (rows then sort by name).
 * Returns [] for an empty route list.
 */
export async function loadRoutePassengers(
  svc: SupabaseClient,
  routeIds: string[],
  stopOrder: Map<string, number | null>
): Promise<RoutePassenger[]> {
  if (routeIds.length === 0) return [];

  const [lres, staffRows] = await Promise.all([
    svc
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .in('transport_route_id', routeIds)
      .eq('bus_required', true)
      .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES]),
    getRouteStaffRows(svc, routeIds),
  ]);
  const learnerRows = (lres.data ?? []) as unknown as LearnerRow[];

  const refs = await loadPassengerRefs(svc, {
    institutionIds: [...learnerRows.map((r) => r.institution_id), ...staffRows.map((s) => s.institution_id)],
    departmentIds: [...learnerRows.map((r) => r.department_id), ...staffRows.map((s) => s.department_id)],
    routeIds,
    stopIds: [...learnerRows.map((r) => r.transport_stop_id), ...staffRows.map((s) => s.transport_stop_id)],
    programIds: learnerRows.map((r) => r.program_id),
    semesterIds: learnerRows.map((r) => r.semester_id),
  });

  const orderOf = (stopId: string | null) => (stopId ? stopOrder.get(stopId) ?? null : null);

  const learnerPax: RoutePassenger[] = learnerRows.map((r) => {
    const lp = mapLearner(r, refs);
    return {
      id: lp.id,
      type: 'learner',
      name: lp.name,
      rollNumber: lp.rollNumber,
      registerNumber: lp.registerNumber,
      designation: null,
      email: lp.email,
      mobile: lp.mobile,
      routeId: r.transport_route_id,
      routeLabel: lp.routeLabel,
      stopLabel: lp.stopLabel,
      stopOrder: orderOf(r.transport_stop_id),
    };
  });
  const staffPax: RoutePassenger[] = staffRows.map((s) => {
    const sp = mapStaff(s, refs);
    return {
      id: sp.id,
      type: 'staff',
      name: sp.name,
      rollNumber: null,
      registerNumber: sp.staffId,
      designation: sp.designation,
      email: sp.email,
      mobile: sp.phone,
      routeId: s.transport_route_id,
      routeLabel: sp.routeLabel,
      stopLabel: sp.stopLabel,
      stopOrder: orderOf(s.transport_stop_id),
    };
  });

  return [...learnerPax, ...staffPax];
}

/** Boarding-order comparator: by stop sequence (unassigned last), then name. */
export function byStopThenName(a: RoutePassenger, b: RoutePassenger): number {
  const ao = a.stopOrder ?? 9999;
  const bo = b.stopOrder ?? 9999;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
}
