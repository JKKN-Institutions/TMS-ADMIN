import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';

/** POST — delete the caller's subscription for a given endpoint (own-row RLS). */
async function handlePost(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });

    const { error } = await auth.supabase
      .from('tms_push_subscription')
      .delete()
      .eq('user_id', auth.userId)
      .eq('endpoint', endpoint);
    if (error) {
      console.error('push/unsubscribe delete:', error.message);
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('POST /api/notifications/push/unsubscribe:', e);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
