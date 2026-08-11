import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { generateBills, type GenerateOutcome } from '@/lib/fees/generate';

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

    // An EXPLICIT empty array is rejected outright: intersectPersonIds reads "no
    // usable ids" as "no scoping applied" (by design, for the absent-field case),
    // so a selection UI that serialises "nothing selected" as [] would otherwise
    // silently bill the ENTIRE cohort instead of nobody. An absent personIds
    // field keeps meaning "bill everyone".
    if (Array.isArray(body?.personIds) && body.personIds.length === 0) {
      return NextResponse.json(
        { error: 'personIds was provided but empty. Omit personIds to bill everyone, or include at least one id.' },
        { status: 400 }
      );
    }
    const personIds: string[] | null = Array.isArray(body?.personIds)
      ? (body.personIds as unknown[]).map((v) => String(v))
      : null;

    const result = await generateBills(createServiceRoleClient(), {
      feeStructureId: id,
      mode,
      personIds,
      actorId: auth.userId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (mode === 'dry_run') {
      return NextResponse.json({ success: true, data: result.data });
    }

    const out = result.data as GenerateOutcome;
    await logActivity(auth, request, {
      module: 'fees',
      action: 'generate',
      entityType: 'tms_fee_structure',
      entityId: id,
      entityLabel: out.structureName,
      description: `Generated transport bills for ${out.structureName}: ${out.learnerBilled} learner bill(s), ${out.staffDeferred} staff deferred, ${out.skipped} skipped, ${out.unresolved} unresolved`,
      metadata: {
        runId: out.runId,
        learnerBilled: out.learnerBilled,
        staffDeferred: out.staffDeferred,
        skipped: out.skipped,
        unresolved: out.unresolved,
        overridden: out.overridden,
        errors: out.errors,
        feeMode: out.feeMode,
        notified: out.notified,
      },
    });

    return NextResponse.json({
      success: true,
      data: out,
      message: `Generated ${out.learnerBilled} learner bill(s); ${out.staffDeferred} staff bill(s); ${out.notified} staff notified; ${out.skipped} already billed (skipped)${out.unresolved ? `; ${out.unresolved} unresolved` : ''}.`,
    });
  } catch (e) {
    console.error('Fee generation error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => generate(request, auth));
