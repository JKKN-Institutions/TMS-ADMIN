import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { classifyRouteStatus, type TrackingState } from '@/lib/gps/route-status';
import { haversineKm } from '@/lib/gps/distance';
import { CAMPUS } from '@/lib/gps/campus';

/**
 * GET /api/admin/track-all/routes — the admin fleet-health read.
 *
 * ROUTE-CENTRIC on purpose. The endpoint this replaces started from tms_driver and
 * kept only drivers that resolved to a route, so routes with no driver never
 * appeared at all and the page silently showed 2 of 24 routes. Starting from
 * tms_route and LEFT JOINing driver + vehicle is what makes "every route accounted
 * for" possible.
 *
 * The route -> driver link is resolved in BOTH directions, because the app writes it
 * in two places: tms_route.driver_id (Routes -> Edit, holds a staff id) and
 * tms_driver.active_route_id / assigned_route_id (Drivers -> Edit). Honouring only
 * one made drivers assigned via the other screen invisible.
 */

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

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
  current_latitude: number | null;
  current_longitude: number | null;
  gps_speed: number | null;
  gps_heading: number | null;
  gps_accuracy: number | null;
  last_gps_update: string | null;
};

const NONE = '00000000-0000-0000-0000-000000000000';
const uniq = (arr: (string | null)[]): string[] =>
  Array.from(new Set(arr.filter((v): v is string => !!v)));

async function handler(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    // Both tables are tiny (24 routes, 31 drivers), so fetch whole and join in JS —
    // the same shape the endpoint this replaces used.
    const [routesRes, driversRes] = await Promise.all([
      svc.from('tms_route').select('id, route_number, route_name, vehicle_id, driver_id'),
      svc
        .from('tms_driver')
        .select('id, staff_id, location_sharing_enabled, active_route_id, assigned_route_id'),
    ]);
    if (routesRes.error) throw routesRes.error;
    if (driversRes.error) throw driversRes.error;

    const routes = (routesRes.data ?? []) as RouteRow[];
    const drivers = (driversRes.data ?? []) as DriverRow[];

    const staffIds = uniq(drivers.map((d) => d.staff_id));
    const vehicleIds = uniq(routes.map((r) => r.vehicle_id));

    const [staffRes, vehRes] = await Promise.all([
      svc
        .from('staff')
        .select('id, first_name, last_name')
        .in('id', staffIds.length ? staffIds : [NONE]),
      svc
        .from('tms_vehicle')
        .select(
          'id, registration_number, current_latitude, current_longitude, gps_speed, gps_heading, gps_accuracy, last_gps_update',
        )
        .in('id', vehicleIds.length ? vehicleIds : [NONE]),
    ]);
    const staffById = new Map(((staffRes.data ?? []) as StaffRow[]).map((s) => [s.id, s]));
    const vehById = new Map(((vehRes.data ?? []) as VehRow[]).map((v) => [v.id, v]));

    // routeId -> driver, in the same precedence the driver's own broadcast uses:
    // active_route_id beats assigned_route_id beats tms_route.driver_id.
    const driverByRoute = new Map<string, DriverRow>();
    for (const d of drivers) {
      if (d.active_route_id) driverByRoute.set(d.active_route_id, d);
    }
    for (const d of drivers) {
      if (d.assigned_route_id && !driverByRoute.has(d.assigned_route_id)) {
        driverByRoute.set(d.assigned_route_id, d);
      }
    }
    const driverByStaffId = new Map(drivers.filter((d) => d.staff_id).map((d) => [d.staff_id!, d]));
    for (const r of routes) {
      if (!r.driver_id || driverByRoute.has(r.id)) continue;
      const d = driverByStaffId.get(r.driver_id);
      if (d) driverByRoute.set(r.id, d);
    }

    const nowMs = Date.now();

    const result = routes.map((r) => {
      const d = driverByRoute.get(r.id) ?? null;
      const veh = r.vehicle_id ? vehById.get(r.vehicle_id) ?? null : null;
      const s = d?.staff_id ? staffById.get(d.staff_id) : undefined;
      const driverName = s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() : '';

      const lat = veh?.current_latitude ?? null;
      const lng = veh?.current_longitude ?? null;
      const position = lat != null && lng != null ? { lat, lng } : null;

      const status = classifyRouteStatus({
        hasDriver: d !== null,
        hasVehicle: veh !== null,
        sharing: !!d?.location_sharing_enabled,
        lastFixAt: veh?.last_gps_update ?? null,
        nowMs,
      });

      const fixHref =
        status.state === 'off' || status.state === 'stuck' || status.state === 'paused'
          ? d
            ? `/drivers/${d.id}/edit`
            : null
          : status.state === 'no_vehicle' ||
              status.state === 'no_driver' ||
              status.state === 'unconfigured'
            ? `/routes/${r.id}/edit`
            : null;

      return {
        routeId: r.id,
        routeNumber: r.route_number,
        routeName: r.route_name,
        driver: d ? { id: d.id, name: driverName || '—' } : null,
        vehicle: veh ? { id: veh.id, registrationNumber: veh.registration_number } : null,
        position,
        heading: veh?.gps_heading ?? null,
        // gps_speed is GeolocationCoordinates.speed in METRES PER SECOND. Convert
        // once here so no consumer can forget and print a wrong number.
        speedKmh: veh?.gps_speed != null ? veh.gps_speed * 3.6 : null,
        accuracyM: veh?.gps_accuracy ?? null,
        distanceToCampusKm: position ? haversineKm(position, CAMPUS) : null,
        lastFixAt: veh?.last_gps_update ?? null,
        sharing: !!d?.location_sharing_enabled,
        state: status.state,
        label: status.label,
        reason: status.reason,
        tone: status.tone,
        fixHref,
        canNudge: status.canNudge,
      };
    });

    const count = (st: TrackingState) => result.filter((x) => x.state === st).length;
    const summary = {
      total: result.length,
      trackable: result.filter((x) => x.driver !== null && x.vehicle !== null).length,
      reporting: count('live') + count('recent'),
      live: count('live'),
      recent: count('recent'),
      paused: count('paused'),
      stuck: count('stuck'),
      off: count('off'),
      noVehicle: count('no_vehicle'),
      noDriver: count('no_driver'),
      unconfigured: count('unconfigured'),
    };

    return NextResponse.json({ success: true, summary, routes: result });
  } catch (error) {
    console.error('track-all/routes GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handler(request, auth));
