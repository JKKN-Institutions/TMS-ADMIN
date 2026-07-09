'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { useTmsNotifications, type TmsNotificationItem } from '@/hooks/use-tms-notifications';
import PushToggle from '@/components/pwa/push-toggle';

/**
 * Portal-agnostic notification bell for the TMS notification module. Shows an unread
 * badge and a dropdown of the user's recent notifications, wired to the shared hook
 * (live via Realtime). Clicking an item marks it read and follows its url. Mounted in
 * the admin / learner / driver / boarding headers. `viewAllHref` adds a footer link to
 * the portal's full inbox page when one exists.
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-400',
};

export default function NotificationBell({ viewAllHref }: { viewAllHref?: string }) {
  const { items, unreadCount, isLoading, markRead, markAllRead } = useTmsNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onItemClick = (n: TmsNotificationItem) => {
    if (!n.readAt) markRead([n.id]);
    if (n.url) {
      setOpen(false);
      router.push(n.url);
    }
  };

  const recent = items.slice(0, 12);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // Mobile (< sm): anchor to the VIEWPORT — `fixed`, full-width with 8px
        // gutters, just below the 4rem fixed header. This escapes the shell's
        // `overflow-x-hidden` (the header has no transform, so `fixed` resolves
        // against the viewport) and can't bleed off the left edge the way
        // `absolute right-0` did when the bell isn't the right-most header item.
        // sm:+ restores the original bell-anchored dropdown.
        <div className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 sm:max-w-[calc(100vw-1rem)] flex flex-col max-h-[calc(100dvh-9rem)] sm:max-h-none overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg z-50 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto sm:flex-none sm:max-h-96">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">Loading…</div>
            ) : recent.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">You're all caught up.</div>
            ) : (
              recent.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItemClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 border-b border-gray-50 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60 ${
                    n.readAt ? '' : 'bg-blue-50/40 dark:bg-blue-500/5'
                  }`}
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      n.readAt ? 'bg-transparent' : PRIORITY_DOT[n.priority ?? 'normal'] ?? 'bg-blue-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    {n.title && <span className="block text-sm font-medium text-gray-900 truncate dark:text-white">{n.title}</span>}
                    {n.body && <span className="block text-xs text-gray-500 line-clamp-2 dark:text-gray-400">{n.body}</span>}
                    <span className="block mt-0.5 text-[11px] text-gray-400">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <PushToggle variant="bell" />

          {viewAllHref && (
            <a
              href={viewAllHref}
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                router.push(viewAllHref);
              }}
              className="block px-4 py-2.5 text-center text-xs font-medium text-blue-600 border-t border-gray-100 hover:bg-gray-50 dark:text-blue-400 dark:border-gray-800 dark:hover:bg-gray-800/60"
            >
              View all notifications
            </a>
          )}
        </div>
      )}
    </div>
  );
}
