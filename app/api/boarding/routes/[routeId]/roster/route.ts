import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Roster for one route: every allocated learner + their attendance status today
 * (onward / return). Authority boundary: the staff must be assigned to this route
 * (getAssignedRouteIdsForUser) — super admins bypass. Read-only; manual marking
 * lands in a later module.
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

    const { data: studs } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .eq('transport_route_id', routeId);
    const students = (studs ?? []) as LearnerLite[];

    // Today's attendance for this route, keyed by learner + direction.
    const today = new Date().toISOString().slice(0, 10);
    const byLearner: Record<string, { onward: string | null; return: string | null; last: string | null }> = {};
    const { data: att, error } = await svc
      .from('tms_attendance')
      .select('learner_id, direction, status, scanned_at')
      .eq('trip_date', today)
      .eq('route_id', routeId);
    if (!error && att) {
      for (const a of att as AttRow[]) {
        const e = (byLearner[a.learner_id] ??= { onward: null, return: null, last: null });
        if (a.direction === 'return') e.return = a.status; else e.onward = a.status;
        if (a.scanned_at && (!e.last || a.scanned_at > e.last)) e.last = a.scanned_at;
      }
    }

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

    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
        counts: { total: students.length, present_onward: presentOnward, present_return: presentReturn },
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
