import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/auth/require-perm';
import { istToday } from '@/lib/booking/window';
import { checkerRouteIds } from '@/lib/route-check/access';
import { selectIn } from '@/lib/route-check/admin';
import type { MyCheckRoute, CheckStatus } from '@/lib/route-check/types';

type RouteRow = { id: string; route_number: string | null; route_name: string | null; vehicle_id: string | null; status: string | null };

/**
 * GET — the routes this user may check today, with today's check per leg.
 * Super admins and Route Check managers see every active route.
 */
async function myRoutes(_req: NextRequest, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();
    const manager = await requirePerm(auth, TMS_PERMISSIONS.ROUTE_CHECK_MANAGE);
    let routes: RouteRow[];
    if (manager) {
      const { data, error } = await svc.from('tms_route').select('id, route_number, route_name, vehicle_id, status').eq('status', 'active').order('route_number');
      if (error) throw new Error(`routes read failed: ${error.message}`);
      routes = (data ?? []) as RouteRow[];
    } else {
      const ids = await checkerRouteIds(svc, auth.userId);
      routes = ids.length ? await selectIn<RouteRow>(svc, 'tms_route', 'id, route_number, route_name, vehicle_id, status', 'id', ids) : [];
      routes.sort((a, b) => (a.route_number ?? '').localeCompare(b.route_number ?? '', undefined, { numeric: true }));
    }
    const vehicles = await selectIn<{ id: string; registration_number: string | null }>(
      svc, 'tms_vehicle', 'id, registration_number', 'id', routes.map((r) => r.vehicle_id ?? ''));
    const regById = new Map(vehicles.map((v) => [v.id, v.registration_number]));

    const today = istToday();
    const { data: todays, error: tErr } = await svc.from('tms_route_check').select('id, route_id, leg, status')
      .eq('checker_id', auth.userId).eq('check_date', today).order('started_at', { ascending: false });
    if (tErr) throw new Error(`today checks read failed: ${tErr.message}`);
    const byRoute = new Map<string, MyCheckRoute['today']>();
    for (const c of (todays ?? []) as { id: string; route_id: string; leg: 'onward' | 'return'; status: CheckStatus }[]) {
      const t = byRoute.get(c.route_id) ?? { onward: null, return: null };
      if (!t[c.leg]) t[c.leg] = { id: c.id, status: c.status };
      byRoute.set(c.route_id, t);
    }
    const data: MyCheckRoute[] = routes.map((r) => ({
      routeId: r.id, routeNumber: r.route_number, routeName: r.route_name,
      vehicleReg: r.vehicle_id ? regById.get(r.vehicle_id) ?? null : null,
      today: byRoute.get(r.id) ?? { onward: null, return: null },
    }));
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check my routes error:', e);
    return NextResponse.json({ error: 'Failed to load your routes' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => myRoutes(request, auth));
