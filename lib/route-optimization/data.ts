/**
 * Route Optimization — data loading.
 *
 * The single place that reads the tms_ plane and feeds the engine. Used by BOTH
 * the read-only GET analysis route and the Phase-2 apply path, so "what the
 * admin sees" and "what gets applied" are computed identically. The apply path
 * deliberately re-runs this server-side instead of trusting a client move-list.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeOptimization } from './engine';
import { recommendRightsizing, type FleetVehicle, type RightsizeRouteInput } from './rightsize';
import type { OptimizationAnalysis, RawBooking, RawRoute, RawStop } from './types';

const CHUNK = 150; // keep .in() lists under the API gateway limit

export async function loadOptimizationAnalysis(
  supabase: SupabaseClient,
  date: string,
  underUtilizedMaxPercent: number
): Promise<OptimizationAnalysis> {
  // 1) Routes (+ vehicle_id for real capacity).
  const { data: routeRows, error: routeErr } = await supabase
    .from('tms_route')
    .select(
      'id, route_number, route_name, status, total_capacity, distance, departure_time, arrival_time, vehicle_id'
    );
  if (routeErr) throw new Error(`routes: ${routeErr.message}`);
  const routes = routeRows ?? [];

  // 2) Vehicles for capacity / cost.
  const vehicleIds = Array.from(
    new Set(routes.map((r) => r.vehicle_id).filter((v): v is string => !!v))
  );
  const vehicleById = new Map<
    string,
    { capacity: number | null; operating_cost_per_km: number | null }
  >();
  for (let i = 0; i < vehicleIds.length; i += CHUNK) {
    const slice = vehicleIds.slice(i, i + CHUNK);
    const { data: vehicleRows, error: vehErr } = await supabase
      .from('tms_vehicle')
      .select('id, capacity, operating_cost_per_km')
      .in('id', slice);
    if (vehErr) throw new Error(`vehicles: ${vehErr.message}`);
    for (const v of vehicleRows ?? []) {
      vehicleById.set(v.id, { capacity: v.capacity, operating_cost_per_km: v.operating_cost_per_km });
    }
  }

  // 3) Stops.
  const { data: stopRows, error: stopErr } = await supabase
    .from('tms_route_stop')
    .select('id, route_id, stop_name, sequence_order, is_major_stop, stop_time, evening_time, latitude, longitude');
  if (stopErr) throw new Error(`stops: ${stopErr.message}`);
  const stops = stopRows ?? [];
  const stopById = new Map<string, string | null>(stops.map((s) => [s.id, s.stop_name]));

  // 4) Bookings for the date.
  const { data: bookingRows, error: bookErr } = await supabase
    .from('tms_booking')
    .select('route_id, learner_id, stop_id')
    .eq('travel_date', date);
  if (bookErr) throw new Error(`bookings: ${bookErr.message}`);
  const rawBookings = bookingRows ?? [];

  // 5) Learner display fields (chunked .in).
  const learnerIds = Array.from(
    new Set(rawBookings.map((b) => b.learner_id).filter((v): v is string => !!v))
  );
  const learnerById = new Map<string, { name: string; roll: string | null }>();
  for (let i = 0; i < learnerIds.length; i += CHUNK) {
    const slice = learnerIds.slice(i, i + CHUNK);
    const { data: learnerRows, error: learnErr } = await supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, register_number')
      .in('id', slice);
    if (learnErr) throw new Error(`learners: ${learnErr.message}`);
    for (const l of learnerRows ?? []) {
      const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim();
      learnerById.set(l.id, {
        name: name || 'Unknown learner',
        roll: l.roll_number || l.register_number || null,
      });
    }
  }

  const engineRoutes: RawRoute[] = routes.map((r) => {
    const vehicle = r.vehicle_id ? vehicleById.get(r.vehicle_id) : undefined;
    return {
      id: r.id,
      route_number: r.route_number,
      route_name: r.route_name,
      status: r.status,
      total_capacity: r.total_capacity,
      distance: r.distance,
      departure_time: r.departure_time,
      arrival_time: r.arrival_time,
      vehicle_capacity: vehicle?.capacity ?? null,
      operating_cost_per_km: vehicle?.operating_cost_per_km ?? null,
    };
  });

  const engineStops: RawStop[] = stops.map((s) => ({
    id: s.id,
    route_id: s.route_id,
    stop_name: s.stop_name,
    sequence_order: s.sequence_order,
    is_major_stop: s.is_major_stop,
    stop_time: s.stop_time ?? null,
    evening_time: s.evening_time ?? null,
    lat: s.latitude ?? null,
    long: s.longitude ?? null,
  }));

  const engineBookings: RawBooking[] = rawBookings.map((b) => {
    const learner = learnerById.get(b.learner_id);
    return {
      route_id: b.route_id,
      learner_id: b.learner_id,
      stop_id: b.stop_id,
      stop_name: b.stop_id ? stopById.get(b.stop_id) ?? null : null,
      learner_name: learner?.name ?? 'Unknown learner',
      learner_roll: learner?.roll ?? null,
    };
  });

  const analysis = analyzeOptimization(engineRoutes, engineStops, engineBookings, date, {
    underUtilizedMaxPercent,
  });

  // Vehicle right-sizing needs the whole fleet (assigned + spare) — a DB concern,
  // so it's composed here rather than inside the pure engine.
  const routeVehicleById = new Map<string, string | null>(routes.map((r) => [r.id, r.vehicle_id ?? null]));
  const assignedVehicleIds = new Set(
    routes
      .filter((r) => (r.status ?? 'active') === 'active' && r.vehicle_id)
      .map((r) => r.vehicle_id as string)
  );
  const { data: fleetRows } = await supabase
    .from('tms_vehicle')
    .select('id, capacity, registration_number, status');
  const spareFleet: FleetVehicle[] = (fleetRows ?? [])
    .filter(
      (v) =>
        !!v.id &&
        !assignedVehicleIds.has(v.id) &&
        (v.status ?? 'active') === 'active' &&
        typeof v.capacity === 'number' &&
        v.capacity > 0
    )
    .map((v) => ({ id: v.id as string, capacity: v.capacity as number, label: (v.registration_number as string) ?? null }));

  const rsInputs: RightsizeRouteInput[] = analysis.routes.map((r) => ({
    routeId: r.routeId,
    routeName: r.routeName,
    routeNumber: r.routeNumber,
    demand: r.currentPassengers,
    currentVehicleId: routeVehicleById.get(r.routeId) ?? null,
    currentCapacity: r.capacity,
  }));
  const rightsize = recommendRightsizing(rsInputs, spareFleet, { headroomPercent: 15, minDemand: 1 });

  return { ...analysis, rightsize };
}
