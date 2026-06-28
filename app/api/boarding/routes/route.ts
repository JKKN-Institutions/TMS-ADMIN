import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadRouteDetails } from '@/lib/routes/detail';

/**
 * The boarding staffer's assigned route(s), each with full detail (ordered stops,
 * driver, vehicle) — the same shape /api/student/route returns, but for every
 * route the staffer supervises. Authority: getAssignedRouteIdsForUser; a super
 * admin with no explicit assignment sees all active routes (mirrors the boarding
 * dashboard). Sits beside the existing [routeId]/roster endpoint.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getRoutes(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();

    let routeIds = await getAssignedRouteIdsForUser(auth);
    if (routeIds.length === 0 && auth.isSuperAdmin) {
      const { data } = await svc.from('tms_route').select('id').eq('status', 'active');
      routeIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }

    const routes = await loadRouteDetails(svc, routeIds);
    return NextResponse.json({ success: true, data: { routes } });
  } catch (e) {
    console.error('boarding/routes error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getRoutes(auth));
