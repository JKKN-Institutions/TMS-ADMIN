import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { loadTrackingSettings } from '@/lib/tracking/settings';
import {
  expireStaleTrips,
  getActiveTripForDriver,
  TRIP_SELECT,
  type TripRow,
} from '@/lib/tracking/trips';
import { deriveDirection, liveStatus, type TripDirection } from '@/lib/tracking/trip-state';
import { istMinutesOfDay } from '@/lib/boarding/attendance-window';
import { istToday } from '@/lib/booking/window';
import { preTripGate } from '@/lib/tracking/pre-trip-check';
import {
  getTodayChecksByVehicle,
  linkCheckToTrip,
  lookupTodayCheck,
} from '@/lib/tracking/pre-trip-check-repo';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Postgres unique_violation — raised by the active-trip partial indexes. */
const UNIQUE_VIOLATION = '23505';

/**
 * GET /api/driver/trips — the signed-in driver's active trip (or null), plus the
 * routes they may start one on.
 *
 * Runs expiry first so a trip abandoned with the browser closed reports as ended here
 * rather than lingering as "active" forever.
 */
async function getActive(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_TRIP_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const svc = createServiceRoleClient();
    const settings = await loadTrackingSettings(svc);
    await expireStaleTrips(svc, settings);

    const trip = await getActiveTripForDriver(svc, drv.id);
    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const route = trip ? routes.find((r) => r.id === trip.route_id) ?? null : null;

    // Today's pre-trip checks, so the screen can show the check before START TRIP.
    // null = the check table is not deployed yet (the screen then skips it). A read
    // failure must not take the whole trip screen down: the server-side gate in POST
    // still asks for the check, and the screen opens the form on that answer.
    const checks = await getTodayChecksByVehicle(svc, drv.id, istToday()).catch((e) => {
      console.error('driver/trips GET pre-trip lookup failed (non-fatal):', e);
      return null;
    });
    const preTrip = {
      enabled: checks !== null,
      doneVehicleIds: checks ? [...checks.keys()] : [],
    };

    return NextResponse.json({
      success: true,
      data: {
        trip,
        route,
        routes,
        preTrip,
        status: trip
          ? liveStatus({
              tripStatus: trip.status,
              lastFixAt: trip.last_fix_at,
              nowMs: Date.now(),
              liveMaxSec: settings.liveMaxSec,
              staleMaxSec: settings.staleMaxSec,
            })
          : null,
      },
    });
  } catch (e) {
    console.error('driver/trips GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface StartBody {
  routeId?: unknown;
  direction?: unknown;
}

/** POST /api/driver/trips — start a trip on one of THIS driver's routes. */
async function startTrip(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_TRIP_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as StartBody | null;
    const routeId = typeof body?.routeId === 'string' ? body.routeId : null;
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });

    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const svc = createServiceRoleClient();
    const settings = await loadTrackingSettings(svc);
    // Clear abandoned sessions before the unique index can reject this start on behalf
    // of a trip that should already have ended.
    await expireStaleTrips(svc, settings);

    // Authorization: the route must be assigned to THIS driver. Never trust the body.
    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const route = routes.find((r) => r.id === routeId);
    if (!route) {
      return NextResponse.json({ error: 'Route not assigned to this driver' }, { status: 403 });
    }
    if (!route.vehicleId) {
      return NextResponse.json({ error: 'No vehicle assigned to this route' }, { status: 422 });
    }

    // The daily pre-trip check: the first trip of the day on this bus cannot start
    // until the driver has done it. Later trips the same day reuse the same check.
    // Enforced HERE, not only on the screen, so a refresh or an old cached page cannot
    // skip it. See lib/tracking/pre-trip-check.ts for the rule.
    const gate = preTripGate(await lookupTodayCheck(svc, drv.id, route.vehicleId, istToday()));
    if (!gate.allow) {
      return NextResponse.json(
        {
          error: 'Do the pre-trip check before starting your first trip today.',
          code: gate.reason,
          data: { routeId, vehicleId: route.vehicleId },
        },
        // 428, not 409: the page already treats 409 as "a trip is live, adopt it".
        // An older cached page that does not know this code shows the error text.
        { status: 428 }
      );
    }

    const direction: TripDirection =
      body?.direction === 'onward' || body?.direction === 'return'
        ? body.direction
        : deriveDirection(istMinutesOfDay(new Date()), route.arrivalTime);

    const nowIso = new Date().toISOString();
    const { data, error } = await svc
      .from('tms_trip')
      .insert({
        route_id: routeId,
        driver_id: drv.id,
        vehicle_id: route.vehicleId,
        direction,
        status: 'active',
        started_at: nowIso,
        created_by: auth.userId,
      })
      .select(TRIP_SELECT)
      .single();

    if (error) {
      // A trip is already live for this route, driver, or bus. Hand the caller the
      // existing trip so the UI can offer "resume" instead of a dead end.
      if (error.code === UNIQUE_VIOLATION) {
        const existing = await getActiveTripForDriver(svc, drv.id);
        return NextResponse.json(
          { error: 'A trip is already active', data: { trip: existing } },
          { status: 409 }
        );
      }
      throw error;
    }

    const trip = data as unknown as TripRow;
    if (gate.checkId) await linkCheckToTrip(svc, gate.checkId, trip.id);

    await svc
      .from('tms_driver')
      .update({
        location_sharing_enabled: true,
        active_route_id: routeId,
        location_sharing_started_at: nowIso,
      })
      .eq('id', drv.id);

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'activate',
      entityType: 'tms_trip',
      entityId: trip.id,
      entityLabel: route.label,
      description: `Driver started a ${direction} trip on route ${route.label}`,
      metadata: { routeId, vehicleId: route.vehicleId, direction },
    });

    return NextResponse.json({ success: true, data: { trip, route } }, { status: 201 });
  } catch (e) {
    console.error('driver/trips POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getActive(request, auth));
export const POST = withAuth((request, auth) => startTrip(request, auth));
