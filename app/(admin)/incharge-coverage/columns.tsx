'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

// One route's coverage as returned by GET /api/admin/incharge-coverage.
export interface UnmarkedShare {
  staff_email: string;
  staff_name: string;
  required: number;
  marked: number;
}

export interface RouteCoverage {
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  students: number;
  inCharges: number;
  unowned: number;
  emptyShares: number;
  unmarked: UnmarkedShare[];
}

const badge = (n: number, tone: 'red' | 'amber') => (
  <span
    className={
      tone === 'red'
        ? 'inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300'
        : 'inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    }
  >
    {n}
  </span>
);

export function getCoverageColumns(): ColumnDef<RouteCoverage>[] {
  return [
    {
      id: 'route',
      accessorKey: 'route_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">
          #{row.original.route_number ?? '—'} — {row.original.route_name ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'students',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Students" />,
      size: 100,
      cell: ({ row }) => (
        <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">{row.original.students}</span>
      ),
    },
    {
      accessorKey: 'inCharges',
      header: ({ column }) => <DataTableColumnHeader column={column} title="In-charges" />,
      size: 110,
      cell: ({ row }) => {
        const n = row.original.inCharges;
        return n === 0 ? badge(n, 'red') : <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">{n}</span>;
      },
    },
    {
      accessorKey: 'unowned',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Unowned" />,
      size: 100,
      cell: ({ row }) => {
        const n = row.original.unowned;
        return n > 0 ? badge(n, 'red') : <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">{n}</span>;
      },
    },
    {
      accessorKey: 'emptyShares',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Empty shares" />,
      size: 120,
      cell: ({ row }) => {
        const n = row.original.emptyShares;
        return n > 0 ? badge(n, 'amber') : <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">{n}</span>;
      },
    },
    {
      id: 'unmarked',
      accessorFn: (r) => r.unmarked.length,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Unmarked today" />,
      size: 130,
      cell: ({ row }) => {
        const list = row.original.unmarked;
        const names = list.map((u) => u.staff_name).join(', ');
        return (
          <span
            className="tabular-nums text-sm text-gray-600 dark:text-gray-300"
            title={names || undefined}
          >
            {list.length}
          </span>
        );
      },
    },
    {
      id: 'status',
      accessorFn: (r) =>
        r.inCharges === 0 && r.students > 0
          ? 'no_incharge'
          : r.emptyShares > 0
            ? 'empty_share'
            : r.unmarked.length > 0
              ? 'unmarked'
              : 'ok',
      // The shared DataTable's status filter is a single-select (FilterSelect),
      // so the applied value is a plain string, not an array.
      filterFn: (row, id, value: string) => !value || row.getValue(id) === value,
    },
  ];
}
