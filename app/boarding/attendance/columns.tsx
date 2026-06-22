'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { QrCode, Pencil } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

// One attendance record as /api/boarding/attendance returns it.
export interface AttendanceRecord {
  id: string;
  learner_name: string;
  roll_number: string | null;
  route_number: string | null;
  direction: string | null;
  status: string | null;
  method: string | null;
  scanned_at: string | null;
}

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'present')
    return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">Present</span>;
  if (status === 'absent')
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">Absent</span>;
  return <span className="text-xs text-gray-400">—</span>;
}

/**
 * Read-only attendance-history columns. Route / Direction / Status are filterable
 * (id + accessorFn + filterFn) so the page's `filters` can target them; "Marked"
 * sorts on the ISO scanned_at (string sort == chronological) and shows a QR vs
 * manual marker.
 */
export function getAttendanceColumns(): ColumnDef<AttendanceRecord>[] {
  const selectColumn: ColumnDef<AttendanceRecord> = {
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
    selectColumn,
    {
      accessorKey: 'learner_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.learner_name}</span>,
    },
    {
      accessorKey: 'roll_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll No." />,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.roll_number || '—'}</span>,
    },
    {
      id: 'route_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (r) => r.route_number ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 100,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.route_number || '—'}</span>,
    },
    {
      id: 'direction',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Direction" />,
      accessorFn: (r) => r.direction ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 110,
      cell: ({ row }) => <span className="capitalize text-gray-600 dark:text-gray-300">{row.original.direction || '—'}</span>,
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => r.status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'scanned_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marked" />,
      size: 120,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500">
          {row.original.method === 'manual' ? <Pencil className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
          {fmtTime(row.original.scanned_at)}
        </span>
      ),
    },
  ];
}
