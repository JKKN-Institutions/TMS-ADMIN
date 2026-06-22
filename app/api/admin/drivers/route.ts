import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import {
  STAFF_SELECT,
  mapStaffToDriver,
  buildOpsPayload,
  type StaffRow,
  type OpsRow,
} from '@/lib/drivers/map';

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
    const drivers = staff.map((s) => mapStaffToDriver(s, opsByStaff.get(s.id) ?? null));
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
 * Create a driver by assigning an EXISTING staff member. Idempotent: flips
 * staff.role_key to 'driver' only when needed, then upserts the tms_driver
 * operational row (onConflict staff_id). Re-running never duplicates.
 *
 * This is the one place TMS writes to the MyJKKN-owned `staff` table, and it is
 * deliberately minimal (a single role_key flip on an admin-chosen staff id).
 */
async function createDriver(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireManage(auth))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const staffId: string | undefined = body?.staffId;
    const f = body?.fields ?? {};
    if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 });

    const supabase = createServiceRoleClient();

    // Verify the staff member exists before mutating anything.
    const { data: staff, error: staffErr } = await supabase
      .from('staff')
      .select('id, role_key')
      .eq('id', staffId)
      .maybeSingle();
    if (staffErr) {
      console.error('Create driver staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Failed to look up staff' }, { status: 500 });
    }
    if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

    // Promote to driver only if not already (avoids needless writes to staff).
    if ((staff as { role_key: string | null }).role_key !== 'driver') {
      const { error: roleErr } = await supabase.from('staff').update({ role_key: 'driver' }).eq('id', staffId);
      if (roleErr) {
        console.error('Create driver role_key update error:', roleErr);
        return NextResponse.json({ error: 'Failed to assign driver role' }, { status: 500 });
      }
    }

    const payload = { ...buildOpsPayload(staffId, f), created_by: auth.userId, updated_by: auth.userId };
    const { data, error } = await supabase
      .from('tms_driver')
      .upsert(payload, { onConflict: 'staff_id' })
      .select()
      .single();
    if (error) {
      console.error('Create driver tms_driver upsert error:', error);
      return NextResponse.json({ error: 'Failed to save driver details' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'drivers',
      action: 'create',
      entityType: 'tms_driver',
      entityId: data?.staff_id ?? staffId,
      description: `Created driver for staff ${staffId}`,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Create driver error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function upsertDriverOps(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireManage(auth))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const staffId: string | undefined = body?.staffId;
    const f = body?.fields ?? {};
    if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const payload = { ...buildOpsPayload(staffId, f), updated_by: auth.userId };
    const { data, error } = await supabase
      .from('tms_driver')
      .upsert(payload, { onConflict: 'staff_id' })
      .select()
      .single();
    if (error) {
      console.error('tms_driver upsert error:', error);
      return NextResponse.json({ error: 'Failed to save driver details' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'drivers',
      action: 'update',
      entityType: 'tms_driver',
      entityId: data?.staff_id ?? staffId,
      description: `Updated driver for staff ${staffId}`,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Driver upsert error:', e);
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
export const PUT = withAuth((request, auth) => upsertDriverOps(request, auth));
export const DELETE = withAuth((request, auth) => deleteDriverOps(request, auth));
