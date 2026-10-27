'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { DataTableFilter } from '@/components/ui/data-table';
import { PhoneLink } from '@/components/ui/display-bits';
import { titleCase } from '@/lib/format/display';
import { groupByStop, UNASSIGNED_STOP_KEY, UNASSIGNED_STOP_LABEL } from '@/lib/passengers/group-by-stop';

// One person on a route roster (Learners, Staff and the combined Passengers
// page), normalised so all three share these columns.
export interface RosterRow {
  /** 1-based position in boarding order, as the API sorted it. */
  order: number;
  kind: 'learner' | 'staff';
  name: string;
  register_number?: string | null;
  roll_number?: string | null;
  staff_id?: string | null;
  designation?: string | null;
  email?: string | null;
  mobile: string | null;
  status: string | null;
  stop_id: string | null;
  stop_name: string | null;
  sequence_order: number | null;
  pickup: string | null;
  evening: string | null;
}

/** Which roster the columns are for: one person type, or both together. */
export type RosterMode = 'learner' | 'staff' | 'both';

// Same bucketing as groupByStop: a dead stop keeps its id but loses its name,
// and is shown (and filtered) as "No stop assigned".
export const stopKey = (r: RosterRow) => (r.stop_id && r.stop_name ? r.stop_id : UNASSIGNED_STOP_KEY);
export const hasNoStop = (r: RosterRow) => stopKey(r) === UNASSIGNED_STOP_KEY;

const statusStyle: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  admitted: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  account: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
};
function StatusBadge({ status }: { status: string | null }) {
  const cls = statusStyle[status ?? ''] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status ?? 'unknown'}
    </span>
  );
}

const TYPE_CLS = {
  learner: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  staff: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
};

const dash = <span className="text-gray-400">—</span>;
const text = (v: string | null | undefined) =>
  v ? <span className="tabular-nums text-gray-700 dark:text-gray-300">{v}</span> : dash;
const eq = (row: { getValue: (id: string) => unknown }, id: string, value: string) => row.getValue(id) === value;

export function getRosterColumns(mode: RosterMode): ColumnDef<RosterRow>[] {
  const cols: ColumnDef<RosterRow>[] = [
    {
      accessorKey: 'order',
      meta: { label: '#' },
      size: 56,
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
      cell: ({ row }) => (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
          {row.original.order}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      meta: { label: 'Name' },
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <span className="block min-w-[10rem] whitespace-normal break-words font-medium text-gray-900 dark:text-gray-100">
          {titleCase(row.original.name)}
        </span>
      ),
    },
  ];

  if (mode === 'both') {
    cols.push({
      id: 'type',
      accessorFn: (r) => r.kind,
      meta: { label: 'Type' },
      filterFn: (row, id, value) => eq(row, id, value),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLS[row.original.kind]}`}>
          {row.original.kind === 'learner' ? 'Learner' : 'Staff'}
        </span>
      ),
    });
  }

  if (mode === 'learner') {
    cols.push(
      {
        id: 'register_number',
        accessorFn: (r) => r.register_number ?? '',
        meta: { label: 'Register No' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Register No" />,
        cell: ({ row }) => text(row.original.register_number),
      },
      {
        id: 'roll_number',
        accessorFn: (r) => r.roll_number ?? '',
        meta: { label: 'Roll No' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Roll No" />,
        cell: ({ row }) => text(row.original.roll_number),
      }
    );
  } else if (mode === 'staff') {
    cols.push({
      id: 'staff_id',
      accessorFn: (r) => r.staff_id ?? '',
      meta: { label: 'Staff ID' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff ID" />,
      cell: ({ row }) => text(row.original.staff_id),
    });
  } else {
    cols.push({
      id: 'id_number',
      accessorFn: (r) => (r.kind === 'learner' ? r.register_number : r.staff_id) ?? '',
      meta: { label: 'Register No / Staff ID' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reg. No / Staff ID" />,
      cell: ({ row }) => text(row.original.kind === 'learner' ? row.original.register_number : row.original.staff_id),
    });
  }

  if (mode !== 'learner') {
    cols.push({
      id: 'designation',
      accessorFn: (r) => r.designation ?? '',
      meta: { label: 'Designation' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Designation" />,
      cell: ({ row }) => (
        <span className="block min-w-[8rem] whitespace-normal text-sm text-gray-700 dark:text-gray-300">
          {row.original.designation || dash}
        </span>
      ),
    });
  }

  cols.push(
    {
      id: 'stop',
      // Value is the stop name so global search finds it; the filter and the
      // sort work off the stop key / boarding sequence instead.
      accessorFn: (r) => (hasNoStop(r) ? UNASSIGNED_STOP_LABEL : r.stop_name ?? ''),
      meta: { label: 'Stop' },
      filterFn: (row, _id, value) => stopKey(row.original) === value,
      sortingFn: (a, b) =>
        (a.original.sequence_order ?? Number.MAX_SAFE_INTEGER) - (b.original.sequence_order ?? Number.MAX_SAFE_INTEGER) ||
        a.original.order - b.original.order,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
      cell: ({ row }) =>
        hasNoStop(row.original) ? (
          <span className="text-sm italic text-gray-500">{UNASSIGNED_STOP_LABEL}</span>
        ) : (
          <span className="block min-w-[8rem] whitespace-normal break-words text-sm text-gray-900 dark:text-gray-100">
            {row.original.stop_name}
          </span>
        ),
    },
    {
      accessorKey: 'pickup',
      meta: { label: 'Morning' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Morning" />,
      cell: ({ row }) => text(row.original.pickup),
    },
    {
      accessorKey: 'evening',
      meta: { label: 'Evening' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Evening" />,
      cell: ({ row }) => text(row.original.evening),
    },
    {
      id: 'mobile',
      accessorFn: (r) => r.mobile ?? '',
      meta: { label: 'Mobile' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mobile" />,
      cell: ({ row }) => <PhoneLink phone={row.original.mobile} />,
    }
  );

  if (mode === 'staff') {
    cols.push({
      id: 'email',
      accessorFn: (r) => r.email ?? '',
      meta: { label: 'Email', hideInCard: true },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => text(row.original.email),
    });
  }

  cols.push({
    id: 'status',
    accessorFn: (r) => r.status ?? 'unknown',
    meta: { label: 'Status' },
    filterFn: (row, id, value) => eq(row, id, value),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  });

  return cols;
}

/** Stop (in boarding order), Status and — for the combined roster — Type filters. */
export function getRosterFilters(rows: RosterRow[], mode: RosterMode): DataTableFilter[] {
  const stops = groupByStop(rows).map((g) => ({ label: g.stop_name, value: g.key }));
  const statuses = [...new Set(rows.map((r) => r.status ?? 'unknown'))]
    .sort()
    .map((s) => ({ label: titleCase(s), value: s }));
  const filters: DataTableFilter[] = [
    { columnId: 'stop', title: 'Stop', options: stops },
    { columnId: 'status', title: 'Status', options: statuses },
  ];
  if (mode === 'both') {
    filters.unshift({
      columnId: 'type',
      title: 'Type',
      options: [
        { label: 'Learner', value: 'learner' },
        { label: 'Staff', value: 'staff' },
      ],
    });
  }
  return filters;
}

/** Stops with at least one rider — the same buckets the Stop filter lists. */
export const countStops = (rows: RosterRow[]) => groupByStop(rows).length;
