import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { grantBoardingRole } from '@/lib/boarding/roles';
import { logActivity } from '@/lib/activity/log';

/**
 * A bus_required staffer accepts the boarding in-charge duty.
 *
 * The route is NOT accepted from the client. It is resolved server-side from the
 * staff master (staff.transport_route_id, via the eligibility RPC), so a staffer can
 * only ever become in-charge of the bus they actually ride. This creates the
 * tms_staff_route_assignment (source='self') and grants the transport_boarding role,
 * after which the staffer flows through the exact gates an admin-assigned staffer
 * uses. One-time: a staffer with an existing active assignment is rejected.
 */
async function postSelfAssign(request: NextRequest, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();

    // The assignment key is the staffer's email (matches getAssignedRouteIdsForUser).
    const { data: prof } = await svc.from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = ((prof as { email: string | null } | null)?.email ?? '').toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: 'Your profile has no email on file' }, { status: 400 });
    }

    // Server-side authority: eligibility, the one-time guard, AND the route itself.
    const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
    if (!elig.eligible) {
      return NextResponse.json({ error: 'You are not eligible to be a bus in-charge' }, { status: 403 });
    }
    if (elig.assignedRouteCount > 0) {
      return NextResponse.json(
        { error: 'You already have a route. Contact an admin to change it.' },
        { status: 409 }
      );
    }
    // Recomputed at confirm time, so a route deactivated since the page loaded is
    // caught here rather than assigned. The RPC already guarantees the route exists
    // and is active, so no separate tms_route lookup is needed.
    if (!elig.routeId) {
      return NextResponse.json(
        { error: 'Your route has not been allocated yet. Please contact an admin.' },
        { status: 400 }
      );
    }

    // ── PHASE 2 SEAM (staff fees) ──────────────────────────────────────────────
    // When staff transport fees exist, block here if this staffer is not cleared
    // (mirror the learner tms_student_transport_access gate). No-op in Phase 1.

    const { data: assignment, error } = await svc
      .from('tms_staff_route_assignment')
      .insert({
        staff_email: email,
        route_id: elig.routeId,
        assigned_by: auth.userId,
        source: 'self',
        is_active: true,
      })
      .select('*')
      .single();
    if (error) {
      // 23505 = the active (staff_email, route_id) unique index. Now that the route is
      // server-resolved, concurrent confirms resolve the SAME route — so this index,
      // not the check-then-act guard above, is what actually settles the race.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You already have this route.' }, { status: 409 });
      }
      console.error('self-assign insert error:', error);
      return NextResponse.json({ error: 'Failed to accept the in-charge duty' }, { status: 500 });
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
      description: `${email} accepted bus in-charge for route ${elig.routeId}`,
      metadata: { staffEmail: email, routeId: elig.routeId, source: 'self' },
    });

    return NextResponse.json(
      { success: true, message: 'You are now the bus in-charge', assignment },
      { status: 201 }
    );
  } catch (e) {
    console.error('self-assign error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => postSelfAssign(request, auth));
