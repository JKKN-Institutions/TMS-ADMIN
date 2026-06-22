import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';

async function bulkDeleteDriverOps(request: NextRequest, auth: AuthContext) {
  try {
    if (!auth.isSuperAdmin) {
      const { data: canManage } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const staffIds: string[] = Array.isArray(body?.staffIds) ? body.staffIds.filter(Boolean) : [];
    if (staffIds.length === 0) return NextResponse.json({ error: 'staffIds is required' }, { status: 400 });

    // Drivers originate from MyJKKN `staff`; we only own the TMS operational rows.
    const supabase = createServiceRoleClient();
    const { error, count } = await supabase
      .from('tms_driver')
      .delete({ count: 'exact' })
      .in('staff_id', staffIds);
    if (error) {
      console.error('tms_driver bulk delete error:', error);
      return NextResponse.json({ error: 'Failed to remove driver operational records' }, { status: 500 });
    }
    const deleted = count ?? staffIds.length;
    await logActivity(auth, request, {
      module: 'drivers',
      action: 'delete',
      entityType: 'tms_driver',
      description: `Bulk deleted ${deleted} driver(s)`,
      metadata: { count: deleted, ids: staffIds },
    });
    return NextResponse.json({ success: true, deleted });
  } catch (e) {
    console.error('Driver bulk delete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => bulkDeleteDriverOps(request, auth));
