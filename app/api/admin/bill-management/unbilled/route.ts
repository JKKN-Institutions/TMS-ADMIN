import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadUnbilledPeople } from '@/lib/fees/bills';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// Applicable bus-required people for a transport year who have no bill yet.
//   /api/admin/bill-management/unbilled?year=<transport_year_id>
async function getUnbilled(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const year = new URL(request.url).searchParams.get('year');
    if (!year || year === 'all') {
      return NextResponse.json({ success: true, data: { count: 0, people: [] } });
    }
    const supabase = createServiceRoleClient();
    const data = await loadUnbilledPeople(supabase, { transportYearId: year });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Bill management unbilled API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getUnbilled(request, auth));
