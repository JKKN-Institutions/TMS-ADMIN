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

/** GET /api/admin/track-all/drivers — live positions for the admin Track-All map, read
 *  from the tms_ plane (the legacy drivers/routes/vehicles tables were dropped). Emits
 *  the same DriverLocation[] shape the Leaflet map + page already consume. */
export async function GET() {
  try {
    const { data: routesData, error: routesErr } = await supabase
      .from('tms_route')
      .select('id, route_number, route_name, vehicle_id, driver_id')
      .not('driver_id', 'is', null);
    if (routesErr) throw routesErr;
    const routes = (routesData ?? []) as RouteRow[];

    const staffIds = [...new Set(routes.map((r) => r.driver_id).filter(Boolean))] as string[];
    const vehicleIds = [...new Set(routes.map((r) => r.vehicle_id).filter(Boolean))] as string[];

    const [driversRes, staffRes, vehRes] = await Promise.all([
      supabase
        .from('tms_driver')
        .select('id, staff_id, location_sharing_enabled, active_route_id')
        .in('staff_id', staffIds.length ? staffIds : [NONE]),
      supabase.from('staff').select('id, first_name, last_name').in('id', staffIds.length ? staffIds : [NONE]),
      supabase
        .from('tms_vehicle')
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, gps_heading, gps_accuracy, last_gps_update, live_tracking_enabled'
        )
        .in('id', vehicleIds.length ? vehicleIds : [NONE]),
    ]);

    const drivers = (driversRes.data ?? []) as DriverRow[];
    const staffById = new Map(((staffRes.data ?? []) as StaffRow[]).map((s) => [s.id, s]));
    const vehById = new Map(((vehRes.data ?? []) as VehRow[]).map((v) => [v.id, v]));

    const routesByStaff = new Map<string, RouteRow[]>();
    for (const r of routes) {
      if (!r.driver_id) continue;
      const arr = routesByStaff.get(r.driver_id) ?? [];
      arr.push(r);
      routesByStaff.set(r.driver_id, arr);
    }

    const result = drivers.map((d) => {
      const drvRoutes = d.staff_id ? routesByStaff.get(d.staff_id) ?? [] : [];
      const route = drvRoutes.find((r) => r.id === d.active_route_id) ?? drvRoutes[0] ?? null;
      const veh = route?.vehicle_id ? vehById.get(route.vehicle_id) : undefined;
      const s = d.staff_id ? staffById.get(d.staff_id) : undefined;
      const name = s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '—' : '—';

      const lat = veh?.current_latitude ?? null;
      const lng = veh?.current_longitude ?? null;
      const fresh = gpsFreshness(veh?.last_gps_update ?? null);
      const hasFix = lat != null && lng != null;

      return {
        id: d.id,
        name,
        current_latitude: lat,
        current_longitude: lng,
        location_accuracy: veh?.gps_accuracy ?? null,
        location_timestamp: veh?.last_gps_update ?? null,
        last_location_update: veh?.last_gps_update ?? null,
        location_sharing_enabled: !!d.location_sharing_enabled,
        location_tracking_status: d.location_sharing_enabled ? 'active' : 'inactive',
        route_id: route?.id ?? null,
        route_number: route?.route_number ?? null,
        route_name: route?.route_name ?? null,
        vehicle_id: veh?.id ?? null,
        registration_number: veh?.registration_number ?? null,
        gps_status: fresh.status,
        time_since_update: fresh.minutes,
        location_status: hasFix ? 'vehicle_gps' : 'no_location',
        status_message: hasFix ? 'Live position from driver app' : 'No location data available',
      };
    });

    return NextResponse.json({
      success: true,
      drivers: result,
      total: result.length,
      active_tracking: result.filter((d) => d.location_sharing_enabled).length,
      online_drivers: result.filter((d) => d.gps_status === 'online').length,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in track all drivers API:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
