'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

export type StrikeStatus = 'ok' | 'warned' | 'final_warning' | 'pending_removal' | 'removed';

/** One row of /api/admin/incharge-attendance-strikes. */
export interface StrikeRow {
  id: string;
  assignment_id: string;
  staff_email: string;
  staff_name: string | null;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  consecutive_misses: number;
  missed_dates: string[];
  last_evaluated_date: string | null;
  warned_at: string | null;
  removed_at: string | null;
  billing_status: string | null;
  status: StrikeStatus;
}

export const STATUS_LABEL: Record<StrikeStatus, string> = {
  ok: 'OK',
  warned: 'Warning 1',
  final_warning: 'Final warning',
  pending_removal: 'Pending removal',
  removed: 'Removed',
};

const STATUS_CLASS: Record<StrikeStatus, string> = {
  ok: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  warned: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  final_warning: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  pending_removal: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  removed: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const BILLING_LABEL: Record<string, string> = {
  billed: 'Billed',
  no_structure: 'No fee structure',
  error: 'Billing error',
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export function getStrikeColumns(): ColumnDef<StrikeRow>[] {
  return [
    {
      accessorKey: 'staff_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.staff_name ?? '—'}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.staff_email}</div>
        </div>
      ),
    },
    {
      accessorKey: 'route_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.route_number ?? '—'}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.route_name ?? ''}</div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_CLASS[row.original.status]
          }`}
        >
          {STATUS_LABEL[row.original.status]}
        </span>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'consecutive_misses',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Misses" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.consecutive_misses}</span>,
    },
    {
      accessorKey: 'missed_dates',
      header: 'Missed dates',
      cell: ({ row }) => (
        <span className="text-xs">{row.original.missed_dates.join(', ') || '—'}</span>
      ),
    },
    {
      accessorKey: 'billing_status',
      header: 'Billing',
      cell: ({ row }) => {
        const b = row.original.billing_status;
        return <span className="text-xs">{b ? BILLING_LABEL[b] ?? b : '—'}</span>;
      },
    },
    {
      accessorKey: 'last_evaluated_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last checked" />,
      cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.last_evaluated_date)}</span>,
    },
  ];
}
