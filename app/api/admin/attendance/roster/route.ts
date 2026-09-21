import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadMarkerNames } from '@/lib/boarding/identity';
import {
  loadRouteAttendanceRoster, buildRosterRows,
  type OrderedStop, type RosterRow, type RosterAttendance,
} from '@/lib/booking/roster';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface StopRow {
  id: string; route_id: string; stop_name: string;
  stop_time: string | null; evening_time: string | null; sequence_order: number | null;
}
interface AttRow {
  learner_id: string; status: string | null; method: string | null;
  scanned_at: string | null; scanned_by: string | null; is_walk_up: boolean | null;
  previous_status: string | null; previous_scanned_by: string | null; previous_scanned_at: string | null;
}

/**
 * GET /api/admin/attendance/roster — one route, one date, one leg.
 *
 * Reuses the SAME pure helpers the boarding staff screen uses
 * (loadRouteAttendanceRoster + buildRosterRows), so present/absent/unmarked,
 * walk-up badges and ownership read identically on both screens. Any date is
 * allowed: viewing history is not marking it.
 */
async function getAdminRoster(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const routeId = url.searchParams.get('routeId') ?? '';
    const date = url.searchParams.get('date') ?? '';
    const direction: 'onward' | 'return' =
      url.searchParams.get('direction') === 'return' ? 'return' : 'onward';

    if (!UUID.test(routeId)) {
      return NextResponse.json({ error: 'routeId must be a UUID' }, { status: 400 });
    }
    if (!ISO_DATE.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    const { data: routeData, error: routeError } = await svc
      .from('tms_route').select('id, route_number, route_name').eq('id', routeId).maybeSingle();
    if (routeError) {
      console.error('admin attendance roster: failed to load route:', routeError);
      return NextResponse.json({ error: 'Failed to load route' }, { status: 500 });
    }
    if (!routeData) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    const route = routeData as { id: string; route_number: string | null; route_name: string | null };

    const { data: stopData, error: stopError } = await svc
      .from('tms_route_stop')
      .select('id, route_id, stop_name, stop_time, evening_time, sequence_order')
      .eq('route_id', routeId).eq('is_active', true)
      .order('sequence_order', { ascending: true });
    if (stopError) {
      console.error('admin attendance roster: failed to load stops:', stopError);
      return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });
    }
    const orderedStops: OrderedStop[] = ((stopData ?? []) as StopRow[]).map((s) => ({
      id: s.id,
      name: s.stop_name,
      time: direction === 'return' ? s.evening_time : s.stop_time,
      order: s.sequence_order,
    }));

    // A failed attendance read must NOT render as "nobody is marked" — on this
    // screen that invites an admin to re-mark a bus that was already done.
    const { data: attData, error: attError } = await svc
      .from('tms_attendance')
      .select(
        'learner_id, status, method, scanned_at, scanned_by, is_walk_up, previous_status, previous_scanned_by, previous_scanned_at',
      )
      .eq('route_id', routeId).eq('trip_date', date).eq('direction', direction);
    if (attError) {
      console.error('admin attendance roster: failed to load attendance:', attError);
      return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
    }
    const attRows = (attData ?? []) as AttRow[];

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

    const riders = await loadRouteAttendanceRoster(svc, routeId, date);

    // An admin on this screen is the correction path by definition: they hold
    // tms.attendance.view, and the write route re-decides every gate server-side
    // anyway, so an over-permissive can_edit hint cannot grant anything.
    const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);
    const rows: RosterRow[] = buildRosterRows(
      riders,
      { id: route.id, route_number: route.route_number },
      orderedStops,
      attByLearner,
      { actorId: auth.userId, isOverrideHolder, isSuperAdmin: auth.isSuperAdmin },
    );

    let present = 0, absent = 0, unmarked = 0, auto = 0;
    for (const r of rows) {
      if (r.status === 'present') present += 1;
      else if (r.status === 'absent') absent += 1;
      else unmarked += 1;
      if (r.method === 'auto') auto += 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        date, direction,
        route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
        rows,
        counts: { total: rows.length, present, absent, unmarked, auto },
      },
    });
  } catch (e) {
    console.error('admin attendance roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAdminRoster(request, auth));
