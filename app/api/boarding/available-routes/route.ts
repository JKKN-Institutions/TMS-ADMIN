import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Active routes offered to a boarding staffer choosing which bus they are
 * in-charge of. Reachable by a super admin, anyone holding tms.attendance.scan,
 * OR an eligible bus_required staffer (the self-service pre-assignment window).
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const ROUTE_COLS =
  'id, route_number, route_name, start_location, end_location, departure_time, arrival_time, total_capacity, current_passengers';

async function getAvailableRoutes(auth: AuthContext) {
  try {
    let allowed = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN);
    if (!allowed) {
      const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
      allowed = elig.eligible;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('tms_route')
      .select(ROUTE_COLS)
      .eq('status', 'active')
      .order('route_number', { ascending: true });

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [] });
      console.error('available-routes query error:', error);
      return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error('available-routes error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getAvailableRoutes(auth));
