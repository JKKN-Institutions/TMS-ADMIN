import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { getRouteStaffRows } from '@/lib/passengers/route-roster';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** GET /api/driver/routes — the signed-in driver's assigned route(s) + timetable + vehicle. */
async function getRoutes(_request: NextRequest, auth: AuthContext) {
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
    const svc = createServiceRoleClient();

    // Attach a small vehicle summary per route (registration / model / capacity).
    const vehicleIds = [...new Set(routes.map((r) => r.vehicleId).filter(Boolean))] as string[];
    const vehicleMap = new Map<string, { registration_number: string | null; model: string | null; capacity: number | null }>();
    if (vehicleIds.length > 0) {
      const vres = await svc
        .from('tms_vehicle')
        .select('id, registration_number, model, capacity')
        .in('id', vehicleIds);
      for (const v of (vres.data ?? []) as Array<{ id: string; registration_number: string | null; model: string | null; capacity: number | null }>) {
        vehicleMap.set(v.id, { registration_number: v.registration_number, model: v.model, capacity: v.capacity });
      }
    }

    // Allocated rider count per route = LEARNERS + STAFF (same roster definition
    // as /api/driver/passengers). tms_route.current_passengers is stale (0
    // everywhere), so we count the real allocation.
    const paxByRoute = new Map<string, number>();
    if (routeIds.length > 0) {
      const [lres, staffRows] = await Promise.all([
        svc
          .from('learners_profiles')
          .select('transport_route_id')
          .in('transport_route_id', routeIds)
          .eq('bus_required', true)
          .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES]),
        getRouteStaffRows(svc, routeIds),
      ]);
      for (const row of (lres.data ?? []) as Array<{ transport_route_id: string | null }>) {
        if (!row.transport_route_id) continue;
        paxByRoute.set(row.transport_route_id, (paxByRoute.get(row.transport_route_id) ?? 0) + 1);
      }
      for (const s of staffRows) {
        if (!s.transport_route_id) continue;
        paxByRoute.set(s.transport_route_id, (paxByRoute.get(s.transport_route_id) ?? 0) + 1);
      }
    }

    const data = routes.map((r) => {
      const v = r.vehicleId ? vehicleMap.get(r.vehicleId) : undefined;
      return {
        ...r,
        passengerCount: paxByRoute.get(r.id) ?? 0,
        vehicle: v
          ? { registrationNumber: v.registration_number, model: v.model, capacity: v.capacity }
          : null,
      };
    });

    return NextResponse.json({ success: true, data: { routes: data } });
  } catch (e) {
    console.error('driver/routes error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRoutes(request, auth));
