import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { authFromRequest, type AuthContext } from '@/lib/api/with-auth';
import { logActivity } from '@/lib/activity/log';
import { OnboardError } from '@/lib/drivers/onboard';
import { setDriverActive } from '@/lib/drivers/status';

async function requireManage(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
  return !!data;
}

/**
 * POST { active: boolean } — mark a driver inactive or active.
 *
 * Inactive writes the employee flag on the `staff` row shared with MyJKKN, so the
 * person shows as Inactive there and can no longer sign in, and takes them off
 * their route and bus. withAuth cannot wrap a dynamic route, so auth and
 * permission are checked here, before any read.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const auth = authFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await requireManage(auth))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { driverId } = await params;
    if (!driverId) return NextResponse.json({ error: 'Driver id is required' }, { status: 400 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const active = (body as { active?: unknown } | null)?.active;
    if (typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Choose active or inactive' }, { status: 400 });
    }

    const result = await setDriverActive(createServiceRoleClient(), driverId, active, auth.userId);

    const released = result.routes.length ? ` and removed from ${result.routes.map((r) => r.label).join(', ')}` : '';
    await logActivity(auth, request, {
      module: 'drivers',
      action: 'update',
      entityType: 'staff',
      entityId: result.id,
      description: `Marked driver ${result.name} ${active ? 'active' : 'inactive'}${released}`,
      metadata: { active, changed: result.changed, routes: result.routes.map((r) => r.id) },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OnboardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('Driver status API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
