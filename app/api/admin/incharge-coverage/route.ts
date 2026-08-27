/**
 * Where attendance coverage is broken, as one board.
 *
 * Three distinct failures share this screen because they all mean "somebody's
 * attendance has no owner", and the transport office fixes all three the same
 * way — by assigning an in-charge:
 *   - routes carrying students with NO in-charge (3 routes, 150 students as of
 *     2026-08-21)
 *   - in-charges holding an EMPTY share (more in-charges than students)
 *   - shares left unmarked on the selected day
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadSharesForRoutes } from '@/lib/boarding/allocation-repo';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
import { shareDuty, shareCovered, isExcused, delegatedTo, type AbsenceRow } from '@/lib/boarding/share-coverage';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Split an id list into <=150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getCoverage(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const dateParam = new URL(request.url).searchParams.get('date');
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const date = dateParam ?? istToday();

    const svc = createServiceRoleClient();

    const { data: routeData, error: rErr } = await svc
      .from('tms_route').select('id, route_number, route_name').order('route_number');
    if (rErr) return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });
    const routes = (routeData ?? []) as Array<{ id: string; route_number: string | null; route_name: string | null }>;
    const routeIds = routes.map((r) => r.id);

    // Student counts per route, in one pass rather than a query per route.
    const studentsByRoute = new Map<string, number>();
    for (const c of chunk(routeIds)) {
      const { data, error } = await svc
        .from('learners_profiles').select('id, transport_route_id').in('transport_route_id', c);
      if (error) return NextResponse.json({ error: 'Failed to load learners' }, { status: 500 });
      for (const l of (data ?? []) as { transport_route_id: string }[]) {
        studentsByRoute.set(l.transport_route_id, (studentsByRoute.get(l.transport_route_id) ?? 0) + 1);
      }
    }

    const { data: aData, error: aErr } = await svc
      .from('tms_staff_route_assignment').select('id, staff_email, route_id').eq('is_active', true);
    if (aErr && aErr.code !== '42P01') {
      return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
    }
    const assignments = (aData ?? []) as Array<{ id: string; staff_email: string; route_id: string }>;
    const assignmentsByRoute = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const arr = assignmentsByRoute.get(a.route_id) ?? [];
      arr.push(a);
      assignmentsByRoute.set(a.route_id, arr);
    }

    const sharesByAssignment = await loadSharesForRoutes(svc, routeIds);

    // The day's bookings and marks, per route.
    const bookedByRoute = new Map<string, string[]>();
    const markedByRoute = new Map<string, string[]>();
    for (const c of chunk(routeIds)) {
      const [{ data: bk, error: bErr }, { data: at, error: atErr }] = await Promise.all([
        svc.from('tms_booking').select('route_id, learner_id').in('route_id', c).eq('travel_date', date),
        svc.from('tms_attendance').select('route_id, learner_id').in('route_id', c).eq('trip_date', date),
      ]);
      // Never let either failure read as "the bus never ran" or "nobody
      // marked" — this board is what the office acts on.
      if (bErr) return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
      if (atErr) return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
      for (const b of (bk ?? []) as { route_id: string; learner_id: string }[]) {
        bookedByRoute.set(b.route_id, [...(bookedByRoute.get(b.route_id) ?? []), b.learner_id]);
      }
      for (const m of (at ?? []) as { route_id: string; learner_id: string }[]) {
        markedByRoute.set(m.route_id, [...(markedByRoute.get(m.route_id) ?? []), m.learner_id]);
      }
    }

    const { data: absData, error: absErr } = await svc
      .from('tms_incharge_absence')
      .select('assignment_id, absence_date, covering_assignment_id, cover_status')
      .eq('absence_date', date);
    // Never let a failed load read as "nobody is excused" — that would list
    // legitimately absent in-charges as coverage gaps the office then chases.
    if (absErr) return NextResponse.json({ error: 'Failed to load absences' }, { status: 500 });
    const absences = (absData ?? []) as AbsenceRow[];

    const totals = { routes: routes.length, unowned: 0, emptyShares: 0, unmarkedShares: 0 };
    const out = [];
    for (const r of routes) {
      const rowAssignments = assignmentsByRoute.get(r.id) ?? [];
      const staff = await getBoardingStaffForRoute(svc, r.id);
      const nameByEmail = new Map(staff.map((s) => [s.email, s.name] as const));

      let allocated = 0;
      let emptyShares = 0;
      const unmarked: Array<{ staff_email: string; staff_name: string; required: number; marked: number }> = [];
      for (const a of rowAssignments) {
        const share = sharesByAssignment.get(a.id) ?? [];
        allocated += share.length;
        if (share.length === 0) emptyShares += 1;
        if (isExcused(a.id, date, absences)) continue;
        // Duty is the own share PLUS any share accepted as cover today —
        // must match lib/boarding/share-coverage.ts
        // exactly, or the board shows green while the cron strikes/bills
        // someone for a covered share it holds them answerable for. Both
        // shares are already loaded in `sharesByAssignment`, so this union
        // costs no extra query.
        const shareIds = new Set(share);
        for (const covered of delegatedTo(a.id, date, absences)) {
          for (const id of sharesByAssignment.get(covered) ?? []) shareIds.add(id);
        }
        const duty = shareDuty({
          shareLearnerIds: [...shareIds],
          bookedLearnerIds: bookedByRoute.get(r.id) ?? [],
        });
        const coverage = shareCovered({ duty, markedLearnerIds: markedByRoute.get(r.id) ?? [] });
        if (!coverage.covered) {
          unmarked.push({
            staff_email: a.staff_email,
            staff_name: nameByEmail.get(a.staff_email.toLowerCase()) ?? a.staff_email,
            required: coverage.required,
            marked: coverage.marked,
          });
        }
      }

      const students = studentsByRoute.get(r.id) ?? 0;
      const unowned = students - allocated;
      totals.unowned += Math.max(0, unowned);
      totals.emptyShares += emptyShares;
      totals.unmarkedShares += unmarked.length;
      out.push({
        route_id: r.id,
        route_number: r.route_number,
        route_name: r.route_name,
        students,
        inCharges: rowAssignments.length,
        unowned: Math.max(0, unowned),
        emptyShares,
        unmarked,
      });
    }

    return NextResponse.json({ success: true, data: { date, routes: out, totals } });
  } catch (e) {
    console.error('admin incharge coverage error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getCoverage(request, auth));
