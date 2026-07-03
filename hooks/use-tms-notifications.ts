'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Shared inbox hook for the TMS notification module — used by the notification bell
 * and the per-portal inbox pages (admin, learner, driver, boarding). Fetches the
 * signed-in user's inbox from /api/notifications and subscribes to Supabase Realtime
 * (INSERT on tms_notification_recipient filtered to this user) so a new notification
 * appears live. Self-contained (plain state, no QueryClientProvider dependency) so it
 * mounts in every portal layout.
 */
export interface TmsNotificationItem {
  id: string; // recipient-row id — the handle for mark-read
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

interface InboxResponse {
  success: boolean;
  data: { items: TmsNotificationItem[]; unread_count: number; has_more: boolean };
}

export function useTmsNotifications() {
  const [items, setItems] = useState<TmsNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef(createClientSupabaseClient());
  // Unique per hook instance so the bell and the inbox (both mount this hook with the
  // same user id) never share a Realtime channel topic on the singleton client.
  const instanceId = useId();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=50', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as InboxResponse;
      setItems(json.data?.items ?? []);
      setUnreadCount(json.data?.unread_count ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        await fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
      } catch {
        /* reconciled by refresh below */
      }
      await refresh();
    },
    [refresh],
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      const unreadIds = ids.filter((id) => items.some((n) => n.id === id && !n.readAt));
      if (unreadIds.length === 0) return;
      // optimistic
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)));
      setUnreadCount((c) => Math.max(0, c - unreadIds.length));
      await post({ ids: unreadIds });
    },
    [items, post],
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    await post({ all: true });
  }, [post]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof createClientSupabaseClient>['channel']> | null = null;
    const supabase = supabaseRef.current;

    (async () => {
      await refresh();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || !active) return;
      // Per-instance topic — see instanceId above. Reusing a stable `tms-notif-${uid}`
      // topic across the bell + inbox made the second consumer call .on() on the
      // already-subscribed channel ("cannot add postgres_changes callbacks after subscribe()").
      const ch = supabase
        .channel(`tms-notif-${uid}-${instanceId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tms_notification_recipient', filter: `user_id=eq.${uid}` },
          () => {
            refresh();
          },
        )
        .subscribe();
      channel = ch;
      // Unmounted while awaiting getUser() (StrictMode/navigation) — tear it down now.
      if (!active) {
        supabase.removeChannel(ch);
        channel = null;
      }
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh, instanceId]);

  return { items, unreadCount, isLoading, error, refresh, markRead, markAllRead };
}
