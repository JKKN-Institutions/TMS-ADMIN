import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';
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

    // A driver's route(s) live on tms_route.driver_id = staff.id (the canonical
    // assignment), not tms_driver.assigned_route_id. The dashboard shows the primary
    // (first) route's two-way timetable: morning (stop_time, inbound pickup) + evening
    // (evening_time, outbound drop).
    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);
    const primary = routes[0] ?? null;

    // Total riders across the driver's route(s) — same roster definition as
    // /api/driver/passengers (bus-required, actively-enrolled learners).
    const routeIds = routes.map((r) => r.id);
    let passengerCount = 0;
    if (routeIds.length > 0) {
      const svc = createServiceRoleClient();
      const { count } = await svc
        .from('learners_profiles')
        .select('id', { count: 'exact', head: true })
        .in('transport_route_id', routeIds)
        .eq('bus_required', true)
        .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES]);
      passengerCount = count ?? 0;
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
        passengerCount,
        assignedRouteId: primary?.id ?? null,
        routeLabel: primary?.label ?? null,
        stops: primary?.stops ?? [],
      },
    });
  } catch (e) {
    console.error('driver/me error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getMe(request, auth));
