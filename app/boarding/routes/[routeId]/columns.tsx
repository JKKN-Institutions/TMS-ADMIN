'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

export type RosterStatus = 'present' | 'absent' | null;
export type RosterDirection = 'onward' | 'return';

// Shape of one roster row (a learner allocated to the route + today's status).
export interface RosterStudent {
  id: string;
  name: string;
  roll_number: string | null;
  onward_status: RosterStatus;
  return_status: RosterStatus;
  last_scanned_at: string | null;
  // Academic detail (shown in the click-through dialog). Optional so older
  // callers/payloads still type-check; resolved names or null.
  register_number?: string | null;
  institution?: string | null;
  degree?: string | null;
  department?: string | null;
  program?: string | null;
  semester?: string | null;
  section?: string | null;
  academic_year?: string | null;
  transport_year?: string | null;
  stop?: string | null;
}

function StatusPill({ status }: { status: RosterStatus }) {
  if (status === 'present')
    return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">Present</span>;
  if (status === 'absent')
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">Absent</span>;
  return <span className="text-xs text-gray-400">—</span>;
}

function MarkControl({ status, disabled, onMark }: { status: RosterStatus; disabled: boolean; onMark: (s: 'present' | 'absent') => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
      <button
        type="button" disabled={disabled} onClick={() => onMark('present')}
        className={`px-2 py-1 text-xs font-medium transition-colors ${status === 'present' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-green-50'} disabled:opacity-50`}
      >
        Present
      </button>
      <button
        type="button" disabled={disabled} onClick={() => onMark('absent')}
        className={`border-l border-gray-300 px-2 py-1 text-xs font-medium transition-colors ${status === 'absent' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-red-50'} disabled:opacity-50`}
      >
        Absent
      </button>
    </div>
  );
}

/**
 * Roster columns factory. Takes an `editable` flag (staff can manage AND the
 * roster is for today) + saving state + the mark callback (a roster row marks
 * attendance instead of view/edit/delete). The onward/return columns are
 * filterable (id + accessorFn + filterFn) so the page's `filters` can target
 * them, and render a live mark control when editable, else a read-only pill —
 * which is also how advance-booking (future-date) rosters display.
 */
export function getRosterColumns(
  editable: boolean,
  saving: boolean,
  onMark: (learnerId: string, direction: RosterDirection, status: 'present' | 'absent') => void,
  onSelect: (student: RosterStudent) => void
): ColumnDef<RosterStudent>[] {
  const selectColumn: ColumnDef<RosterStudent> = {
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
    ...(editable ? [selectColumn] : []),
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onSelect(row.original)}
          className="cursor-pointer text-left font-medium text-blue-700 underline-offset-2 transition-colors hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
          title="View learner details"
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: 'roll_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll No." />,
      cell: ({ row }) => <span className="text-gray-600 dark:text-gray-300">{row.original.roll_number || '—'}</span>,
    },
    {
      id: 'onward',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Onward" />,
      accessorFn: (s) => s.onward_status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return editable
          ? <MarkControl status={s.onward_status} disabled={saving} onMark={(st) => onMark(s.id, 'onward', st)} />
          : <StatusPill status={s.onward_status} />;
      },
    },
    {
      id: 'return',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Return" />,
      accessorFn: (s) => s.return_status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return editable
          ? <MarkControl status={s.return_status} disabled={saving} onMark={(st) => onMark(s.id, 'return', st)} />
          : <StatusPill status={s.return_status} />;
      },
    },
  ];
}
