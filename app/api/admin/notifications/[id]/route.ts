import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { describeTargeting, type Targeting } from '@/lib/notifications/audience';

/**
 * Per-notification detail + delete. MODERN plane. withAuth does not forward Next's
 * route `params`, so the id is parsed from the pathname (…/notifications/<id>).
 *   GET    → message + delivery stats (recipients, reads, read %) + recent recipients.
 *   DELETE → hard-delete the notification (cascades its recipient rows).
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

function idFromPath(request: NextRequest): string {
  const segs = request.nextUrl.pathname.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? '';
}

interface NotifFull {
  id: string;
  title: string | null;
  body: string | null;
  url: string | null;
  icon: string | null;
  category: string | null;
  priority: string | null;
  targeting: Targeting | null;
  metadata: Record<string, unknown> | null;
  recipient_count: number | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
}

async function handleGet(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.NOTIFICATIONS_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = idFromPath(request);
  const svc = createServiceRoleClient();

  const { data: n } = await svc
    .from('tms_notification')
    .select(
      'id, title, body, url, icon, category, priority, targeting, metadata, recipient_count, created_by, created_at, sent_at, expires_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (!n) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const notif = n as NotifFull;

  const [{ count: total }, { count: reads }] = await Promise.all([
    svc.from('tms_notification_recipient').select('id', { count: 'exact', head: true }).eq('notification_id', id),
    svc
      .from('tms_notification_recipient')
      .select('id', { count: 'exact', head: true })
      .eq('notification_id', id)
      .not('read_at', 'is', null),
  ]);

  // A sample of recipients (most-recently-read first) with their email + read state.
  const { data: recRows } = await svc
    .from('tms_notification_recipient')
    .select('user_id, read_at, created_at')
    .eq('notification_id', id)
    .order('read_at', { ascending: false, nullsFirst: false })
    .limit(50);
  const userIds = [...new Set((recRows ?? []).map((r: { user_id: string }) => r.user_id))];
  const emailById = new Map<string, string | null>();
  if (userIds.length) {
    const { data: profs } = await svc.from('profiles').select('id, email').in('id', userIds);
    for (const p of (profs ?? []) as { id: string; email: string | null }[]) emailById.set(p.id, p.email);
  }
  const recipients = (recRows ?? []).map((r: { user_id: string; read_at: string | null; created_at: string }) => ({
    userId: r.user_id,
    email: emailById.get(r.user_id) ?? null,
    readAt: r.read_at,
  }));

  const recipientTotal = total ?? notif.recipient_count ?? 0;
  const readTotal = reads ?? 0;

  return NextResponse.json({
    success: true,
    data: {
      id: notif.id,
      title: notif.title,
      body: notif.body,
      url: notif.url,
      icon: notif.icon,
      category: notif.category,
      priority: notif.priority,
      targeting: notif.targeting,
      audience: describeTargeting(notif.targeting),
      metadata: notif.metadata,
      createdBy: notif.created_by,
      createdAt: notif.created_at,
      sentAt: notif.sent_at,
      expiresAt: notif.expires_at,
      stats: {
        recipients: recipientTotal,
        reads: readTotal,
        readPercent: recipientTotal > 0 ? Math.round((readTotal / recipientTotal) * 100) : 0,
      },
      recipients,
    },
  });
}

async function handleDelete(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.NOTIFICATIONS_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = idFromPath(request);
  const svc = createServiceRoleClient();
  const { error } = await svc.from('tms_notification').delete().eq('id', id);
  if (error) {
    console.error('DELETE /api/admin/notifications/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: 'Notification deleted.' });
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const DELETE = withAuth((request, auth) => handleDelete(request, auth));
