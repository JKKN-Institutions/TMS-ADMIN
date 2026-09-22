import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadLearnerNotice } from '@/lib/fees/payment-notice/learner-notice';

// Returns the logged-in learner's transport-fee access status (single source of
// truth = the tms_student_transport_access RPC, also used by proxy.ts). Consumed
// by the /student/fees page. Exempt from the payment gate so a blocked learner
// can still load their own status.
async function getAccess(auth: AuthContext) {
  try {
    const { data, error } = await auth.supabase.rpc('tms_student_transport_access', {
      p_profile_id: auth.userId,
    });
    if (error) {
      console.error('transport-access RPC error:', error);
      return NextResponse.json({ error: 'Failed to evaluate transport access' }, { status: 500 });
    }
    // Additive fields for the 48-hour payment countdown. Read failures must
    // never break the access check itself, so they degrade to "no notice".
    let payment_notice = null;
    const yearId = (data as { transport_year_id?: string | null } | null)?.transport_year_id ?? null;
    if (yearId) {
      try {
        payment_notice = await loadLearnerNotice(createServiceRoleClient(), {
          profileId: auth.userId,
          email: auth.email,
          transportYearId: yearId,
        });
      } catch (e) {
        console.error('transport-access payment notice read failed (non-fatal):', e);
      }
    }
    return NextResponse.json({
      success: true,
      data: { ...(data as object), payment_notice, server_now: new Date().toISOString() },
    });
  } catch (e) {
    console.error('transport-access error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_request, auth) => getAccess(auth));
