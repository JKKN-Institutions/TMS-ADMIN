'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { QrCode, Pencil, Check, X, Ticket, TicketX } from 'lucide-react';
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

function TicketBadge({ booked }: { booked: boolean }) {
  return booked ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
      <Ticket className="h-3 w-3" /> Booked
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      <TicketX className="h-3 w-3" /> Without ticket
    </span>
  );
}

/**
 * Full-bus columns for the Attendance page. Route/Status are filterable.
 * The Action column is a single toggle button, shown only when `canMark` (the
 * travel day AND the attendance window is open — onward-only, see
 * lib/boarding/attendance-window.ts) AND the student holds a ticket for the day.
 * It shows the NEXT action: unmarked/absent → "Present", present → "Absent"; the
 * Status badge shows the current state. Clicking POSTs that status to
 * /api/boarding/attendance.
 *
 * Rows now cover the WHOLE allocated bus, so a student who did not book appears
 * with a "Without ticket" badge and no mark control — they are visible to the
 * in-charge but are not part of the day's attendance.
 */
export function getRosterColumns(opts: {
  canMark: boolean;
  busyId: string | null;
  onMark: (row: RosterRow, status: 'present' | 'absent') => void;
  // Whether ANY row in the current response carries an owner. While the
  // share-scoring flag is off, owner_name is null on every row and this is
  // false — in that state the In-charge column is omitted entirely rather
  // than rendering "Unassigned" on the whole bus (which would read as an
  // alarm on a screen in-charges use daily, for a feature that isn't live).
  hasOwners: boolean;
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

  // Built separately (rather than inline in the return array) so it can be
  // conditionally spread in only when hasOwners — see the opts.hasOwners doc.
  const ownerColumn: ColumnDef<RosterRow> = {
    accessorKey: 'owner_name',
    id: 'owner',
    header: 'In-charge',
    cell: ({ row }) => {
      const r = row.original;
      if (!r.owner_name) return <span className="text-xs text-gray-400">Unassigned</span>;
      return (
        <span className={r.is_mine ? 'text-xs font-medium text-gray-900 dark:text-gray-100' : 'text-xs text-gray-500'}>
          {r.is_mine ? 'You' : r.owner_name}
        </span>
      );
    },
    // FilterSelect (components/ui/data-table.tsx) is single-select and passes
    // a plain string — 'mine' or 'others' — matching the equality pattern the
    // other filterable columns in this file use (route_number/ticket/status).
    filterFn: (row, _id, value) => (row.original.is_mine ? 'mine' : 'others') === value,
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
      id: 'ticket',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ticket" />,
      // Filter values are the strings the page's filter options emit, not booleans.
      accessorFn: (r) => (r.booked ? 'booked' : 'without_ticket'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 130,
      cell: ({ row }) => <TicketBadge booked={row.original.booked} />,
    },
    ...(opts.hasOwners ? [ownerColumn] : []),
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
        row.original.status !== 'unmarked' ? (
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
        // Marking is gated to the travel day AND an open attendance window; otherwise
        // no control shows at all (present and absent are both disabled by timing).
        if (!opts.canMark) return null;
        // No booking → no attendance for the day. The row stays visible (the
        // in-charge still needs to see who is on the bus roster) but carries no
        // mark control; the Ticket column already says why.
        if (!row.original.booked) return <span className="text-xs text-gray-400">—</span>;
        const busy = opts.busyId === row.original.learner_id;
        // Ownership gate: the in-charge can see the whole bus but only marks their own
        // share. Not-mine rows keep the button visible (so the state stays legible) but
        // disabled, with a tooltip naming whose share it is.
        const disabled = !row.original.is_mine || busy;
        const title = !row.original.is_mine ? `${row.original.owner_name ?? 'Another in-charge'} marks this student` : undefined;
        // Single toggle showing the NEXT action: present → mark Absent, else → mark Present.
        const next: 'present' | 'absent' = row.original.status === 'present' ? 'absent' : 'present';
        return next === 'present' ? (
          <button
            type="button"
            onClick={() => opts.onMark(row.original, 'present')}
            disabled={disabled}
            title={title}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Present'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => opts.onMark(row.original, 'absent')}
            disabled={disabled}
            title={title}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Absent'}
          </button>
        );
      },
    },
  ];
}
