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
export const LEARNER_SELECT =
  'id, first_name, last_name, student_email, college_email, student_mobile, ' +
  'roll_number, register_number, lifecycle_status, institution_id, department_id, ' +
  'bus_required, transport_route_id, transport_stop_id, transport_fee';

export const STAFF_SELECT =
  'id, first_name, last_name, email, institution_email, phone, staff_id, ' +
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
  student_email: string;
  college_email: string | null;
  student_mobile: string;
  roll_number: string | null;
  register_number: string | null;
  lifecycle_status: string;
  institution_id: string | null;
  department_id: string | null;
  bus_required: boolean | null;
  transport_route_id: string | null;
  transport_stop_id: string | null;
  transport_fee: number | null;
}

export interface StaffRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  institution_email: string;
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
}

export const EMPTY_REFS: RefMaps = {
  institutions: new Map(),
  departments: new Map(),
  routes: new Map(),
  stops: new Map(),
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

function routeLabel(refs: RefMaps, routeId: string | null): string | null {
  if (!routeId) return null;
  const r = refs.routes.get(routeId);
  return r ? `${r.routeNumber} · ${r.routeName}` : null;
}

// ── Pure mappers (row + resolved refs → DTO). ────────────────────────────────
export function mapLearner(row: LearnerRow, refs: RefMaps): LearnerPassenger {
  return {
    id: row.id,
    name: fullName(row.first_name, row.last_name) || (row.student_email ?? 'Unknown'),
    rollNumber: row.roll_number,
    registerNumber: row.register_number,
    email: row.student_email ?? row.college_email ?? null,
    mobile: row.student_mobile ?? null,
    lifecycleStatus: row.lifecycle_status,
    institutionName: row.institution_id ? refs.institutions.get(row.institution_id) ?? null : null,
    departmentName: row.department_id ? refs.departments.get(row.department_id) ?? null : null,
    routeLabel: routeLabel(refs, row.transport_route_id),
    stopLabel: row.transport_stop_id ? refs.stops.get(row.transport_stop_id) ?? null : null,
    transportFee: row.transport_fee,
    assigned: !!row.transport_route_id,
  };
}

export function mapStaff(row: StaffRow, refs: RefMaps): StaffPassenger {
  return {
    id: row.id,
    name: fullName(row.first_name, row.last_name) || (row.email ?? 'Unknown'),
    staffId: row.staff_id,
    email: row.email ?? row.institution_email ?? null,
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
