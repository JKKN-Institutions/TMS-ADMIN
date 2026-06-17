import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadTransportBills, loadUnbilledPeople } from '@/lib/fees/bills';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// Read-only Bill Management feed: KPI summary + per-term-bill rows from the
// tms_fee_bill ledger (joined to billing_student_bills for learner money).
//   /api/admin/bill-management?year=<transport_year_id|all>
async function getBills(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const year = new URL(request.url).searchParams.get('year');
    const transportYearId = year && year !== 'all' ? year : undefined;

    const supabase = createServiceRoleClient();
    const { summary, rows } = await loadTransportBills(supabase, { transportYearId });

    // Unbilled is year-specific (needs that year's active structures).
    if (transportYearId) {
      const { count } = await loadUnbilledPeople(supabase, { transportYearId });
      summary.unbilledCount = count;
    }

    return NextResponse.json({ success: true, data: { summary, rows }, count: rows.length });
  } catch (e) {
    console.error('Bill management API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getBills(request, auth));
