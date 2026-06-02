import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { STAFF_SELECT, mapStaff, type StaffRow } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';

/**
 * GET bus-required staff for the Passenger module's Staff page.
 *
 * Reads the MyJKKN-owned `staff` directory filtered to `bus_required = true`
 * (a NOT NULL boolean). Currently zero staff are flagged, so this returns an
 * empty list until staff start opting in — the page renders an empty state.
 *
 * Permission: tms.enrollment.view (shared with the Learners page).
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getStaffPassengers(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.enrollment.view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('staff')
      .select(STAFF_SELECT)
      .eq('bus_required', true)
      .order('first_name', { ascending: true });

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [], count: 0 });
      console.error('Staff passengers query error:', error);
      return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as StaffRow[];
    const refs = await loadPassengerRefs(supabase, {
      institutionIds: rows.map((r) => r.institution_id),
      departmentIds: rows.map((r) => r.department_id),
      routeIds: rows.map((r) => r.transport_route_id),
      stopIds: rows.map((r) => r.transport_stop_id),
    });

    const result = rows.map((r) => mapStaff(r, refs));
    return NextResponse.json({ success: true, data: result, count: result.length });
  } catch (e) {
    console.error('Staff passengers API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getStaffPassengers(request, auth));
