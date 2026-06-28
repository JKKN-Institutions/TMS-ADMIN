import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { applyVehicleSwaps } from '@/lib/route-optimization/apply';
import { logActivity } from '@/lib/activity/log';

/**
 * POST /api/admin/route-optimization/apply-vehicle
 * Body: { date: 'YYYY-MM-DD', swaps: [{ routeId, toVehicleId }] }
 *
 * Right-sizing: reassign routes to better-fitting spare vehicles. Records an
 * undoable run (reversed via /rollback). Requires tms.routes.edit.
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
  const rawSwaps = Array.isArray(body?.swaps) ? body.swaps : [];
  const swaps = rawSwaps.filter(
    (s: unknown): s is { routeId: string; toVehicleId: string } =>
      !!s &&
      typeof (s as Record<string, unknown>).routeId === 'string' &&
      typeof (s as Record<string, unknown>).toVehicleId === 'string'
  );
  if (swaps.length === 0) {
    return NextResponse.json({ error: 'Select at least one vehicle change to apply' }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await applyVehicleSwaps(supabase, { date, swaps, actorId: auth.userId });
    await logActivity(auth, request, {
      module: 'route-optimization',
      action: 'assign',
      entityType: 'tms_route',
      entityId: result.runId,
      entityLabel: `${result.applied} vehicle change(s)`,
      description: `Right-sized ${result.applied} route vehicle(s) on ${date}${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}`,
      metadata: { ...result },
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('route-optimization: vehicle swap failed', error);
    return NextResponse.json({ error: 'Failed to apply vehicle changes' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
