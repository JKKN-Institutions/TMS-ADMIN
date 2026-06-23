import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { pickBookingWindow } from '@/lib/schedule-management/fields';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}
const missing = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

async function list(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_VIEW))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const routeId = url.searchParams.get('route_id');
  if (!routeId) return NextResponse.json({ error: 'route_id is required' }, { status: 400 });
  const from = url.searchParams.get('from') ?? '1900-01-01';
  const to = url.searchParams.get('to') ?? '2999-12-31';
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from('tms_booking_window')
    .select('id, route_id, travel_date, booking_enabled, deadline, capacity_override, note')
    .eq('route_id', routeId).gte('travel_date', from).lte('travel_date', to)
    .order('travel_date', { ascending: true });
  if (error) {
    if (missing(error)) return NextResponse.json({ success: true, data: { rows: [] } });
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { rows: data ?? [] } });
}

async function upsert(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_EDIT))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const picked = pickBookingWindow(body);
  if ('error' in picked) return NextResponse.json({ error: picked.error }, { status: 400 });
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from('tms_booking_window')
    .upsert({ ...picked, updated_by: auth.userId, created_by: auth.userId }, { onConflict: 'route_id,travel_date' })
    .select('id').single();
  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  return NextResponse.json({ success: true, data: { id: data.id } });
}

async function remove(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_EDIT))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_booking_window').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const GET = withAuth((r, a) => list(r, a));
export const POST = withAuth((r, a) => upsert(r, a));
export const DELETE = withAuth((r, a) => remove(r, a));
