import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { parseRuleInput } from '@/lib/fees/concession-rules';
import { logActivity } from '@/lib/activity/log';

// withAuth drops Next's route context, so pull the [id] from the path:
// /api/admin/fees/concessions/rules/<id>
function idFromPath(request: NextRequest): string {
  const segs = request.nextUrl.pathname.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? '';
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function putRule(request: NextRequest, auth: AuthContext, id: string) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_APPLY))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const parsed = parseRuleInput(await request.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const svc = createServiceRoleClient();
    const { data: before } = await svc.from('tms_fee_concession_rule').select('*').eq('id', id).maybeSingle();
    if (!before) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    if (before.kind !== parsed.value.kind) {
      return NextResponse.json({ error: 'A rule cannot change kind.' }, { status: 400 });
    }
    const { data, error } = await svc
      .from('tms_fee_concession_rule')
      .update({
        ...parsed.value,
        // Omitting is_active on a PUT must never reactivate/deactivate a rule.
        is_active: parsed.isActiveProvided ? parsed.value.is_active : before.is_active,
        updated_at: new Date().toISOString(),
        updated_by: auth.userId,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An active 7.5% rule already exists for this year.' }, { status: 409 });
      }
      throw error;
    }
    await logActivity(auth, request, {
      module: 'fee-concessions',
      action: before.is_active && !data.is_active ? 'deactivate' : !before.is_active && data.is_active ? 'activate' : 'update',
      entityType: 'tms_fee_concession_rule', entityId: id, entityLabel: data.label,
      description: `Updated concession rule "${data.label}"`,
      changes: { before, after: data },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Concession rule update API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PUT = withAuth(async (request, auth) => {
  const id = idFromPath(request);
  return putRule(request, auth, id);
});
