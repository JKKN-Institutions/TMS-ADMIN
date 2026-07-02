import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { loadRoutePassengers, byStopThenName } from '@/lib/passengers/route-roster';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * GET /api/driver/passengers — the bus-required passengers (actively-enrolled
 * LEARNERS + active STAFF) allocated to the signed-in driver's route(s), grouped
 * per route and ordered by stop sequence. Reuses the Passenger module's mappers +
 * loadPassengerRefs so the roster definition stays consistent with the admin
 * Passenger pages; each row is tagged with `type` ('learner' | 'staff').
 */
async function getPassengers(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);
    const routeIds = routes.map((r) => r.id);
    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, data: { totalPassengers: 0, routes: [] } });
    }

    const svc = createServiceRoleClient();

    // stopId → boarding sequence, for sorting each route's roster.
    const stopOrder = new Map<string, number | null>();
    for (const rt of routes) for (const s of rt.stops) stopOrder.set(s.id, s.order);

    // Merged learner + staff roster (shared with the boarding portal).
    const allPax = await loadRoutePassengers(svc, routeIds, stopOrder);

    const result = routes.map((rt) => ({
      id: rt.id,
      label: rt.label,
      passengers: allPax.filter((p) => p.routeId === rt.id).sort(byStopThenName),
    }));

    return NextResponse.json({
      success: true,
      data: { totalPassengers: allPax.length, routes: result },
    });
  } catch (e) {
    console.error('driver/passengers error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getPassengers(request, auth));
