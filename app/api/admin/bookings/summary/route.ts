import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookedCount, routeCapacity } from '@/lib/booking/repo';
import { bookableDates } from '@/lib/booking/window';

/**
 * Per-route booked-vs-capacity load for a date (default: tomorrow). Read-only
 * planning view — the "passive counts" optimization signal.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteRow { id: string; route_number: string | null; route_name: string | null }

async function getSummary(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const qp = new URL(request.url).searchParams.get('date') ?? '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(qp) ? qp : bookableDates()[0]; // default tomorrow

    const svc = createServiceRoleClient();
    const { data: routes, error } = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .eq('status', 'active')
      .order('route_number', { ascending: true });
    if (error) {
      if ((error as { code?: string }).code === '42P01') {
        return NextResponse.json({ success: true, data: { date, routes: [] } });
      }
      console.error('admin/bookings/summary error:', error);
      return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });
    }

    const rows = await Promise.all(
      ((routes ?? []) as RouteRow[]).map(async (r) => ({
        id: r.id,
        label: `${r.route_number ?? '—'} · ${r.route_name ?? ''}`.trim(),
        booked: await bookedCount(svc, r.id, date),
        capacity: await routeCapacity(svc, r.id),
      }))
    );

    return NextResponse.json({ success: true, data: { date, routes: rows } });
  } catch (e) {
    console.error('admin/bookings/summary error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getSummary(request, auth));
