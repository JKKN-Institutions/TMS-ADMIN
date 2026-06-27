import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import {
  addPortalComment,
  createPortalGrievance,
  listPortalGrievances,
  loadPortalGrievance,
  type PortalRoute,
} from '@/lib/grievances/portal';

/**
 * Boarding-staff self-service transport grievances (mirrors /api/student/grievances,
 * but the submitter is boarding staff — submitter_profile_id + submitter_type='boarding').
 *   GET           -> list own grievances (+ linkable assigned route)
 *   GET ?id=X     -> one grievance + comment thread (ownership-checked)
 *   POST {action:'create', ...}                    -> submit a grievance
 *   POST {action:'comment', grievanceId, message}  -> add a comment
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function boardingRoutes(auth: AuthContext, svc: ReturnType<typeof createServiceRoleClient>): Promise<PortalRoute[]> {
  const ids = await getAssignedRouteIdsForUser(auth);
  if (ids.length === 0) return [];
  const refs = await loadPassengerRefs(svc, { institutionIds: [], departmentIds: [], routeIds: ids, stopIds: [] });
  return ids.map((id) => {
    const r = refs.routes.get(id);
    return { id, label: r ? `${r.routeNumber} · ${r.routeName}` : id };
  });
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.GRIEVANCES_SUBMIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const svc = createServiceRoleClient();
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    const detail = await loadPortalGrievance(svc, auth.userId, 'boarding', id);
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: detail });
  }

  const routes = await boardingRoutes(auth, svc);
  const data = await listPortalGrievances(svc, auth.userId, 'boarding', routes);
  return NextResponse.json({ success: true, data });
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.GRIEVANCES_SUBMIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const svc = createServiceRoleClient();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === 'comment') {
    const r = await addPortalComment(svc, {
      profileId: auth.userId,
      type: 'boarding',
      grievanceId: String(body.grievanceId ?? ''),
      message: String(body.message ?? ''),
    });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true });
  }

  const r = await createPortalGrievance(svc, { profileId: auth.userId, type: 'boarding', body });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, id: r.data.id });
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const POST = withAuth((request, auth) => handlePost(request, auth));
