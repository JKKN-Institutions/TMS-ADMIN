/**
 * Admin view of how one route's students are split across its in-charges,
 * with a Rebalance button and a per-learner pin.
 *
 * Pinning exists because the balanced split cannot know local facts — a
 * sibling pair, a student an in-charge personally escorts. A pinned learner
 * survives every recompute and is excluded from the balanced pool.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { recomputeRouteAllocation } from '@/lib/boarding/allocation-repo';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Next 15 hands params as a Promise; read the id off the path instead. */
function routeIdFrom(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  return segments[segments.indexOf('routes') + 1] ?? '';
}

interface LearnerLite { id: string; first_name: string | null; last_name: string | null; roll_number: string | null; transport_stop_id: string | null }

async function getAllocation(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const routeId = routeIdFrom(request);
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });

    const svc = createServiceRoleClient();

    const { data: learnerData, error: lErr } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, transport_stop_id')
      .eq('transport_route_id', routeId);
    if (lErr) return NextResponse.json({ error: 'Failed to load learners' }, { status: 500 });
    const learners = (learnerData ?? []) as LearnerLite[];

    const { data: stopData, error: sErr } = await svc
      .from('tms_route_stop').select('id, stop_name').eq('route_id', routeId);
    if (sErr) return NextResponse.json({ error: 'Failed to load stops' }, { status: 500 });
    const stopName = new Map(((stopData ?? []) as { id: string; stop_name: string }[]).map((s) => [s.id, s.stop_name]));

    const { data: rows, error: rErr } = await svc
      .from('tms_incharge_roster_allocation')
      .select('learner_id, assignment_id, staff_email, is_manual')
      .eq('route_id', routeId);
    // An unchecked {data} here would render an empty split as "nobody is
    // allocated", which reads identically to a route with no in-charges.
    if (rErr && rErr.code !== '42P01') {
      return NextResponse.json({ error: 'Failed to load allocation' }, { status: 500 });
    }
    const allocation = (rows ?? []) as Array<{ learner_id: string; assignment_id: string; staff_email: string; is_manual: boolean }>;

    const staff = await getBoardingStaffForRoute(svc, routeId);
    const nameByEmail = new Map(staff.map((s) => [s.email, s.name] as const));
    const learnerById = new Map(learners.map((l) => [l.id, l] as const));

    const byAssignment = new Map<string, { assignment_id: string; staff_email: string; staff_name: string; learners: unknown[] }>();
    const owned = new Set<string>();
    for (const a of allocation) {
      owned.add(a.learner_id);
      const l = learnerById.get(a.learner_id);
      const bucket = byAssignment.get(a.assignment_id) ?? {
        assignment_id: a.assignment_id,
        staff_email: a.staff_email,
        staff_name: nameByEmail.get(a.staff_email) ?? a.staff_email,
        learners: [],
      };
      bucket.learners.push({
        learner_id: a.learner_id,
        name: l ? `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner' : 'Learner',
        roll: l?.roll_number ?? null,
        stop_name: l?.transport_stop_id ? stopName.get(l.transport_stop_id) ?? 'Stop not set' : 'Stop not set',
        is_manual: a.is_manual,
      });
      byAssignment.set(a.assignment_id, bucket);
    }

    return NextResponse.json({
      success: true,
      data: {
        shares: [...byAssignment.values()],
        unowned: learners
          .filter((l) => !owned.has(l.id))
          .map((l) => ({
            learner_id: l.id,
            name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner',
            roll: l.roll_number,
          })),
      },
    });
  } catch (e) {
    console.error('admin allocation get error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postAllocation(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const routeId = routeIdFrom(request);
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      action?: string; learnerId?: string; assignmentId?: string;
    };
    const svc = createServiceRoleClient();

    if (body.action === 'rebalance') {
      const result = await recomputeRouteAllocation(svc, routeId, auth.userId);
      await logActivity(auth, request, {
        module: 'boarding',
        action: 'update',
        entityType: 'tms_incharge_roster_allocation',
        entityId: routeId,
        description: `Rebalanced in-charge shares for route ${routeId}`,
        metadata: result,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === 'pin') {
      const learnerId = String(body.learnerId ?? '');
      const assignmentId = String(body.assignmentId ?? '');
      if (!learnerId || !assignmentId) {
        return NextResponse.json({ error: 'learnerId and assignmentId are required' }, { status: 400 });
      }
      // A learner's route membership must be checked explicitly: the DB's
      // UNIQUE (learner_id) constraint on tms_incharge_roster_allocation
      // guarantees single ownership, but it happily accepts a pin naming a
      // learner from a DIFFERENT route than the one this endpoint is scoped
      // to — the constraint has no notion of "route", only of "one row per
      // learner". Without this check that learner's ownership silently
      // moves onto a bus they don't ride.
      const { data: learnerRow, error: lrErr } = await svc
        .from('learners_profiles')
        .select('id, transport_route_id')
        .eq('id', learnerId)
        .maybeSingle();
      if (lrErr) {
        console.error('allocation pin learner lookup error:', lrErr);
        return NextResponse.json({ error: 'Failed to verify learner' }, { status: 500 });
      }
      const learner = learnerRow as { id: string; transport_route_id: string | null } | null;
      if (!learner || learner.transport_route_id !== routeId) {
        return NextResponse.json({ error: 'That learner is not on this route' }, { status: 400 });
      }

      const { data: assignment, error: aErr } = await svc
        .from('tms_staff_route_assignment')
        .select('id, staff_email').eq('id', assignmentId).eq('route_id', routeId).eq('is_active', true).maybeSingle();
      if (aErr) {
        console.error('allocation pin assignment lookup error:', aErr);
        return NextResponse.json({ error: 'Failed to verify in-charge assignment' }, { status: 500 });
      }
      const target = assignment as { id: string; staff_email: string } | null;
      if (!target) {
        return NextResponse.json({ error: 'That in-charge is not assigned to this route' }, { status: 400 });
      }

      // Upsert on learner_id: the unique constraint guarantees the pin REPLACES
      // any existing owner rather than creating a second one.
      const { error } = await svc
        .from('tms_incharge_roster_allocation')
        .upsert({
          route_id: routeId,
          assignment_id: assignmentId,
          staff_email: target.staff_email.toLowerCase(),
          learner_id: learnerId,
          is_manual: true,
          allocated_by: auth.userId,
        }, { onConflict: 'learner_id' });
      if (error) {
        console.error('allocation pin error:', error);
        return NextResponse.json({ error: 'Failed to pin learner' }, { status: 500 });
      }
      await logActivity(auth, request, {
        module: 'boarding',
        action: 'update',
        entityType: 'tms_incharge_roster_allocation',
        entityId: learnerId,
        description: `Pinned learner to in-charge ${target.staff_email} on route ${routeId}`,
        metadata: { routeId, learnerId, assignmentId },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "action must be 'rebalance' or 'pin'" }, { status: 400 });
  } catch (e) {
    console.error('admin allocation post error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAllocation(request, auth));
export const POST = withAuth((request, auth) => postAllocation(request, auth));
