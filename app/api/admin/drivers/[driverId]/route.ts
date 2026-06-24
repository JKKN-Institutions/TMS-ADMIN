import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { STAFF_SELECT, mapStaffToDriver, type StaffRow, type OpsRow } from '@/lib/drivers/map';
import { getRoutesForDrivers } from '@/lib/drivers/routes';

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
