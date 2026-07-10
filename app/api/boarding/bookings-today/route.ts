import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { loadBookedRoster, groupRosterByStop, type OrderedStop } from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteRow { id: string; route_number: string | null; route_name: string | null }
interface StopRow { id: string; route_id: string; stop_name: string; stop_time: string | null; sequence_order: number | null }

/**
 * GET /api/boarding/bookings-today?date=YYYY-MM-DD — students who booked today
 * across the signed-in staff's assigned route(s), grouped by boarding stop. Same
 * authority boundary as the roster route (assigned routes only; super admins see all).
 */
async function getBookingsToday(request: NextRequest, auth: AuthContext) {
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

    const svc = createServiceRoleClient();

    let routeIds = await getAssignedRouteIdsForUser(auth);
    if (routeIds.length === 0 && auth.isSuperAdmin) {
      const { data } = await svc.from('tms_route').select('id');
      routeIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }
    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, data: { date, routes: [] } });
    }

    const { data: routeData } = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .in('id', routeIds)
      .order('route_number', { ascending: true });
    const routes = (routeData ?? []) as RouteRow[];

    const { data: stopData } = await svc
      .from('tms_route_stop')
      .select('id, route_id, stop_name, stop_time, sequence_order')
      .in('route_id', routeIds)
      .order('sequence_order', { ascending: true });
    const stopsByRoute = new Map<string, OrderedStop[]>();
    for (const s of (stopData ?? []) as StopRow[]) {
      const arr = stopsByRoute.get(s.route_id) ?? [];
      arr.push({ id: s.id, name: s.stop_name, time: s.stop_time, order: s.sequence_order });
      stopsByRoute.set(s.route_id, arr);
    }

    const out: Array<{
      id: string; label: string; counts: { booked: number; capacity: number };
      stops: ReturnType<typeof groupRosterByStop>;
    }> = [];
    for (const rt of routes) {
      const { counts, riders } = await loadBookedRoster(svc, rt.id, date);
      out.push({
        id: rt.id,
        label: `${rt.route_number ?? '?'} · ${rt.route_name ?? ''}`.trim(),
        counts,
        stops: groupRosterByStop(riders, stopsByRoute.get(rt.id) ?? []),
      });
    }

    return NextResponse.json({ success: true, data: { date, routes: out } });
  } catch (e) {
    console.error('boarding bookings-today error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getBookingsToday(request, auth));
