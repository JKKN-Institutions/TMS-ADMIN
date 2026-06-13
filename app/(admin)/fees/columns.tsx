'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FeeStructureRow, FeeStatus, FeeAudience } from '@/lib/fees/types';

export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<FeeStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  archived: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
};
export const feeStatusBadge = (status: FeeStatus) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status] ?? STATUS_STYLE.draft}`}>
    {status}
  </span>
);

export const audienceBadge = (a: FeeAudience) => (
  <span
    className={
      a === 'staff'
        ? 'inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-500/15 dark:text-purple-400'
        : 'inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-400'
    }
  >
    {a === 'staff' ? 'Staff' : 'Learners'}
  </span>
);

export function getFeeColumns(
  onView: (f: FeeStructureRow) => void,
  onEdit: (f: FeeStructureRow) => void,
  onDelete: (f: FeeStructureRow) => void,
  canManage: boolean,
  canDelete: boolean
): ColumnDef<FeeStructureRow>[] {
  const selectColumn: ColumnDef<FeeStructureRow> = {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    size: 40,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v)} aria-label="Select row" />
    ),
  };

  return [
    ...(canManage ? [selectColumn] : []),
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fee Structure" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onView(row.original)}
            className="text-left font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
          >
            {row.original.name}
          </button>
          {audienceBadge(row.original.audience)}
        </div>
      ),
    },
    {
      id: 'transport_year',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Transport Year" />,
      accessorFn: (f) => f.transport_year_name ?? '—',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
          {row.original.transport_year_name ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total Fee" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{inr(row.original.total_amount)}</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'split_count',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Terms" />,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.original.split_count} {row.original.split_count === 1 ? 'term' : 'terms'}
        </span>
      ),
      size: 90,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (f) => f.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => feeStatusBadge(row.original.status),
      size: 110,
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const f = row.original;
        const open = (fn: (f: FeeStructureRow) => void) => setTimeout(() => fn(f), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${f.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(onView)}>
                  <Eye className="text-gray-500" /> View
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => open(onEdit)}>
                    <Pencil className="text-gray-500" /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => open(onDelete)}
                      className="text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 [&>svg]:text-red-500"
                    >
                      <Trash2 /> Delete
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
