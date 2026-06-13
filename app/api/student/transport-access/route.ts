import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';

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
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('transport-access error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_request, auth) => getAccess(auth));
