'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Eye, MoreHorizontal, PlayCircle, XCircle } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { grievanceCategoryLabel } from '@/lib/grievances/categories';

// Shape of one row from GET /api/admin/transport-grievances (tms_grievance,
// with learner + route labels joined server-side).
export interface GrievanceRow {
  id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  learnerName: string;
  rollNumber: string | null;
  submitterType?: string; // 'learner' | 'driver' | 'boarding'
  routeLabel: string | null;
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

// tms_grievance.status check: open | in_progress | resolved | closed
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

// tms_grievance.priority check: low | normal | high
export function PriorityBadge({ priority }: { priority?: string }) {
  const map: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
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

// Who raised it — learners stay unlabelled (the common case); staff get a small tag.
export function SubmitterBadge({ type }: { type?: string }) {
  if (!type || type === 'learner') return null;
  const map: Record<string, string> = {
    driver: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    boarding: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  };
  const cls = map[type] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {type}
    </span>
  );
}

export function getGrievanceColumns(
  onView: (g: GrievanceRow) => void,
  onSetStatus: (g: GrievanceRow, status: string) => void,
  canManage: boolean
): ColumnDef<GrievanceRow>[] {
  return [
    {
      accessorKey: 'subject',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Subject" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="max-w-[22rem] truncate text-left font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
          title={row.original.subject}
        >
          {row.original.subject}
        </button>
      ),
    },
    {
      id: 'learner',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Submitter" />,
      // Combine name + roll + type so the global fuzzy search matches any of them.
      accessorFn: (g) => `${g.learnerName} ${g.rollNumber ?? ''} ${g.submitterType ?? ''}`.trim(),
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-gray-800 dark:text-gray-200">{row.original.learnerName}</span>
          {row.original.rollNumber ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.rollNumber}</span>
          ) : (
            <SubmitterBadge type={row.original.submitterType} />
          )}
        </div>
      ),
    },
    {
      id: 'category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      accessorFn: (g) => g.category ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 150,
      cell: ({ row }) => (
        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-500/20 dark:text-gray-300">
          {grievanceCategoryLabel(row.original.category)}
        </span>
      ),
    },
    {
      accessorKey: 'routeLabel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
          {row.original.routeLabel ?? '—'}
        </span>
      ),
    },
    {
      id: 'priority',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
      accessorFn: (g) => g.priority ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (g) => g.status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Submitted" />,
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
        const g = row.original;
        // Defer to the next tick so Radix unmounts the menu before the dialog
        // (or the status mutation's re-render) grabs focus.
        const open = (fn: () => void) => setTimeout(fn, 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for grievance ${g.subject}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(() => onView(g))}>
                  <Eye className="text-gray-500" /> View &amp; reply
                </DropdownMenuItem>
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => open(() => onSetStatus(g, 'in_progress'))}
                      disabled={g.status === 'in_progress'}
                    >
                      <PlayCircle className="text-gray-500" /> Mark in progress
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => open(() => onSetStatus(g, 'resolved'))}
                      disabled={g.status === 'resolved'}
                    >
                      <CheckCircle2 className="text-gray-500" /> Mark resolved
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => open(() => onSetStatus(g, 'closed'))}
                      disabled={g.status === 'closed'}
                    >
                      <XCircle className="text-gray-500" /> Close
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
