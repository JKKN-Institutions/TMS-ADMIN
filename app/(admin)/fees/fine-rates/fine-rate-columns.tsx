'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { inr } from '@/app/(admin)/fees/columns';

export interface FineRateRow {
  stop_id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  fine_amount: number | null;
}

export function getFineRateColumns(
  canManage: boolean,
  onChange: (stopId: string, value: string) => void,
  draft: Record<string, string>
): ColumnDef<FineRateRow>[] {
  return [
    {
      accessorKey: 'route_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="text-gray-900 dark:text-gray-100">
          {row.original.route_number ?? '—'}
          {row.original.route_name ? (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{row.original.route_name}</span>
          ) : null}
        </span>
      ),
    },
    {
      accessorKey: 'stop_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.stop_name}</span>
      ),
    },
    {
      id: 'fine_amount',
      accessorFn: (r) => r.fine_amount,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fine" />,
      cell: ({ row }) => {
        const r = row.original;
        const value = draft[r.stop_id] ?? (r.fine_amount === null ? '' : String(r.fine_amount));
        if (!canManage) {
          return (
            <span
              className={
                r.fine_amount === null
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-gray-900 dark:text-gray-100'
              }
            >
              {r.fine_amount === null ? 'not set' : inr(r.fine_amount)}
            </span>
          );
        }
        return (
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(r.stop_id, e.target.value)}
            placeholder="not set"
            aria-label={`Fine amount for ${r.stop_name}`}
            className="h-9 w-32 rounded-lg border border-gray-300 px-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        );
      },
    },
  ];
}
