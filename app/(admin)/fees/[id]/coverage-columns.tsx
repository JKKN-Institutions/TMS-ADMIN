'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { GraduationCap, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { CoveragePerson } from '../fee-api';

// Coverage status → badge (light + dark variants).
const STATUS_STYLE: Record<string, string> = {
  billed: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  unbilled: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  staff_deferred: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-400',
};

const coverageStatusBadge = (status: string) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
      STATUS_STYLE[status] ?? STATUS_STYLE.unbilled
    }`}
  >
    {status.replace(/_/g, ' ')}
  </span>
);

const typeBadge = (t: CoveragePerson['person_type']) => (
  <span
    className={
      t === 'staff'
        ? 'inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-500/15 dark:text-purple-400'
        : 'inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-400'
    }
  >
    {t === 'staff' ? <Users className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
    {t === 'staff' ? 'Staff' : 'Learner'}
  </span>
);

// Read-only coverage table: no row actions/selection, just sortable + filterable
// columns. `person_type` and `status` carry id + accessorFn + filterFn so the
// page's <DataTable filters> dropdowns bind to them.
export function getCoverageColumns(): ColumnDef<CoveragePerson>[] {
  return [
    {
      id: 'select',
      enableSorting: false,
      enableHiding: false,
      size: 40,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(v)}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">{row.original.code || '—'}</span>
      ),
      size: 140,
    },
    {
      id: 'institution',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      accessorFn: (p) => p.institution_name ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">{row.original.institution_name || '—'}</span>
      ),
    },
    {
      id: 'person_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      accessorFn: (p) => p.person_type,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => typeBadge(row.original.person_type),
      size: 120,
    },
    {
      id: 'terms',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Terms billed" />,
      accessorFn: (p) => p.terms_billed, // sort by count
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.original.terms_billed}/{row.original.total_terms}
        </span>
      ),
      size: 130,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (p) => p.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => coverageStatusBadge(row.original.status),
      size: 150,
    },
  ];
}
