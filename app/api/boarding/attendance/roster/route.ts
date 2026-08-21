import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { loadRouteAttendanceRoster, buildRosterRows, type OrderedStop, type RosterRow } from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadRouteAllocation } from '@/lib/boarding/allocation-repo';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { delegatedTo, type AbsenceRow } from '@/lib/boarding/share-coverage';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteRow { id: string; route_number: string | null }
interface StopRow { id: string; route_id: string; stop_name: string; stop_time: string | null; evening_time: string | null; sequence_order: number | null }
interface AttRow { learner_id: string; status: string | null; method: string | null; scanned_at: string | null }

/**
 * GET /api/boarding/attendance/roster?date=&direction= — EVERY student on the
 * staff's assigned routes for the day, not just the ones who booked: the route's
 * allocated learners unioned with the day's bookings (see
 * loadRouteAttendanceRoster), each joined to their attendance for the selected
 * leg and tagged `booked`. Students without a booking are listed as "Without
 * ticket" so the in-charge can see the whole bus rather than the small booked
 * slice of it; the client offers no mark action for them.
 *
 * Route-scoped to the staff's assigned routes (super admins see all). Counts are
 * derived from the produced rows so Marked + Unmarked === Total always holds.
 */
async function getRoster(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    let date = istToday();
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
      }
      date = dateParam;
    }
    const direction: 'onward' | 'return' = url.searchParams.get('direction') === 'return' ? 'return' : 'onward';

    const svc = createServiceRoleClient();
    const cfg = await loadSchedulingConfig(svc);
    const { data: callerProfile } = await auth.supabase
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    const callerEmail = (callerProfile?.email as string | undefined)?.toLowerCase() ?? null;

    let routeIds = await getAssignedRouteIdsForUser(auth);
    if (routeIds.length === 0 && auth.isSuperAdmin) {
      const { data } = await svc.from('tms_route').select('id');
      routeIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }
    const empty = {
      success: true,
      data: {
        date, direction, rows: [] as RosterRow[],
        counts: { total: 0, present: 0, absent: 0, unmarked: 0, booked: 0, withoutTicket: 0 },
        share: { total: 0, marked: 0, remaining: 0 },
      },
    };
    if (routeIds.length === 0) return NextResponse.json(empty);

    const { data: routeData } = await svc
      .from('tms_route').select('id, route_number').in('id', routeIds).order('route_number', { ascending: true });
    const routes = (routeData ?? []) as RouteRow[];

    const { data: stopData } = await svc
      .from('tms_route_stop')
      .select('id, route_id, stop_name, stop_time, evening_time, sequence_order')
      .in('route_id', routeIds)
      .eq('is_active', true)
      .order('sequence_order', { ascending: true });
    // Resolve each stop's time to the selected leg BEFORE handing to the pure helper.
    const stopsByRoute = new Map<string, OrderedStop[]>();
    for (const s of (stopData ?? []) as StopRow[]) {
      const arr = stopsByRoute.get(s.route_id) ?? [];
      arr.push({ id: s.id, name: s.stop_name, time: direction === 'return' ? s.evening_time : s.stop_time, order: s.sequence_order });
      stopsByRoute.set(s.route_id, arr);
    }

    const { data: attData } = await svc
      .from('tms_attendance')
      .select('learner_id, status, method, scanned_at')
      .in('route_id', routeIds)
      .eq('trip_date', date)
      .eq('direction', direction);
    const attByLearner = new Map<string, { status: string; method: string | null; scanned_at: string | null }>();
    for (const a of (attData ?? []) as AttRow[]) {
      if (a.status) attByLearner.set(a.learner_id, { status: a.status, method: a.method, scanned_at: a.scanned_at });
    }

    const rows: RosterRow[] = [];
    for (const rt of routes) {
      const riders = await loadRouteAttendanceRoster(svc, rt.id, date);

      let ownership: Parameters<typeof buildRosterRows>[4];
      if (cfg.inchargeShareScoringEnabled) {
        const [allocation, staff] = await Promise.all([
          loadRouteAllocation(svc, rt.id),
          getBoardingStaffForRoute(svc, rt.id),
        ]);
        const nameByEmail = new Map(staff.map((s) => [s.email, s.name] as const));
        const ownerByLearner = new Map<string, { staff_email: string; name: string }>();
        for (const [learnerId, owner] of allocation) {
          ownerByLearner.set(learnerId, {
            staff_email: owner.staff_email,
            name: nameByEmail.get(owner.staff_email) ?? owner.staff_email,
          });
        }

        // "Mine" is my own share plus any share I accepted cover for today.
        const mine = new Set<string>();
        if (callerEmail) {
          mine.add(callerEmail);
          const { data: myAssignment } = await svc
            .from('tms_staff_route_assignment')
            .select('id').eq('route_id', rt.id).eq('staff_email', callerEmail).eq('is_active', true).maybeSingle();
          const myAssignmentId = (myAssignment as { id: string } | null)?.id ?? null;
          if (myAssignmentId) {
            const { data: absData } = await svc
              .from('tms_incharge_absence')
              .select('assignment_id, absence_date, covering_assignment_id, cover_status')
              .eq('route_id', rt.id).eq('absence_date', date);
            const covered = delegatedTo(myAssignmentId, date, (absData ?? []) as AbsenceRow[]);
            if (covered.length) {
              const { data: coveredRows } = await svc
                .from('tms_staff_route_assignment').select('staff_email').in('id', covered);
              for (const c of (coveredRows ?? []) as { staff_email: string }[]) mine.add(c.staff_email.toLowerCase());
            }
          }
        }
        ownership = { ownerByLearner, mine };
      }

      rows.push(...buildRosterRows(
        riders,
        { id: rt.id, route_number: rt.route_number },
        stopsByRoute.get(rt.id) ?? [],
        attByLearner,
        ownership,
      ));
    }

    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const booked = rows.filter((r) => r.booked).length;
    // Share counts are over the caller's OWN markable learners only: a share
    // that reads "12 of 12 marked" while the bus still has 30 unmarked riders
    // is the correct answer to "am I done?".
    const mineRows = rows.filter((r) => r.is_mine && r.booked);
    const mineMarked = mineRows.filter((r) => r.status !== 'unmarked').length;
    return NextResponse.json({
      success: true,
      data: {
        date,
        direction,
        rows,
        counts: {
          total: rows.length,
          present,
          absent,
          unmarked: rows.length - present - absent,
          booked,
          withoutTicket: rows.length - booked,
        },
        share: {
          total: mineRows.length,
          marked: mineMarked,
          remaining: mineRows.length - mineMarked,
        },
      },
    });
  } catch (e) {
    console.error('boarding attendance roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRoster(request, auth));
