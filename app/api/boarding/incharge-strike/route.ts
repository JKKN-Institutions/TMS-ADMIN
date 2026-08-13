/** The signed-in in-charge's own current strike state, for the portal banner. */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { REMOVAL_THRESHOLD } from '@/lib/boarding/incharge-attendance';

async function handler(_request: NextRequest, auth: AuthContext) {
  const svc = createServiceRoleClient();

  // Shadow and off are dry runs from the staffer's point of view: strikes are
  // being recorded, but the cron has warned nobody, so showing a warning here
  // would alarm someone who was never actually warned.
  const cfg = await loadSchedulingConfig(svc);
  if (cfg.inchargeEnforcementMode !== 'enforce') {
    return NextResponse.json({ success: true, data: null });
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('email')
    .eq('id', auth.userId)
    .maybeSingle();
  if (!profile?.email) return NextResponse.json({ success: true, data: null });

  const { data } = await svc
    .from('tms_incharge_attendance_strike')
    .select('consecutive_misses, missed_dates, removed_at')
    .ilike('staff_email', emailIlikePattern(profile.email))
    .maybeSingle();

  if (!data || data.removed_at || (data.consecutive_misses ?? 0) < 1) {
    return NextResponse.json({ success: true, data: null });
  }
  return NextResponse.json({
    success: true,
    data: {
      consecutiveMisses: data.consecutive_misses,
      missedDates: (data.missed_dates as string[] | null) ?? [],
      // One more miss and the role goes. Drives the escalated banner.
      isFinalWarning: (data.consecutive_misses ?? 0) >= REMOVAL_THRESHOLD - 1,
    },
  });
}

export const GET = withAuth(handler);
