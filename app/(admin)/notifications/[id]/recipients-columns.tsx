'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

export interface DetailRecipient {
  userId: string;
  email: string | null;
  readAt: string | null;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');

export const READ_STATUS_OPTIONS = [
  { label: 'Read', value: 'read' },
  { label: 'Unread', value: 'unread' },
];

export const recipientColumns: ColumnDef<DetailRecipient>[] = [
  {
    id: 'recipient',
    accessorFn: (r) => r.email ?? r.userId,
    meta: { label: 'Recipient' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Recipient" />,
    cell: ({ row }) => (
      <span className="break-all text-gray-700 dark:text-gray-200">{row.original.email ?? row.original.userId}</span>
    ),
  },
  {
    id: 'status',
    accessorFn: (r) => (r.readAt ? 'read' : 'unread'),
    filterFn: (row, id, value) => (row.getValue(id) as string) === value,
    meta: { label: 'Status' },
    size: 110,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) =>
      row.original.readAt ? (
        <span className="text-xs font-medium text-green-600 dark:text-green-400">Read</span>
      ) : (
        <span className="text-xs text-gray-400">Unread</span>
      ),
  },
  {
    // ISO timestamps sort correctly as strings; unread rows sort first ascending.
    id: 'readAt',
    accessorFn: (r) => r.readAt ?? '',
    meta: { label: 'Read at' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Read at" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">{fmt(row.original.readAt)}</span>
    ),
  },
];
