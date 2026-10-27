'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { RosterRow } from '@/lib/booking/roster';

export type MarkChoice = 'present' | 'absent';

const STATUS_CLASS: Record<RosterRow['status'], string> = {
  present: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  absent: 'bg-red-500/15 text-red-700 dark:text-red-400',
  unmarked: 'bg-muted text-muted-foreground',
};

/** Worded exactly as the staff screen (app/boarding/attendance/columns.tsx). */
const OTHER_BUS_TEXT: Record<NonNullable<RosterRow['other_bus']>['kind'], string> = {
  booked: 'Booked on bus',
  boarded: 'Boarded bus',
  from: 'From bus',
};

export const STATUS_LABEL: Record<RosterRow['status'], string> = {
  present: 'Present',
  absent: 'Absent',
  unmarked: 'Unmarked',
};

const ticketText = (r: RosterRow) => (r.is_walk_up ? 'Rode without ticket' : r.booked ? 'Booked' : 'No ticket');
const markedByText = (r: RosterRow) => (r.method === 'auto' ? 'Auto-absent job' : r.marked_by_name ?? '—');

export function getRosterColumns({
  showMark,
  onMark,
  busyId,
  bulkBusy,
}: {
  /** Marking controls: only for markers, and never on a future date. */
  showMark: boolean;
  onMark: (r: RosterRow, status: MarkChoice) => void;
  busyId: string | null;
  bulkBusy: boolean;
}): ColumnDef<RosterRow>[] {
  const columns: ColumnDef<RosterRow>[] = [
    {
      accessorKey: 'name',
      meta: { label: 'Learner' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      id: 'roll',
      accessorFn: (r) => r.roll ?? '',
      meta: { label: 'Roll' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.roll ?? '—'}</span>,
    },
    {
      accessorKey: 'stop_name',
      meta: { label: 'Stop' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.stop_name}</span>,
    },
    {
      id: 'ticket',
      accessorFn: ticketText,
      meta: { label: 'Ticket' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ticket" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="text-muted-foreground">
            {ticketText(r)}
            {/* Another bus is involved today. "Boarded bus N" is why a
                back-dated mark from this page is refused: that day's row
                belongs to bus N and must be corrected from its page. */}
            {r.other_bus && (
              <span className="block text-xs text-muted-foreground">
                {OTHER_BUS_TEXT[r.other_bus.kind]} {r.other_bus.routeNumber ?? '?'}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      filterFn: (row, id, value) => row.getValue(id) === value,
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[row.original.status]}`}>
          {STATUS_LABEL[row.original.status]}
        </span>
      ),
    },
    {
      id: 'marked_by',
      accessorFn: markedByText,
      meta: { label: 'Marked by' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marked by" />,
      cell: ({ row }) => <span className="text-muted-foreground">{markedByText(row.original)}</span>,
    },
  ];

  if (showMark) {
    columns.push({
      // 'actions' so the phone card view puts the buttons top-right.
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span>Mark</span>,
      cell: ({ row }) => {
        const r = row.original;
        const disabled = busyId === r.learner_id || bulkBusy;
        return (
          <div className="whitespace-nowrap">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onMark(r, 'present')}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              Present
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onMark(r, 'absent')}
              className="ml-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              Absent
            </button>
          </div>
        );
      },
    });
  }

  return columns;
}
