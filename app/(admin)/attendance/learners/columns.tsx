'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { RIDER_KIND_LABEL } from '@/lib/attendance/rider-kind';
import type { LearnerRegisterRow } from '@/app/api/admin/attendance/learners/route';

export type { LearnerRegisterRow };

const KIND_TONE: Record<LearnerRegisterRow['riderKind'], string> = {
  transport: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  hosteller: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  non_transport: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
};

const num = (title: string, key: keyof LearnerRegisterRow, id: string): ColumnDef<LearnerRegisterRow> => ({
  id,
  accessorFn: (r) => r[key] as number,
  meta: { label: title },
  header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
  cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span>,
});

export function getRegisterColumns(month: string): ColumnDef<LearnerRegisterRow>[] {
  return [
    {
      id: 'name',
      accessorFn: (r) => `${r.name} ${r.rollNumber ?? ''}`,
      meta: { label: 'Learner' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => (
        <Link
          href={`/attendance/learners/${row.original.learnerId}?month=${month}`}
          title="Open this learner's attendance report"
          className="block min-w-0 hover:underline"
        >
          <span className="block truncate font-medium text-foreground">{row.original.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.original.rollNumber ?? '—'}
            {row.original.institution ? ` · ${row.original.institution}` : ''}
          </span>
        </Link>
      ),
    },
    {
      id: 'rider',
      accessorFn: (r) => r.riderKind,
      filterFn: (row, id, value: string[] | string) =>
        Array.isArray(value) ? value.includes(row.getValue(id)) : row.getValue(id) === value,
      meta: { label: 'Rider' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rider" />,
      cell: ({ row }) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${KIND_TONE[row.original.riderKind]}`}>
          {RIDER_KIND_LABEL[row.original.riderKind]}
        </span>
      ),
    },
    {
      id: 'route',
      accessorFn: (r) => r.routeId ?? '',
      filterFn: (row, id, value: string[] | string) =>
        Array.isArray(value) ? value.includes(row.getValue(id)) : row.getValue(id) === value,
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.routeLabel ?? '—'}</span>,
    },
    num('Days travelled', 'daysTravelled', 'days'),
    num('Morning', 'onwardPresent', 'onward'),
    num('Evening', 'returnPresent', 'return'),
    num('Both trips', 'bothTripDays', 'both'),
    num('Absent', 'staffAbsent', 'absent'),
    num('Auto-absent', 'autoAbsent', 'auto'),
    num('No booking', 'withoutBooking', 'walkup'),
    {
      id: 'last',
      accessorFn: (r) => r.lastTravel ?? '',
      meta: { label: 'Last travel' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last travel" />,
      cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.original.lastTravel ?? '—'}</span>,
    },
  ];
}
