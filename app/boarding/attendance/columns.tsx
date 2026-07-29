'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { QrCode, Pencil, Check, X, Lock } from 'lucide-react';
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
  if (status === 'absent')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <X className="h-3 w-3" /> Absent
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
 * The Action column is a single toggle button, shown only when `canMark` (the
 * travel day AND the attendance window is open — onward-only, see
 * lib/boarding/attendance-window.ts). It shows the NEXT action: unmarked/absent
 * → "Present", present → "Absent"; the Status badge shows the current state.
 * Clicking POSTs that status to /api/boarding/attendance.
 */
export function getRosterColumns(opts: {
  canMark: boolean;
  busyId: string | null;
  onMark: (row: RosterRow, status: 'present' | 'absent') => void;
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
      size: 170,
      cell: ({ row }) => {
        const r = row.original;
        if (r.status === 'unmarked') return <span className="text-gray-400">—</span>;
        return (
          <div className="leading-tight">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500">
              {r.method === 'manual' ? <Pencil className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
              {fmtTime(r.scanned_at)}
            </span>
            {/* A route can have a dozen staff splitting one roster, so an
                unattributed mark tells nobody who actually did the work. */}
            <span className="block text-xs text-gray-400">by {r.marked_by_name ?? '—'}</span>
            {r.previous_status && (
              <span className="block text-xs text-amber-600 dark:text-amber-400">
                was {r.previous_status === 'present' ? 'Present' : 'Absent'}
                {r.previous_by_name ? ` · ${r.previous_by_name}` : ''}
                {r.previous_at ? ` · ${fmtTime(r.previous_at)}` : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'action',
      enableHiding: false,
      enableSorting: false,
      size: 120,
      header: () => null,
      cell: ({ row }) => {
        // Marking is gated to the travel day AND an open attendance window; outside
        // that no control shows at all (present and absent are both disabled by timing).
        if (!opts.canMark) return null;
        const r = row.original;

        // Somebody else's mark. First mark wins, so there is no button — only a
        // statement of who owns it. `can_edit` comes from the server; this is
        // presentation, and the write route re-decides regardless.
        if (!r.can_edit) {
          return (
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              title={`Marked ${r.status === 'present' ? 'Present' : 'Absent'} by ${
                r.marked_by_name ?? 'another staff member'
              }${r.scanned_at ? ` at ${fmtTime(r.scanned_at)}` : ''}. Only they or the transport office can change it.`}
            >
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          );
        }

        const busy = opts.busyId === r.learner_id;
        // Single toggle showing the NEXT action: present → mark Absent, else → mark Present.
        const next: 'present' | 'absent' = r.status === 'present' ? 'absent' : 'present';
        return next === 'present' ? (
          <button
            type="button"
            onClick={() => opts.onMark(r, 'present')}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Present'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => opts.onMark(r, 'absent')}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Absent'}
          </button>
        );
      },
    },
  ];
}
