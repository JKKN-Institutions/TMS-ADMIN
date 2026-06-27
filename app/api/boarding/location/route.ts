import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { gpsFreshness } from '@/lib/gps/freshness';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** GET /api/boarding/location — last-known position of the vehicle on the boarding
 *  staffer's assigned route. Read-only "where's my bus" for the boarding portal,
 *  scoped by getAssignedRouteIdsForUser (the same authority boundary the scanner
 *  uses). Mirrors /api/student/location's response shape so the page can reuse the
 *  student live-track UI. */
async function getBoardingLocation(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    // Route in scope: the staffer's assigned route (they have exactly one). A super
    // admin with no explicit assignment falls back to the first route, matching the
    // boarding dashboard, so the page stays testable.
    const routeIds = await getAssignedRouteIdsForUser(auth);
    let routeId: string | null = routeIds[0] ?? null;
    if (!routeId && auth.isSuperAdmin) {
      const { data: first } = await svc
        .from('tms_route')
        .select('id')
        .order('route_number', { ascending: true })
        .limit(1)
        .maybeSingle();
      routeId = (first as { id: string } | null)?.id ?? null;
    }
    if (!routeId) {
      return NextResponse.json({ success: true, data: { route: null, vehicle: null } });
    }

    const { data: route } = await svc
      .from('tms_route')
      .select('id, route_number, route_name, vehicle_id')
      .eq('id', routeId)
      .maybeSingle();
    if (!route) {
      return NextResponse.json({ success: true, data: { route: null, vehicle: null } });
    }

    let vehicle: {
      registrationNumber: string | null;
      model: string | null;
      latitude: number | null;
      longitude: number | null;
      speed: number | null;
      lastUpdate: string | null;
      liveTrackingEnabled: boolean;
      hasFix: boolean;
      status: 'online' | 'recent' | 'offline';
      minutesAgo: number | null;
    } | null = null;

    if (route.vehicle_id) {
      const { data: v } = await svc
        .from('tms_vehicle')
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, last_gps_update, live_tracking_enabled'
        )
        .eq('id', route.vehicle_id)
        .maybeSingle();
      if (v) {
        const fresh = gpsFreshness(v.last_gps_update);
        vehicle = {
          registrationNumber: v.registration_number,
          model: v.model,
          latitude: v.current_latitude,
          longitude: v.current_longitude,
          speed: v.gps_speed,
          lastUpdate: v.last_gps_update,
          liveTrackingEnabled: !!v.live_tracking_enabled,
          hasFix: v.current_latitude != null && v.current_longitude != null,
          status: fresh.status,
          minutesAgo: fresh.minutes,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, label: `${route.route_number ?? '?'} · ${route.route_name ?? ''}`.trim() },
        vehicle,
      },
    });
  } catch (e) {
    console.error('boarding/location error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getBoardingLocation(request, auth));
