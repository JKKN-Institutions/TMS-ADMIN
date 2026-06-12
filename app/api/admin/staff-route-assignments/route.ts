import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';

// Service-role client bypasses RLS, so writes are gated by an explicit
// tms.drivers.assign check here (defense-in-depth; super admins bypass).
async function requireAssign(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: 'tms.drivers.assign',
  });
  return !!data;
}

type Svc = ReturnType<typeof createServiceRoleClient>;

// Boarding scanners are designated by route assignment: assigning a staff grants
// them the dedicated `transport_boarding` role (via user_roles), so the proxy
// /boarding gate + client can() pass. Best-effort — never fails the assignment.
async function grantBoardingRole(supabase: Svc, staffEmail: string, assignedBy: string) {
  try {
    const { data: prof } = await supabase.from('profiles').select('id').ilike('email', staffEmail).maybeSingle();
    const profileId = (prof as { id: string } | null)?.id;
    if (!profileId) return;
    const { data: role } = await supabase.from('custom_roles').select('id').eq('role_key', 'transport_boarding').maybeSingle();
    const roleId = (role as { id: string } | null)?.id;
    if (!roleId) return;
    const { data: existing } = await supabase.from('user_roles').select('id').eq('user_id', profileId).eq('role_id', roleId).maybeSingle();
    if (existing) return;
    await supabase.from('user_roles').insert({ user_id: profileId, role_id: roleId, is_primary: false, assigned_by: assignedBy });
  } catch (e) {
    console.error('grantBoardingRole (non-fatal):', e);
  }
}

// Revoke the boarding role only if the staff has NO remaining active assignments.
async function maybeRevokeBoardingRole(supabase: Svc, assignmentId: string) {
  try {
    const { data: a } = await supabase.from('tms_staff_route_assignment').select('staff_email').eq('id', assignmentId).maybeSingle();
    const email = (a as { staff_email: string } | null)?.staff_email;
    if (!email) return;
    const { data: remaining } = await supabase
      .from('tms_staff_route_assignment').select('id').eq('staff_email', email).eq('is_active', true).limit(1).maybeSingle();
    if (remaining) return;
    const { data: prof } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle();
    const profileId = (prof as { id: string } | null)?.id;
    if (!profileId) return;
    const { data: role } = await supabase.from('custom_roles').select('id').eq('role_key', 'transport_boarding').maybeSingle();
    const roleId = (role as { id: string } | null)?.id;
    if (!roleId) return;
    await supabase.from('user_roles').delete().eq('user_id', profileId).eq('role_id', roleId);
  } catch (e) {
    console.error('maybeRevokeBoardingRole (non-fatal):', e);
  }
}

// Columns of tms_route we surface alongside each assignment (joined in JS).
const ROUTE_COLS =
  'id, route_number, route_name, start_location, end_location, departure_time, arrival_time, status, total_capacity, current_passengers';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET: active staff↔route assignments, each with its embedded tms_route.
async function getAssignments() {
  try {
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from('tms_staff_route_assignment')
      .select('*')
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (error) {
      // Table absent (42P01) → degrade to empty list until the migration is applied.
      if (error.code === '42P01') {
        return NextResponse.json({ success: true, assignments: [], count: 0 });
      }
      console.error('Assignments query error:', error);
      return NextResponse.json({ success: false, error: 'Failed to fetch assignments' }, { status: 500 });
    }

    // Join the route for each assignment in JS (same pattern as the drivers API:
    // robust to PostgREST not having the FK relationship cached).
    const routeIds = [...new Set((rows ?? []).map((r) => r.route_id).filter(Boolean))];
    const { data: routes } = routeIds.length
      ? await supabase.from('tms_route').select(ROUTE_COLS).in('id', routeIds)
      : { data: [] as Record<string, unknown>[] };
    const routeById = new Map((routes ?? []).map((r) => [r.id as string, r]));

    const assignments = (rows ?? []).map((r) => ({ ...r, routes: routeById.get(r.route_id) ?? null }));
    return NextResponse.json({ success: true, assignments, count: assignments.length });
  } catch (e) {
    console.error('Assignments API error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST: assign a staff email to a route.
async function postAssignment(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireAssign(auth))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const staffEmail = String(body?.staffEmail ?? '').toLowerCase().trim();
    const routeId = String(body?.routeId ?? '').trim();
    const notes = body?.notes ? String(body.notes).trim() : null;

    if (!staffEmail || !routeId) {
      return NextResponse.json({ success: false, error: 'Staff email and route are required' }, { status: 400 });
    }
    if (!EMAIL_RE.test(staffEmail)) {
      return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Verify the route exists in tms_route (the dropdown is populated from here).
    const { data: route, error: routeErr } = await supabase
      .from('tms_route')
      .select('id, status')
      .eq('id', routeId)
      .maybeSingle();
    if (routeErr && routeErr.code === '42P01') {
      return NextResponse.json({ success: false, error: 'Routes table not found — apply the tms_route migration' }, { status: 503 });
    }
    if (!route) {
      return NextResponse.json({ success: false, error: 'Route not found' }, { status: 404 });
    }

    // Reject a duplicate ACTIVE assignment for the same email+route.
    const { data: existing } = await supabase
      .from('tms_staff_route_assignment')
      .select('id')
      .eq('staff_email', staffEmail)
      .eq('route_id', routeId)
      .eq('is_active', true)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'This email is already assigned to this route', assignmentId: existing.id },
        { status: 409 }
      );
    }

    const { data: assignment, error } = await supabase
      .from('tms_staff_route_assignment')
      .insert({ staff_email: staffEmail, route_id: routeId, assigned_by: auth.userId, notes, is_active: true })
      .select('*')
      .single();
    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ success: false, error: 'Assignments table not found — apply the tms_staff_route_assignment migration' }, { status: 503 });
      }
      console.error('Assignment create error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create assignment' }, { status: 500 });
    }
    // Grant the boarding-scanner role so this staff can enter /boarding (best-effort).
    await grantBoardingRole(supabase, staffEmail, auth.userId);
    await logActivity(auth, request, {
      module: 'staff-route-assignments',
      action: 'assign',
      entityType: 'tms_staff_route_assignment',
      entityId: assignment?.id,
      entityLabel: staffEmail,
      description: `Assigned ${staffEmail} to route ${routeId}`,
      metadata: { staffEmail, routeId },
    });
    return NextResponse.json({ success: true, message: 'Route assigned successfully', assignment }, { status: 201 });
  } catch (e) {
    console.error('Assignment create error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: soft-remove an assignment (is_active=false) so the unique index frees up.
async function deleteAssignment(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireAssign(auth))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const assignmentId = new URL(request.url).searchParams.get('assignmentId');
    if (!assignmentId) {
      return NextResponse.json({ success: false, error: 'Assignment ID is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('tms_staff_route_assignment')
      .update({ is_active: false })
      .eq('id', assignmentId);
    if (error) {
      console.error('Assignment remove error:', error);
      return NextResponse.json({ success: false, error: 'Failed to remove assignment' }, { status: 500 });
    }
    await maybeRevokeBoardingRole(supabase, assignmentId);
    await logActivity(auth, request, {
      module: 'staff-route-assignments',
      action: 'unassign',
      entityType: 'tms_staff_route_assignment',
      entityId: assignmentId,
      description: `Removed assignment ${assignmentId}`,
    });
    return NextResponse.json({ success: true, message: 'Assignment removed successfully' });
  } catch (e) {
    console.error('Assignment remove error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getAssignments());
export const POST = withAuth((request, auth) => postAssignment(request, auth));
export const DELETE = withAuth((request, auth) => deleteAssignment(request, auth));
