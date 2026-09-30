import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const POST = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { day?: unknown; reason?: unknown };
  const day = String(body.day ?? '');
  const reason = String(body.reason ?? '').trim();
  if (!ISO_DATE.test(day)) return NextResponse.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 });

  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_incharge_excused_day').upsert({ day, reason, created_by: auth.userId }, { onConflict: 'day' });
  if (error) return NextResponse.json({ error: 'Failed to save the excused day' }, { status: 500 });
  await logActivity(auth, request, {
    module: 'fees', action: 'create', entityType: 'tms_incharge_excused_day', entityId: day,
    entityLabel: day, description: `Excused ${day} from the in-charge bill review: ${reason}`,
  });
  return NextResponse.json({ success: true });
});

export const DELETE = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const day = request.nextUrl.searchParams.get('day') ?? '';
  if (!ISO_DATE.test(day)) return NextResponse.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_incharge_excused_day').delete().eq('day', day);
  if (error) return NextResponse.json({ error: 'Failed to remove the excused day' }, { status: 500 });
  await logActivity(auth, request, {
    module: 'fees', action: 'delete', entityType: 'tms_incharge_excused_day', entityId: day,
    entityLabel: day, description: `Removed excused day ${day} from the in-charge bill review`,
  });
  return NextResponse.json({ success: true });
});
