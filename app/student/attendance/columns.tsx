'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, QrCode } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

// One of MY attendance records, exactly as /api/student/attendance returns it.
export interface AttendanceRow {
  id: string;
  tripDate: string;
  direction: string;
  status: string;
  method: string;
  routeLabel: string | null;
  stopLabel: string | null;
  scannedAt: string;
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

function StatusBadge({ status }: { status: string }) {
  if (status === 'present')
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        Present
      </span>
    );
  if (status === 'absent')
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
        Absent
      </span>
    );
  return <span className="text-xs text-gray-400">—</span>;
}

/**
 * Read-only history of the signed-in learner's OWN boarding attendance.
 *
 * Date + Marked sort on their ISO strings (lexicographic order == chronological).
 * Direction + Status are filterable (explicit `id` + `accessorFn` + `filterFn`)
 * so the page's `filters` dropdowns can target them by that same id. There is no
 * select or actions column — a learner only ever reads these records, so the
 * factory takes no callbacks or permission flags.
 */
export function getAttendanceColumns(): ColumnDef<AttendanceRow>[] {
  return [
    {
      accessorKey: 'tripDate',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">
          {fmtDate(row.original.tripDate)}
        </span>
      ),
    },
    {
      id: 'direction',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Direction" />,
      accessorFn: (r) => r.direction ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => (
        <span className="capitalize text-gray-600 dark:text-gray-300">{row.original.direction || '—'}</span>
      ),
    },
    {
      accessorKey: 'routeLabel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">{row.original.routeLabel || '—'}</span>
      ),
    },
    {
      accessorKey: 'stopLabel',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">{row.original.stopLabel || '—'}</span>
      ),
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
      accessorKey: 'scannedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marked" />,
      size: 120,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500">
          {row.original.method === 'manual' ? (
            <Pencil className="h-3.5 w-3.5" />
          ) : (
            <QrCode className="h-3.5 w-3.5" />
          )}
          {fmtTime(row.original.scannedAt)}
        </span>
      ),
    },
  ];
}
