import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Staff search for the "Create Driver" flow. Searches the MyJKKN-owned `staff`
 * table (the same table the drivers list reads from) by name or email so an
 * admin can pick an existing staff member to assign as a driver.
 *
 * Note: the unrelated /api/admin/staff/search endpoint searches `admin_users`
 * (grievance-assignment admins), which is why this feature needs its own.
 */
interface StaffSearchRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  role_key: string | null;
  is_active: boolean | null;
}

async function searchStaff(request: NextRequest, auth: AuthContext) {
  try {
    if (!auth.isSuperAdmin) {
      const { data: canManage } = await auth.supabase.rpc('user_has_permission', {
        permission_name: 'tms.drivers.manage',
      });
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
      return NextResponse.json({ error: 'Search query must be at least 2 characters' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const pattern = `%${q}%`;
    const { data, error } = await supabase
      .from('staff')
      .select('id, first_name, last_name, designation, email, phone, role_key, is_active')
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
      .order('first_name', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Staff search error:', error);
      return NextResponse.json({ error: 'Failed to search staff' }, { status: 500 });
    }

    const results = ((data ?? []) as StaffSearchRow[]).map((s) => ({
      id: s.id,
      name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || (s.email ?? 'Unknown'),
      designation: s.designation ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      isActive: s.is_active ?? false,
      alreadyDriver: s.role_key === 'driver',
    }));

    return NextResponse.json({ success: true, data: results, count: results.length });
  } catch (e) {
    console.error('Staff search API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => searchStaff(request, auth));
