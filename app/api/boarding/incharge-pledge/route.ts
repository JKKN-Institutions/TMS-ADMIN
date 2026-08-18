/**
 * A billed staffer accepts the attendance commitment.
 *
 * "Mark attendance every service day from today to the end of this month and
 * your transport fee bill will be cancelled."
 *
 * ORDER IS LOAD-BEARING: probation row FIRST, then the assignment, then the
 * role. The self-assign fee guard passes anyone with an ACTIVE probation, so
 * the probation must exist before the assignment is attempted. And the
 * assignment must exist before the role, because being assigned is what
 * reopens the portal -- without it the staffer would be promised a screen they
 * cannot reach, and a commitment they cannot honour.
 *
 * The route is never accepted from the client; it is resolved server-side from
 * the staff master, so a staffer can only ever commit to the bus they ride.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStaffBoardingEligibility } from '@/lib/boarding/eligibility';
import { grantBoardingRole } from '@/lib/boarding/roles';
import { logActivity } from '@/lib/activity/log';
import { probationWindow } from '@/lib/boarding/incharge-month';
import { istToday } from '@/lib/booking/window';

async function postPledge(request: NextRequest, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();

    const { data: prof } = await svc
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const email = ((prof as { email: string | null } | null)?.email ?? '').toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: 'Your profile has no email on file' }, { status: 400 });
    }

    const elig = await getStaffBoardingEligibility(auth.supabase, auth.userId);
    if (!elig.eligible) {
      return NextResponse.json({ error: 'You are not eligible to be a bus in-charge' }, { status: 403 });
    }
    if (!elig.routeId) {
      return NextResponse.json(
        { error: 'Your route has not been allocated yet. Please contact an admin.' },
        { status: 400 },
      );
    }

    const window = probationWindow(istToday());

    const { data: probation, error: pErr } = await svc
      .from('tms_incharge_probation')
      .insert({
        staff_email: email,
        route_id: elig.routeId,
        window_start: window.start,
        window_end: window.end,
        status: 'active',
      })
      .select('id')
      .single();
    if (pErr) {
      // 23505 = the partial unique index on an active probation. A second
      // submit is not an error worth surfacing -- they already accepted.
      if (pErr.code === '23505') {
        return NextResponse.json(
          { error: 'You have already accepted this commitment.' },
          { status: 409 },
        );
      }
      console.error('pledge insert error:', pErr);
      return NextResponse.json({ error: 'Failed to record your commitment' }, { status: 500 });
    }

    const probationId = (probation as { id: string }).id;

    const { data: assignment, error: aErr } = await svc
      .from('tms_staff_route_assignment')
      .insert({
        staff_email: email,
        route_id: elig.routeId,
        assigned_by: auth.userId,
        source: 'self',
        is_active: true,
      })
      .select('id')
      .single();
    if (aErr && aErr.code !== '23505') {
      // Roll the probation back. A probation without an assignment is the one
      // state the design must never produce: the staffer would owe a daily
      // duty while locked out of the only screen that performs it.
      await svc.from('tms_incharge_probation').delete().eq('id', probationId);
      console.error('pledge assignment error:', aErr);
      return NextResponse.json({ error: 'Failed to reassign you as bus in-charge' }, { status: 500 });
    }

    const assignmentId = (assignment as { id: string } | null)?.id ?? null;
    if (assignmentId) {
      await svc.from('tms_incharge_probation')
        .update({ assignment_id: assignmentId }).eq('id', probationId);
    }

    await grantBoardingRole(svc, email, auth.userId);

    await logActivity(auth, request, {
      module: 'staff-route-assignments',
      action: 'assign',
      entityType: 'tms_staff_route_assignment',
      entityId: assignmentId ?? undefined,
      entityLabel: email,
      description: `${email} accepted the attendance commitment for route ${elig.routeId}`,
      metadata: {
        staffEmail: email,
        routeId: elig.routeId,
        source: 'self',
        probation: { id: probationId, ...window },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Commitment accepted. You are the bus in-charge again.',
        window,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('pledge error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => postPledge(request, auth));
