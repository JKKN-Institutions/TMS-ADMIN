import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { applyConcessions, MAX_APPLY } from '@/lib/fees/concessions';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function postApply(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_APPLY))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      year?: string; kind?: string; personIds?: unknown;
    };
    const kind = body.kind;
    if (!body.year || body.year === 'all') {
      return NextResponse.json({ error: 'Select a transport year.' }, { status: 400 });
    }
    if (kind !== 'final_year' && kind !== 'scheme_75') {
      return NextResponse.json({ error: 'Unknown concession kind.' }, { status: 400 });
    }
    const personIds = Array.isArray(body.personIds)
      ? [...new Set(body.personIds.filter((x): x is string => typeof x === 'string' && x.length > 0))]
      : [];
    // An empty selection must never mean "everyone".
    if (!personIds.length) {
      return NextResponse.json({ error: 'Select at least one learner.' }, { status: 400 });
    }
    if (personIds.length > MAX_APPLY) {
      return NextResponse.json({ error: `Apply at most ${MAX_APPLY} learners at a time.` }, { status: 400 });
    }

    const results = await applyConcessions(createServiceRoleClient(), {
      transportYearId: body.year,
      kind,
      personIds,
      actorId: auth.userId,
      today: new Date().toISOString().slice(0, 10),
    });

    const counts: Record<string, number> = {};
    for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    const changed = results.filter((r) => ['repriced', 'ledger_aligned', 'override_only', 'unchanged'].includes(r.outcome));
    if (changed.length) {
      await logActivity(auth, request, {
        module: 'fee-concessions',
        action: 'apply',
        entityType: 'tms_fee_override',
        entityLabel: kind === 'final_year' ? 'Final year 50%' : '7.5% scheme',
        description: `Applied ${kind === 'final_year' ? 'final-year' : '7.5% scheme'} concession to ${changed.length} learner(s)`,
        metadata: { transport_year_id: body.year, kind, counts, person_ids: changed.map((r) => r.personId) },
      });
    }
    return NextResponse.json({ success: true, data: { results } });
  } catch (e) {
    console.error('Fee concessions apply API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => postApply(request, auth));
