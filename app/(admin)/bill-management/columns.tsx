'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { GraduationCap, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { TransportBillRow, BillStatus } from '@/lib/fees/bills';

export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_STYLE: Record<BillStatus, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  partially_paid: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400',
  unpaid: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  staff_deferred: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-400',
  unknown: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
};

export const billStatusBadge = (status: BillStatus) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
      STATUS_STYLE[status] ?? STATUS_STYLE.unknown
    }`}
  >
    {status.replace(/_/g, ' ')}
  </span>
);

const typeBadge = (t: TransportBillRow['person_type']) => (
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

export function getBillColumns(): ColumnDef<TransportBillRow>[] {
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
      accessorKey: 'person_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Person" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.person_name}</span>
      ),
    },
    {
      accessorKey: 'code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">{row.original.code || '—'}</span>
      ),
      size: 120,
    },
    {
      id: 'institution',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      accessorFn: (r) => r.institution_name ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">{row.original.institution_name || '—'}</span>
      ),
    },
    {
      id: 'structure',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Structure / Term" />,
      accessorFn: (r) => r.structure_name ?? '',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.original.structure_name || '—'}
          <span className="text-gray-400"> · T{row.original.term_no}</span>
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{inr(row.original.amount)}</span>
      ),
      size: 110,
    },
    {
      accessorKey: 'paid_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Paid" />,
      cell: ({ row }) => (
        <span className="text-sm text-green-700 dark:text-green-400">{inr(row.original.paid_amount)}</span>
      ),
      size: 110,
    },
    {
      accessorKey: 'pending_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pending" />,
      cell: ({ row }) => (
        <span
          className={
            row.original.pending_amount > 0
              ? 'text-sm font-medium text-red-600 dark:text-red-400'
              : 'text-sm text-gray-400'
          }
        >
          {inr(row.original.pending_amount)}
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'due_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due date" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.due_date)}</span>
      ),
      size: 130,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => r.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => billStatusBadge(row.original.status),
      size: 130,
    },
    {
      id: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      accessorFn: (r) => r.person_type,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => typeBadge(row.original.person_type),
      size: 110,
    },
  ];
}
