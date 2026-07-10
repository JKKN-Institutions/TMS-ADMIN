import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { loadBookedRoster, groupRosterByStop, type OrderedStop } from '@/lib/booking/roster';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * GET /api/driver/roster?date=YYYY-MM-DD — the students who BOOKED today (or the
 * given date) on the signed-in driver's route(s), grouped by boarding stop in
 * pickup order. Authority boundary: routes derive from the driver's identity via
 * getDriverRoutes, never from input, so a driver only ever sees their own routes.
 */
async function getRoster(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
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

    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);
    const svc = createServiceRoleClient();

    const out: Array<{
      id: string; label: string; counts: { booked: number; capacity: number };
      stops: ReturnType<typeof groupRosterByStop>;
    }> = [];
    for (const rt of routes) {
      const { counts, riders } = await loadBookedRoster(svc, rt.id, date);
      const orderedStops: OrderedStop[] = rt.stops.map((s) => ({ id: s.id, name: s.name, time: s.time, order: s.order }));
      out.push({ id: rt.id, label: rt.label, counts, stops: groupRosterByStop(riders, orderedStops) });
    }

    return NextResponse.json({ success: true, data: { date, routes: out } });
  } catch (e) {
    console.error('driver/roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRoster(request, auth));
