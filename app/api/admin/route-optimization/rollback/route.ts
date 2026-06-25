import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { rollbackRun } from '@/lib/route-optimization/apply';
import { logActivity } from '@/lib/activity/log';

/**
 * POST /api/admin/route-optimization/rollback
 * Body: { runId: string }
 *
 * Undoes an applied optimization run: each moved booking is restored to its
 * snapshotted route/stop (only if it is still where the run put it). Requires
 * tms.routes.edit.
 */

async function canEdit(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: TMS_PERMISSIONS.ROUTES_EDIT,
  });
  return !!data;
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await canEdit(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const runId: unknown = body?.runId;
  if (typeof runId !== 'string' || runId.length < 10) {
    return NextResponse.json({ error: 'A valid runId is required' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await rollbackRun(supabase, { runId, actorId: auth.userId });

    await logActivity(auth, request, {
      module: 'route-optimization',
      action: 'update',
      entityType: 'tms_route_optimization',
      entityId: runId,
      entityLabel: `Rolled back ${result.restored} move(s)`,
      description: result.alreadyRolledBack
        ? `Optimization run ${runId} was already rolled back`
        : `Rolled back optimization run ${runId}: ${result.restored} booking(s) restored, ${result.skipped} skipped`,
      metadata: { runId, ...result },
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('route-optimization: rollback failed', error);
    const message = error instanceof Error ? error.message : 'Failed to roll back';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
