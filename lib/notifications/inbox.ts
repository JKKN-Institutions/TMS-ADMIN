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
  /** True when the message's expires_at has passed. The list hides these; the single-item
   *  read keeps them so a link the user just clicked doesn't dead-end in "not found". */
  expired: boolean;
}

interface JoinedNotification {
  id: string;
  title: string | null;
  body: string | null;
  url: string | null;
  icon: string | null;
  category: string | null;
  priority: string | null;
  expires_at: string | null;
}

interface JoinedRow {
  id: string;
  read_at: string | null;
  created_at: string;
  // PostgREST returns an embedded to-one either as an object or a 1-element array
  // depending on how it infers the relationship, so both shapes are handled.
  tms_notification: JoinedNotification | JoinedNotification[] | null;
}

/** The columns getInbox / getInboxItem select — kept in one place so they can't drift. */
const JOIN_SELECT =
  'id, read_at, created_at, tms_notification!inner(id, title, body, url, icon, category, priority, expires_at)';

/** Flatten one joined recipient row into an InboxItem. Null when the message is missing. */
export function toInboxItem(row: JoinedRow, nowMs: number = Date.now()): InboxItem | null {
  const n = Array.isArray(row.tms_notification) ? row.tms_notification[0] : row.tms_notification;
  if (!n) return null;
  return {
    id: row.id,
    notificationId: n.id,
    title: n.title,
    body: n.body,
    url: n.url,
    icon: n.icon,
    category: n.category,
    priority: n.priority,
    createdAt: row.created_at,
    readAt: row.read_at,
    expired: !!n.expires_at && new Date(n.expires_at).getTime() <= nowMs,
  };
}

/**
 * Fetch ONE of the user's own recipient rows by its id — the read behind the
 * notification view page. The `user_id` filter is the security guard: another user's
 * recipient id simply doesn't match, so it reads as "not found" rather than leaking.
 */
export async function getInboxItem(
  svc: Svc,
  userId: string,
  recipientId: string,
): Promise<InboxItem | null> {
  const { data, error } = await svc
    .from('tms_notification_recipient')
    .select(JOIN_SELECT)
    .eq('id', recipientId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === '42P01') return null;
    throw new Error(`inbox: item load failed: ${error.message}`);
  }
  if (!data) return null;
  return toInboxItem(data as unknown as JoinedRow);
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
      .select(JOIN_SELECT)
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
  const items: InboxItem[] = ((listRes.data ?? []) as unknown as JoinedRow[])
    .map((r) => toInboxItem(r, nowMs))
    .filter((x): x is InboxItem => !!x && !x.expired);

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
