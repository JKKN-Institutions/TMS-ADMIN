'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, MoreHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { relativeTime } from '@/components/notifications/notification-bell';
import type { TmsNotificationItem } from '@/hooks/use-tms-notifications';

/**
 * Columns for the per-portal notification inbox (learner / driver / boarding), rendered
 * by the shared components/ui/data-table engine. The row is one recipient row
 * (TmsNotificationItem, keyed by its recipient-row `id`) — NOT the admin sender view — so
 * the "status" column is DERIVED from `readAt` (there is no literal status field) and the
 * row callbacks are the inbox's own onOpen / onMarkRead.
 */

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

// Solid tints need explicit dark: pairs — the app only remaps neutrals globally.
const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
};

function PriorityBadge({ priority }: { priority?: string | null }) {
  const cls = PRIORITY_BADGE[priority ?? ''] ?? PRIORITY_BADGE.normal;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {priority ?? 'normal'}
    </span>
  );
}

function CategoryBadge({ category }: { category?: string | null }) {
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600 dark:bg-gray-500/20 dark:text-gray-300">
      {category ?? 'general'}
    </span>
  );
}

export function getInboxColumns(
  onOpen: (n: TmsNotificationItem) => void,
  onMarkRead: (n: TmsNotificationItem) => void,
): ColumnDef<TmsNotificationItem>[] {
  const selectColumn: ColumnDef<TmsNotificationItem> = {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    size: 40,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : false
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select notification"
      />
    ),
  };

  return [
    selectColumn,
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (n) => (n.readAt ? 'read' : 'unread'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => {
        const unread = !row.original.readAt;
        return (
          <span className="inline-flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                unread ? 'bg-blue-500' : 'border border-gray-300 dark:border-gray-600'
              }`}
            />
            <span className={unread ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500'}>
              {unread ? 'Unread' : 'Read'}
            </span>
          </span>
        );
      },
    },
    {
      accessorKey: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notification" />,
      cell: ({ row }) => {
        const n = row.original;
        return (
          <button
            type="button"
            onClick={() => onOpen(n)}
            title={n.title ?? ''}
            className={`block max-w-[22rem] truncate text-left hover:text-green-600 hover:underline ${
              n.readAt
                ? 'font-normal text-gray-700 dark:text-gray-300'
                : 'font-semibold text-gray-900 dark:text-gray-100'
            }`}
          >
            {n.title || '(no title)'}
          </button>
        );
      },
    },
    {
      accessorKey: 'body',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Message" />,
      enableSorting: false,
      cell: ({ row }) => (
        <span
          className="block max-w-[26rem] truncate text-sm text-gray-600 dark:text-gray-300"
          title={row.original.body ?? ''}
        >
          {row.original.body || '—'}
        </span>
      ),
    },
    {
      id: 'category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      accessorFn: (n) => n.category ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => <CategoryBadge category={row.original.category} />,
    },
    {
      id: 'priority',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
      accessorFn: (n) => n.priority ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Received" />,
      size: 150,
      cell: ({ row }) => (
        <span
          className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300"
          title={fmtFull(row.original.createdAt)}
        >
          {relativeTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const n = row.original;
        // Defer to the next tick so Radix unmounts the menu before navigation/state grabs
        // focus (the pointer-events / focus race the skill warns about).
        const open = (fn: () => void) => setTimeout(fn, 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 dark:hover:bg-gray-800"
                  aria-label={`Actions for ${n.title ?? 'notification'}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(() => onOpen(n))}>
                  <Eye className="text-gray-500" /> {n.url ? 'Open' : 'View'}
                </DropdownMenuItem>
                {!n.readAt && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => open(() => onMarkRead(n))}>
                      <Check className="text-gray-500" /> Mark as read
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
