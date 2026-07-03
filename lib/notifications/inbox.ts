import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Consumer inbox reads for the TMS notification module — shared by every portal
 * (admin bell, learner, driver, boarding). "My notifications" == the recipient rows
 * for auth.userId joined to their message. Runs under the service-role client; the
 * user_id filter is the guard (RLS also scopes the client-side realtime stream).
 */

type Svc = ReturnType<typeof createServiceRoleClient>;

export interface InboxItem {
  id: string; // tms_notification_recipient.id — the handle used to mark-read
  notificationId: string;
  title: string | null;
  body: string | null;
  url: string | null;
  icon: string | null;
  category: string | null;
  priority: string | null;
  createdAt: string;
  readAt: string | null;
}

interface JoinedRow {
  id: string;
  read_at: string | null;
  created_at: string;
  tms_notification:
    | {
        id: string;
        title: string | null;
        body: string | null;
        url: string | null;
        icon: string | null;
        category: string | null;
        priority: string | null;
        expires_at: string | null;
      }
    | Array<{
        id: string;
        title: string | null;
        body: string | null;
        url: string | null;
        icon: string | null;
        category: string | null;
        priority: string | null;
        expires_at: string | null;
      }>
    | null;
}

/** Fetch a user's inbox (newest first, expired hidden) + their global unread count. */
export async function getInbox(
  svc: Svc,
  userId: string,
  opts?: { limit?: number },
): Promise<{ items: InboxItem[]; unreadCount: number }> {
  const limit = opts?.limit ?? 50;

  const [listRes, countRes] = await Promise.all([
    svc
      .from('tms_notification_recipient')
      .select(
        'id, read_at, created_at, tms_notification!inner(id, title, body, url, icon, category, priority, expires_at)',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    svc
      .from('tms_notification_recipient')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null),
  ]);

  if (listRes.error) {
    if ((listRes.error as { code?: string }).code === '42P01') return { items: [], unreadCount: 0 };
    throw new Error(`inbox: load failed: ${listRes.error.message}`);
  }

  const nowMs = Date.now();
  const items: InboxItem[] = ((listRes.data ?? []) as JoinedRow[])
    .map((r) => {
      const n = Array.isArray(r.tms_notification) ? r.tms_notification[0] : r.tms_notification;
      return n ? { r, n } : null;
    })
    .filter((x): x is { r: JoinedRow; n: NonNullable<Exclude<JoinedRow['tms_notification'], unknown[] | null>> } => !!x)
    .filter(({ n }) => !n.expires_at || new Date(n.expires_at).getTime() > nowMs)
    .map(({ r, n }) => ({
      id: r.id,
      notificationId: n.id,
      title: n.title,
      body: n.body,
      url: n.url,
      icon: n.icon,
      category: n.category,
      priority: n.priority,
      createdAt: r.created_at,
      readAt: r.read_at,
    }));

  return { items, unreadCount: countRes.count ?? 0 };
}

/**
 * Mark the user's own recipient rows as read. `all:true` clears every unread row;
 * otherwise only the given recipient-row ids. Returns how many rows were updated.
 */
export async function markRead(
  svc: Svc,
  userId: string,
  opts: { ids?: string[]; all?: boolean },
): Promise<number> {
  let q = svc
    .from('tms_notification_recipient')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (!opts.all) {
    const ids = (opts.ids ?? []).filter((x) => typeof x === 'string');
    if (ids.length === 0) return 0;
    q = q.in('id', ids);
  }

  const { data, error } = await q.select('id');
  if (error) throw new Error(`inbox: mark-read failed: ${error.message}`);
  return (data ?? []).length;
}
