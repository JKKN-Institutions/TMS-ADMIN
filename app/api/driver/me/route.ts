import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getMe(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    let routeLabel: string | null = null;
    if (drv.assigned_route_id) {
      const svc = createServiceRoleClient();
      const r = await svc
        .from('tms_route')
        .select('route_number, route_name')
        .eq('id', drv.assigned_route_id)
        .maybeSingle();
      const rr = r.data as { route_number: string; route_name: string } | null;
      if (rr) routeLabel = `${rr.route_number} · ${rr.route_name}`;
    }

    return NextResponse.json({
      success: true,
      data: {
        licenseNumber: drv.license_number,
        licenseExpiry: drv.license_expiry,
        status: drv.driver_status,
        experienceYears: drv.experience_years,
        rating: drv.rating,
        totalTrips: drv.total_trips,
        assignedRouteId: drv.assigned_route_id,
        routeLabel,
      },
    });
  } catch (e) {
    console.error('driver/me error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getMe(request, auth));
