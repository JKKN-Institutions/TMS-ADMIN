'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { MARKING_LABEL, type MarkingCell, type MarkingRow, type MarkingStatus } from '@/lib/attendance/incharge-marking';

/** One in-charge on the chosen day. */
export type DayRow = MarkingRow & { cell: MarkingCell };

// Solid pills, as on the Daily report: colour + word, never colour alone.
export const STATUS_PILL: Record<MarkingStatus, string> = {
  marked: 'bg-green-600 text-white',
  others: 'bg-amber-500 text-white',
  missed: 'bg-red-600 text-white',
  leave: 'bg-sky-600 text-white',
  pending: 'bg-gray-200 text-gray-700',
  off: 'bg-gray-100 text-gray-500',
  na: 'bg-gray-100 text-gray-400',
};

export function StatusPill({ status }: { status: MarkingStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[status]}`}>
      {MARKING_LABEL[status]}
    </span>
  );
}

const share = (r: DayRow) => (r.cell.bus > 0 ? Math.round((r.cell.n / r.cell.bus) * 100) : null);

export function getInchargeColumns(date: string, direction: 'onward' | 'return'): ColumnDef<DayRow>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="In-charge" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      id: 'bus',
      accessorFn: (r) => `${r.routeNumber ?? ''} ${r.routeName ?? ''}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      sortingFn: (a, b) =>
        String(a.original.routeNumber ?? '').localeCompare(String(b.original.routeNumber ?? ''), undefined, { numeric: true }),
      cell: ({ row }) => (
        <Link
          href={`/attendance/${row.original.routeId}/${date}?direction=${direction}`}
          className="inline-flex items-center gap-2 hover:underline"
          title="Open this bus's learners for the day"
        >
          <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-green-100 px-1.5 text-xs font-bold text-green-800">
            {row.original.routeNumber ?? '—'}
          </span>
          <span className="truncate text-gray-600 dark:text-gray-300">{row.original.routeName ?? ''}</span>
        </Link>
      ),
    },
    {
      id: 'status',
      accessorFn: (r) => r.cell.s,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusPill status={row.original.cell.s} />,
    },
    {
      id: 'scanned',
      accessorFn: (r) => r.cell.n,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scanned" />,
      cell: ({ row }) => <span className="font-semibold tabular-nums">{row.original.cell.n || '—'}</span>,
    },
    {
      id: 'busTotal',
      accessorFn: (r) => r.cell.bus,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus total" />,
      cell: ({ row }) => <span className="tabular-nums text-gray-600">{row.original.cell.bus || '—'}</span>,
    },
    {
      id: 'share',
      accessorFn: (r) => share(r) ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Their share" />,
      cell: ({ row }) => {
        const p = share(row.original);
        return p === null ? <span className="text-gray-400">—</span> : <span className="tabular-nums">{p}%</span>;
      },
    },
    {
      id: 'first',
      accessorFn: (r) => r.cell.first ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="First scan" />,
      cell: ({ row }) => <span className="tabular-nums text-gray-600">{row.original.cell.first ?? '—'}</span>,
    },
    {
      id: 'last',
      accessorFn: (r) => r.cell.last ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last scan" />,
      cell: ({ row }) => <span className="tabular-nums text-gray-600">{row.original.cell.last ?? '—'}</span>,
    },
    {
      id: 'month',
      accessorFn: (r) => r.markedPct ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="This month" />,
      cell: ({ row }) => {
        const r = row.original;
        if (r.markedPct === null) return <span className="text-gray-400">—</span>;
        const tone = r.markedPct >= 75 ? 'text-green-700' : r.markedPct >= 50 ? 'text-amber-700' : 'text-red-700';
        return (
          <span className="whitespace-nowrap tabular-nums" title={`Scanned on ${r.markedDays} of ${r.dutyDays} working days`}>
            <span className={`font-semibold ${tone}`}>{r.markedPct}%</span>
            <span className="text-xs text-muted-foreground"> · {r.markedDays}/{r.dutyDays} days</span>
          </span>
        );
      },
    },
  ];
}
