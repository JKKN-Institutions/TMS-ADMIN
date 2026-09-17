'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { inr } from '../columns';
import type { ConcessionRow } from './concessions-api';

export const STATUS_LABEL: Record<ConcessionRow['status'], string> = {
  needs_fix: 'Needs fix',
  applied: 'Applied',
  review: 'Needs review',
  unresolved: 'Unresolved',
};

const STATUS_CLS: Record<ConcessionRow['status'], string> = {
  needs_fix: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  applied: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  review: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  unresolved: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400',
};

const money = (n: number | null) => (n === null ? '—' : inr(n));

export function getConcessionColumns(): ColumnDef<ConcessionRow>[] {
  return [
    {
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
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(v)}
          disabled={!row.getCanSelect()}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: 'rollNumber',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll no" />,
      cell: ({ row }) => <span className="text-sm text-gray-600 dark:text-gray-300">{row.original.rollNumber || '—'}</span>,
      size: 110,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.name}</span>,
    },
    {
      id: 'institution',
      accessorFn: (r) => r.institutionName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      header: ({ column }) => <DataTableColumnHeader column={column} title="College" />,
      cell: ({ row }) => (
        <div className="min-w-0 text-sm text-gray-600 dark:text-gray-300">
          <div className="truncate">{row.original.institutionName || '—'}</div>
          <div className="truncate text-xs text-gray-400">
            {[row.original.programName, row.original.admissionYear].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      id: 'fullTotal',
      accessorFn: (r) => r.fullTotal ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Full fee" />,
      cell: ({ row }) => <span className="text-sm tabular-nums">{money(row.original.fullTotal)}</span>,
      size: 100,
    },
    {
      id: 'targetTotal',
      accessorFn: (r) => r.targetTotal ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Concession fee" />,
      cell: ({ row }) => <span className="text-sm font-medium tabular-nums">{money(row.original.targetTotal)}</span>,
      size: 120,
    },
    {
      id: 'billAmount',
      accessorFn: (r) => r.billAmount ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Current bill" />,
      cell: ({ row }) => (
        <div className="text-sm tabular-nums">
          <div>{row.original.billAmount === null ? 'Not billed' : inr(row.original.billAmount)}</div>
          {row.original.billStatus && <div className="text-xs capitalize text-gray-400">{row.original.billStatus.replace('_', ' ')}</div>}
        </div>
      ),
      size: 110,
    },
    {
      accessorKey: 'paidAmount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Paid" />,
      cell: ({ row }) => <span className="text-sm tabular-nums">{inr(row.original.paidAmount)}</span>,
      size: 90,
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLS[row.original.status]}`}>
            {STATUS_LABEL[row.original.status]}
          </span>
          {row.original.reason && (
            <div className="mt-0.5 max-w-[16rem] text-xs text-gray-500 dark:text-gray-400">{row.original.reason}</div>
          )}
        </div>
      ),
    },
  ];
}
