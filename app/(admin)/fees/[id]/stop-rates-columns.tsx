'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

export interface StopRateRow {
  stop_id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  annual_amount: number | null;
}

// Priced / needs-rate → badge (light + dark variants), matching the amber
// "needs rate" treatment used inline in the Annual column.
const pricedBadge = (priced: boolean) => (
  <span
    className={
      priced
        ? 'inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-500/15 dark:text-green-400'
        : 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'
    }
  >
    {priced ? 'Priced' : 'Needs rate'}
  </span>
);

// Read-only table: no row selection, no actions — rates are edited via the
// import sheet, not per row. `priced` carries id + accessorFn + filterFn so
// the page's <DataTable filters> dropdown binds to it (id must match).
export function getStopRateColumns(): ColumnDef<StopRateRow>[] {
  return [
    {
      id: 'route',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (r) => `${r.route_number ?? ''} ${r.route_name ?? ''}`.trim(),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
          {row.original.route_number} — {row.original.route_name}
        </span>
      ),
    },
    {
      accessorKey: 'sequence_order',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Seq" />,
      size: 70,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums text-gray-500 dark:text-gray-400">
          {row.original.sequence_order}
        </span>
      ),
    },
    {
      // Row identity column — styled as the primary text but NOT clickable:
      // there is no per-stop detail view to link to.
      accessorKey: 'stop_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      cell: ({ row }) => (
        <span className="font-semibold text-gray-900 dark:text-gray-100">{row.original.stop_name}</span>
      ),
    },
    {
      id: 'annual_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Annual (₹)" />,
      accessorFn: (r) => r.annual_amount,
      // Unpriced (null) rows sort as lower than any priced amount, so an
      // ascending sort surfaces "needs rate" rows first -- the thing an
      // operator most wants to find before generating bills.
      sortingFn: (rowA, rowB, columnId) => {
        const a = rowA.getValue<number | null>(columnId);
        const b = rowB.getValue<number | null>(columnId);
        const av = a === null || a === undefined ? -Infinity : a;
        const bv = b === null || b === undefined ? -Infinity : b;
        return av === bv ? 0 : av < bv ? -1 : 1;
      },
      size: 140,
      cell: ({ row }) => {
        const amount = row.original.annual_amount;
        return (
          <div className="text-right">
            {amount === null ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
                Needs rate
              </span>
            ) : (
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {amount.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'priced',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => (r.annual_amount === null ? 'unpriced' : 'priced'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => pricedBadge(row.original.annual_amount !== null),
    },
  ];
}
