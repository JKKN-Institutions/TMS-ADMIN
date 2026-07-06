'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { categoryLabel, PORTAL_LABEL, type BugPortal, type BugReportRow } from '@/lib/bug-reports/shared';

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

// status: open | in_progress | resolved | closed
export function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    open: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    resolved: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    closed: 'bg-gray-200 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
  };
  const cls = map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {(status ?? 'unknown').replace('_', ' ')}
    </span>
  );
}

// priority: low | medium | high | critical
export function PriorityBadge({ priority }: { priority?: string }) {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
    medium: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
    low: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  };
  const cls = map[priority ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {priority ?? '—'}
    </span>
  );
}

// Which portal the report came from (derived from page_url).
export function PortalBadge({ portal }: { portal?: BugPortal }) {
  const map: Record<BugPortal, string> = {
    admin: 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300',
    student: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    driver: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    boarding: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    other: 'bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400',
  };
  const p = portal ?? 'other';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${map[p]}`}>
      {PORTAL_LABEL[p]}
    </span>
  );
}

export function CategoryBadge({ category }: { category?: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-500/20 dark:text-gray-300">
      {categoryLabel(category)}
    </span>
  );
}

export function getBugColumns(onView: (b: BugReportRow) => void): ColumnDef<BugReportRow>[] {
  return [
    {
      accessorKey: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="max-w-[24rem] truncate text-left font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
          title={row.original.title}
        >
          {row.original.title}
        </button>
      ),
    },
    {
      id: 'portal',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Portal" />,
      accessorFn: (b) => b.portal,
      filterFn: (r, id, value) => (r.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => <PortalBadge portal={row.original.portal} />,
    },
    {
      id: 'reporter',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reporter" />,
      // Combine name + email so the global search matches either.
      accessorFn: (b) => `${b.reporterName} ${b.reporterEmail ?? ''}`.trim(),
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-gray-800 dark:text-gray-200">{row.original.reporterName}</span>
          {row.original.reporterEmail && (
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">{row.original.reporterEmail}</span>
          )}
        </div>
      ),
    },
    {
      id: 'category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      accessorFn: (b) => b.category ?? '',
      filterFn: (r, id, value) => (r.getValue(id) as string) === value,
      size: 140,
      cell: ({ row }) => <CategoryBadge category={row.original.category} />,
    },
    {
      id: 'priority',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
      accessorFn: (b) => b.priority ?? '',
      filterFn: (r, id, value) => (r.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (b) => b.status ?? '',
      filterFn: (r, id, value) => (r.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reported" />,
      size: 120,
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
        const b = row.original;
        // Defer so Radix unmounts the menu before the panel grabs focus.
        const open = (fn: () => void) => setTimeout(fn, 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${b.title}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(() => onView(b))}>
                  <Eye className="text-gray-500" /> View &amp; reply
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
