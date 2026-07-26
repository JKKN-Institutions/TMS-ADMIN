/**
 * Server-only batch loader for the name lookups the Passenger mappers need.
 *
 * The learner/staff rows only carry FK ids (institution_id, department_id,
 * transport_route_id, transport_stop_id). Rather than rely on PostgREST FK
 * auto-embedding (which needs detectable FK constraints), we collect the distinct
 * ids from the result set and batch-fetch the four reference tables into Maps.
 * With the current data volume (tens of rows) this is trivially cheap and avoids
 * any embedding ambiguity. Pass in the caller's service-role client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RefMaps } from './types';

export interface RefIds {
  institutionIds: (string | null)[];
  departmentIds: (string | null)[];
  routeIds: (string | null)[];
  stopIds: (string | null)[];
  // Optional so existing callers (e.g. the staff route) compile unchanged; the
  // learner routes pass these to resolve program_id / semester_id → names.
  programIds?: (string | null)[];
  semesterIds?: (string | null)[];
}

const uniq = (arr: (string | null)[] = []): string[] =>
  Array.from(new Set(arr.filter((v): v is string => !!v)));

/**
 * PostgREST rejects a very large `.in()` list with HTTP 400, and an unchecked
 * `{ data }` read turns that into an EMPTY result rather than an error — so every
 * label silently renders as a raw UUID with a 200 response and nothing logged.
 * The id lists here are unbounded in principle and already close in practice
 * (tms_route_stop holds 479 rows), so chunk below the limit.
 *
 * Errors are logged and skipped rather than thrown: 14 routes call this helper
 * and all of them treat a missing label as cosmetic degradation. Turning that
 * into a 500 across the app is a bigger behaviour change than this fix warrants.
 */
const REF_CHUNK = 150;

async function fetchRefs<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: string[]
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += REF_CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in('id', ids.slice(i, i + REF_CHUNK));
    if (error) {
      console.error(`loadPassengerRefs: ${table} lookup failed`, error);
      continue;
    }
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export async function loadPassengerRefs(
  supabase: SupabaseClient,
  ids: RefIds
): Promise<RefMaps> {
  const institutionIds = uniq(ids.institutionIds);
  const departmentIds = uniq(ids.departmentIds);
  const routeIds = uniq(ids.routeIds);
  const stopIds = uniq(ids.stopIds);
  const programIds = uniq(ids.programIds);
  const semesterIds = uniq(ids.semesterIds);

  const [instRows, deptRows, routeRows, stopRows, programRows, semesterRows] = await Promise.all([
    fetchRefs<{ id: string; name: string }>(supabase, 'institutions', 'id, name', institutionIds),
    fetchRefs<{ id: string; department_name: string }>(
      supabase, 'departments', 'id, department_name', departmentIds
    ),
    fetchRefs<{ id: string; route_number: string; route_name: string }>(
      supabase, 'tms_route', 'id, route_number, route_name', routeIds
    ),
    fetchRefs<{ id: string; stop_name: string }>(
      supabase, 'tms_route_stop', 'id, stop_name', stopIds
    ),
    fetchRefs<{ id: string; program_name: string }>(
      supabase, 'programs', 'id, program_name', programIds
    ),
    fetchRefs<{ id: string; semester_name: string }>(
      supabase, 'semesters', 'id, semester_name', semesterIds
    ),
  ]);

  const institutions = new Map<string, string>(instRows.map((r) => [r.id, r.name]));
  const departments = new Map<string, string>(deptRows.map((r) => [r.id, r.department_name]));
  const routes = new Map<string, { routeNumber: string; routeName: string }>(
    routeRows.map((r) => [r.id, { routeNumber: r.route_number, routeName: r.route_name }])
  );
  const stops = new Map<string, string>(stopRows.map((r) => [r.id, r.stop_name]));
  const programs = new Map<string, string>(programRows.map((r) => [r.id, r.program_name]));
  const semesters = new Map<string, string>(semesterRows.map((r) => [r.id, r.semester_name]));

  return { institutions, departments, routes, stops, programs, semesters };
}
