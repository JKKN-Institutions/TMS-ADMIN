import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { STAFF_SELECT, mapStaffToDriver, type StaffRow, type OpsRow } from '@/lib/drivers/map';
import { assignExistingStaffAsDriver } from '@/lib/drivers/assign-existing';
import { OnboardError } from '@/lib/drivers/onboard';
import { getRoutesForDrivers } from '@/lib/drivers/routes';

async function getDrivers() {
  try {
    const supabase = createServiceRoleClient();
    const { data: staffRows, error } = await supabase
      .from('staff')
      .select(STAFF_SELECT)
      .eq('role_key', 'driver')
      .order('first_name', { ascending: true });
    if (error) {
      console.error('Drivers (staff) query error:', error);
      return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
    }
    const staff = (staffRows ?? []) as StaffRow[];
    const ids = staff.map((s) => s.id);
    const { data: opsRows } = ids.length
      ? await supabase.from('tms_driver').select('*').in('staff_id', ids)
      : { data: [] as OpsRow[] };
    const opsByStaff = new Map<string, OpsRow>(((opsRows ?? []) as OpsRow[]).map((o) => [o.staff_id, o]));
    const routesByStaff = await getRoutesForDrivers(
      supabase,
      staff.map((s) => ({ staffId: s.id, assignedRouteId: opsByStaff.get(s.id)?.assigned_route_id ?? null }))
    );
    const drivers = staff.map((s) =>
      mapStaffToDriver(s, opsByStaff.get(s.id) ?? null, routesByStaff.get(s.id) ?? [])
    );
    return NextResponse.json({ success: true, data: drivers, count: drivers.length });
  } catch (e) {
    console.error('Drivers API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function requireManage(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
  return !!data;
}

/**
 * Create a driver by assigning an EXISTING staff member who is not a driver yet:
 * flips staff.role_key to 'driver' when needed and writes the TMS transport
 * details. Someone who already has a tms_driver row gets a 409 and nothing is
 * written (their details change only through Edit).
 */
async function createDriver(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireManage(auth))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: { staffId?: unknown; fields?: unknown } | null = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const staffId = typeof body?.staffId === 'string' ? body.staffId : '';
    if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 });
    const fields =
      typeof body?.fields === 'object' && body.fields !== null && !Array.isArray(body.fields)
        ? (body.fields as Record<string, unknown>)
        : {};

    const data = await assignExistingStaffAsDriver(createServiceRoleClient(), staffId, fields, auth.userId);

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'create',
      entityType: 'tms_driver',
      entityId: (data?.staff_id as string | undefined) ?? staffId,
      description: `Created driver for staff ${staffId}`,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof OnboardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('Create driver error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function deleteDriverOps(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireManage(auth))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const staffId = new URL(request.url).searchParams.get('staffId');
    if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 });

    // Drivers originate from MyJKKN `staff`; we only own the TMS operational row.
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('tms_driver').delete().eq('staff_id', staffId);
    if (error) {
      console.error('tms_driver delete error:', error);
      return NextResponse.json({ error: 'Failed to remove driver operational record' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'drivers',
      action: 'delete',
      entityType: 'tms_driver',
      entityId: staffId,
      description: `Deleted driver ops for staff ${staffId}`,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Driver delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getDrivers());
export const POST = withAuth((request, auth) => createDriver(request, auth));
export const DELETE = withAuth((request, auth) => deleteDriverOps(request, auth));
