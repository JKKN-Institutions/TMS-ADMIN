import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { pickServiceCalendar } from '@/lib/schedule-management/fields';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}
const missing = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

async function list(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_VIEW))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '1900-01-01';
  const to = url.searchParams.get('to') ?? '2999-12-31';
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from('tms_service_calendar')
    .select('id, exception_date, route_id, kind, note')
    .gte('exception_date', from).lte('exception_date', to)
    .order('exception_date', { ascending: true });
  if (error) {
    if (missing(error)) return NextResponse.json({ success: true, data: { rows: [] } });
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { rows: data ?? [] } });
}

async function create(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_EDIT))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const picked = pickServiceCalendar(body);
  if ('error' in picked) return NextResponse.json({ error: picked.error }, { status: 400 });
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from('tms_service_calendar')
    .insert({ ...picked, created_by: auth.userId, updated_by: auth.userId })
    .select('id').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'That date already has an exception' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { id: data.id } });
}

async function remove(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SCHEDULES_EDIT))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_service_calendar').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const GET = withAuth((r, a) => list(r, a));
export const POST = withAuth((r, a) => create(r, a));
export const DELETE = withAuth((r, a) => remove(r, a));
