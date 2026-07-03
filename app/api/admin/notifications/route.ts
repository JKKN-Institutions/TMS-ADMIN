import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { describeTargeting, type Targeting } from '@/lib/notifications/audience';

/**
 * Admin TMS notifications list (tms_notification). MODERN plane — withAuth +
 * service-role + requirePerm. Compose/send is POST /api/admin/notifications/send;
 * per-notification detail + delete is /api/admin/notifications/[id].
 *   GET ?category=&priority=&search=&limit=  → recent notifications + audience label
 *                                              + denormalized recipient_count.
 */
interface NotifRow {
  id: string;
  title: string | null;
  body: string | null;
  category: string | null;
  priority: string | null;
  targeting: Targeting | null;
  recipient_count: number | null;
  url: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.NOTIFICATIONS_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const svc = createServiceRoleClient();
  const sp = new URL(request.url).searchParams;
  const category = sp.get('category');
  const priority = sp.get('priority');
  const search = sp.get('search');
  const limitRaw = parseInt(sp.get('limit') || '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

  let q = svc
    .from('tms_notification')
    .select('id, title, body, category, priority, targeting, recipient_count, url, created_by, created_at, expires_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (category) q = q.eq('category', category);
  if (priority) q = q.eq('priority', priority);
  if (search) q = q.ilike('title', `%${search}%`);

  const { data, error } = await q;
  if (error) {
    if ((error as { code?: string }).code === '42P01') return NextResponse.json({ success: true, data: [] });
    console.error('GET /api/admin/notifications:', error);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }

  const rows = (data ?? []) as NotifRow[];
  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x))];
  const emailById = new Map<string, string | null>();
  if (creatorIds.length) {
    const { data: profs } = await svc.from('profiles').select('id, email').in('id', creatorIds);
    for (const p of (profs ?? []) as { id: string; email: string | null }[]) emailById.set(p.id, p.email);
  }

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category,
    priority: r.priority,
    url: r.url,
    recipientCount: r.recipient_count ?? 0,
    audience: describeTargeting(r.targeting),
    createdBy: r.created_by,
    createdByEmail: r.created_by ? emailById.get(r.created_by) ?? null : null,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));

  return NextResponse.json({ success: true, data: items });
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
