import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { generateForStructure } from '@/lib/fees/generate';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route context, so pull the [id] from the path:
// /api/admin/fees/<id>/generate
function feeIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('fees');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

async function generate(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_GENERATE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = feeIdFromPath(request);
    if (!id) return NextResponse.json({ error: 'Fee structure id is required' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const mode: 'dry_run' | 'generate' = body?.mode === 'generate' ? 'generate' : 'dry_run';
    const supabase = createServiceRoleClient();

    const { data: fs } = await supabase.from('tms_fee_structure').select('*').eq('id', id).maybeSingle();
    if (!fs) return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
    if (fs.status !== 'active') {
      return NextResponse.json({ error: 'Activate the fee structure before generating bills.' }, { status: 400 });
    }

    const outcome = await generateForStructure(supabase, fs, { mode, triggeredBy: auth.userId });
    if (outcome.kind === 'invalid') return NextResponse.json({ error: outcome.message }, { status: 400 });
    if (outcome.kind === 'failed') return NextResponse.json({ error: outcome.message }, { status: 500 });
    if (outcome.kind === 'dry_run') return NextResponse.json({ success: true, data: outcome.preview });

    const s = outcome.summary;
    await logActivity(auth, request, {
      module: 'fees',
      action: 'generate',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: fs.name,
      description: `Generated transport bills for ${fs.name}: ${s.learnerBilled} learner bill(s), ${s.staffDeferred} staff deferred, ${s.skipped} skipped, ${s.unresolved} unresolved`,
      metadata: { runId: s.runId, learnerBilled: s.learnerBilled, staffDeferred: s.staffDeferred, skipped: s.skipped, unresolved: s.unresolved, errors: s.errors, feeMode: s.feeMode },
    });

    return NextResponse.json({
      success: true,
      data: { mode: 'generate', runId: s.runId, applicable: s.applicable, learnerBilled: s.learnerBilled, staffDeferred: s.staffDeferred, skipped: s.skipped, unresolved: s.unresolved, errors: s.errors },
      message: `Generated ${s.learnerBilled} learner bill(s); ${s.staffDeferred} staff deferred; ${s.skipped} already billed (skipped)${s.unresolved ? `; ${s.unresolved} unresolved` : ''}.`,
    });
  } catch (e) {
    console.error('Fee generation error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => generate(request, auth));
