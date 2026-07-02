import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { loadRoutePassengers, byStopThenName } from '@/lib/passengers/route-roster';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * GET /api/boarding/passengers — the full ASSIGNED passenger roster (bus-required
 * LEARNERS + active STAFF) for the boarding staffer's route(s). This is the static
 * allocation roster — distinct from /api/boarding/routes/[routeId]/roster, which is
 * the per-DAY booking + attendance roster. Mirrors the driver portal's
 * /api/driver/passengers via the shared loadRoutePassengers, so both portals'
 * passenger lists mean exactly the same thing; only route RESOLUTION differs
 * (boarding → tms_staff_route_assignment by email).
 */
async function getPassengers(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const routeIds = auth.isSuperAdmin
      ? []
      : await getAssignedRouteIdsForUser(auth);

    // A super admin isn't route-scoped; without an assignment there are no
    // passengers to show (the portal layout already blocks unassigned staff).
    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, data: { totalPassengers: 0, passengers: [] } });
    }

    const svc = createServiceRoleClient();

    // stopId → boarding sequence, so the roster sorts in boarding order.
    const { data: stops } = await svc
      .from('tms_route_stop')
      .select('id, sequence_order')
      .in('route_id', routeIds);
    const stopOrder = new Map<string, number | null>(
      ((stops ?? []) as { id: string; sequence_order: number | null }[]).map((s) => [s.id, s.sequence_order])
    );

    const passengers = (await loadRoutePassengers(svc, routeIds, stopOrder)).sort(byStopThenName);

    return NextResponse.json({
      success: true,
      data: { totalPassengers: passengers.length, passengers },
    });
  } catch (e) {
    console.error('boarding/passengers error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_request: NextRequest, auth) => getPassengers(auth));
