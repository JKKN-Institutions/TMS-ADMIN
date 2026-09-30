'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ReviewRowDto } from '@/app/api/admin/incharge-bill-review/route';

const OUTCOME_STYLE: Record<ReviewRowDto['outcome'], string> = {
  passed: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  not_enough_days: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
};
const OUTCOME_LABEL: Record<ReviewRowDto['outcome'], string> = {
  passed: 'Pass', failed: 'Fail', not_enough_days: 'Not enough days',
};
const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN')}`;
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });

export function getReviewColumns(): ColumnDef<ReviewRowDto>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Staff',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          {row.original.staff_code && <div className="text-xs text-gray-500">{row.original.staff_code}</div>}
        </div>
      ),
    },
    { id: 'routes', header: 'Route', accessorFn: (r) => r.routes.join(', ') },
    {
      id: 'route',
      header: 'Bus marked',
      accessorFn: (r) => r.route_days,
      cell: ({ row }) => `${row.original.route_days} / ${row.original.required_days}`,
    },
    {
      id: 'own',
      header: 'Own marks',
      accessorFn: (r) => r.personal_pct,
      cell: ({ row }) => `${row.original.personal_days} / ${row.original.required_days} (${row.original.personal_pct}%)`,
    },
    {
      id: 'missed',
      header: 'Missed bus days',
      accessorFn: (r) => r.missed_route_dates.join(' '),
      cell: ({ row }) => row.original.missed_route_dates.map(shortDate).join(', ') || '—',
    },
    {
      accessorKey: 'outcome',
      header: 'Result',
      filterFn: (row, id, value) => !value || row.getValue(id) === value,
      cell: ({ row }) => (
        <span title={row.original.reason} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[row.original.outcome]}`}>
          {OUTCOME_LABEL[row.original.outcome]}
        </span>
      ),
    },
    {
      id: 'bill',
      header: 'Bill',
      accessorFn: (r) => r.outstanding_amount,
      cell: ({ row }) => {
        const r = row.original;
        if (r.applied && r.bill_action === 'cancelled') return <span className="text-green-700 dark:text-green-400">Cancelled {rupees(r.cancelled_amount)}</span>;
        if (r.error) return <span className="text-red-600" title={r.error}>Error</span>;
        return rupees(r.outstanding_amount);
      },
    },
  ];
}
