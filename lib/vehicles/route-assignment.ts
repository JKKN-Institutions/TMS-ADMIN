/**
 * route-assignment — which route rows change when a bus is given a route from
 * the vehicle form. Pure.
 *
 * The bus <-> route link lives on the ROUTE (tms_route.vehicle_id); a bus has
 * no route column. One bus serves one route (live data 2026-11-05: no bus on
 * two routes), so choosing a route for a bus:
 *   - clears the bus from every other route it is on, and
 *   - sets the chosen route's vehicle_id to this bus, which displaces the bus
 *     that route had before (that bus is left with no route — the form warns).
 */

export interface RouteLink {
  id: string;
  vehicle_id: string | null;
}

export interface RouteAssignmentPlan {
  /** Routes whose vehicle_id must be set to null (they carry this bus now). */
  clearRouteIds: string[];
  /** Route whose vehicle_id must be set to this bus; null = none. */
  setRouteId: string | null;
  /** The bus the chosen route had before, which is left without a route. */
  displacedVehicleId: string | null;
  changed: boolean;
}

export function planRouteAssignment(
  vehicleId: string,
  chosenRouteId: string | null,
  routes: RouteLink[],
): RouteAssignmentPlan {
  const chosen = chosenRouteId ? routes.find((r) => r.id === chosenRouteId) : null;
  if (chosenRouteId && !chosen) throw new Error('Route not found');

  const clearRouteIds = routes
    .filter((r) => r.vehicle_id === vehicleId && r.id !== chosenRouteId)
    .map((r) => r.id);
  const alreadyThere = !!chosen && chosen.vehicle_id === vehicleId;
  const setRouteId = chosen && !alreadyThere ? chosen.id : null;
  const displacedVehicleId = setRouteId && chosen!.vehicle_id ? chosen!.vehicle_id : null;

  return {
    clearRouteIds,
    setRouteId,
    displacedVehicleId,
    changed: clearRouteIds.length > 0 || setRouteId !== null,
  };
}

/**
 * The form's `route_id` key: absent = leave routes alone (old clients, the
 * import); '' or null = no route; a string = that route.
 */
export function parseRouteChoice(
  body: Record<string, unknown>,
): { provided: false } | { provided: true; routeId: string | null } {
  if (!('route_id' in body)) return { provided: false };
  const v = body.route_id;
  return { provided: true, routeId: typeof v === 'string' && v.trim() ? v.trim() : null };
}
