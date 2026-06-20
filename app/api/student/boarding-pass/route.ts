import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { mapLearner } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { signPass } from '@/lib/boarding/pass';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { hasBookingForDate } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';

/**
 * GET the signed-in learner's boarding pass (a signed QR token) + allocation
 * labels. Self-scoped. Only issued when the learner has an allocated route.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getPass(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const learner = await getLearnerRowForUser(auth);
    if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });

    if (!learner.transport_route_id) {
      return NextResponse.json({ success: true, data: { hasPass: false, reason: 'no_route' } });
    }

    const svcGate = createServiceRoleClient();
    const booked = await hasBookingForDate(svcGate, learner.id, istToday());
    if (!booked) {
      return NextResponse.json({ success: true, data: { hasPass: false, reason: 'not_booked' } });
    }

    const svc = createServiceRoleClient();
    const refs = await loadPassengerRefs(svc, {
      institutionIds: [learner.institution_id],
      departmentIds: [learner.department_id],
      routeIds: [learner.transport_route_id],
      stopIds: [learner.transport_stop_id],
      programIds: [learner.program_id],
      semesterIds: [learner.semester_id],
    });
    const dto = mapLearner(learner, refs);

    return NextResponse.json({
      success: true,
      data: {
        hasPass: true,
        token: signPass(learner.id),
        name: dto.name,
        rollNumber: dto.rollNumber,
        routeLabel: dto.routeLabel,
        stopLabel: dto.stopLabel,
      },
    });
  } catch (e) {
    console.error('student/boarding-pass error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getPass(request, auth));
