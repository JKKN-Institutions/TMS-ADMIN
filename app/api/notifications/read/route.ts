import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { markRead } from '@/lib/notifications/inbox';

/**
 * POST mark the signed-in user's notifications read.
 *   body { all: true }        → clear every unread row
 *   body { ids: [recId, …] }  → mark just those recipient rows
 * Only the caller's OWN rows are ever touched (user_id filter). No extra permission.
 */
async function handlePost(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown; all?: unknown };
    const all = body.all === true;
    const ids = Array.isArray(body.ids) ? (body.ids.filter((x) => typeof x === 'string') as string[]) : [];

    if (!all && ids.length === 0) {
      return NextResponse.json({ error: 'Provide ids[] or all:true' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const updated = await markRead(svc, auth.userId, { ids, all });

    return NextResponse.json({ success: true, data: { updated } });
  } catch (e) {
    console.error('POST /api/notifications/read:', e);
    return NextResponse.json({ error: 'Failed to mark read' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
