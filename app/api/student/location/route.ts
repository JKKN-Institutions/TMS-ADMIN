import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { gpsFreshness } from '@/lib/gps/freshness';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** GET /api/student/location — last-known position of the vehicle on the learner's
 *  allocated route. Read-only "where's my bus". */
async function getStudentLocation(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const learner = await getLearnerRowForUser(auth);
    if (!learner) {
      return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });
    }
    if (!learner.transport_route_id) {
      return NextResponse.json({ success: true, data: { route: null, vehicle: null } });
    }

    const svc = createServiceRoleClient();
    const { data: route } = await svc
      .from('tms_route')
      .select('id, route_number, route_name, vehicle_id')
      .eq('id', learner.transport_route_id)
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
    console.error('student/location error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getStudentLocation(request, auth));
