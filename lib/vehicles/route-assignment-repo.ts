import type { SupabaseClient } from '@supabase/supabase-js';
import { planRouteAssignment, type RouteAssignmentPlan, type RouteLink } from './route-assignment';

export type ApplyRouteResult =
  | { ok: true; plan: RouteAssignmentPlan; routeNumbers: Map<string, string | null> }
  | { ok: false; status: number; error: string };

/**
 * Give `vehicleId` the route `routeId` (null = no route) by rewriting
 * tms_route.vehicle_id. Clears first, then sets, so a failure part-way leaves
 * the bus with no route rather than on two routes. Errors are returned, never
 * swallowed: an unchecked write here would report a route change that did not
 * happen.
 */
export async function applyRouteAssignment(
  svc: SupabaseClient,
  vehicleId: string,
  routeId: string | null,
): Promise<ApplyRouteResult> {
  const { data, error } = await svc.from('tms_route').select('id, vehicle_id, route_number');
  if (error) return { ok: false, status: 500, error: 'Could not read routes' };
  const rows = (data ?? []) as Array<RouteLink & { route_number: string | null }>;

  let plan: RouteAssignmentPlan;
  try {
    plan = planRouteAssignment(vehicleId, routeId, rows);
  } catch {
    return { ok: false, status: 400, error: 'The chosen route does not exist' };
  }
  const routeNumbers = new Map(rows.map((r) => [r.id, r.route_number] as const));
  if (!plan.changed) return { ok: true, plan, routeNumbers };

  if (plan.clearRouteIds.length > 0) {
    const { error: clearError } = await svc
      .from('tms_route')
      .update({ vehicle_id: null })
      .in('id', plan.clearRouteIds);
    if (clearError) return { ok: false, status: 500, error: 'Could not remove the bus from its old route' };
  }
  if (plan.setRouteId) {
    const { error: setError } = await svc
      .from('tms_route')
      .update({ vehicle_id: vehicleId })
      .eq('id', plan.setRouteId);
    if (setError) return { ok: false, status: 500, error: 'Could not assign the bus to the route' };
  }
  return { ok: true, plan, routeNumbers };
}

/** "route 12" / "no route", for activity-log text. */
export function describeRouteChange(
  plan: RouteAssignmentPlan,
  routeNumbers: Map<string, string | null>,
): string {
  if (!plan.changed) return '';
  const label = (id: string) => `route ${routeNumbers.get(id) ?? '?'}`;
  if (plan.setRouteId) {
    return ` — assigned to ${label(plan.setRouteId)}` +
      (plan.clearRouteIds.length ? ` (was ${plan.clearRouteIds.map(label).join(', ')})` : '') +
      (plan.displacedVehicleId ? '; that route\'s previous bus now has no route' : '');
  }
  return ` — removed from ${plan.clearRouteIds.map(label).join(', ')}`;
}
