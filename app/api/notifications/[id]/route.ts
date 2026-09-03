import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getInboxItem } from '@/lib/notifications/inbox';

/**
 * GET one notification from the signed-in user's own inbox — the read behind the
 * notification view page (bell item / inbox row → /<portal>/notifications/<id>).
 * The `id` is a tms_notification_recipient.id, the same handle the list and mark-read
 * use. Like GET /api/notifications this needs no extra permission: getInboxItem scopes
 * the lookup to auth.userId, so another user's row simply reads as 404.
 *
 * withAuth does not forward Next's route `params`, so the id comes off the pathname
 * (…/api/notifications/<id>) — same approach as the admin notifications [id] route.
 */
function idFromPath(request: NextRequest): string {
  const segs = request.nextUrl.pathname.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? '';
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  try {
    const id = idFromPath(request);
    if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const svc = createServiceRoleClient();
    const item = await getInboxItem(svc, auth.userId, id);
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, data: item });
  } catch (e) {
    console.error('GET /api/notifications/[id]:', e);
    return NextResponse.json({ error: 'Failed to load notification' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
