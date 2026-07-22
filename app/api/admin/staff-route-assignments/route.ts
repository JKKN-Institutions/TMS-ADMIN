import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { grantBoardingRole, maybeRevokeBoardingRole } from '@/lib/boarding/roles';
import { countRouteRoster } from '@/lib/passengers/route-roster';
import type { SupabaseClient } from '@supabase/supabase-js';

// Service-role client bypasses RLS, so writes are gated by an explicit
// tms.drivers.assign check here (defense-in-depth; super admins bypass).
async function requireAssign(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: 'tms.drivers.assign',
  });
  return !!data;
}

// Columns of tms_route we surface alongside each assignment (joined in JS).
// NOTE: current_passengers is intentionally NOT selected — it is a dead column
// (default 0, never written). The rider count is derived via countRouteRoster.
const ROUTE_COLS =
  'id, route_number, route_name, start_location, end_location, departure_time, arrival_time, status, total_capacity, vehicle_id';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RouteRow = { id: string; vehicle_id?: string | null; total_capacity?: number | null };

/**
 * Seats per route, from the vehicle actually assigned to it. Falls back to
 * tms_route.total_capacity, which is 0 on 23 of 24 routes, then to null so the
 * UI can render "—" instead of a bogus 0.
 */
async function loadRouteCapacities(
  supabase: SupabaseClient,
  routes: unknown[]
): Promise<Map<string, number>> {
  const rows = routes as RouteRow[];
  const vehicleIds = [...new Set(rows.map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const capByVehicle = new Map<string, number>();
  if (vehicleIds.length) {
    const { data, error } = await supabase.from('tms_vehicle').select('id, capacity').in('id', vehicleIds);
    if (error) console.error('Assignment vehicle-capacity error:', error);
    for (const v of (data ?? []) as Array<{ id: string; capacity: number | null }>) {
      if (v.capacity != null) capByVehicle.set(v.id, v.capacity);
    }
  }
  const out = new Map<string, number>();
  for (const r of rows) {
    const seats = (r.vehicle_id ? capByVehicle.get(r.vehicle_id) : undefined) ?? r.total_capacity ?? 0;
    if (seats > 0) out.set(r.id, seats);
  }
  return out;
}

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

    // Passenger load: counted live from real allocation, and seats taken from the
    // route's assigned vehicle. Both tms_route counter columns are unmaintained,
    // so neither can be trusted (see countRouteRoster). A failure here degrades to
    // "no count" rather than 500-ing the assignment list, which is the real payload.
    const [paxByRoute, capacityByRoute] = await Promise.all([
      countRouteRoster(supabase, routeIds).catch((e) => {
        console.error('Assignment passenger-count error:', e);
        return new Map<string, number>();
      }),
      loadRouteCapacities(supabase, routes ?? []),
    ]);

    const assignments = (rows ?? []).map((r) => {
      const route = routeById.get(r.route_id);
      return {
        ...r,
        routes: route
          ? {
              ...route,
              passenger_count: paxByRoute.get(r.route_id) ?? 0,
              capacity: capacityByRoute.get(r.route_id) ?? null,
            }
          : null,
      };
    });
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
      .insert({ staff_email: staffEmail, route_id: routeId, assigned_by: auth.userId, notes, is_active: true, source: 'admin' })
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
    const { data: existing } = await supabase
      .from('tms_staff_route_assignment')
      .select('staff_email, route_id')
      .eq('id', assignmentId)
      .single();
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
      entityLabel: existing?.staff_email ?? null,
      description: `Removed assignment for ${existing?.staff_email ?? assignmentId}`,
      metadata: { staffEmail: existing?.staff_email, routeId: existing?.route_id },
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
