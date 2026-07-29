import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import {
  loadBookedRoster, buildRosterRows,
  type OrderedStop, type RosterRow, type RosterAttendance,
} from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

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
  previous_status: string | null;
  previous_scanned_by: string | null;
  previous_scanned_at: string | null;
}

/**
 * GET /api/boarding/attendance/roster?date=&direction= — today's (or any day's)
 * booked students across the staff's assigned routes, each joined to their
 * attendance for the selected leg. Route-scoped to the staff's assigned routes
 * (super admins see all). Counts are derived from the produced rows so
 * Marked + Unmarked === Total always holds.
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

    let routeIds = await getAssignedRouteIdsForUser(auth);
    if (routeIds.length === 0 && auth.isSuperAdmin) {
      const { data } = await svc.from('tms_route').select('id');
      routeIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }
    const empty = { success: true, data: { date, direction, rows: [] as RosterRow[], counts: { total: 0, present: 0, absent: 0, unmarked: 0 } } };
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

    const { data: attData, error: attErr } = await svc
      .from('tms_attendance')
      .select(
        'learner_id, status, method, scanned_at, scanned_by, previous_status, previous_scanned_by, previous_scanned_at',
      )
      .in('route_id', routeIds)
      .eq('trip_date', date)
      .eq('direction', direction);
    // A failed read must not render as "nobody is marked" — on this screen that
    // reads as an empty roster inviting staff to re-mark everyone.
    if (attErr) {
      console.error('boarding attendance roster attendance error:', attErr);
      return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
    }
    const attRows = (attData ?? []) as AttRow[];

    // Marker names for both the current and the replaced mark, in one lookup.
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
        previous_status: a.previous_status,
        previous_by_name: a.previous_scanned_by ? markerNames.get(a.previous_scanned_by) ?? null : null,
        previous_at: a.previous_scanned_at,
      });
    }

    // Authority for the lock, resolved ONCE for the whole roster. requirePerm
    // already returns true for super admins, so isSuperAdmin is passed separately
    // only to keep decideMark's inputs explicit.
    const viewer = {
      actorId: auth.userId,
      isOverrideHolder: await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE),
      isSuperAdmin: auth.isSuperAdmin,
    };

    const rows: RosterRow[] = [];
    for (const rt of routes) {
      const { riders } = await loadBookedRoster(svc, rt.id, date);
      rows.push(
        ...buildRosterRows(
          riders,
          { id: rt.id, route_number: rt.route_number },
          stopsByRoute.get(rt.id) ?? [],
          attByLearner,
          viewer,
        ),
      );
    }

    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    return NextResponse.json({
      success: true,
      data: { date, direction, rows, counts: { total: rows.length, present, absent, unmarked: rows.length - present - absent } },
    });
  } catch (e) {
    console.error('boarding attendance roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRoster(request, auth));
