/**
 * Shared types + mappers for the Passenger module (bus-required learners & staff).
 *
 * The Passenger module lists the people who need transport, sourced from the two
 * MyJKKN master tables that carry the `bus_required` flag:
 *   - learners_profiles  → the Learners page
 *   - staff              → the Staff page
 *
 * MyJKKN owns these tables; TMS only READS them. There is no TMS-owned passenger
 * table — the route/stop linkage is denormalised onto each profile row via
 * transport_route_id / transport_stop_id (both FK → tms_route / tms_route_stop).
 *
 * This file is intentionally free of any server-only imports (no supabase client)
 * so the client `columns.tsx`/`page.tsx` can import the DTO types safely. The
 * mappers below are pure functions; the name lookups they need are passed in as
 * pre-resolved Maps (see lib/passengers/refs.ts).
 */

// ── SELECT column lists (kept here so the API routes and the row types stay in
//    lockstep — change a column in one place only). ──────────────────────────
// The Passenger module shows ONLY the institution-issued address, so we fetch
// just that column and never pull the personal one:
//   learners_profiles → college_email      (personal is student_email, omitted)
//   staff             → institution_email  (personal is email, omitted)
export const LEARNER_SELECT =
  'id, first_name, last_name, college_email, student_mobile, ' +
  'roll_number, register_number, lifecycle_status, institution_id, department_id, ' +
  'program_id, semester_id, ' +
  'bus_required, transport_route_id, transport_stop_id, transport_fee';

export const STAFF_SELECT =
  'id, first_name, last_name, institution_email, phone, staff_id, ' +
  'designation, status, is_active, institution_id, department_id, ' +
  'bus_required, transport_route_id, transport_stop_id';

// ── Lifecycle filtering for the Learners page. ───────────────────────────────
// learners_profiles.lifecycle_status is a 14-value enum. The Learners page shows
// only ENROLLED/active learners for transport, via an explicit ALLOW-LIST
// (PostgREST `in` filter) — so ONLY these states ever appear and nothing else can
// creep in. Admission-pipeline prospects ('reserved', 'enquiry_submitted') are
// intentionally EXCLUDED — they are not yet active learners. 'account' is the
// enrolled state that currently carries bus-required learners; 'active'/'admitted'
// are included for forward-compatibility. To also show reserved/prospective
// learners later, add those values back here (single edit, picked up by the
// learners API route).
export const ACTIVE_LIFECYCLE_STATUSES = [
  'active',
  'admitted',
  'account',
] as const;

// ── Raw DB row shapes (what PostgREST returns for the SELECTs above). ─────────
export interface LearnerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  college_email: string | null;
  student_mobile: string;
  roll_number: string | null;
  register_number: string | null;
  lifecycle_status: string;
  institution_id: string | null;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  bus_required: boolean | null;
  transport_route_id: string | null;
  transport_stop_id: string | null;
  transport_fee: number | null;
}

export interface StaffRow {
  id: string;
  first_name: string;
  last_name: string;
  institution_email: string | null;
  phone: string;
  staff_id: string | null;
  designation: string;
  status: string;
  is_active: boolean | null;
  institution_id: string | null;
  department_id: string | null;
  bus_required: boolean;
  transport_route_id: string | null;
  transport_stop_id: string | null;
}

// ── Resolved name lookups passed to the mappers. ─────────────────────────────
export interface RefMaps {
  institutions: Map<string, string>; // id → institution name
  departments: Map<string, string>; // id → department name
  routes: Map<string, { routeNumber: string; routeName: string }>;
  stops: Map<string, string>; // id → stop name
  programs: Map<string, string>; // id → program name
  semesters: Map<string, string>; // id → semester name
}

export const EMPTY_REFS: RefMaps = {
  institutions: new Map(),
  departments: new Map(),
  routes: new Map(),
  stops: new Map(),
  programs: new Map(),
  semesters: new Map(),
};

// ── Clean DTOs the API returns and the UI consumes. ──────────────────────────
export interface LearnerPassenger {
  id: string;
  name: string;
  rollNumber: string | null;
  registerNumber: string | null;
  email: string | null;
  mobile: string | null;
  lifecycleStatus: string;
  institutionName: string | null;
  departmentName: string | null;
  programName: string | null;
  semesterName: string | null;
  routeLabel: string | null;
  stopLabel: string | null;
  transportFee: number | null;
  assigned: boolean; // has a transport route assigned
}

export interface StaffPassenger {
  id: string;
  name: string;
  staffId: string | null;
  email: string | null;
  phone: string | null;
  designation: string | null;
  status: string;
  isActive: boolean;
  institutionName: string | null;
  departmentName: string | null;
  routeLabel: string | null;
  stopLabel: string | null;
  assigned: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fullName(first: string | null, last: string | null): string {
  return `${first ?? ''} ${last ?? ''}`.trim();
}

// Institution email only. The source columns are frequently an EMPTY STRING
// rather than NULL, so `?? null` alone would surface a blank; trim-then-coalesce
// yields a real "no institution email" (null) that the UI renders as "—".
function instEmail(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function routeLabel(refs: RefMaps, routeId: string | null): string | null {
  if (!routeId) return null;
  const r = refs.routes.get(routeId);
  return r ? `${r.routeNumber} · ${r.routeName}` : null;
}

// ── Pure mappers (row + resolved refs → DTO). ────────────────────────────────
export function mapLearner(row: LearnerRow, refs: RefMaps): LearnerPassenger {
  return {
    id: row.id,
    name: fullName(row.first_name, row.last_name) || (instEmail(row.college_email) ?? 'Unknown'),
    rollNumber: row.roll_number,
    registerNumber: row.register_number,
    email: instEmail(row.college_email),
    mobile: row.student_mobile ?? null,
    lifecycleStatus: row.lifecycle_status,
    institutionName: row.institution_id ? refs.institutions.get(row.institution_id) ?? null : null,
    departmentName: row.department_id ? refs.departments.get(row.department_id) ?? null : null,
    programName: row.program_id ? refs.programs.get(row.program_id) ?? null : null,
    semesterName: row.semester_id ? refs.semesters.get(row.semester_id) ?? null : null,
    routeLabel: routeLabel(refs, row.transport_route_id),
    stopLabel: row.transport_stop_id ? refs.stops.get(row.transport_stop_id) ?? null : null,
    transportFee: row.transport_fee,
    assigned: !!row.transport_route_id,
  };
}

export function mapStaff(row: StaffRow, refs: RefMaps): StaffPassenger {
  return {
    id: row.id,
    name: fullName(row.first_name, row.last_name) || (instEmail(row.institution_email) ?? 'Unknown'),
    staffId: row.staff_id,
    email: instEmail(row.institution_email),
    phone: row.phone ?? null,
    designation: row.designation,
    status: row.status,
    isActive: row.is_active ?? false,
    institutionName: row.institution_id ? refs.institutions.get(row.institution_id) ?? null : null,
    departmentName: row.department_id ? refs.departments.get(row.department_id) ?? null : null,
    routeLabel: routeLabel(refs, row.transport_route_id),
    stopLabel: row.transport_stop_id ? refs.stops.get(row.transport_stop_id) ?? null : null,
    assigned: !!row.transport_route_id,
  };
}

// ── Rider counts per route. ──────────────────────────────────────────────────
/**
 * Tally allocated riders per route from already-fetched learner and/or staff
 * rows. Pass any number of row groups; they sum into one count per route.
 *
 * WHY this exists: `tms_route.current_passengers` is a dead denormalized column
 * — created `default 0` by the tms_route migration and never written by any code
 * path — so it reads 0 for every route. Any screen showing a rider count must
 * derive it from real allocation (learners + staff carrying transport_route_id),
 * which is the same roster definition loadRoutePassengers uses. Kept pure and
 * import-free here so vitest can cover it; callers do the I/O.
 */
export function countRosterByRoute(
  ...groups: Array<ReadonlyArray<{ transport_route_id: string | null }>>
): Map<string, number> {
  const byRoute = new Map<string, number>();
  for (const group of groups) {
    for (const row of group) {
      const routeId = row.transport_route_id;
      if (!routeId) continue;
      byRoute.set(routeId, (byRoute.get(routeId) ?? 0) + 1);
    }
  }
  return byRoute;
}
