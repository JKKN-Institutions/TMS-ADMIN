import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { loadBookedRoster, buildRosterRows, type OrderedStop, type RosterRow } from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteRow { id: string; route_number: string | null }
interface StopRow { id: string; route_id: string; stop_name: string; stop_time: string | null; evening_time: string | null; sequence_order: number | null }
interface AttRow { learner_id: string; status: string | null; method: string | null; scanned_at: string | null }

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
    const empty = { success: true, data: { date, direction, rows: [] as RosterRow[], counts: { total: 0, marked: 0, unmarked: 0 } } };
    if (routeIds.length === 0) return NextResponse.json(empty);

    const { data: routeData } = await svc
      .from('tms_route').select('id, route_number').in('id', routeIds).order('route_number', { ascending: true });
    const routes = (routeData ?? []) as RouteRow[];

    const { data: stopData } = await svc
      .from('tms_route_stop')
      .select('id, route_id, stop_name, stop_time, evening_time, sequence_order')
      .in('route_id', routeIds)
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
      const { riders } = await loadBookedRoster(svc, rt.id, date);
      rows.push(...buildRosterRows(riders, { id: rt.id, route_number: rt.route_number }, stopsByRoute.get(rt.id) ?? [], attByLearner));
    }

    const marked = rows.filter((r) => r.status === 'present').length;
    return NextResponse.json({
      success: true,
      data: { date, direction, rows, counts: { total: rows.length, marked, unmarked: rows.length - marked } },
    });
  } catch (e) {
    console.error('boarding attendance roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRoster(request, auth));
