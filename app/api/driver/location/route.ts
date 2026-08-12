import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { normalizeCapturedAt, isNewerCapture } from '@/lib/driver/tracking';
import { loadTrackingSettings } from '@/lib/tracking/settings';
import { expireStaleTrips, getActiveTripForDriver } from '@/lib/tracking/trips';
import { shouldAcceptFix, distanceIncrementKm } from '@/lib/tracking/trip-state';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** GET /api/driver/location — last-known GPS fix of the vehicle on each of the driver's
 *  route(s). Read-only "where's my bus"; vehicles with no live fix return null coords. */
async function getLocation(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);
    const vehicleIds = [...new Set(routes.map((r) => r.vehicleId).filter(Boolean))] as string[];

    type VehicleRow = {
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
    const vmap = new Map<string, VehicleRow>();
    if (vehicleIds.length > 0) {
      const svc = createServiceRoleClient();
      const vres = await svc
        .from('tms_vehicle')
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, gps_heading, gps_accuracy, last_gps_update, live_tracking_enabled'
        )
        .in('id', vehicleIds);
      for (const v of (vres.data ?? []) as VehicleRow[]) vmap.set(v.id, v);
    }

    const data = routes.map((r) => {
      const v = r.vehicleId ? vmap.get(r.vehicleId) : undefined;
      const hasFix = !!v && v.current_latitude != null && v.current_longitude != null;
      return {
        id: r.id,
        label: r.label,
        vehicle: v
          ? {
              registrationNumber: v.registration_number,
              model: v.model,
              latitude: v.current_latitude,
              longitude: v.current_longitude,
              speed: v.gps_speed,
              heading: v.gps_heading,
              accuracyM: v.gps_accuracy,
              lastUpdate: v.last_gps_update,
              liveTrackingEnabled: !!v.live_tracking_enabled,
              hasFix,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, data: { routes: data } });
  } catch (e) {
    console.error('driver/location GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface PingBody {
  routeId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  speed?: unknown;
  heading?: unknown;
  accuracy?: unknown;
  capturedAt?: unknown;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** POST /api/driver/location — the driver's phone broadcasts a GPS fix for the route it
 *  is actively driving. Updates the vehicle's cached fix + appends a ping row. */
async function postLocation(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_SHARE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as PingBody | null;
    const routeId = typeof body?.routeId === 'string' ? body.routeId : null;
    const latitude = num(body?.latitude);
    const longitude = num(body?.longitude);
    if (!routeId || latitude === null || longitude === null) {
      return NextResponse.json({ error: 'routeId, latitude, longitude are required' }, { status: 400 });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 });
    }
    const speed = num(body?.speed);
    const heading = num(body?.heading);
    const accuracy = num(body?.accuracy);

    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const svc = createServiceRoleClient();

    const settings = await loadTrackingSettings(svc);
    await expireStaleTrips(svc, settings);

    // Tracking is bound to an explicit trip: no active trip means no position is
    // stored. This is what makes "the driver must start tracking" enforceable rather
    // than merely a UI convention.
    const trip = await getActiveTripForDriver(svc, drv.id);
    if (!trip) {
      return NextResponse.json({ error: 'No active trip' }, { status: 409 });
    }
    if (trip.route_id !== routeId) {
      return NextResponse.json({ error: 'Route does not match the active trip' }, { status: 403 });
    }

    // Quality gate: a wildly inaccurate fix would teleport every reader's marker and
    // inflate trip distance. Accepted-but-ignored rather than an error — the phone
    // should keep trying, not treat this as a failure.
    if (!shouldAcceptFix(accuracy, settings.minAccuracyM)) {
      return NextResponse.json({
        success: true,
        data: { accepted: false, advanced: false, tripId: trip.id, rejectedReason: 'accuracy' },
      });
    }

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const route = routes.find((r) => r.id === routeId);
    if (!route) {
      return NextResponse.json({ error: 'Route not assigned to this driver' }, { status: 403 });
    }
    if (!route.vehicleId) {
      return NextResponse.json({ error: 'No vehicle assigned to this route' }, { status: 422 });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    // Capture time of this fix (client-supplied, validated). Drives the monotonic
    // guard below; falls back to server-now for old client bundles.
    const capturedIso = normalizeCapturedAt(body?.capturedAt, nowIso, nowMs);

    // Monotonic guard: only advance the vehicle's live position when THIS fix was
    // captured later than the one already stored. Ordering keys off the DEVICE
    // capture time (last_capture_at); a frozen/duplicate session re-sending an old
    // fix (watchPosition stopped, send-interval alive) is rejected here, so it can't
    // drag every reader's marker back to a stale point under tms_vehicle
    // last-write-wins. last_gps_update is stamped separately with server-receipt
    // time so freshness reads aren't at the mercy of a skewed phone clock.
    const { data: veh } = await svc
      .from('tms_vehicle')
      .select('last_capture_at')
      .eq('id', route.vehicleId)
      .maybeSingle();
    const advanced = isNewerCapture((veh?.last_capture_at as string | null) ?? null, capturedIso);

    if (advanced) {
      await svc
        .from('tms_vehicle')
        .update({
          current_latitude: latitude,
          current_longitude: longitude,
          gps_speed: speed,
          gps_heading: heading,
          gps_accuracy: accuracy,
          last_gps_update: nowIso,        // server-receipt time → drives reader freshness
          last_capture_at: capturedIso,   // device capture time → ordering baseline
          live_tracking_enabled: true,
          gps_provider: 'driver_app',
        })
        .eq('id', route.vehicleId);

      // Log only fixes that actually moved the position forward — keeps the ping
      // history free of the frozen-re-send duplicates that were polluting it.
      await svc.from('gps_location_history').insert({
        vehicle_id: route.vehicleId,
        trip_id: trip.id,
        latitude,
        longitude,
        speed,
        heading,
        accuracy,
        source: 'driver_app',
        timestamp: capturedIso,
      });

      // Trip odometer. distanceIncrementKm discards sub-20m jitter, so a parked bus
      // does not accumulate phantom kilometres over a three-hour trip. The previous
      // point is the trip's own end_* pair, which tracks the newest accepted fix.
      const prev =
        trip.end_latitude != null && trip.end_longitude != null
          ? { lat: Number(trip.end_latitude), lng: Number(trip.end_longitude) }
          : null;
      const increment = distanceIncrementKm(prev, { lat: latitude, lng: longitude });

      await svc
        .from('tms_trip')
        .update({
          last_fix_at: nowIso,
          fix_count: trip.fix_count + 1,
          distance_km: Number(trip.distance_km) + increment,
          // start_* is stamped once, on the first fix of the trip.
          ...(trip.start_latitude == null
            ? { start_latitude: latitude, start_longitude: longitude }
            : {}),
          end_latitude: latitude,
          end_longitude: longitude,
          updated_at: nowIso,
        })
        .eq('id', trip.id);
    }

    await svc
      .from('tms_driver')
      .update({ location_sharing_enabled: true, active_route_id: routeId })
      .eq('id', drv.id);

    // Session start is stamped and audited by POST /api/driver/trips, so the
    // every-6s pings no longer need to detect the on-duty transition themselves.

    return NextResponse.json({
      success: true,
      data: { accepted: true, advanced, tripId: trip.id },
    });
  } catch (e) {
    console.error('driver/location POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/driver/location — driver goes off duty; stop broadcasting and mark the
 *  driver's route vehicles not-live (the last fix remains but ages out of "online"). */
async function stopLocation(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_SHARE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }
    const svc = createServiceRoleClient();

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const vehicleIds = [...new Set(routes.map((r) => r.vehicleId).filter(Boolean))] as string[];
    if (vehicleIds.length > 0) {
      await svc.from('tms_vehicle').update({ live_tracking_enabled: false }).in('id', vehicleIds);
    }

    // Ending the broadcast ends the trip: the two must never disagree, or the fleet
    // view would show an active trip for a driver who has gone off duty.
    const stoppedIso = new Date().toISOString();
    await svc
      .from('tms_trip')
      .update({
        status: 'completed',
        ended_at: stoppedIso,
        end_reason: 'driver',
        updated_at: stoppedIso,
      })
      .eq('driver_id', drv.id)
      .eq('status', 'active');

    await svc
      .from('tms_driver')
      .update({ location_sharing_enabled: false, active_route_id: null, location_sharing_started_at: null })
      .eq('id', drv.id);

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'deactivate',
      entityType: 'tms_driver',
      entityId: drv.id,
      description: 'Driver stopped live location sharing',
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('driver/location DELETE error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getLocation(request, auth));
export const POST = withAuth((request, auth) => postLocation(request, auth));
export const DELETE = withAuth((request, auth) => stopLocation(request, auth));
