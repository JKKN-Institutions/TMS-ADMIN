import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Boarding-portal access gate. A staffer may use the portal only if they are
 * actually assigned to at least one active route (tms_staff_route_assignment) —
 * the `tms.attendance.scan` permission alone is not enough. Super admins always
 * pass. Returns { allowed, assignedRouteCount } for the layout to gate on.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getAccess(auth: AuthContext) {
  try {
    if (auth.isSuperAdmin) {
      return NextResponse.json({ success: true, data: { allowed: true, assignedRouteCount: 0, superAdmin: true } });
    }
    // Must hold the boarding permission AND be assigned to a route.
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ success: true, data: { allowed: false, assignedRouteCount: 0 } });
    }
    const routeIds = await getAssignedRouteIdsForUser(auth);
    return NextResponse.json({
      success: true,
      data: { allowed: routeIds.length > 0, assignedRouteCount: routeIds.length },
    });
  } catch (e) {
    console.error('boarding access check error:', e);
    // Fail closed — if we can't confirm an assignment, don't grant access.
    return NextResponse.json({ success: true, data: { allowed: false, assignedRouteCount: 0 } });
  }
}

export const GET = withAuth((_req, auth) => getAccess(auth));
