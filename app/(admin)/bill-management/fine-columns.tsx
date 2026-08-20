'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { FineRow, FineDisplayStatus } from '@/lib/fines/list';
import { inr } from './columns';

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_STYLE: Record<FineDisplayStatus, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  partially_paid: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400',
  unpaid: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  cancelled: 'bg-slate-100 text-slate-600 line-through dark:bg-slate-500/15 dark:text-slate-400',
  unknown: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
};

export function getFineColumns(
  canManage: boolean,
  onCancel: (row: FineRow) => void
): ColumnDef<FineRow>[] {
  return [
    {
      accessorKey: 'person_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {row.original.person_name}
          {row.original.code ? (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{row.original.code}</span>
          ) : null}
        </span>
      ),
    },
    {
      // Hidden by default: powers the Route filter only — the visible Stop column
      // already prints the route number. NOTE this filters on the route as it was
      // when the fine was RAISED (tms_fee_fine snapshots it), so a learner who has
      // since moved routes still appears under their old one. That is deliberate:
      // the ledger is a historical record, not a live view of the roster.
      id: 'route',
      header: 'Route',
      accessorFn: (r) => r.route_number ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span>{row.original.route_number ?? '—'}</span>,
    },
    {
      id: 'stop',
      header: 'Stop',
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">
          {row.original.route_number ? `${row.original.route_number} · ` : ''}
          {row.original.stop_name ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'fine_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <span className="text-gray-900 dark:text-gray-100">{inr(row.original.fine_amount)}</span>
      ),
    },
    {
      accessorKey: 'due_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">{fmtDate(row.original.due_date)}</span>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.reason}</span>,
    },
    {
      id: 'status',
      accessorFn: (r) => r.display_status,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
            STATUS_STYLE[row.original.display_status]
          }`}
        >
          {row.original.display_status.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) =>
        canManage &&
        row.original.display_status !== 'cancelled' &&
        row.original.display_status !== 'paid' ? (
          <button
            type="button"
            onClick={() => onCancel(row.original)}
            className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Waive
          </button>
        ) : null,
    },
  ];
}
