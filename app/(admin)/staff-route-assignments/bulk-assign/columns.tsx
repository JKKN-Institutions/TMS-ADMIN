'use client';

import { createContext, useContext } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { titleCase } from '@/lib/format/display';
import type { Candidate } from '@/lib/staff-assignments/bulk';

// The selection is the PAGE's Set (the submit flow, its batching and its
// keep-failed-batch-selected retry all read it), not the table's internal
// rowSelection. Handing it to the checkbox cells through context keeps the
// columns array static — rebuilding columns on every tick would remount cells.
interface CandidateSelection {
  selected: Set<string>;
  toggle: (staffId: string) => void;
  /** Select every given staffer, or clear them all if they are all already on. */
  toggleMany: (staff: Candidate[]) => void;
}

export const CandidateSelectionContext = createContext<CandidateSelection>({
  selected: new Set(),
  toggle: () => {},
  toggleMany: () => {},
});

function SelectAllHeader({ rows }: { rows: Candidate[] }) {
  const { selected, toggleMany } = useContext(CandidateSelectionContext);
  const on = rows.filter((c) => selected.has(c.staffId)).length;
  return (
    <Checkbox
      checked={rows.length > 0 && on === rows.length ? true : on > 0 ? 'indeterminate' : false}
      onCheckedChange={() => toggleMany(rows)}
      disabled={rows.length === 0}
      aria-label="Select all matching staff"
      title="Select all matching staff (every page)"
    />
  );
}

function SelectCell({ candidate }: { candidate: Candidate }) {
  const { selected, toggle } = useContext(CandidateSelectionContext);
  return (
    <Checkbox
      checked={selected.has(candidate.staffId)}
      onCheckedChange={() => toggle(candidate.staffId)}
      aria-label={`Select ${candidate.name}`}
    />
  );
}

export const routeLabel = (c: Pick<Candidate, 'routeNumber' | 'routeName'>) => `${c.routeNumber} - ${c.routeName}`;

export const candidateColumns: ColumnDef<Candidate>[] = [
  {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    size: 40,
    // Header acts on every row left after search + the route filter (all
    // pages), so "filter to a route, tick the header" is the old per-route
    // "Select all".
    header: ({ table }) => <SelectAllHeader rows={table.getFilteredRowModel().rows.map((r) => r.original)} />,
    cell: ({ row }) => <SelectCell candidate={row.original} />,
  },
  {
    accessorKey: 'name',
    meta: { label: 'Staff' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
    cell: ({ row }) => (
      <span className="font-medium text-gray-900 dark:text-gray-100">{titleCase(row.original.name)}</span>
    ),
  },
  {
    id: 'staffCode',
    accessorFn: (c) => c.staffCode ?? '',
    meta: { label: 'Staff code' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Staff code" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{row.original.staffCode || '—'}</span>
    ),
  },
  {
    accessorKey: 'email',
    meta: { label: 'Email' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
    cell: ({ row }) => <span className="text-sm text-gray-600 dark:text-gray-300">{row.original.email}</span>,
  },
  {
    // Value is the label so global search matches "12 - Eadappadi"; the route
    // filter compares the stable routeId instead.
    id: 'route',
    accessorFn: routeLabel,
    filterFn: (row, _id, value) => row.original.routeId === value,
    meta: { label: 'Route' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{routeLabel(row.original)}</span>
    ),
  },
];
