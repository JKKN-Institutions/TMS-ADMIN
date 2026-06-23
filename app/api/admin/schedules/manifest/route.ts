import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookedCount, routeCapacity } from '@/lib/booking/repo';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function manifest(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_VIEW))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const routeId = url.searchParams.get('route_id') ?? '';
  const date = url.searchParams.get('date') ?? '';
  if (!routeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'route_id and date (YYYY-MM-DD) are required' }, { status: 400 });
  }
  const svc = createServiceRoleClient();

  const bk = await svc
    .from('tms_booking')
    .select('learner_id, stop_id')
    .eq('route_id', routeId).eq('travel_date', date);
  if (bk.error && (bk.error as { code?: string }).code !== '42P01') {
    return NextResponse.json({ error: 'Failed to load manifest' }, { status: 500 });
  }
  const rows = (bk.data ?? []) as { learner_id: string; stop_id: string | null }[];

  const learnerIds = [...new Set(rows.map((r) => r.learner_id))];
  const stopIds = [...new Set(rows.map((r) => r.stop_id).filter(Boolean) as string[])];

  const namesById = new Map<string, { name: string; roll: string | null }>();
  if (learnerIds.length) {
    const lr = await svc.from('learners_profiles').select('id, first_name, last_name, roll_number').in('id', learnerIds);
    for (const l of (lr.data ?? []) as { id: string; first_name: string | null; last_name: string | null; roll_number: string | null }[]) {
      namesById.set(l.id, { name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || '—', roll: l.roll_number });
    }
  }
  const stopsById = new Map<string, string>();
  if (stopIds.length) {
    const sr = await svc.from('tms_route_stop').select('id, stop_name').in('id', stopIds);
    for (const s of (sr.data ?? []) as { id: string; stop_name: string }[]) stopsById.set(s.id, s.stop_name);
  }

  const learners = rows.map((r) => ({
    id: r.learner_id,
    name: namesById.get(r.learner_id)?.name ?? '—',
    roll: namesById.get(r.learner_id)?.roll ?? null,
    stop: r.stop_id ? stopsById.get(r.stop_id) ?? null : null,
  })).sort((a, b) => a.name.localeCompare(b.name));

  const rt = await svc.from('tms_route').select('route_number, route_name').eq('id', routeId).maybeSingle();
  const routeLabel = rt.data ? `${rt.data.route_number ?? '—'} · ${rt.data.route_name ?? ''}`.trim() : routeId;

  const winRow = await svc.from('tms_booking_window').select('capacity_override').eq('route_id', routeId).eq('travel_date', date).maybeSingle();
  const capOverride = (winRow.data as { capacity_override: number | null } | null)?.capacity_override ?? null;

  return NextResponse.json({
    success: true,
    data: { date, routeLabel, booked: await bookedCount(svc, routeId, date), capacity: capOverride ?? (await routeCapacity(svc, routeId)), learners },
  });
}

export const GET = withAuth((r, a) => manifest(r, a));
