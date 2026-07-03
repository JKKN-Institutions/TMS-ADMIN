'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Trash2 } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// One row from GET /api/admin/notifications (tms_notification + audience label +
// denormalized recipient_count).
export interface NotifRow {
  id: string;
  title: string | null;
  body: string | null;
  category: string | null;
  priority: string | null;
  url: string | null;
  recipientCount: number;
  audience: string;
  createdBy: string | null;
  createdByEmail: string | null;
  createdAt: string;
  expiresAt: string | null;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function PriorityBadge({ priority }: { priority?: string | null }) {
  const map: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    high: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    normal: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
    low: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  };
  const cls = map[priority ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {priority ?? '—'}
    </span>
  );
}

export function CategoryBadge({ category }: { category?: string | null }) {
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600 dark:bg-gray-500/20 dark:text-gray-300">
      {category ?? 'general'}
    </span>
  );
}

export function getNotificationColumns(
  onView: (n: NotifRow) => void,
  onDelete: (n: NotifRow) => void,
  canManage: boolean,
): ColumnDef<NotifRow>[] {
  return [
    {
      accessorKey: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="max-w-[24rem] truncate text-left font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
          title={row.original.title ?? ''}
        >
          {row.original.title || '(untitled)'}
        </button>
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
      accessorKey: 'audience',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Audience" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{row.original.audience}</span>
      ),
    },
    {
      accessorKey: 'recipientCount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Recipients" />,
      size: 110,
      cell: ({ row }) => (
        <span className="tabular-nums text-sm text-gray-700 dark:text-gray-200">
          {row.original.recipientCount.toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sent" />,
      size: 170,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.createdAt)}</span>
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
        const open = (fn: () => void) => setTimeout(fn, 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${n.title ?? 'notification'}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(() => onView(n))}>
                  <Eye className="text-gray-500" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => open(() => onDelete(n))}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="text-red-500" /> Delete
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
