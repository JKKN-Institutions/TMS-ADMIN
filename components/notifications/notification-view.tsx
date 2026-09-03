'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, ExternalLink } from 'lucide-react';
import { relativeTime } from '@/components/notifications/notification-bell';
import type { TmsNotificationItem } from '@/hooks/use-tms-notifications';

/**
 * Portal-agnostic view page for ONE received notification — the destination the bell
 * items and inbox rows now open. Every portal (admin, learner, driver, boarding) renders
 * this same component from its own `notifications/[id]` route, so the message is always
 * readable in full even when it carries no deep link.
 *
 * Deliberately plain state (no react-query): the portal layouts have no
 * QueryClientProvider, which is the same reason use-tms-notifications is hand-rolled.
 * Opening the page marks the row read, matching what a click used to do.
 */

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
};

const fmtFull = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

interface ViewItem extends TmsNotificationItem {
  expired?: boolean;
}

export default function NotificationView({ id, backHref }: { id: string; backHref: string }) {
  const router = useRouter();
  const [item, setItem] = useState<ViewItem | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  const markRead = useCallback(async (recipientId: string) => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ids: [recipientId] }),
      });
    } catch {
      /* non-fatal: the badge reconciles on the next inbox refresh */
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/notifications/${id}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!active) return;
        if (res.status === 404) return setStatus('notfound');
        if (!res.ok) return setStatus('error');
        const json = (await res.json()) as { data: ViewItem };
        if (!active) return;
        setItem(json.data);
        setStatus('ready');
        if (!json.data.readAt) markRead(json.data.id);
      } catch {
        if (active) setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [id, markRead]);

  const back = (
    <button
      type="button"
      onClick={() => router.push(backHref)}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
    >
      <ArrowLeft className="h-4 w-4" /> Back to notifications
    </button>
  );

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        {back}
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  if (status !== 'ready' || !item) {
    return (
      <div className="space-y-6">
        {back}
        <div className="rounded-xl border border-gray-200 p-8 text-center dark:border-gray-800">
          <Bell className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
            {status === 'notfound' ? 'This notification is no longer available.' : 'Could not load this notification.'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {status === 'notfound'
              ? 'It may have been deleted, or it was never addressed to you.'
              : 'Please try again in a moment.'}
          </p>
        </div>
      </div>
    );
  }

  const priorityCls = PRIORITY_BADGE[item.priority ?? 'normal'] ?? PRIORITY_BADGE.normal;

  return (
    <div className="space-y-6">
      {back}

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600 dark:bg-gray-500/20 dark:text-gray-300">
            {item.category ?? 'general'}
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${priorityCls}`}>
            {item.priority ?? 'normal'}
          </span>
          {item.expired && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-500/20 dark:text-gray-400">
              Expired
            </span>
          )}
        </div>

        <h1 className="mt-3 break-words text-2xl font-semibold text-gray-900 dark:text-white">
          {item.title || '(no title)'}
        </h1>

        <p className="mt-1 text-xs text-gray-500" title={fmtFull(item.createdAt)}>
          Received {relativeTime(item.createdAt)} · {fmtFull(item.createdAt)}
        </p>

        <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700 dark:text-gray-200">
          {item.body || 'This notification has no message body.'}
        </p>

        {item.url && (
          <button
            type="button"
            onClick={() => router.push(item.url as string)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <ExternalLink className="h-4 w-4" /> Go to related page
          </button>
        )}
      </div>
    </div>
  );
}
