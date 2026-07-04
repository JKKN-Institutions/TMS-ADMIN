import webpush from 'web-push';
import { createServiceRoleClient } from '@/lib/supabase/server';

type Svc = ReturnType<typeof createServiceRoleClient>;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon: string;
  tag: string;
  priority: string;
}

/** JSON string the service worker `push` handler parses. Pure. */
export function buildPushPayload(p: PushPayload): string {
  return JSON.stringify({
    title: p.title,
    body: p.body,
    url: p.url || '/',
    icon: p.icon || '/icons/icon-192.png',
    tag: p.tag,
    priority: p.priority || 'normal',
  });
}

/** A push endpoint reported gone (subscription revoked/expired) → prune it. Pure. */
export function shouldPruneStatus(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:transport@jkkn.ac.in';
  if (!pub || !priv) {
    console.error('sendPushToUsers: VAPID keys missing — skipping push.');
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

const SUB_CHUNK = 150; // .in() gateway limit
const SEND_CONCURRENCY = 10;

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string }

/**
 * Best-effort: push `payload` to every subscribed device of `userIds`. Prunes
 * subscriptions the push service reports as gone (404/410). NEVER throws — the
 * in-app inbox is the source of truth, so a push failure must not break dispatch.
 * `svc` is the service-role client (RLS bypassed) already held by the caller.
 */
export async function sendPushToUsers(svc: Svc, userIds: string[], payload: PushPayload): Promise<void> {
  try {
    if (userIds.length === 0 || !ensureVapid()) return;
    const ids = [...new Set(userIds)];

    const subs: SubRow[] = [];
    for (let i = 0; i < ids.length; i += SUB_CHUNK) {
      const chunk = ids.slice(i, i + SUB_CHUNK);
      const { data, error } = await svc
        .from('tms_push_subscription')
        .select('id, endpoint, p256dh, auth')
        .in('user_id', chunk);
      if (error) {
        console.error('sendPushToUsers: load subscriptions failed:', error.message);
        return;
      }
      subs.push(...((data ?? []) as SubRow[]));
    }
    if (subs.length === 0) return;

    const body = buildPushPayload(payload);
    const stale: string[] = [];

    for (let i = 0; i < subs.length; i += SEND_CONCURRENCY) {
      const batch = subs.slice(i, i + SEND_CONCURRENCY);
      await Promise.all(
        batch.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body,
            );
          } catch (e: unknown) {
            const status = (e as { statusCode?: number })?.statusCode ?? 0;
            if (shouldPruneStatus(status)) stale.push(s.id);
          }
        }),
      );
    }

    for (let i = 0; i < stale.length; i += SUB_CHUNK) {
      const chunk = stale.slice(i, i + SUB_CHUNK);
      const { error } = await svc.from('tms_push_subscription').delete().in('id', chunk);
      if (error) console.error('sendPushToUsers: prune failed:', error.message);
    }
  } catch (e) {
    console.error('sendPushToUsers (non-fatal):', e);
  }
}
