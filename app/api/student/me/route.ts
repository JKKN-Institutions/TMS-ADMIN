import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { mapLearner } from '@/lib/passengers/types';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * GET the signed-in learner's own transport profile.
 *
 * Self-scoped: the learner row is resolved from the session (see getLearnerRowForUser),
 * never from a request param. Permission: tms.passenger.self.view. Reuses the
 * Passenger module's LEARNER_SELECT + mapLearner + ref loader so the DTO stays in
 * lockstep with the admin Learners page.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getMe(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const row = await getLearnerRowForUser(auth);
    if (!row) {
      return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });
    }

    const supabase = createServiceRoleClient();
    const refs = await loadPassengerRefs(supabase, {
      institutionIds: [row.institution_id],
      departmentIds: [row.department_id],
      routeIds: [row.transport_route_id],
      stopIds: [row.transport_stop_id],
      programIds: [row.program_id],
      semesterIds: [row.semester_id],
    });

    return NextResponse.json({
      success: true,
      data: { ...mapLearner(row, refs), busRequired: row.bus_required },
    });
  } catch (e) {
    console.error('student/me error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getMe(request, auth));
