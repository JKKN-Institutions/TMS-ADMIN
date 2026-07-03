'use client';

import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { useTmsNotifications, type TmsNotificationItem } from '@/hooks/use-tms-notifications';
import { relativeTime } from '@/components/notifications/notification-bell';

/**
 * Full-page notification inbox for the portal pages (learner, driver, boarding).
 * Same shared hook as the bell — so opening the page and the header badge stay in
 * sync — with a fuller list, unread highlighting, mark-all-read and per-item read.
 */
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-400',
};

export default function NotificationInbox() {
  const { items, unreadCount, isLoading, error, markRead, markAllRead } = useTmsNotifications();
  const router = useRouter();

  const onClick = (n: TmsNotificationItem) => {
    if (!n.readAt) markRead([n.id]);
    if (n.url) router.push(n.url);
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          Notifications
          {unreadCount > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500 text-white">{unreadCount}</span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead()}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="text-destructive">Could not load notifications.</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Bell className="w-8 h-8 opacity-40" />
          <p className="text-sm">You have no notifications.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onClick(n)}
              className={`w-full text-left rounded-lg border p-4 flex gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                n.readAt
                  ? 'border-gray-200 dark:border-gray-800'
                  : 'border-blue-200 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-500/5'
              }`}
            >
              <span
                className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                  n.readAt ? 'bg-transparent' : PRIORITY_DOT[n.priority ?? 'normal'] ?? 'bg-blue-500'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  {n.title && <span className="font-medium break-words text-gray-900 dark:text-white">{n.title}</span>}
                  <time className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">{relativeTime(n.createdAt)}</time>
                </span>
                {n.body && <span className="block text-sm text-muted-foreground break-words">{n.body}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
