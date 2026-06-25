import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { applyManualMoves } from '@/lib/route-optimization/apply';
import { logActivity } from '@/lib/activity/log';

/**
 * POST /api/admin/route-optimization/execute-transfers
 * Body: { date: 'YYYY-MM-DD', mode?: 'today_booking'|'permanent', threshold?: number, moves: [{learnerId, fromRouteId, toRouteId}] }
 *
 * Validates each move and applies via `applyManualMoves`:
 *  - today_booking → writes to tms_booking for the given date
 *  - permanent     → updates learners_profiles standing allocation
 * Records an undoable run in tms_route_optimization (see /rollback). Requires tms.routes.edit.
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
  const mode = body?.mode === 'permanent' ? 'permanent' : 'today_booking';
  const thresholdRaw = Number(body?.threshold);
  const threshold = Number.isFinite(thresholdRaw) && thresholdRaw >= 1 && thresholdRaw <= 100 ? Math.round(thresholdRaw) : 50;
  const rawMoves = Array.isArray(body?.moves) ? body.moves : [];
  const moves = rawMoves
    .filter((m: unknown): m is { learnerId: string; fromRouteId: string; toRouteId: string } =>
      !!m && typeof (m as Record<string, unknown>).learnerId === 'string'
          && typeof (m as Record<string, unknown>).fromRouteId === 'string'
          && typeof (m as Record<string, unknown>).toRouteId === 'string');
  if (moves.length === 0) {
    return NextResponse.json({ error: 'Select at least one passenger move to apply' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await applyManualMoves(supabase, { date, mode, threshold, moves, actorId: auth.userId });
    await logActivity(auth, request, {
      module: 'route-optimization',
      action: 'assign',
      entityType: mode === 'permanent' ? 'learners_profiles' : 'tms_booking',
      entityId: result.runId,
      entityLabel: `${result.applied} move(s) · ${date}`,
      description: `Applied ${mode === 'permanent' ? 'permanent ' : ''}route allocation for ${date}: ${result.applied} moved, ${result.skipped.length} skipped, ${result.routesCancelled} bus(es) freed`,
      metadata: { ...result },
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('route-optimization: apply failed', error);
    return NextResponse.json({ error: 'Failed to apply allocation' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
