import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { addDays, bookableDates, istToday } from '@/lib/booking/window';
import { loadExceptions } from '@/lib/booking/calendar';
import { loadSchedulingConfig, toWindowOpts } from '@/lib/settings/scheduling';

/**
 * Per-route booked-vs-capacity load for a date (default: tomorrow). Read-only
 * planning view — the "passive counts" optimization signal.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteRow { id: string; route_number: string | null; route_name: string | null; total_capacity: number | null; vehicle_id: string | null }

async function getSummary(request: NextRequest, auth: AuthContext) {
  try {
    const canView = (await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_VIEW)) || (await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_VIEW));
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const qp = new URL(request.url).searchParams.get('date') ?? '';
    const svc = createServiceRoleClient();

    // Default to the next WORKING day, not blind tomorrow — otherwise the admin
    // summary reports on a Sunday or an admin-declared holiday, for which no
    // learner could have booked. routeId null = ALL-ROUTES exceptions only, which
    // is right for a fleet-wide summary. Falls back to tomorrow if the 21-day walk
    // finds no service day at all, so the response always carries a date.
    let date = qp;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const today = istToday();
      const [exceptions, cfg] = await Promise.all([
        loadExceptions(svc, null, addDays(today, 1), addDays(today, 21)),
        loadSchedulingConfig(svc),
      ]);
      date =
        bookableDates(new Date(), {
          ...toWindowOpts(cfg),
          daysAhead: 1,
          offDates: new Set(exceptions.keys()),
        })[0] ?? addDays(today, 1);
    }

    const capMap = new Map<string, number | null>();
    const winRes = await svc.from('tms_booking_window').select('route_id, capacity_override').eq('travel_date', date);
    if (!winRes.error) {
      for (const w of (winRes.data ?? []) as { route_id: string; capacity_override: number | null }[]) capMap.set(w.route_id, w.capacity_override);
    }

    const { data: routes, error } = await svc
      .from('tms_route')
      .select('id, route_number, route_name, total_capacity, vehicle_id')
      .eq('status', 'active')
      .order('route_number', { ascending: true });
    if (error) {
      if ((error as { code?: string }).code === '42P01') {
        return NextResponse.json({ success: true, data: { date, routes: [] } });
      }
      console.error('admin/bookings/summary error:', error);
      return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });
    }
    const routeList = (routes ?? []) as RouteRow[];

    // Booked counts for EVERY route on this date in ONE query, tallied in JS. This
    // replaces a per-route count query — an N+1 that fired one round trip per active
    // route (bookedCount) plus up to two more (routeCapacity → route + vehicle).
    const bookedByRoute = new Map<string, number>();
    const bookedRes = await svc.from('tms_booking').select('route_id').eq('travel_date', date);
    if (!bookedRes.error) {
      for (const b of (bookedRes.data ?? []) as { route_id: string }[]) {
        bookedByRoute.set(b.route_id, (bookedByRoute.get(b.route_id) ?? 0) + 1);
      }
    }
    // A 42P01 (un-migrated tms_booking) just leaves every count at 0 — the same safe
    // default the old repo helper returned.

    // Assigned-vehicle capacities for EVERY route in ONE query. Route counts are
    // bounded (well under the gateway .in() limit), so no chunking needed here.
    const vehicleIds = [...new Set(routeList.map((r) => r.vehicle_id).filter((v): v is string => !!v))];
    const vehCap = new Map<string, number>();
    if (vehicleIds.length) {
      const { data: vehs } = await svc.from('tms_vehicle').select('id, capacity').in('id', vehicleIds);
      for (const v of (vehs ?? []) as { id: string; capacity: number | null }[]) {
        if (typeof v.capacity === 'number' && v.capacity > 0) vehCap.set(v.id, v.capacity);
      }
    }

    // Mirrors routeCapacity() precedence: per-date override wins (matches the old
    // `capMap.get(r.id) ?? routeCapacity(...)`), then a vehicle capacity > 0, then
    // the route's own total_capacity.
    const capacityOf = (r: RouteRow): number => {
      const override = capMap.get(r.id);
      if (override != null) return override;
      if (r.vehicle_id && vehCap.has(r.vehicle_id)) return vehCap.get(r.vehicle_id)!;
      return typeof r.total_capacity === 'number' ? r.total_capacity : 0;
    };

    const rows = routeList.map((r) => ({
      id: r.id,
      label: `${r.route_number ?? '—'} · ${r.route_name ?? ''}`.trim(),
      booked: bookedByRoute.get(r.id) ?? 0,
      capacity: capacityOf(r),
    }));

    return NextResponse.json({ success: true, data: { date, routes: rows } });
  } catch (e) {
    console.error('admin/bookings/summary error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getSummary(request, auth));
