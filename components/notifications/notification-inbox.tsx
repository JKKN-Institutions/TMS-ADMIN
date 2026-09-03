'use client';

import { useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { useTmsNotifications, type TmsNotificationItem } from '@/hooks/use-tms-notifications';
import { getInboxColumns } from '@/components/notifications/inbox-columns';

/**
 * Full-page notification inbox for the portal pages (learner, driver, boarding) — all
 * three render this one component, so a change here updates every portal. Same shared hook
 * as the bell (so the page and the header badge stay in sync), now presented through the
 * standard advanced-data-table engine: sortable columns, status/priority/category filters,
 * global search, pagination, and row selection for bulk mark-as-read.
 */

const PRIORITY_OPTIONS = [
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Normal', value: 'normal' },
  { label: 'Low', value: 'low' },
];

const STATUS_OPTIONS = [
  { label: 'Unread', value: 'unread' },
  { label: 'Read', value: 'read' },
];

export default function NotificationInbox() {
  const { items, unreadCount, isLoading, error, markRead, markAllRead } = useTmsNotifications();
  const router = useRouter();
  // This component IS the inbox page, so its own pathname is the base for the per-item
  // view route (…/notifications → …/notifications/<recipientId>). Derived rather than
  // passed so all four portal pages keep rendering <NotificationInbox /> with no props.
  const basePath = (usePathname() ?? '').replace(/\/+$/, '');

  // Open = mark the item read (if unread) and go to its view page. Shared by the
  // title-click and the row action menu. Previously this followed n.url and did nothing
  // at all when the notification had none.
  const onOpen = (n: TmsNotificationItem) => {
    if (!n.readAt) markRead([n.id]);
    const href = basePath ? `${basePath}/${n.id}` : n.url;
    if (href) router.push(href);
  };

  // The column defs must keep a stable identity (TanStack rebuilds the table otherwise),
  // but the handlers must NOT be frozen at first render: `markRead` closes over `items`,
  // which is still empty while the inbox loads, so a memoized copy silently filtered every
  // id away and mark-as-read did nothing. Route through a ref so the table holds stable
  // callbacks that always invoke the current closures.
  const handlers = useRef({ onOpen, markRead });
  handlers.current = { onOpen, markRead };

  const columns = useMemo(
    () => getInboxColumns((n) => handlers.current.onOpen(n), (n) => handlers.current.markRead([n.id])),
    [],
  );

  // Category values are data-driven (the sender picks them), so build the filter options
  // from whatever categories actually appear in this user's inbox.
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const n of items) if (n.category) seen.add(n.category);
    return Array.from(seen)
      .sort()
      .map((c) => ({ label: c.charAt(0).toUpperCase() + c.slice(1), value: c }));
  }, [items]);

  const filters = useMemo(
    () => [
      { columnId: 'status', title: 'Status', options: STATUS_OPTIONS },
      { columnId: 'priority', title: 'Priority', options: PRIORITY_OPTIONS },
      ...(categoryOptions.length > 0
        ? [{ columnId: 'category', title: 'Category', options: categoryOptions }]
        : []),
    ],
    [categoryOptions],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          Notifications
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">{unreadCount}</span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead()}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          Could not load notifications.
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          entityName="notifications"
          isLoading={isLoading}
          searchPlaceholder="Search title, message..."
          enableRowSelection
          getRowId={(n) => n.id}
          filters={filters}
          toolbarActions={({ selectedRows, resetSelection }) => {
            const unreadSelected = selectedRows.filter((n) => !n.readAt);
            if (unreadSelected.length === 0) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  markRead(unreadSelected.map((n) => n.id));
                  resetSelection();
                }}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <CheckCheck className="h-4 w-4" /> Mark read ({unreadSelected.length})
              </button>
            );
          }}
        />
      )}
    </div>
  );
}
