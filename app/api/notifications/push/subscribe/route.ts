import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';

/**
 * POST — upsert the caller's push subscription. Uses the USER-scoped client so the
 * own-row RLS insert/update policies enforce ownership (user_id = auth.uid()).
 */
async function handlePost(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
      userAgent?: unknown;
    };
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
    const authKey = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: 'endpoint and keys are required' }, { status: 400 });
    }
    const userAgent = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : null;

    const { error } = await auth.supabase.from('tms_push_subscription').upsert(
      {
        user_id: auth.userId,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    );
    if (error) {
      console.error('push/subscribe upsert:', error.message);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('POST /api/notifications/push/subscribe:', e);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
