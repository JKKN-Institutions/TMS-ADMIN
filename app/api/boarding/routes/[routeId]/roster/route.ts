import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookedCount, routeCapacity } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';

/**
 * Roster for one route TODAY: learners who booked today UNION walk-ups (learners
 * with an attendance row today), each with their onward/return status. Authority
 * boundary: staff must be assigned to this route; super admins bypass.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface LearnerLite { id: string; first_name: string | null; last_name: string | null; roll_number: string | null }
interface AttRow { learner_id: string; direction: string | null; status: string | null; scanned_at: string | null }

async function getRoster(auth: AuthContext, routeId: string) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!routeId) return NextResponse.json({ error: 'Route id is required' }, { status: 400 });

    // Authority: staff may only view rosters for routes they're assigned to.
    if (!auth.isSuperAdmin) {
      const assigned = await getAssignedRouteIdsForUser(auth);
      if (!assigned.includes(routeId)) {
        return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });
      }
    }

    const svc = createServiceRoleClient();

    const { data: route } = await svc
      .from('tms_route').select('id, route_number, route_name').eq('id', routeId).maybeSingle();
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    const today = istToday();

    // Roster = learners who BOOKED today ∪ learners with attendance today (walk-ups).
    const { data: bookings } = await svc
      .from('tms_booking')
      .select('learner_id')
      .eq('route_id', routeId)
      .eq('travel_date', today)
      .eq('status', 'booked');
    const rosterIds = new Set<string>(((bookings ?? []) as { learner_id: string }[]).map((b) => b.learner_id));

    // Today's attendance for this route, keyed by learner + direction.
    const byLearner: Record<string, { onward: string | null; return: string | null; last: string | null }> = {};
    const { data: att, error } = await svc
      .from('tms_attendance')
      .select('learner_id, direction, status, scanned_at')
      .eq('trip_date', today)
      .eq('route_id', routeId);
    if (!error && att) {
      for (const a of att as AttRow[]) {
        rosterIds.add(a.learner_id); // include walk-ups (attended but not booked)
        const e = (byLearner[a.learner_id] ??= { onward: null, return: null, last: null });
        if (a.direction === 'return') e.return = a.status; else e.onward = a.status;
        if (a.scanned_at && (!e.last || a.scanned_at > e.last)) e.last = a.scanned_at;
      }
    }

    const idList = Array.from(rosterIds);
    const { data: studs } = idList.length
      ? await svc
          .from('learners_profiles')
          .select('id, first_name, last_name, roll_number')
          .in('id', idList)
      : { data: [] as LearnerLite[] };
    const students = (studs ?? []) as LearnerLite[];

    let presentOnward = 0, presentReturn = 0;
    const rows = students
      .map((s) => {
        const att = byLearner[s.id] ?? { onward: null, return: null, last: null };
        if (att.onward === 'present') presentOnward += 1;
        if (att.return === 'present') presentReturn += 1;
        return {
          id: s.id,
          name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Learner',
          roll_number: s.roll_number,
          onward_status: att.onward,
          return_status: att.return,
          last_scanned_at: att.last,
        };
      })
      .sort((a, b) => (a.roll_number ?? a.name).localeCompare(b.roll_number ?? b.name));

    const [booked, capacity] = await Promise.all([
      bookedCount(svc, routeId, today),
      routeCapacity(svc, routeId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
        counts: {
          total: students.length,
          booked,
          capacity,
          present_onward: presentOnward,
          present_return: presentReturn,
        },
        students: rows,
      },
    });
  } catch (e) {
    console.error('boarding roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((req: NextRequest, auth) => {
  // Extract [routeId] from the path: /api/boarding/routes/<routeId>/roster
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const routeId = decodeURIComponent(parts[parts.indexOf('routes') + 1] ?? '');
  return getRoster(auth, routeId);
});
