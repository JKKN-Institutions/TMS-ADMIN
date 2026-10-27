'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { FeeStructureStopTerm, FeeStructureTerm } from '@/lib/fees/types';
import { inr } from '../columns';

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Columns both schedules share: the instalment number and its label.
function leadColumns<T extends { term_no: number; term_label: string | null }>(): ColumnDef<T>[] {
  return [
    {
      accessorKey: 'term_no',
      meta: { label: '#' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
      size: 60,
      cell: ({ row }) => <span className="tabular-nums text-gray-500">{row.original.term_no}</span>,
    },
    {
      id: 'term',
      meta: { label: 'Term' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Term" />,
      accessorFn: (t) => t.term_label || `Term ${t.term_no}`,
      cell: ({ getValue }) => <span className="font-medium text-gray-900 dark:text-gray-100">{getValue() as string}</span>,
    },
  ];
}

const dueDateColumn = <T extends { due_date: string }>(): ColumnDef<T> => ({
  accessorKey: 'due_date',
  meta: { label: 'Due date' },
  header: ({ column }) => <DataTableColumnHeader column={column} title="Due date" />,
  cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.due_date)}</span>,
});

/** Flat and tiered-band terms: #, Term, Amount, Due date. */
export function getTermColumns(): ColumnDef<FeeStructureTerm>[] {
  return [
    ...leadColumns<FeeStructureTerm>(),
    {
      accessorKey: 'amount',
      meta: { label: 'Amount' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => <span className="tabular-nums">{inr(row.original.amount)}</span>,
    },
    dueDateColumn<FeeStructureTerm>(),
  ];
}

/** Stop-wise instalments carry a share, not an amount: #, Term, Due date, Share. */
export function getStopTermColumns(): ColumnDef<FeeStructureStopTerm>[] {
  return [
    ...leadColumns<FeeStructureStopTerm>(),
    dueDateColumn<FeeStructureStopTerm>(),
    {
      id: 'share',
      meta: { label: 'Share' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Share" />,
      accessorFn: (t) => Number(t.share_percent),
      cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}%</span>,
    },
  ];
}
