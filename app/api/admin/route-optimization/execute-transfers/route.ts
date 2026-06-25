import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { DEFAULT_OPTIONS } from '@/lib/route-optimization/engine';
import { applyConsolidations } from '@/lib/route-optimization/apply';
import { logActivity } from '@/lib/activity/log';

/**
 * POST /api/admin/route-optimization/execute-transfers
 * Body: { date: 'YYYY-MM-DD', threshold?: number, routeIds: string[] }
 *
 * Applies the consolidation for the selected SOURCE routes: the server re-runs
 * the analysis and moves each feasible booking onto a healthy route, recording a
 * reversible run (see /rollback). Requires tms.routes.edit.
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
  const date: unknown = body?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date (YYYY-MM-DD) is required' }, { status: 400 });
  }

  const thresholdRaw = Number(body?.threshold);
  const threshold =
    Number.isFinite(thresholdRaw) && thresholdRaw >= 1 && thresholdRaw <= 100
      ? Math.round(thresholdRaw)
      : DEFAULT_OPTIONS.underUtilizedMaxPercent;

  const routeIds: string[] = Array.isArray(body?.routeIds)
    ? body.routeIds.filter((x: unknown): x is string => typeof x === 'string')
    : [];
  if (routeIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one route to consolidate' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await applyConsolidations(supabase, {
      date,
      threshold,
      routeIds,
      actorId: auth.userId,
    });

    await logActivity(auth, request, {
      module: 'route-optimization',
      action: 'assign',
      entityType: 'tms_booking',
      entityId: result.runId,
      entityLabel: `${result.totalMoves} transfer(s) · ${date}`,
      description: `Applied route optimization for ${date}: ${result.totalMoves} passenger(s) moved, ${result.routesCancelled} bus(es) freed`,
      metadata: { routeIds, ...result },
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('route-optimization: apply failed', error);
    return NextResponse.json({ error: 'Failed to apply transfers' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
