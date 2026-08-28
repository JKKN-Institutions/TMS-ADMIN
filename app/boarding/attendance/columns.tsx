'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { QrCode, Pencil, Check, X, Ticket, TicketX, Lock, Undo2 } from 'lucide-react';
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
 * Three states, not two. "Without ticket" and "Rode without ticket" look alike
 * but mean very different things: the first is the ~1,000 riders a day who did
 * not book, most of whom stayed home; the second is the far smaller set someone
 * actually watched board. Rendering them identically would waste the record.
 */
function TicketBadge({ booked, walkUp }: { booked: boolean; walkUp: boolean }) {
  if (booked)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
        <Ticket className="h-3 w-3" /> Booked
      </span>
    );
  if (walkUp)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <TicketX className="h-3 w-3" /> Rode without ticket
      </span>
    );
  return (
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
 * Rows cover the WHOLE allocated bus. A student who did not book carries a
 * "Without ticket" badge and gets a DIFFERENT control from a booked one: a
 * single amber "Boarded" button rather than a Present/Absent toggle, because
 * the only fact worth recording about an unbooked student is that they rode
 * anyway. That write is flagged is_walk_up server-side, the badge turns red,
 * and the row's control becomes "Undo" — the sole correction path, so it is
 * gated by the same ownership rule (can_edit, from canClearMark) as everything
 * else on this screen.
 */
export function getRosterColumns(opts: {
  canMark: boolean;
  busyId: string | null;
  onMark: (row: RosterRow, status: 'present' | 'absent') => void;
  /** Clear a without-ticket boarding record — the only correction path those rows have. */
  onUndo: (row: RosterRow) => void;
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
      // 'rode_without_ticket' is a strict subset of the unbooked riders, and is
      // the one the transport office actually wants to pull out of a 1,600-row
      // roster — so it gets its own filter value rather than sharing one.
      accessorFn: (r) => (r.booked ? 'booked' : r.is_walk_up ? 'rode_without_ticket' : 'without_ticket'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 160,
      cell: ({ row }) => <TicketBadge booked={row.original.booked} walkUp={row.original.is_walk_up} />,
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
          <div className="whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5 text-gray-500">
              {row.original.method === 'manual' ? <Pencil className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
              {fmtTime(row.original.scanned_at)}
            </span>
            {/* A dozen in-charges share this roster, so an unattributed mark
                cannot be acted on: "who already did this?" is the question. */}
            {row.original.marked_by_name && (
              <div className="text-xs text-gray-400">by {row.original.marked_by_name}</div>
            )}
            {row.original.previous_status && (
              <div className="text-xs text-amber-700 dark:text-amber-300">
                was {row.original.previous_status}
                {row.original.previous_by_name ? ` · ${row.original.previous_by_name}` : ''}
              </div>
            )}
          </div>
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
        const busy = opts.busyId === row.original.learner_id;

        // ── Without a ticket: one action, not a toggle ──
        // A student who neither booked nor travelled is simply not on the bus,
        // so there is no Absent to offer — the only fact worth recording is
        // that they boarded anyway. Once recorded, the opposite of "boarded" is
        // not "absent", it is "I got that wrong", so the row offers Undo.
        if (!row.original.booked) {
          const r = row.original;
          if (r.status === 'unmarked') {
            if (r.lock_reason === 'not_my_share') {
              return (
                <span className="text-xs text-gray-400" title={`${r.owner_name ?? 'Another in-charge'} marks this student`}>
                  —
                </span>
              );
            }
            return (
              <button
                type="button"
                onClick={() => opts.onMark(r, 'present')}
                disabled={busy}
                title="Record that this student boarded without booking a seat"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                <TicketX className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Boarded'}
              </button>
            );
          }
          // Already recorded. Undo is the ONLY correction path for these rows,
          // so it must respect the same ownership rule as every other write --
          // can_edit already folds it in (canClearMark, server-side).
          if (!r.can_edit) {
            return (
              <span
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                title={`${r.marked_by_name ?? 'Another staff member'} recorded this. Only they or the transport office can clear it.`}
              >
                <Lock className="h-3.5 w-3.5" /> Locked
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={() => opts.onUndo(r)}
              disabled={busy}
              title="Clear this record"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Undo2 className="h-3.5 w-3.5" /> {busy ? 'Clearing…' : 'Undo'}
            </button>
          );
        }

        // ONE server-decided flag folds both gates -- scope (whose share is this
        // learner?) and arbitration (whose mark is already on this row?). The
        // client never re-derives either; lock_reason only picks the wording.
        const r = row.original;
        if (r.lock_reason === 'locked') {
          return (
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              title={`${r.marked_by_name ?? 'Another staff member'} marked this student. Only they or the transport office can change it.`}
            >
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          );
        }
        const disabled = !r.can_edit || busy;
        const title =
          r.lock_reason === 'not_my_share'
            ? `${r.owner_name ?? 'Another in-charge'} marks this student`
            : undefined;
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
