/**
 * Batched route enrichment shared by route-info views (the student "My Route"
 * page and the boarding "My Route" page). For a set of route ids it loads each
 * route with its ordered stops, assigned driver name, and vehicle — in set-based
 * queries (a handful total, not per-route), so it scales from one route to all.
 *
 * The RouteDetail shape matches what /api/student/route returns for a single
 * route, so the same presentational <RouteTicket> can render either portal.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RouteStopDetail {
  id: string;
  name: string;
  time: string | null; // morning / inbound (to-college) pickup
  eveningTime: string | null; // evening / outbound (from-college) drop
  order: number | null;
  isMajor: boolean | null;
}

export interface RouteVehicleDetail {
  registrationNumber: string;
  model: string | null;
  capacity: number | null;
}

export interface RouteDetail {
  id: string;
  routeNumber: string | null;
  routeName: string | null;
  startLocation: string | null;
  endLocation: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  distance: number | null;
  duration: number | null;
  fare: number | null;
  status: string | null;
  driverName: string | null;
  vehicle: RouteVehicleDetail | null;
  stops: RouteStopDetail[];
}

interface RouteRow {
  id: string;
  route_number: string | null;
  route_name: string | null;
  start_location: string | null;
  end_location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  distance: number | null;
  duration: number | null;
  fare: number | null;
  status: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';
const fullName = (f: string | null, l: string | null) => `${f ?? ''} ${l ?? ''}`.trim();

/**
 * Resolve tms_route.driver_id values to names. The admin route forms store the
 * driver's STAFF id (pickers come from /api/admin/drivers, whose ids are staff
 * ids), so we look up `staff` first, then fall back to legacy rows that stored
 * tms_driver.id (→ staff_id → staff). Batched throughout.
 */
async function resolveDriverNames(svc: SupabaseClient, driverIds: string[]): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  if (driverIds.length === 0) return nameById;

  const { data: staff } = await svc.from('staff').select('id, first_name, last_name').in('id', driverIds);
  for (const s of (staff ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    const name = fullName(s.first_name, s.last_name);
    if (name) nameById.set(s.id, name);
  }

  const unresolved = driverIds.filter((id) => !nameById.has(id));
  if (unresolved.length === 0) return nameById;

  const { data: drivers } = await svc.from('tms_driver').select('id, staff_id').in('id', unresolved);
  const staffIdByDriverId = new Map<string, string>();
  for (const d of (drivers ?? []) as Array<{ id: string; staff_id: string | null }>) {
    if (d.staff_id) staffIdByDriverId.set(d.id, d.staff_id);
  }
  const staffIds = [...new Set(staffIdByDriverId.values())];
  if (staffIds.length === 0) return nameById;

  const { data: staff2 } = await svc.from('staff').select('id, first_name, last_name').in('id', staffIds);
  const nameByStaffId = new Map<string, string>();
  for (const s of (staff2 ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    const name = fullName(s.first_name, s.last_name);
    if (name) nameByStaffId.set(s.id, name);
  }
  for (const [driverId, staffId] of staffIdByDriverId) {
    const name = nameByStaffId.get(staffId);
    if (name) nameById.set(driverId, name);
  }
  return nameById;
}

/** Load full RouteDetail for each id, ordered by route number (numeric-aware). */
export async function loadRouteDetails(svc: SupabaseClient, routeIds: string[]): Promise<RouteDetail[]> {
  const ids = [...new Set(routeIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const { data: routeData, error: routeErr } = await svc
    .from('tms_route')
    .select(
      'id, route_number, route_name, start_location, end_location, departure_time, arrival_time, distance, duration, fare, status, driver_id, vehicle_id'
    )
    .in('id', ids);
  if (routeErr) {
    if (isMissingTable(routeErr)) return [];
    throw routeErr;
  }
  const routes = (routeData ?? []) as RouteRow[];
  if (routes.length === 0) return [];

  // Stops grouped by route.
  const stopsByRoute = new Map<string, RouteStopDetail[]>();
  const { data: stopData } = await svc
    .from('tms_route_stop')
    .select('id, route_id, stop_name, stop_time, evening_time, sequence_order, is_major_stop')
    .in('route_id', ids)
    .order('sequence_order', { ascending: true });
  for (const s of (stopData ?? []) as Array<{
    id: string; route_id: string; stop_name: string; stop_time: string | null; evening_time: string | null; sequence_order: number | null; is_major_stop: boolean | null;
  }>) {
    const arr = stopsByRoute.get(s.route_id) ?? [];
    arr.push({ id: s.id, name: s.stop_name, time: s.stop_time, eveningTime: s.evening_time, order: s.sequence_order, isMajor: s.is_major_stop });
    stopsByRoute.set(s.route_id, arr);
  }

  // Vehicles.
  const vehicleIds = [...new Set(routes.map((r) => r.vehicle_id).filter((v): v is string => !!v))];
  const vehicleById = new Map<string, RouteVehicleDetail>();
  if (vehicleIds.length) {
    const { data: vData } = await svc.from('tms_vehicle').select('id, registration_number, model, capacity').in('id', vehicleIds);
    for (const v of (vData ?? []) as Array<{ id: string; registration_number: string; model: string | null; capacity: number | null }>) {
      vehicleById.set(v.id, { registrationNumber: v.registration_number, model: v.model, capacity: v.capacity });
    }
  }

  // Drivers.
  const driverIds = [...new Set(routes.map((r) => r.driver_id).filter((v): v is string => !!v))];
  const driverNameById = await resolveDriverNames(svc, driverIds);

  return routes
    .map((r): RouteDetail => ({
      id: r.id,
      routeNumber: r.route_number,
      routeName: r.route_name,
      startLocation: r.start_location,
      endLocation: r.end_location,
      departureTime: r.departure_time,
      arrivalTime: r.arrival_time,
      distance: r.distance,
      duration: r.duration,
      fare: r.fare,
      status: r.status,
      driverName: r.driver_id ? driverNameById.get(r.driver_id) ?? null : null,
      vehicle: r.vehicle_id ? vehicleById.get(r.vehicle_id) ?? null : null,
      stops: stopsByRoute.get(r.id) ?? [],
    }))
    .sort((a, b) => (a.routeNumber ?? '').localeCompare(b.routeNumber ?? '', undefined, { numeric: true }));
}
