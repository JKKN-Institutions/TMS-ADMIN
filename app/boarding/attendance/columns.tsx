'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { QrCode, Pencil, Check, Undo2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { RosterRow } from '@/lib/booking/roster';

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

function StatusBadge({ status }: { status: RosterRow['status'] }) {
  if (status === 'present')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        <Check className="h-3 w-3" /> Present
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      Unmarked
    </span>
  );
}

/**
 * Booked-students columns for the Attendance page. Route/Status are filterable.
 * The Action column shows a "Mark present" button for unmarked rows only when
 * `canMark` (today) — a manual override that POSTs to /api/boarding/attendance.
 */
export function getRosterColumns(opts: {
  canMark: boolean;
  canUndo: boolean;
  busyId: string | null;
  onMark: (row: RosterRow) => void;
  onUnmark: (row: RosterRow) => void;
}): ColumnDef<RosterRow>[] {
  const selectColumn: ColumnDef<RosterRow> = {
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
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.name}</span>,
    },
    {
      accessorKey: 'roll',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll No." />,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.roll || '—'}</span>,
    },
    {
      id: 'route_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (r) => r.route_number ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 90,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.route_number || '—'}</span>,
    },
    {
      id: 'stop',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      accessorFn: (r) => r.stop_name,
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">
          {row.original.stop_name}
          {row.original.stop_time ? <span className="text-gray-400"> · {row.original.stop_time.slice(0, 5)}</span> : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => r.status,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'scanned_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marked" />,
      size: 110,
      cell: ({ row }) =>
        row.original.status === 'present' ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500">
            {row.original.method === 'manual' ? <Pencil className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
            {fmtTime(row.original.scanned_at)}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      id: 'action',
      enableHiding: false,
      enableSorting: false,
      size: 120,
      header: () => null,
      cell: ({ row }) => {
        const busy = opts.busyId === row.original.learner_id;
        if (row.original.status === 'present') {
          if (!opts.canUndo) return null;
          return (
            <button
              type="button"
              onClick={() => opts.onUnmark(row.original)}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <Undo2 className="h-3.5 w-3.5" /> {busy ? 'Undoing…' : 'Undo'}
            </button>
          );
        }
        if (!opts.canMark) return null;
        return (
          <button
            type="button"
            onClick={() => opts.onMark(row.original)}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> {busy ? 'Marking…' : 'Mark present'}
          </button>
        );
      },
    },
  ];
}
