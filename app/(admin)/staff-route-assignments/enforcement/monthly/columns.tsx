'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

/** One row of /api/admin/incharge-month-verdict. */
export interface VerdictRow {
  id: string;
  staff_email: string;
  route_id: string | null;
  month: string;
  window_start: string;
  window_end: string;
  required_days: number;
  marked_days: number;
  missed_dates: string[];
  outcome: 'passed' | 'failed';
  bill_action: 'cancelled' | 'generated' | 'none' | null;
  was_probation: boolean;
  mode: 'shadow' | 'enforce';
  decided_at: string;
}

export const OUTCOME_LABEL: Record<'passed' | 'failed', string> = {
  passed: 'Passed',
  failed: 'Failed',
};

const OUTCOME_CLASS: Record<'passed' | 'failed', string> = {
  passed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const BILL_LABEL: Record<string, string> = {
  cancelled: 'Bill cancelled',
  generated: 'Bill payable',
  none: 'No bill',
};

export function getVerdictColumns(
  onMarkPaid: (row: VerdictRow) => void,
): ColumnDef<VerdictRow>[] {
  return [
    {
      accessorKey: 'staff_email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.staff_email}</div>
          {row.original.was_probation && (
            <div className="truncate text-xs text-muted-foreground">
              On commitment from {row.original.window_start}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'outcome',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Outcome" />,
      cell: ({ row }) => (
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            OUTCOME_CLASS[row.original.outcome]
          }`}
        >
          {OUTCOME_LABEL[row.original.outcome]}
        </span>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: 'coverage',
      header: 'Marked / required',
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.marked_days} / {row.original.required_days}
        </span>
      ),
    },
    {
      accessorKey: 'missed_dates',
      header: 'Missed dates',
      cell: ({ row }) => (
        <span className="text-xs">{row.original.missed_dates.join(', ') || '—'}</span>
      ),
    },
    {
      accessorKey: 'bill_action',
      header: 'Bill',
      cell: ({ row }) => {
        const b = row.original.bill_action;
        return <span className="text-xs">{b ? BILL_LABEL[b] ?? b : '—'}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.bill_action === 'generated' ? (
          <button
            onClick={() => onMarkPaid(row.original)}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Mark bill paid
          </button>
        ) : null,
    },
  ];
}
