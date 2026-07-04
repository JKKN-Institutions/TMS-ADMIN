import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveTargeting, type Targeting } from '@/lib/notifications/audience';
import { after } from 'next/server';
import { sendPushToUsers } from '@/lib/notifications/push';

/**
 * The single fan-out primitive for the TMS notification module. Used by BOTH the
 * admin compose/broadcast route and the automated writers (enrollment, grievance,
 * booking reminders, schedule changes) via lib/notifications/notify.ts.
 *
 * Flow: resolve the audience → insert one tms_notification message row → chunked
 * upsert of tms_notification_recipient rows → stamp recipient_count.
 *
 * THROWS on failure so the admin /send route can surface it. Automated callers wrap
 * this in try/catch (see notify.ts) to keep best-effort semantics. When the audience
 * resolves to zero recipients NOTHING is inserted and { id: null, recipientCount: 0 }
 * is returned — the caller decides whether that is an error (admin) or a no-op
 * (a learner with no auth profile yet).
 */

type Svc = ReturnType<typeof createServiceRoleClient>;

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface DispatchInput {
  title: string;
  body: string;
  targeting: Targeting;
  category?: string;
  priority?: NotificationPriority;
  url?: string | null;
  icon?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
}

export interface DispatchResult {
  id: string | null;
  recipientCount: number;
}

const RECIPIENT_CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function dispatchNotification(svc: Svc, input: DispatchInput): Promise<DispatchResult> {
  const userIds = await resolveTargeting(svc, input.targeting);
  if (userIds.length === 0) return { id: null, recipientCount: 0 };

  const { data: notif, error: insErr } = await svc
    .from('tms_notification')
    .insert({
      title: input.title,
      body: input.body,
      url: input.url ?? null,
      icon: input.icon ?? null,
      category: input.category ?? 'general',
      priority: input.priority ?? 'normal',
      targeting: input.targeting,
      metadata: input.metadata ?? {},
      created_by: input.createdBy ?? null,
      recipient_count: userIds.length,
      expires_at: input.expiresAt ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select('id')
    .single();

  if (insErr || !notif) {
    throw new Error(`dispatch: insert notification failed: ${insErr?.message ?? 'no row returned'}`);
  }
  const notificationId = (notif as { id: string }).id;

  for (const part of chunk(userIds, RECIPIENT_CHUNK)) {
    const rows = part.map((uid) => ({ notification_id: notificationId, user_id: uid }));
    const { error: fanErr } = await svc
      .from('tms_notification_recipient')
      .upsert(rows, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
    if (fanErr) throw new Error(`dispatch: fan-out failed: ${fanErr.message}`);
  }

  // Best-effort device push AFTER the HTTP response (never blocks the send). If we're
  // somehow outside a request scope (after() throws), fall back to fire-and-forget.
  const push = () =>
    sendPushToUsers(svc, userIds, {
      title: input.title,
      body: input.body,
      url: input.url ?? '/',
      icon: input.icon ?? '/icons/icon-192.png',
      tag: notificationId,
      priority: input.priority ?? 'normal',
    });
  try {
    after(push);
  } catch {
    void push();
  }

  return { id: notificationId, recipientCount: userIds.length };
}
