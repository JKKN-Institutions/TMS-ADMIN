import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { STAFF_SELECT, mapStaffToDriver, type StaffRow, type OpsRow } from '@/lib/drivers/map';
import { getRoutesForDrivers } from '@/lib/drivers/routes';
import { authFromRequest, type AuthContext } from '@/lib/api/with-auth';
import { logActivity } from '@/lib/activity/log';
import { updateDriver } from '@/lib/drivers/edit';
import { OnboardError } from '@/lib/drivers/onboard';

/**
 * GET one driver (staff + TMS ops) by staff id. Backs the in-module view/edit
 * pages so they survive deep-link / hard refresh. Auth is enforced by proxy.ts
 * (every /api route requires an authenticated TMS user), matching the sibling
 * [driverId]/route-assignments handler. withAuth is not used here because it
 * does not forward Next's dynamic `params`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const { driverId } = await params;
    if (!driverId) {
      return NextResponse.json({ error: 'Driver id is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: staffRow, error } = await supabase
      .from('staff')
      .select(STAFF_SELECT)
      .eq('id', driverId)
      .eq('role_key', 'driver')
      .maybeSingle();

    if (error) {
      console.error('Driver detail query error:', error);
      return NextResponse.json({ error: 'Failed to fetch driver' }, { status: 500 });
    }
    if (!staffRow) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const { data: opsRow } = await supabase
      .from('tms_driver')
      .select('*')
      .eq('staff_id', driverId)
      .maybeSingle();

    const ops = (opsRow as OpsRow | null) ?? null;
    const routesByStaff = await getRoutesForDrivers(supabase, [
      { staffId: driverId, assignedRouteId: ops?.assigned_route_id ?? null },
    ]);
    const driver = mapStaffToDriver(staffRow as unknown as StaffRow, ops, routesByStaff.get(driverId) ?? []);
    return NextResponse.json({ success: true, data: driver });
  } catch (e) {
    console.error('Driver detail API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function requireManage(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
  return !!data;
}

/**
 * PATCH a driver: person fields on the shared `staff` row (only when TMS may edit
 * the whole record) plus the TMS-owned `tms_driver` transport row. withAuth cannot
 * wrap a dynamic route, so auth and permission are checked here, before any read.
 */
export async function PATCH(
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
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { person, transport, baseUpdatedAt } = body as {
      person?: unknown;
      transport?: unknown;
      baseUpdatedAt?: unknown;
    };

    const result = await updateDriver(
      createServiceRoleClient(),
      driverId,
      { person, transport, baseUpdatedAt },
      auth.userId,
    );

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'update',
      entityType: 'staff',
      entityId: result.id,
      description:
        (result.changed.length
          ? `Updated driver ${result.id}: ${result.changed.join(', ')}`
          : `Updated driver ${result.id} transport details`) +
        (result.changed.includes('is_active') && result.released ? ' (marked inactive)' : '') +
        (result.released?.routes.length
          ? `; removed from ${result.released.routes.map((r) => r.label).join(', ')}`
          : ''),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OnboardError) {
      return NextResponse.json(
        { error: e.message, ...(e.field ? { field: e.field } : {}), ...(e.fields ? { fields: e.fields } : {}) },
        { status: e.status }
      );
    }
    console.error('Driver update API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
