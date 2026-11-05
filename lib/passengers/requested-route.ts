import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The route + boarding stop a learner asked for in their Bus Pass Request.
 *
 * Bus pass requests are NOT a tms_ table: they live in the shared MyJKKN
 * `service_requests` queue (one service type among many — Gate Outpass etc.),
 * with the learner's choice inside `form_data`:
 *   { bus_route: <tms_route.id>, boarding_stop: <tms_route_stop.id | ''>, passenger_type }
 * `requester_id` is the learner's profiles.id (= learners_profiles.profile_id).
 *
 * The Learners page uses this to show an unassigned learner's requested route
 * and to pre-fill the Assign route dialog, so the admin isn't assigning blind.
 */
export interface RequestedRoute {
  routeId: string;
  stopId: string | null;
}

export interface BusPassRequestRow {
  requester_id: string;
  created_at: string;
  form_data: unknown;
}

// Pre-fulfilment states plus fulfilled. 'cancelled' / 'closed' requests are
// withdrawn and must not drive an assignment.
export const LIVE_BUS_PASS_STATUSES = ['draft', 'submitted', 'fulfilled'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readId(form: Record<string, unknown>, key: string): string | null {
  const v = form[key];
  return typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim() : null;
}

/** Latest request per requester that names a route. Pure — unit tested. */
export function pickRequestedRoutes(rows: BusPassRequestRow[]): Map<string, RequestedRoute> {
  const latest = new Map<string, { at: string; value: RequestedRoute }>();
  for (const row of rows) {
    if (!row.requester_id || !row.form_data || typeof row.form_data !== 'object') continue;
    const form = row.form_data as Record<string, unknown>;
    const routeId = readId(form, 'bus_route');
    if (!routeId) continue;
    const prev = latest.get(row.requester_id);
    if (prev && prev.at >= row.created_at) continue;
    latest.set(row.requester_id, { at: row.created_at, value: { routeId, stopId: readId(form, 'boarding_stop') } });
  }
  return new Map(Array.from(latest, ([k, v]) => [k, v.value]));
}

// Same gateway limit as loadPassengerRefs: a huge `.in()` silently empties.
const CHUNK = 150;

/**
 * Requested routes keyed by profile id. Failures degrade to "no requested
 * route" (logged) — this is a convenience hint, never a reason to fail the list.
 */
export async function loadRequestedRoutes(
  supabase: SupabaseClient,
  profileIds: (string | null)[]
): Promise<Map<string, RequestedRoute>> {
  const ids = Array.from(new Set(profileIds.filter((v): v is string => !!v)));
  if (ids.length === 0) return new Map();

  const typeRes = await supabase.from('service_types').select('id').eq('name', 'Bus Pass Request').limit(1);
  if (typeRes.error) {
    console.error('loadRequestedRoutes: service type lookup failed', typeRes.error);
    return new Map();
  }
  const typeId = (typeRes.data ?? [])[0]?.id as string | undefined;
  if (!typeId) return new Map();

  const rows: BusPassRequestRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('service_requests')
      .select('requester_id, created_at, form_data')
      .eq('service_type_id', typeId)
      .in('status', [...LIVE_BUS_PASS_STATUSES])
      .in('requester_id', ids.slice(i, i + CHUNK));
    if (error) {
      console.error('loadRequestedRoutes: request lookup failed', error);
      continue;
    }
    rows.push(...((data ?? []) as BusPassRequestRow[]));
  }
  return pickRequestedRoutes(rows);
}
