import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { TRIP_SELECT, type TripRow } from '@/lib/tracking/trips';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * POST /api/driver/trips/:tripId/end — the driver ends their own trip.
 *
 * Ownership is resolved from the session, never from the URL: every query is filtered
 * on this driver's id, so a driver who edits the tripId gets 404 rather than ending
 * — or learning anything about — someone else's trip.
 */
async function endTrip(request: NextRequest, auth: AuthContext, tripId: string) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_TRIP_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const svc = createServiceRoleClient();

    // Scoped to this driver so a foreign tripId reveals nothing about another bus.
    const { data: tripRow } = await svc
      .from('tms_trip')
      .select('vehicle_id')
      .eq('id', tripId)
      .eq('driver_id', drv.id)
      .maybeSingle();
    if (!tripRow) {
      return NextResponse.json({ error: 'No active trip found for this driver' }, { status: 404 });
    }
    const vehicleId = (tripRow as { vehicle_id: string }).vehicle_id;

    // Final position for the trip summary, read before we close the row.
    const { data: veh } = await svc
      .from('tms_vehicle')
      .select('current_latitude, current_longitude')
      .eq('id', vehicleId)
      .maybeSingle();
    const lastPos = veh as { current_latitude: number | null; current_longitude: number | null } | null;

    const nowIso = new Date().toISOString();
    const { data, error } = await svc
      .from('tms_trip')
      .update({
        status: 'completed',
        ended_at: nowIso,
        end_reason: 'driver',
        end_latitude: lastPos?.current_latitude ?? null,
        end_longitude: lastPos?.current_longitude ?? null,
        updated_at: nowIso,
      })
      .eq('id', tripId)
      .eq('driver_id', drv.id) // ownership guard
      .eq('status', 'active')
      .select(TRIP_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'No active trip found for this driver' }, { status: 404 });
    }
    const trip = data as unknown as TripRow;

    await svc
      .from('tms_driver')
      .update({
        location_sharing_enabled: false,
        active_route_id: null,
        location_sharing_started_at: null,
      })
      .eq('id', drv.id);

    await svc.from('tms_vehicle').update({ live_tracking_enabled: false }).eq('id', trip.vehicle_id);

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'deactivate',
      entityType: 'tms_trip',
      entityId: trip.id,
      description: `Driver ended a trip after ${trip.fix_count} fixes over ${Number(
        trip.distance_km
      ).toFixed(1)} km`,
      metadata: { routeId: trip.route_id, distanceKm: trip.distance_km, fixCount: trip.fix_count },
    });

    return NextResponse.json({ success: true, data: { trip } });
  } catch (e) {
    console.error('driver/trips/[tripId]/end POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth(async (request, auth) => {
  // withAuth wraps (request) => …, so the dynamic segment is read from the URL rather
  // than from Next's async `params` argument.
  const segments = new URL(request.url).pathname.split('/');
  const tripId = segments[segments.indexOf('trips') + 1] ?? '';
  if (!tripId || tripId === 'end') {
    return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
  }
  return endTrip(request, auth, tripId);
});
