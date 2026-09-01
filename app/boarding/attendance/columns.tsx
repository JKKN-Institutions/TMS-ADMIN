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
 * Three states, not two — and the two unbooked ones must not READ alike.
 *
 * They were first shipped as "Without ticket" and "Rode without ticket", which
 * differ by one word and are indistinguishable when an in-charge scans the list
 * on a moving bus. Staff could not tell them apart, so the labels were changed
 * to share no leading words at all:
 *
 *   Not booked                 — no booking today. A QUESTION, not an accusation:
 *                                ~1,000 riders a day, most of whom stayed home.
 *                                Nothing has been recorded about them.
 *   Travelled without booking  — the ANSWER. An in-charge saw this student board
 *                                anyway and said so.
 *
 * Same student before and after the Boarded tap; the badge is what changes.
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
      <span className="inline-flex items-start gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <TicketX className="mt-0.5 h-3 w-3 shrink-0" /> Travelled without booking
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      <TicketX className="h-3 w-3 shrink-0" /> Not booked
    </span>
  );
}

/**
 * Full-bus columns for the Attendance page. Route/Status are filterable.
 * The Action column is shown only when `canMark` (the travel day AND the
 * attendance window is open — onward-only, see lib/boarding/attendance-window.ts).
 * Every row offers BOTH outcomes, minus whichever one it already holds:
 * unmarked → [Present] [Absent], present → [Absent], absent → [Present]. The
 * Status badge shows the current state; clicking POSTs to /api/boarding/attendance.
 *
 * It was a single toggle showing only the NEXT action, which meant an UNMARKED
 * student offered "Present" and nothing else — reaching absent required marking
 * them present first and flipping, writing a boarding that never happened. A
 * toggle cannot express a three-state row: it only ever reaches one of the two
 * states you are not currently in.
 *
 * Rows cover the WHOLE allocated bus, and a student who did not book carries a
 * "Not booked" badge. Those rows once offered present ONLY — a one-way amber
 * "Boarded" button whose sole reverse was Undo — which left a rider recorded as
 * boarded who had not boarded with no way to be marked absent. They now get the
 * SAME pair of outcomes as a booked rider; ticket state changes the wording and
 * the weight of the present action, not which outcomes exist:
 *
 *   "Boarded" (amber, not green) — asserts the student rode without booking.
 *   The server flags it is_walk_up, the ticket badge turns red, and the student
 *   is notified once. Absent is an ordinary no-show and is never a walk-up.
 *
 * Undo (clear the row back to unmarked) remains available alongside the toggle
 * on unbooked rows, gated on `can_clear` — canClearMark, strictly narrower than
 * the `can_edit` that gates the status flip, because erasing a record the
 * student was notified about is not the same act as correcting it.
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
      // Wide enough for "Travelled without booking" to sit on one line on a
      // laptop; it wraps inside the pill on a phone rather than truncating,
      // because a half-shown label is exactly the confusion being fixed.
      size: 190,
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
      // Sized for the widest cell this column produces — an unmarked no-ticket
      // row's [Boarded][Absent], or a recorded one's [action][Undo]. It was 120,
      // enough for the single toggle that used to live here; leaving it there
      // would wrap or clip the second button on the exact rows the pair was
      // added for.
      size: 230,
      header: () => null,
      cell: ({ row }) => {
        // Marking is gated to the travel day AND an open attendance window; otherwise
        // no control shows at all (present and absent are both disabled by timing).
        if (!opts.canMark) return null;
        const busy = opts.busyId === row.original.learner_id;

        // ── Without a ticket: BOTH actions, same as a booked rider ──
        // This shipped as present-only — one amber "Boarded" button whose only
        // reverse was Undo — on the reasoning that an unbooked student who did
        // not travel is simply not on the bus, so there is nothing to record.
        //
        // Staff hit the dead end that creates within days: a rider recorded
        // "Boarded" who had NOT boarded showed a boarding with no opposite, and
        // Undo is owner-only, so a colleague saw a Locked pill and no way back.
        // Every rider now gets the same present/absent pair; what ticket state
        // still changes is the WORDING and the weight of the present action,
        // because for an unbooked rider that action asserts a rule breach and
        // notifies the student.
        if (!row.original.booked) {
          const r = row.original;
          if (r.lock_reason === 'not_my_share') {
            return (
              <span className="text-xs text-gray-400" title={`${r.owner_name ?? 'Another in-charge'} marks this student`}>
                —
              </span>
            );
          }
          if (r.lock_reason === 'locked') {
            return (
              <span
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                title={`${r.marked_by_name ?? 'Another staff member'} recorded this. Only they or the transport office can change it.`}
              >
                <Lock className="h-3.5 w-3.5" /> Locked
              </span>
            );
          }
          const boarded = (
            <button
              type="button"
              onClick={() => opts.onMark(r, 'present')}
              disabled={busy}
              title="Only if you can see this student on the bus: record that they travelled without booking a seat"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              <TicketX className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Boarded'}
            </button>
          );
          const absent = (
            <button
              type="button"
              onClick={() => opts.onMark(r, 'absent')}
              disabled={busy}
              title="Record that this student did not travel today"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Absent'}
            </button>
          );
          // Undo survives the toggle rather than being replaced by it: flipping
          // to absent asserts a second fact about the student, where Undo says
          // the record should never have existed. It stays gated on can_clear,
          // which is STRICTLY narrower than can_edit — only the marker or the
          // transport office may erase a record the student was notified about.
          const undo = r.can_clear ? (
            <button
              type="button"
              onClick={() => opts.onUndo(r)}
              disabled={busy}
              title="Clear this record entirely"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Undo2 className="h-3.5 w-3.5" /> {busy ? 'Clearing…' : 'Undo'}
            </button>
          ) : null;

          return (
            <div className="flex items-center gap-1.5">
              {r.status !== 'present' && boarded}
              {r.status !== 'absent' && absent}
              {r.status !== 'unmarked' && undo}
            </div>
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
        // Both outcomes, minus whichever one the row already holds.
        //
        // This was a SINGLE toggle showing only the next action — unmarked
        // rendered "Present" alone, so an UNMARKED booked student could not be
        // marked absent in one tap. Reaching absent meant marking them present
        // first and then flipping, which writes a boarding that never happened
        // (notifying nobody, but leaving a present mark in the audit trail and
        // a moment where the roster says a no-show boarded). A toggle is the
        // wrong shape for a three-state row: it can only ever offer one of the
        // two remaining states.
        //
        // Unmarked → [Present] [Absent]; present → [Absent]; absent → [Present],
        // matching the unbooked rows above so the whole column reads one way.
        return (
          <div className="flex items-center gap-1.5">
            {r.status !== 'present' && (
              <button
                type="button"
                onClick={() => opts.onMark(r, 'present')}
                disabled={disabled}
                title={title}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Present'}
              </button>
            )}
            {r.status !== 'absent' && (
              <button
                type="button"
                onClick={() => opts.onMark(r, 'absent')}
                disabled={disabled}
                title={title}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Absent'}
              </button>
            )}
          </div>
        );
      },
    },
  ];
}
