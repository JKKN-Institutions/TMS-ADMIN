import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Shared resolver for a driver's assigned route(s) + ordered stop timetable.
 *
 * IMPORTANT — driver→route assignment can live on EITHER of two columns, written by
 * two different admin screens (BOTH are populated in production):
 *   - tms_route.driver_id = staff.id   (Routes → Edit → "Driver" dropdown)
 *   - tms_driver.assigned_route_id     (Drivers → Edit → "Assigned Route")
 * So callers pass the driver's `staff_id` AND `assigned_route_id`; we resolve via both
 * (see the `.or` below). A driver may own multiple routes. Reused by
 * /api/driver/{me,routes,passengers,location} and mirrored by the admin Track-All read.
 */

export interface DriverRouteStop {
  id: string;
  name: string;
  time: string | null; // morning (inbound, to-college) pickup
  eveningTime: string | null; // evening (outbound, from-college) drop
  order: number | null;
  isMajor: boolean | null;
}

export interface DriverRoute {
  id: string;
  routeNumber: string | null;
  routeName: string | null;
  routeCode: string | null;
  startLocation: string | null;
  endLocation: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  distance: number | null;
  duration: string | null;
  totalCapacity: number | null;
  currentPassengers: number | null;
  fare: number | null;
  status: string | null;
  vehicleId: string | null;
  label: string; // "36 · ERODE (VEPPADAI…)"
  stops: DriverRouteStop[];
}

const ROUTE_SELECT =
  'id, route_number, route_name, route_code, start_location, end_location, departure_time, arrival_time, distance, duration, total_capacity, current_passengers, fare, status, vehicle_id';
const STOP_SELECT = 'route_id, id, stop_name, stop_time, evening_time, sequence_order, is_major_stop';

type RouteRowRaw = {
  id: string;
  route_number: string | null;
  route_name: string | null;
  route_code: string | null;
  start_location: string | null;
  end_location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  distance: number | null;
  duration: string | null;
  total_capacity: number | null;
  current_passengers: number | null;
  fare: number | null;
  status: string | null;
  vehicle_id: string | null;
};
type StopRowRaw = {
  route_id: string;
  id: string;
  stop_name: string;
  stop_time: string | null;
  evening_time: string | null;
  sequence_order: number | null;
  is_major_stop: boolean | null;
};

function mapStop(s: StopRowRaw): DriverRouteStop {
  return {
    id: s.id,
    name: s.stop_name,
    time: s.stop_time,
    eveningTime: s.evening_time,
    order: s.sequence_order,
    isMajor: s.is_major_stop,
  };
}

/**
 * All routes assigned to the driver, each with its ordered stops. The assignment can
 * come from EITHER admin screen, which write to different columns:
 *   - tms_route.driver_id = staff.id   (Routes → Edit → "Driver" dropdown)
 *   - tms_driver.assigned_route_id     (Drivers → Edit → "Assigned Route")
 * We honor both so whichever screen was used, the portal shows the route. Returns []
 * when neither id is provided or the driver owns no routes.
 */
export async function getDriverRoutes(
  staffId: string | null,
  assignedRouteId: string | null = null,
  svc: ReturnType<typeof createServiceRoleClient> = createServiceRoleClient()
): Promise<DriverRoute[]> {
  const ors: string[] = [];
  if (staffId) ors.push(`driver_id.eq.${staffId}`);
  if (assignedRouteId) ors.push(`id.eq.${assignedRouteId}`);
  if (ors.length === 0) return [];

  const routesRes = await svc
    .from('tms_route')
    .select(ROUTE_SELECT)
    .or(ors.join(','))
    .order('route_number', { ascending: true });
  const rows = (routesRes.data ?? []) as RouteRowRaw[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const stopsRes = await svc
    .from('tms_route_stop')
    .select(STOP_SELECT)
    .in('route_id', ids)
    .order('sequence_order', { ascending: true });
  const stopRows = (stopsRes.data ?? []) as StopRowRaw[];

  const byRoute = new Map<string, DriverRouteStop[]>();
  for (const s of stopRows) {
    const arr = byRoute.get(s.route_id) ?? [];
    arr.push(mapStop(s));
    byRoute.set(s.route_id, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    routeNumber: r.route_number,
    routeName: r.route_name,
    routeCode: r.route_code,
    startLocation: r.start_location,
    endLocation: r.end_location,
    departureTime: r.departure_time,
    arrivalTime: r.arrival_time,
    distance: r.distance,
    duration: r.duration,
    totalCapacity: r.total_capacity,
    currentPassengers: r.current_passengers,
    fare: r.fare,
    status: r.status,
    vehicleId: r.vehicle_id,
    label: `${r.route_number ?? '?'} · ${r.route_name ?? ''}`.trim(),
    stops: byRoute.get(r.id) ?? [],
  }));
}
