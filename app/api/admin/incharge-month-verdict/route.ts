/**
 * Admin-facing read of the recorded month verdicts.
 *
 * Deliberately NOT a proxy to the cron route: that one holds the CRON_SECRET
 * and can mutate. This reads what the job already recorded, so the board can
 * never cause a verdict as a side effect of being looked at.
 */
import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

export const GET = withAuth(async (request, auth) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVERS_ASSIGN))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const month = new URL(request.url).searchParams.get('month');
  const svc = createServiceRoleClient();
  let q = svc
    .from('tms_incharge_month_verdict')
    .select('*')
    .order('decided_at', { ascending: false });
  if (month && /^\d{4}-\d{2}$/.test(month)) q = q.eq('month', `${month}-01`);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: 'Failed to load verdicts' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
});
