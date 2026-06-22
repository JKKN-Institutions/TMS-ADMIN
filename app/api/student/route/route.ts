import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * GET the signed-in learner's allocated route (with ordered stops, driver name,
 * and vehicle). Self-scoped: the route is taken from the learner's own
 * transport_route_id, never a request param.
 */
interface RouteRow {
  id: string;
  route_number: string;
  route_name: string;
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
interface StopRow {
  id: string;
  stop_name: string;
  stop_time: string | null;
  evening_time: string | null;
  sequence_order: number | null;
  is_major_stop: boolean | null;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getMyRoute(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const learner = await getLearnerRowForUser(auth);
    if (!learner) {
      return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });
    }

    const boardingStopId = learner.transport_stop_id ?? null;
    if (!learner.transport_route_id) {
      return NextResponse.json({ success: true, data: { route: null, boardingStopId } });
    }

    const svc = createServiceRoleClient();

    const routeRes = await svc
      .from('tms_route')
      .select(
        'id, route_number, route_name, start_location, end_location, departure_time, arrival_time, distance, duration, fare, status, driver_id, vehicle_id'
      )
      .eq('id', learner.transport_route_id)
      .maybeSingle();
    const route = routeRes.data as RouteRow | null;
    if (!route) {
      return NextResponse.json({ success: true, data: { route: null, boardingStopId } });
    }

    const stopsRes = await svc
      .from('tms_route_stop')
      .select('id, stop_name, stop_time, evening_time, sequence_order, is_major_stop')
      .eq('route_id', route.id)
      .order('sequence_order', { ascending: true });
    const stops = (stopsRes.data ?? []) as StopRow[];

    let vehicle: { registrationNumber: string; model: string | null; capacity: number | null } | null = null;
    if (route.vehicle_id) {
      const v = await svc
        .from('tms_vehicle')
        .select('registration_number, model, capacity')
        .eq('id', route.vehicle_id)
        .maybeSingle();
      const vr = v.data as { registration_number: string; model: string | null; capacity: number | null } | null;
      if (vr) vehicle = { registrationNumber: vr.registration_number, model: vr.model, capacity: vr.capacity };
    }

    let driverName: string | null = null;
    if (route.driver_id) {
      // tms_route.driver_id is a loose ref and the admin route forms store the
      // driver's STAFF id (picker options come from /api/admin/drivers, whose ids
      // are staff ids). Resolve via staff directly, falling back to legacy rows
      // that stored tms_driver.id instead.
      let st = await svc.from('staff').select('first_name, last_name').eq('id', route.driver_id).maybeSingle();
      if (!st.data) {
        const drv = await svc.from('tms_driver').select('staff_id').eq('id', route.driver_id).maybeSingle();
        const staffId = (drv.data as { staff_id: string | null } | null)?.staff_id;
        if (staffId) {
          st = await svc.from('staff').select('first_name, last_name').eq('id', staffId).maybeSingle();
        }
      }
      const sr = st.data as { first_name: string | null; last_name: string | null } | null;
      if (sr) driverName = `${sr.first_name ?? ''} ${sr.last_name ?? ''}`.trim() || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        boardingStopId,
        route: {
          id: route.id,
          routeNumber: route.route_number,
          routeName: route.route_name,
          startLocation: route.start_location,
          endLocation: route.end_location,
          departureTime: route.departure_time,
          arrivalTime: route.arrival_time,
          distance: route.distance,
          duration: route.duration,
          fare: route.fare,
          status: route.status,
          driverName,
          vehicle,
          stops: stops.map((s) => ({
            id: s.id,
            name: s.stop_name,
            time: s.stop_time,
            eveningTime: s.evening_time,
            order: s.sequence_order,
            isMajor: s.is_major_stop,
          })),
        },
      },
    });
  } catch (e) {
    console.error('student/route error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getMyRoute(request, auth));
