/** The signed-in in-charge's own current strike state, for the portal banner. */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

async function handler(_request: NextRequest, auth: AuthContext) {
  const svc = createServiceRoleClient();
  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('email')
    .eq('id', auth.userId)
    .maybeSingle();
  if (!profile?.email) return NextResponse.json({ success: true, data: null });

  const { data } = await svc
    .from('tms_incharge_attendance_strike')
    .select('consecutive_misses, missed_dates, removed_at')
    .ilike('staff_email', profile.email)
    .maybeSingle();

  if (!data || data.removed_at || (data.consecutive_misses ?? 0) < 1) {
    return NextResponse.json({ success: true, data: null });
  }
  return NextResponse.json({
    success: true,
    data: {
      consecutiveMisses: data.consecutive_misses,
      missedDates: (data.missed_dates as string[] | null) ?? [],
    },
  });
}

export const GET = withAuth(handler);
