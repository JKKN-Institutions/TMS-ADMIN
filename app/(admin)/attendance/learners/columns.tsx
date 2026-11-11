'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { RIDER_KIND_LABEL } from '@/lib/attendance/rider-kind';
import type { LearnerRegisterRow } from '@/app/api/admin/attendance/learners/route';

export type { LearnerRegisterRow };

// Solid pills, as on the Daily Report. Each shade keeps white text readable.
const KIND_TONE: Record<LearnerRegisterRow['riderKind'], string> = {
  transport: 'bg-green-600 text-white',
  hosteller: 'bg-violet-600 text-white',
  non_transport: 'bg-orange-600 text-white',
};

// The avatar takes its colour from the rider type, so the three kinds can be
// told apart down the first column without reading the pill.
const AVATAR_TONE: Record<LearnerRegisterRow['riderKind'], string> = {
  transport: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  hosteller: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  non_transport: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** A figure column. A zero is greyed so the non-zero values stand out. */
const num = (
  title: string,
  key: keyof LearnerRegisterRow,
  id: string,
  tone = 'text-foreground',
): ColumnDef<LearnerRegisterRow> => ({
  id,
  accessorFn: (r) => r[key] as number,
  enableGlobalFilter: false,
  meta: { label: title },
  header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
  cell: ({ getValue }) => {
    const v = getValue<number>();
    return <span className={`tabular-nums ${v > 0 ? tone : 'text-muted-foreground'}`}>{v}</span>;
  },
});

export function getRegisterColumns(month: string): ColumnDef<LearnerRegisterRow>[] {
  return [
    {
      id: 'name',
      accessorFn: (r) => `${r.name} ${r.rollNumber ?? ''}`,
      enableHiding: false,
      meta: { label: 'Learner' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Link
            href={`/attendance/learners/${r.learnerId}?month=${month}`}
            title="Open this learner's attendance report"
            className="group/learner flex min-w-0 max-w-[20rem] items-center gap-3"
          >
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_TONE[r.riderKind]}`}
            >
              {initials(r.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground group-hover/learner:underline">{r.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {r.rollNumber ?? '—'}
                {r.institution ? ` · ${r.institution}` : ''}
              </span>
            </span>
          </Link>
        );
      },
    },
    {
      id: 'rider',
      accessorFn: (r) => r.riderKind,
      enableGlobalFilter: false,
      filterFn: (row, id, value: string[] | string) =>
        Array.isArray(value) ? value.includes(row.getValue(id)) : row.getValue(id) === value,
      meta: { label: 'Rider' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rider" />,
      cell: ({ row }) => (
        <span
          className={`inline-flex min-w-[5.5rem] justify-center rounded-full px-3 py-1 text-xs font-semibold ${KIND_TONE[row.original.riderKind]}`}
        >
          {RIDER_KIND_LABEL[row.original.riderKind]}
        </span>
      ),
    },
    {
      id: 'route',
      accessorFn: (r) => r.routeId ?? '',
      enableGlobalFilter: false,
      filterFn: (row, id, value: string[] | string) =>
        Array.isArray(value) ? value.includes(row.getValue(id)) : row.getValue(id) === value,
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      cell: ({ row }) => (
        <span className="block max-w-[14rem] truncate text-muted-foreground" title={row.original.routeLabel ?? undefined}>
          {row.original.routeLabel ?? '—'}
        </span>
      ),
    },
    num('Days travelled', 'daysTravelled', 'days', 'font-semibold text-green-700 dark:text-green-400'),
    num('Morning', 'onwardPresent', 'onward'),
    num('Evening', 'returnPresent', 'return'),
    num('Both trips', 'bothTripDays', 'both'),
    num('Absent', 'staffAbsent', 'absent', 'font-semibold text-red-600 dark:text-red-400'),
    num('Auto-absent', 'autoAbsent', 'auto', 'font-medium text-orange-700 dark:text-orange-300'),
    num('No booking', 'withoutBooking', 'walkup'),
    {
      id: 'last',
      accessorFn: (r) => r.lastTravel ?? '',
      enableGlobalFilter: false,
      meta: { label: 'Last travel' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last travel" />,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.lastTravel ?? '—'}</span>,
    },
  ];
}
