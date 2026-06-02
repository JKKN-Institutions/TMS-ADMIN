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
}

const uniq = (arr: (string | null)[]): string[] =>
  Array.from(new Set(arr.filter((v): v is string => !!v)));

export async function loadPassengerRefs(
  supabase: SupabaseClient,
  ids: RefIds
): Promise<RefMaps> {
  const institutionIds = uniq(ids.institutionIds);
  const departmentIds = uniq(ids.departmentIds);
  const routeIds = uniq(ids.routeIds);
  const stopIds = uniq(ids.stopIds);

  const [instRes, deptRes, routeRes, stopRes] = await Promise.all([
    institutionIds.length
      ? supabase.from('institutions').select('id, name').in('id', institutionIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    departmentIds.length
      ? supabase.from('departments').select('id, department_name').in('id', departmentIds)
      : Promise.resolve({ data: [] as { id: string; department_name: string }[] }),
    routeIds.length
      ? supabase.from('tms_route').select('id, route_number, route_name').in('id', routeIds)
      : Promise.resolve({ data: [] as { id: string; route_number: string; route_name: string }[] }),
    stopIds.length
      ? supabase.from('tms_route_stop').select('id, stop_name').in('id', stopIds)
      : Promise.resolve({ data: [] as { id: string; stop_name: string }[] }),
  ]);

  const institutions = new Map<string, string>(
    ((instRes.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name])
  );
  const departments = new Map<string, string>(
    ((deptRes.data ?? []) as { id: string; department_name: string }[]).map((r) => [
      r.id,
      r.department_name,
    ])
  );
  const routes = new Map<string, { routeNumber: string; routeName: string }>(
    ((routeRes.data ?? []) as { id: string; route_number: string; route_name: string }[]).map(
      (r) => [r.id, { routeNumber: r.route_number, routeName: r.route_name }]
    )
  );
  const stops = new Map<string, string>(
    ((stopRes.data ?? []) as { id: string; stop_name: string }[]).map((r) => [r.id, r.stop_name])
  );

  return { institutions, departments, routes, stops };
}
