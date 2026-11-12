import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/auth/require-perm';
import { selectIn, staffName } from '@/lib/route-check/admin';
import { istToday } from '@/lib/booking/window';
import {
  buildDayRows, dayTotals, parseCheckDate, resolveCheckRoute, toAdminRow,
  type DayRoute, type ExpectedBus,
} from '@/lib/tracking/pre-trip-admin';

/** Every column except the photo path, which never leaves the server. */
const SELECT =
  'id, check_date, created_at, driver_id, vehicle_id, trip_id, skipped, skip_reason, tyres_ok, brakes_ok, lights_ok, horn_ok, fuel_level_ok, first_aid_box_ok, odometer_km, odometer_photo_path, any_issue, notes';

type DbRow = Parameters<typeof toAdminRow>[0];
type RouteDb = {
  id: string;
  route_number: string | null;
  route_name: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
};
type DriverDb = { id: string; staff_id: string | null; assigned_route_id: string | null };

/**
 * GET /api/admin/pre-trip-checks?date=YYYY-MM-DD&issues=1
 *
 * The day's pre-trip checks, bus by bus, for one IST date (default today):
 * every check with its route, plus a "Not done" line for each active route
 * that has a bus but no check that day. issues=1 keeps only the lines with a
 * NOT OK or a skip. Gated on tms.dashboard.view — the same permission as the
 * table's read policy (held by transport_head; super admins pass). The photo
 * path is replaced by hasPhoto; the photo itself is only reachable through
 * /api/admin/pre-trip-checks/<id>/photo.
 *
 * "Not done" uses the route, bus and driver assignments as they are NOW; past
 * assignments are not stored.
 */
async function listChecks(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DASHBOARD_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const today = istToday();
    const date = parseCheckDate(sp.get('date'), today);
    const issuesOnly = sp.get('issues') === '1';

    const svc = createServiceRoleClient();
    const [checksRes, routesRes, driversRes] = await Promise.all([
      svc.from('tms_pre_trip_check').select(SELECT).eq('check_date', date).order('created_at', { ascending: false }),
      svc.from('tms_route').select('id, route_number, route_name, vehicle_id, driver_id').eq('status', 'active'),
      svc.from('tms_driver').select('id, staff_id, assigned_route_id'),
    ]);
    if (checksRes.error) throw checksRes.error;
    if (routesRes.error) throw routesRes.error;
    if (driversRes.error) throw driversRes.error;
    const rows = (checksRes.data ?? []) as unknown as DbRow[];
    const routesDb = (routesRes.data ?? []) as unknown as RouteDb[];
    const drivers = (driversRes.data ?? []) as unknown as DriverDb[];

    const driverById = new Map(drivers.map((d) => [d.id, d]));
    // A route's driver comes from either admin screen (see lib/driver/routes).
    const assignedStaffByRoute = new Map<string, string>();
    for (const d of drivers) {
      if (d.assigned_route_id && d.staff_id && !assignedStaffByRoute.has(d.assigned_route_id)) {
        assignedStaffByRoute.set(d.assigned_route_id, d.staff_id);
      }
    }
    const routes: DayRoute[] = routesDb.map((r) => ({
      id: r.id,
      routeNumber: r.route_number,
      routeName: r.route_name,
      vehicleId: r.vehicle_id,
      driverStaffId: r.driver_id ?? assignedStaffByRoute.get(r.id) ?? null,
    }));

    const [staff, vehicles, trips] = await Promise.all([
      selectIn<{ id: string; first_name: string | null; last_name: string | null }>(
        svc,
        'staff',
        'id, first_name, last_name',
        'id',
        [
          ...rows.map((r) => driverById.get(r.driver_id)?.staff_id ?? ''),
          ...routes.map((r) => r.driverStaffId ?? ''),
        ]
      ),
      selectIn<{ id: string; registration_number: string | null }>(
        svc,
        'tms_vehicle',
        'id, registration_number',
        'id',
        [...rows.map((r) => r.vehicle_id), ...routes.map((r) => r.vehicleId ?? '')]
      ),
      selectIn<{ id: string; route_id: string | null }>(
        svc,
        'tms_trip',
        'id, route_id',
        'id',
        rows.map((r) => r.trip_id ?? '')
      ),
    ]);
    const staffById = new Map(staff.map((s) => [s.id, staffName(s)]));
    const regByVehicle = new Map(vehicles.map((v) => [v.id, v.registration_number]));
    const tripRouteId = new Map(trips.filter((t) => t.route_id).map((t) => [t.id, t.route_id as string]));

    const checks = rows.map((r) => {
      const staffId = driverById.get(r.driver_id)?.staff_id ?? null;
      return {
        check: toAdminRow(r, {
          driverName: staffId ? staffById.get(staffId) ?? null : null,
          busRegistration: regByVehicle.get(r.vehicle_id) ?? null,
        }),
        route: resolveCheckRoute({ tripId: r.trip_id, vehicleId: r.vehicle_id, driverStaffId: staffId }, tripRouteId, routes),
      };
    });

    const expected: ExpectedBus[] = routes
      .filter((r) => r.vehicleId)
      .map((r) => ({
        route: r,
        busRegistration: regByVehicle.get(r.vehicleId as string) ?? null,
        driverName: r.driverStaffId ? staffById.get(r.driverStaffId) || null : null,
      }));

    const all = buildDayRows(checks, expected);
    const totals = dayTotals(all);

    return NextResponse.json({
      success: true,
      data: {
        date,
        today,
        totals: { ...totals, all: totals.checked, flagged: totals.issue + totals.skipped },
        rows: issuesOnly ? all.filter((r) => r.status === 'issue' || r.status === 'skipped') : all,
      },
    });
  } catch (e) {
    console.error('admin/pre-trip-checks GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => listChecks(request, auth));
