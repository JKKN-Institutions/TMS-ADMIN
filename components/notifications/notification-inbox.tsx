'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
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

  // Open = mark the item read (if unread) and follow its url. Shared by the title-click
  // and the row action menu.
  const onOpen = (n: TmsNotificationItem) => {
    if (!n.readAt) markRead([n.id]);
    if (n.url) router.push(n.url);
  };

  const columns = useMemo(
    () => getInboxColumns(onOpen, (n) => markRead([n.id])),
    // onOpen/markRead are stable-enough for the table; deps intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
