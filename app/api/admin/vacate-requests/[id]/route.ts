import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { rejectVacateRequest } from '@/lib/vacate/requests';
import { notifyLearner } from '@/lib/notifications/notify';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// withAuth drops Next's route params, so pull [id] from the path:
// /api/admin/vacate-requests/<id>
function requestIdFromPath(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

async function handlePatch(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.VACATE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = requestIdFromPath(request);
    const body = (await request.json().catch(() => ({}))) as { action?: string; note?: string };
    const svc = createServiceRoleClient();

    // Resolve the learner for notify/logging.
    const { data: reqRow } = await svc
      .from('tms_transport_vacate_request')
      .select('learner_id, status')
      .eq('id', id)
      .maybeSingle();
    if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const learnerId = (reqRow as { learner_id: string }).learner_id;

    if (body.action === 'reject') {
      const note = body.note?.trim();
      if (!note) return NextResponse.json({ error: 'A reason is required to reject.' }, { status: 400 });
      const result = await rejectVacateRequest(svc, { id, approverId: auth.userId, note });
      if (result === 'not_found') return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      if (result === 'not_pending') return NextResponse.json({ error: 'Request is no longer pending' }, { status: 409 });
      await notifyLearner(svc, {
        learnerId,
        actorId: auth.userId,
        title: 'Transport vacate declined',
        body: `Your request to leave the bus was declined: ${note}`,
        url: '/student/fees',
      });
      await logActivity(auth, request, {
        module: 'transport-vacate',
        action: 'reject',
        entityType: 'tms_transport_vacate_request',
        entityId: id,
        entityLabel: learnerId,
        description: 'Rejected transport vacate',
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('admin vacate PATCH error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PATCH = withAuth((request, auth) => handlePatch(request, auth));
