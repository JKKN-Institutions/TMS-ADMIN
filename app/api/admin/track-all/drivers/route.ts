import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gpsFreshness } from '@/lib/gps/freshness';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type RouteRow = {
  id: string;
  route_number: string | null;
  route_name: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
};
type DriverRow = {
  id: string;
  staff_id: string | null;
  location_sharing_enabled: boolean | null;
  active_route_id: string | null;
  assigned_route_id: string | null;
};
type StaffRow = { id: string; first_name: string | null; last_name: string | null };
type VehRow = {
  id: string;
  registration_number: string | null;
  model: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  gps_speed: number | null;
  gps_heading: number | null;
  gps_accuracy: number | null;
  last_gps_update: string | null;
  live_tracking_enabled: boolean | null;
};

const NONE = '00000000-0000-0000-0000-000000000000';
const uniq = (arr: (string | null)[]): string[] =>
  Array.from(new Set(arr.filter((v): v is string => !!v)));

/** GET /api/admin/track-all/drivers — live positions for the admin Track-All map, read
 *  from the tms_ plane (the legacy drivers/routes/vehicles tables were dropped).
 *
 *  DRIVER-CENTRIC: we start from tms_driver and resolve each driver's route honoring
 *  BOTH assignment columns — `tms_driver.active_route_id`/`assigned_route_id` (Drivers →
 *  Edit) AND `tms_route.driver_id = staff_id` (Routes → Edit) — the same dual linkage the
 *  driver's broadcast uses (lib/driver/routes.ts). Discovering drivers only via
 *  tms_route.driver_id (the old approach) made any driver assigned through the Drivers
 *  screen invisible here even while actively sharing. Emits the same DriverLocation[]
 *  shape the Leaflet map + page already consume. */
export async function GET() {
  try {
    // 1. Drivers first (small table) — the discovery is driver-centric, not route-centric.
    const { data: driversData, error: driversErr } = await supabase
      .from('tms_driver')
      .select('id, staff_id, location_sharing_enabled, active_route_id, assigned_route_id');
    if (driversErr) throw driversErr;
    const drivers = (driversData ?? []) as DriverRow[];

    if (drivers.length === 0) {
      return NextResponse.json({
        success: true,
        drivers: [],
        total: 0,
        active_tracking: 0,
        online_drivers: 0,
        last_updated: new Date().toISOString(),
      });
    }

    // 2. Ids needed to resolve each driver's route via EITHER linkage column.
    const staffIds = uniq(drivers.map((d) => d.staff_id));
    const routeIds = uniq(drivers.flatMap((d) => [d.active_route_id, d.assigned_route_id]));

    // 3. One route fetch covering both paths: driver_id = staff_id (Routes screen) OR
    //    id ∈ the active/assigned route ids (Drivers screen). Both lists are tiny.
    const orParts: string[] = [];
    if (staffIds.length) orParts.push(`driver_id.in.(${staffIds.join(',')})`);
    if (routeIds.length) orParts.push(`id.in.(${routeIds.join(',')})`);
    const { data: routesData, error: routesErr } = orParts.length
      ? await supabase
          .from('tms_route')
          .select('id, route_number, route_name, vehicle_id, driver_id')
          .or(orParts.join(','))
      : { data: [] as RouteRow[], error: null };
    if (routesErr) throw routesErr;
    const routes = (routesData ?? []) as RouteRow[];

    const routesById = new Map(routes.map((r) => [r.id, r]));
    const routesByStaff = new Map<string, RouteRow[]>();
    for (const r of routes) {
      if (!r.driver_id) continue;
      const arr = routesByStaff.get(r.driver_id) ?? [];
      arr.push(r);
      routesByStaff.set(r.driver_id, arr);
    }

    // 4. Per-driver route resolution, in the same priority the driver broadcasts on:
    //    active_route_id → assigned_route_id → first route whose driver_id = staff_id.
    const pickRoute = (d: DriverRow): RouteRow | null =>
      (d.active_route_id ? routesById.get(d.active_route_id) : undefined) ??
      (d.assigned_route_id ? routesById.get(d.assigned_route_id) : undefined) ??
      (d.staff_id ? routesByStaff.get(d.staff_id)?.[0] : undefined) ??
      null;

    // 5. Keep drivers that resolve to a route (via either column).
    const resolved = drivers
      .map((d) => ({ d, route: pickRoute(d) }))
      .filter((x): x is { d: DriverRow; route: RouteRow } => x.route !== null);

    // 6. Names + vehicles for the resolved set.
    const vehicleIds = uniq(resolved.map((x) => x.route.vehicle_id));
    const [staffRes, vehRes] = await Promise.all([
      supabase
        .from('staff')
        .select('id, first_name, last_name')
        .in('id', staffIds.length ? staffIds : [NONE]),
      supabase
        .from('tms_vehicle')
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, gps_heading, gps_accuracy, last_gps_update, live_tracking_enabled'
        )
        .in('id', vehicleIds.length ? vehicleIds : [NONE]),
    ]);
    const staffById = new Map(((staffRes.data ?? []) as StaffRow[]).map((s) => [s.id, s]));
    const vehById = new Map(((vehRes.data ?? []) as VehRow[]).map((v) => [v.id, v]));

    const result = resolved.map(({ d, route }) => {
      const veh = route.vehicle_id ? vehById.get(route.vehicle_id) : undefined;
      const s = d.staff_id ? staffById.get(d.staff_id) : undefined;
      const name = s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '—' : '—';

      const lat = veh?.current_latitude ?? null;
      const lng = veh?.current_longitude ?? null;
      const fresh = gpsFreshness(veh?.last_gps_update ?? null);
      const hasFix = lat != null && lng != null;
      const isLive = !!d.location_sharing_enabled && fresh.status === 'online';

      return {
        id: d.id,
        name,
        current_latitude: lat,
        current_longitude: lng,
        location_accuracy: veh?.gps_accuracy ?? null,
        location_timestamp: veh?.last_gps_update ?? null,
        last_location_update: veh?.last_gps_update ?? null,
        location_sharing_enabled: !!d.location_sharing_enabled,
        is_live: isLive,
        // Honest tri-state: sharing + fresh = active; sharing but stale = paused; off = inactive.
        location_tracking_status: !d.location_sharing_enabled ? 'inactive' : isLive ? 'active' : 'paused',
        route_id: route.id,
        route_number: route.route_number,
        route_name: route.route_name,
        vehicle_id: veh?.id ?? null,
        registration_number: veh?.registration_number ?? null,
        gps_status: fresh.status,
        time_since_update: fresh.minutes,
        location_status: hasFix ? 'vehicle_gps' : 'no_location',
        status_message: hasFix ? 'Live position from driver app' : 'No location data available',
      };
    });

    const timestamps = result
      .map((d) => d.last_location_update)
      .filter((t): t is string => !!t)
      .sort();
    return NextResponse.json({
      success: true,
      drivers: result,
      total: result.length,
      active_tracking: result.filter((d) => d.is_live).length,
      online_drivers: result.filter((d) => d.gps_status === 'online').length,
      freshest_update: timestamps.length ? timestamps[timestamps.length - 1] : null,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in track all drivers API:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
