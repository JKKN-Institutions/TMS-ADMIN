import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { grantBoardingRole } from '@/lib/boarding/roles';
import { logActivity } from '@/lib/activity/log';

/**
 * A bus_required staffer self-selects the ONE route they are in-charge of. This
 * is the self-service equivalent of the admin assign flow: it creates the
 * tms_staff_route_assignment (source='self') and grants the transport_boarding
 * role so the staffer flows through the existing gates afterwards. One-time:
 * a staffer with an existing active assignment is rejected (admin must change it).
 */
async function postSelfAssign(request: NextRequest, auth: AuthContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const routeId = String(body?.routeId ?? '').trim();
    if (!routeId) {
      return NextResponse.json({ error: 'Route is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // The assignment key is the staffer's email (matches getAssignedRouteIdsForUser).
    const { data: prof } = await svc.from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = ((prof as { email: string | null } | null)?.email ?? '').toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: 'Your profile has no email on file' }, { status: 400 });
    }

    // Server-side authority: eligibility + one-time guard.
    const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
    if (!elig.eligible) {
      return NextResponse.json({ error: 'You are not eligible to select a route' }, { status: 403 });
    }
    if (elig.assignedRouteCount > 0) {
      return NextResponse.json(
        { error: 'You already have a route. Contact an admin to change it.' },
        { status: 409 }
      );
    }

    // ── PHASE 2 SEAM (staff fees) ──────────────────────────────────────────────
    // When staff transport fees exist, block here if this staffer is not cleared
    // (mirror the learner tms_student_transport_access gate). No-op in Phase 1.

    // Validate the route is real and active.
    const { data: route, error: routeErr } = await svc
      .from('tms_route').select('id, status').eq('id', routeId).maybeSingle();
    if (routeErr?.code === '42P01') {
      return NextResponse.json({ error: 'Routes table not found' }, { status: 503 });
    }
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }
    if ((route as { status: string }).status !== 'active') {
      return NextResponse.json({ error: 'That route is not active' }, { status: 400 });
    }

    const { data: assignment, error } = await svc
      .from('tms_staff_route_assignment')
      .insert({ staff_email: email, route_id: routeId, assigned_by: auth.userId, source: 'self', is_active: true })
      .select('*')
      .single();
    if (error) {
      // 23505 = the active (staff_email, route_id) unique index — treat as already-done.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You already have this route.' }, { status: 409 });
      }
      console.error('self-assign insert error:', error);
      return NextResponse.json({ error: 'Failed to select route' }, { status: 500 });
    }

    await grantBoardingRole(svc, email, auth.userId);
    await logActivity(auth, request, {
      module: 'staff-route-assignments',
      // ActivityAction has no distinct 'self-assign' value — reuse 'assign' (matches
      // the admin route's call shape) and carry source:'self' in metadata/description
      // instead, so this stays a same-shape drop-in with the existing action map.
      action: 'assign',
      entityType: 'tms_staff_route_assignment',
      entityId: (assignment as { id: string } | null)?.id,
      entityLabel: email,
      description: `Self-assigned ${email} to route ${routeId}`,
      metadata: { staffEmail: email, routeId, source: 'self' },
    });

    return NextResponse.json({ success: true, message: 'Route selected', assignment }, { status: 201 });
  } catch (e) {
    console.error('self-assign error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => postSelfAssign(request, auth));
