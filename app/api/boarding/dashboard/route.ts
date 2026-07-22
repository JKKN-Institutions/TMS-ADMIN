import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { countRouteRoster } from '@/lib/passengers/route-roster';
import { istToday } from '@/lib/booking/window';

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

    // Riders allocated to each scoped route, via the SHARED roster definition
    // (bus-required active learners + bus-required active staff) — the same
    // helper the admin staff-assignment and analytics screens use, so all four
    // screens report the same number for a route. This previously counted every
    // learners_profiles row carrying the route id with no bus_required/lifecycle
    // filter, which over-reported (route 24: 90 vs the real 87) by including
    // people who will never board.
    const studentCounts = routeIds.length
      ? await countRouteRoster(svc, routeIds).catch((e) => {
          console.error('boarding dashboard roster count error:', e);
          return new Map<string, number>();
        })
      : new Map<string, number>();
    const studentsTotal = [...studentCounts.values()].reduce((sum, n) => sum + n, 0);

    // Today's attendance for scoped routes. The date must be IST, not UTC:
    // bookings are stored against IST travel_dates (lib/booking/window), so a
    // UTC `today` would read the PREVIOUS day's rows between 00:00 and 05:29 IST.
    const today = istToday();
    let total = 0;
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

    // Seats booked for today on the scoped routes — what the in-charge should
    // EXPECT to board, against `total` (who actually did). One tms_booking row =
    // one learner holding a seat for that travel_date; cancelling deletes the
    // row, so a plain count is the live figure.
    let bookedToday = 0;
    const bookedByRoute: Record<string, number> = {};
    if (routeIds.length) {
      const { data: bks, error: bkErr } = await svc
        .from('tms_booking')
        .select('route_id')
        .eq('travel_date', today)
        .in('route_id', routeIds);
      if (bkErr) {
        // Missing table or query failure degrades to zero, never a 500 — same
        // defensive contract as the attendance block above.
        console.error('boarding dashboard booking count error:', bkErr);
      } else {
        for (const b of (bks ?? []) as { route_id: string | null }[]) {
          if (!b.route_id) continue;
          bookedByRoute[b.route_id] = (bookedByRoute[b.route_id] ?? 0) + 1;
          bookedToday += 1;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        staffName,
        assignedRouteCount: routes.length,
        studentsTotal,
        bookedToday,
        today: { total },
        routes: routes
          .map((r) => ({
            id: r.id,
            route_number: r.route_number,
            route_name: r.route_name,
            student_count: studentCounts.get(r.id) ?? 0,
            present_today: presentByRoute[r.id] ?? 0,
            booked_today: bookedByRoute[r.id] ?? 0,
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
