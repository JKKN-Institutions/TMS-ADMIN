import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import {
  loadRouteAttendanceRoster, buildRosterRows,
  type OrderedStop, type RosterRow, type RosterAttendance,
} from '@/lib/booking/roster';
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
interface AttRow {
  learner_id: string;
  status: string | null;
  method: string | null;
  scanned_at: string | null;
  scanned_by: string | null;
  is_walk_up: boolean | null;
  previous_status: string | null;
  previous_scanned_by: string | null;
  previous_scanned_at: string | null;
}

/** Split an id list into ≤150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * GET /api/boarding/attendance/roster?date=&direction= — EVERY student on the
 * staff's assigned routes for the day, not just the ones who booked: the route's
 * allocated learners unioned with the day's bookings (see
 * loadRouteAttendanceRoster), each joined to their attendance for the selected
 * leg and tagged `booked`. Students without a booking are listed as "Not
 * booked" so the in-charge can see the whole bus rather than the small booked
 * slice of it, and can record the ones who actually board — those marks carry
 * is_walk_up and read "Travelled without booking", which is what separates them
 * from the far larger "did not book, and stayed home".
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
    // A failed lookup here must NOT silently fall through to a null email: that
    // would make every row the caller actually owns read as is_mine:false and
    // disable their mark buttons with no visible error.
    const { data: callerProfile, error: callerProfileError } = await auth.supabase
      .from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    if (callerProfileError) {
      console.error('boarding attendance roster: failed to load caller profile:', callerProfileError);
      return NextResponse.json({ error: 'Failed to load staff profile' }, { status: 500 });
    }
    const callerEmail = (callerProfile?.email as string | undefined)?.toLowerCase() ?? null;

    // Authority for both row gates, resolved ONCE for the whole roster and
    // reused to widen the all-routes fallback below.
    const viewer = {
      actorId: auth.userId,
      isOverrideHolder: await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE),
      isSuperAdmin: auth.isSuperAdmin,
    };

    let routeIds = await getAssignedRouteIdsForUser(auth);
    // An override holder (transport_head) must SEE every route's marks to
    // correct them, not merely be allowed to write once they somehow get there
    // -- without this they are assigned to nothing and see an empty roster.
    if (routeIds.length === 0 && (auth.isSuperAdmin || viewer.isOverrideHolder)) {
      const { data } = await svc.from('tms_route').select('id');
      routeIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }
    const empty = {
      success: true,
      data: {
        date, direction, rows: [] as RosterRow[],
        counts: { total: 0, present: 0, absent: 0, unmarked: 0, booked: 0, withoutTicket: 0, boardedWithoutTicket: 0 },
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

    // A failed read must NOT render as "nobody is marked": on this screen that
    // reads as an empty roster inviting staff to re-mark everyone.
    const attRows: AttRow[] = [];
    for (const c of chunk(routeIds)) {
      const { data, error } = await svc
        .from('tms_attendance')
        .select(
          'learner_id, status, method, scanned_at, scanned_by, is_walk_up, previous_status, previous_scanned_by, previous_scanned_at',
        )
        .in('route_id', c)
        .eq('trip_date', date)
        .eq('direction', direction);
      if (error) {
        console.error('boarding attendance roster: failed to load attendance:', error);
        return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
      }
      attRows.push(...((data ?? []) as AttRow[]));
    }

    // Names for BOTH the current and the replaced marker, in one lookup. A
    // dozen staff share this roster, so an unattributed mark is unusable.
    const markerNames = await loadMarkerNames(svc, [
      ...attRows.map((a) => a.scanned_by),
      ...attRows.map((a) => a.previous_scanned_by),
    ]);

    const attByLearner = new Map<string, RosterAttendance>();
    for (const a of attRows) {
      if (!a.status) continue;
      attByLearner.set(a.learner_id, {
        status: a.status,
        method: a.method,
        scanned_at: a.scanned_at,
        scanned_by: a.scanned_by,
        marked_by_name: a.scanned_by ? markerNames.get(a.scanned_by) ?? null : null,
        is_walk_up: a.is_walk_up === true,
        previous_status: a.previous_status,
        previous_by_name: a.previous_scanned_by ? markerNames.get(a.previous_scanned_by) ?? null : null,
        previous_at: a.previous_scanned_at,
      });
    }

    // "Mine" is my own share plus any share I accepted cover for today. These
    // queries are caller-scoped, not route-scoped, so they are hoisted OUT of
    // the per-route loop below: on the super-admin path (~25 routes) doing
    // this per-route would be 75-100 extra queries per page load for a value
    // that never varies by route.
    const mineByRoute = new Map<string, Set<string>>();
    if (cfg.inchargeShareScoringEnabled && callerEmail) {
      const myAssignmentByRoute = new Map<string, string>();
      for (const c of chunk(routeIds)) {
        const { data, error } = await svc
          .from('tms_staff_route_assignment')
          .select('id, route_id')
          .eq('staff_email', callerEmail).eq('is_active', true)
          .in('route_id', c);
        if (error) {
          console.error('boarding attendance roster: failed to load caller assignments:', error);
          return NextResponse.json({ error: 'Failed to load staff assignment' }, { status: 500 });
        }
        for (const a of (data ?? []) as { id: string; route_id: string }[]) myAssignmentByRoute.set(a.route_id, a.id);
      }

      // Absences are scoped per route below (via absencesByRoute) so an
      // absence declared on one route can never grant cover on another.
      const absencesByRoute = new Map<string, AbsenceRow[]>();
      for (const c of chunk(routeIds)) {
        const { data, error } = await svc
          .from('tms_incharge_absence')
          .select('route_id, assignment_id, absence_date, covering_assignment_id, cover_status')
          .in('route_id', c).eq('absence_date', date);
        if (error) {
          console.error('boarding attendance roster: failed to load in-charge absences:', error);
          return NextResponse.json({ error: 'Failed to load in-charge absences' }, { status: 500 });
        }
        for (const a of (data ?? []) as Array<AbsenceRow & { route_id: string }>) {
          const arr = absencesByRoute.get(a.route_id) ?? [];
          arr.push(a);
          absencesByRoute.set(a.route_id, arr);
        }
      }

      const coveredByRoute = new Map<string, string[]>();
      const allCoveredIds = new Set<string>();
      for (const [routeId, myAssignmentId] of myAssignmentByRoute) {
        const covered = delegatedTo(myAssignmentId, date, absencesByRoute.get(routeId) ?? []);
        if (covered.length) {
          coveredByRoute.set(routeId, covered);
          for (const id of covered) allCoveredIds.add(id);
        }
      }

      const emailByAssignmentId = new Map<string, string>();
      for (const c of chunk([...allCoveredIds])) {
        const { data, error } = await svc
          .from('tms_staff_route_assignment').select('id, staff_email').in('id', c);
        if (error) {
          console.error('boarding attendance roster: failed to resolve covering assignments:', error);
          return NextResponse.json({ error: 'Failed to resolve covering assignments' }, { status: 500 });
        }
        for (const a of (data ?? []) as { id: string; staff_email: string }[]) {
          emailByAssignmentId.set(a.id, a.staff_email.toLowerCase());
        }
      }

      for (const routeId of routeIds) {
        const mine = new Set<string>([callerEmail]);
        for (const id of coveredByRoute.get(routeId) ?? []) {
          const email = emailByAssignmentId.get(id);
          if (email) mine.add(email);
        }
        mineByRoute.set(routeId, mine);
      }
    }

    const rows: RosterRow[] = [];
    for (const rt of routes) {
      const riders = await loadRouteAttendanceRoster(svc, rt.id, date);

      // Owner names genuinely differ per route, so allocation + staff lookup
      // stay inside the loop; there is no clean batch form for them.
      let ownership: Parameters<typeof buildRosterRows>[5];
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
        const mine = mineByRoute.get(rt.id) ?? new Set<string>();
        ownership = { ownerByLearner, mine, myEmail: callerEmail };
      }

      rows.push(...buildRosterRows(
        riders,
        { id: rt.id, route_number: rt.route_number },
        stopsByRoute.get(rt.id) ?? [],
        attByLearner,
        viewer,
        ownership,
      ));
    }

    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const booked = rows.filter((r) => r.booked).length;
    // Two DIFFERENT numbers, and conflating them would destroy the distinction
    // this feature exists to draw:
    //   withoutTicket        — allocated to the bus but did not book (~1,000/day).
    //                          Most of them simply stayed home.
    //   boardedWithoutTicket — someone actually saw them board and said so.
    const boardedWithoutTicket = rows.filter((r) => r.is_walk_up).length;
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
          boardedWithoutTicket,
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
