import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { parseRuleInput } from '@/lib/fees/concession-rules';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getRules(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const year = sp.get('year');
    if (!year) return NextResponse.json({ error: 'Select a transport year.' }, { status: 400 });
    let q = createServiceRoleClient()
      .from('tms_fee_concession_rule')
      .select('*')
      .eq('transport_year_id', year)
      .order('created_at', { ascending: true });
    const kind = sp.get('kind');
    if (kind) q = q.eq('kind', kind);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error('Concession rules API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postRule(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_APPLY))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const year = typeof body.year === 'string' ? body.year : '';
    if (!year || year === 'all') return NextResponse.json({ error: 'Select a transport year.' }, { status: 400 });
    const parsed = parseRuleInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await createServiceRoleClient()
      .from('tms_fee_concession_rule')
      .insert({ ...parsed.value, transport_year_id: year, created_by: auth.userId })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An active 7.5% rule already exists for this year — edit it instead.' }, { status: 409 });
      }
      throw error;
    }
    await logActivity(auth, request, {
      module: 'fee-concessions', action: 'create', entityType: 'tms_fee_concession_rule',
      entityId: data.id, entityLabel: data.label, description: `Added concession rule "${data.label}"`,
      changes: { after: data },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Concession rules API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getRules(request, auth));
export const POST = withAuth((request, auth) => postRule(request, auth));
