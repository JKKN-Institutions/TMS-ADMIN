'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { effectiveAmount, parseRateInput } from '@/lib/fees/stop-rate-draft';

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

/**
 * `canManage` swaps the Annual cell between a read-only figure and an input
 * bound to the card's draft. Sorting, the status badge and the status filter
 * all read the EFFECTIVE amount (draft over saved), so an unsaved edit is
 * reflected everywhere at once rather than only in the box you typed in.
 */
export function getStopRateColumns(
  canManage: boolean,
  onChange: (stopId: string, value: string) => void,
  draft: Record<string, string>
): ColumnDef<StopRateRow>[] {
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
      accessorFn: (r) => effectiveAmount(r, draft),
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
      size: 160,
      cell: ({ row }) => {
        const r = row.original;
        const amount = r.annual_amount;

        if (!canManage) {
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
        }

        const raw = draft[r.stop_id] ?? (amount === null ? '' : String(amount));
        const invalid = !parseRateInput(raw).ok;
        return (
          <div className="flex justify-end">
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={raw}
              onChange={(e) => onChange(r.stop_id, e.target.value)}
              placeholder="Needs rate"
              aria-label={`Annual amount for ${r.stop_name}`}
              aria-invalid={invalid}
              className={
                invalid
                  ? 'h-9 w-32 rounded-lg border border-red-400 bg-red-50 px-2 text-right text-sm tabular-nums text-red-900 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200'
                  : 'h-9 w-32 rounded-lg border border-gray-300 px-2 text-right text-sm tabular-nums text-gray-900 placeholder:text-amber-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-amber-500'
              }
            />
          </div>
        );
      },
    },
    {
      id: 'priced',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => (effectiveAmount(r, draft) === null ? 'unpriced' : 'priced'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => pricedBadge(effectiveAmount(row.original, draft) !== null),
    },
  ];
}
