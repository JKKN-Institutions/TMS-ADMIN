import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

/**
 * GET the signed-in learner's notifications (read-only inbox).
 *
 * The notifications table targets a specific user via the `targeting` jsonb
 * ({"type":"user","user_id":<profiles.id>}). We list those addressed to this user
 * and drop expired ones. Read-state / acknowledgment is intentionally NOT handled
 * yet — the system's recipient-policy model is a later concern (Phase 8 / push).
 */
interface NotifRow {
  id: string;
  title: string | null;
  body: string | null;
  category: string | null;
  priority: string | null;
  url: string | null;
  created_at: string;
  expires_at: string | null;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getNotifications(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const res = await svc
      .from('notifications')
      .select('id, title, body, category, priority, url, created_at, expires_at')
      .eq('targeting->>user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (res.error) {
      if ((res.error as { code?: string }).code === '42P01') {
        return NextResponse.json({ success: true, data: [] });
      }
      console.error('student/notifications error:', res.error);
      return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
    }

    const nowMs = Date.now();
    const data = ((res.data ?? []) as NotifRow[])
      .filter((n) => !n.expires_at || new Date(n.expires_at).getTime() > nowMs)
      .map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        category: n.category,
        priority: n.priority,
        url: n.url,
        createdAt: n.created_at,
      }));

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('student/notifications error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getNotifications(request, auth));
