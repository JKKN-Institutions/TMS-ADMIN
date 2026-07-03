import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getInbox } from '@/lib/notifications/inbox';

/**
 * GET the signed-in user's TMS notification inbox — shared by every portal (admin
 * bell, learner, driver, boarding). No extra permission: a user always reads their
 * OWN recipient rows (own-row RLS + the user_id filter guard it). Returns items
 * (newest first, expired hidden) and a global unread count.
 */
async function handleGet(request: NextRequest, auth: AuthContext) {
  try {
    const limitParam = parseInt(new URL(request.url).searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

    const svc = createServiceRoleClient();
    const { items, unreadCount } = await getInbox(svc, auth.userId, { limit });

    return NextResponse.json({
      success: true,
      data: { items, unread_count: unreadCount, has_more: items.length === limit },
    });
  } catch (e) {
    console.error('GET /api/notifications:', e);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
