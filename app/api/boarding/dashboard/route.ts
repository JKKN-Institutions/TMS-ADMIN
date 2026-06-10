import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * Boarding-staff dashboard stats, scoped to the staff member's assigned routes
 * (getAssignedRouteIdsForUser) — the same authority boundary the scanner uses.
 * Super admins with no explicit assignment see all routes. Everything is
 * defensive: a missing tms_attendance table or empty data returns zeros, never a
 * 500, so the dashboard always renders.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteLite { id: string; route_number: string | null; route_name: string | null }
interface AttRow { id: string; learner_id: string; route_id: string; direction: string | null; status: string | null; scanned_at: string | null }
interface LearnerLite { id: string; first_name: string | null; last_name: string | null; roll_number: string | null }

async function getDashboard(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    // Header label.
    const { data: prof } = await auth.supabase
      .from('profiles').select('full_name, email').eq('id', auth.userId).single();
    const staffName = (prof?.full_name as string) || (prof?.email as string) || 'Boarding Staff';

    // Routes in scope: assigned routes; super admin with none → all routes.
    let routeIds = await getAssignedRouteIdsForUser(auth);
    let routes: RouteLite[] = [];
    if (routeIds.length > 0) {
      const { data } = await svc.from('tms_route').select('id, route_number, route_name').in('id', routeIds);
      routes = (data ?? []) as RouteLite[];
    } else if (auth.isSuperAdmin) {
      const { data } = await svc.from('tms_route').select('id, route_number, route_name').order('route_number');
      routes = (data ?? []) as RouteLite[];
      routeIds = routes.map((r) => r.id);
    }

    // Students allocated to each scoped route.
    const studentCounts: Record<string, number> = {};
    let studentsTotal = 0;
    if (routeIds.length) {
      const { data: studs } = await svc
        .from('learners_profiles').select('transport_route_id').in('transport_route_id', routeIds);
      for (const s of (studs ?? []) as { transport_route_id: string | null }[]) {
        if (!s.transport_route_id) continue;
        studentCounts[s.transport_route_id] = (studentCounts[s.transport_route_id] ?? 0) + 1;
        studentsTotal += 1;
      }
    }

    // Today's attendance for scoped routes.
    const today = new Date().toISOString().slice(0, 10);
    let total = 0, onward = 0, ret = 0;
    const presentByRoute: Record<string, number> = {};
    let recent: Array<{ id: string; learner_name: string; roll_number: string | null; route_number: string | null; direction: string | null; scanned_at: string | null }> = [];

    if (routeIds.length) {
      const { data: att, error } = await svc
        .from('tms_attendance')
        .select('id, learner_id, route_id, direction, status, scanned_at')
        .eq('trip_date', today)
        .in('route_id', routeIds)
        .order('scanned_at', { ascending: false });

      if (!error && att) {
        const rows = att as AttRow[];
        for (const a of rows) {
          if (a.status !== 'present') continue;
          total += 1;
          if (a.direction === 'return') ret += 1; else onward += 1;
          presentByRoute[a.route_id] = (presentByRoute[a.route_id] ?? 0) + 1;
        }

        const top = rows.slice(0, 8);
        const learnerIds = [...new Set(top.map((a) => a.learner_id))];
        const nameById: Record<string, { name: string; roll: string | null }> = {};
        if (learnerIds.length) {
          const { data: ls } = await svc
            .from('learners_profiles').select('id, first_name, last_name, roll_number').in('id', learnerIds);
          for (const l of (ls ?? []) as LearnerLite[]) {
            nameById[l.id] = {
              name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Learner',
              roll: l.roll_number,
            };
          }
        }
        const routeNumById: Record<string, string | null> = {};
        for (const r of routes) routeNumById[r.id] = r.route_number;

        recent = top.map((a) => ({
          id: a.id,
          learner_name: nameById[a.learner_id]?.name ?? 'Learner',
          roll_number: nameById[a.learner_id]?.roll ?? null,
          route_number: routeNumById[a.route_id] ?? null,
          direction: a.direction,
          scanned_at: a.scanned_at,
        }));
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        staffName,
        assignedRouteCount: routes.length,
        studentsTotal,
        today: { total, onward, return: ret },
        routes: routes
          .map((r) => ({
            id: r.id,
            route_number: r.route_number,
            route_name: r.route_name,
            student_count: studentCounts[r.id] ?? 0,
            present_today: presentByRoute[r.id] ?? 0,
          }))
          .sort((a, b) => (a.route_number ?? '').localeCompare(b.route_number ?? '')),
        recent,
      },
    });
  } catch (e) {
    console.error('boarding dashboard error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getDashboard(auth));
