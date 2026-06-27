import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import {
  addPortalComment,
  createPortalGrievance,
  listPortalGrievances,
  loadPortalGrievance,
  type PortalRoute,
} from '@/lib/grievances/portal';

/**
 * Driver self-service transport grievances (mirrors /api/student/grievances, but the
 * submitter is a driver — stored via submitter_profile_id + submitter_type='driver').
 *   GET           -> list own grievances (+ linkable route)
 *   GET ?id=X     -> one grievance + comment thread (ownership-checked)
 *   POST {action:'create', ...}                    -> submit a grievance
 *   POST {action:'comment', grievanceId, message}  -> add a comment
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function driverRoutes(auth: AuthContext, svc: ReturnType<typeof createServiceRoleClient>): Promise<PortalRoute[]> {
  const driver = await getDriverForUser(auth);
  if (!driver) return [];
  const routes = await getDriverRoutes(driver.staff_id, driver.assigned_route_id, svc);
  return routes.map((r) => ({ id: r.id, label: r.label }));
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.GRIEVANCES_SUBMIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const svc = createServiceRoleClient();
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    const detail = await loadPortalGrievance(svc, auth.userId, 'driver', id);
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: detail });
  }

  const routes = await driverRoutes(auth, svc);
  const data = await listPortalGrievances(svc, auth.userId, 'driver', routes);
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
      type: 'driver',
      grievanceId: String(body.grievanceId ?? ''),
      message: String(body.message ?? ''),
    });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true });
  }

  const r = await createPortalGrievance(svc, { profileId: auth.userId, type: 'driver', body });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, id: r.data.id });
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const POST = withAuth((request, auth) => handlePost(request, auth));
