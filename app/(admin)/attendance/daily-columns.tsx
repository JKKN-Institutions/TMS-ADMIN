'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Bus } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { DAILY_STATUS_LABEL, type DailyRouteRow, type DailyStatus } from '@/lib/attendance/daily-report';

// Solid pills, as in the reference dashboard. Each shade keeps white text
// readable (amber-500 would not), and solid fills need no dark-mode pair.
const STATUS_TONE: Record<DailyStatus, string> = {
  marked: 'bg-green-600 text-white',
  low: 'bg-amber-700 text-white',
  not_marked: 'bg-red-600 text-white',
  no_service: 'bg-slate-500 text-white',
};

const DASH = <span className="text-muted-foreground">—</span>;

/** A scan-time column: when the first / last card was scanned on that bus. */
const scanTime = (
  id: string,
  title: string,
  value: (r: DailyRouteRow) => string | null,
): ColumnDef<DailyRouteRow> => ({
  id,
  accessorFn: (r) => value(r) ?? '',
  enableGlobalFilter: false,
  meta: { label: title },
  header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
  cell: ({ row }) => {
    const v = value(row.original);
    return v ? <span className="tabular-nums text-foreground">{v}</span> : DASH;
  },
});

const isMarked = (r: DailyRouteRow) => r.status === 'marked' || r.status === 'low';

/** A count column. Buses nobody scanned show a dash, never a false zero. */
const count = (
  id: string,
  title: string,
  value: (r: DailyRouteRow) => number,
  opts: { always?: boolean; tone?: string } = {},
): ColumnDef<DailyRouteRow> => ({
  id,
  accessorFn: value,
  enableGlobalFilter: false,
  meta: { label: title },
  header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
  cell: ({ row }) => {
    const r = row.original;
    if (!opts.always && !isMarked(r)) return <span className="text-muted-foreground">—</span>;
    const v = value(r);
    return <span className={`tabular-nums ${v > 0 ? opts.tone ?? '' : 'text-muted-foreground'}`}>{v}</span>;
  },
});

export function getDailyColumns(date: string, direction: 'onward' | 'return'): ColumnDef<DailyRouteRow>[] {
  return [
    {
      id: 'route',
      // Number and name together, so the search box finds either.
      accessorFn: (r) => `${r.routeNumber ?? ''} ${r.routeName ?? ''}`.trim(),
      sortingFn: (x, y) =>
        (x.original.routeNumber ?? '').localeCompare(y.original.routeNumber ?? '', undefined, { numeric: true }),
      enableHiding: false,
      meta: { label: 'Route No' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route No" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Link
            href={`/attendance/${r.routeId}/${date}?direction=${direction}`}
            className="group/route inline-flex items-center gap-2.5"
            title="Open the learner list for this bus and day"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300">
              <Bus className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-semibold tabular-nums text-foreground group-hover/route:underline">
              {r.routeNumber ?? '—'}
            </span>
          </Link>
        );
      },
    },
    {
      id: 'routeName',
      accessorFn: (r) => r.routeName ?? '',
      enableGlobalFilter: false,
      meta: { label: 'Route name' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route name" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="min-w-0 max-w-[15rem]">
            <span className="block truncate text-foreground" title={r.routeName ?? undefined}>{r.routeName ?? '—'}</span>
            {!r.hasBus && <span className="block text-xs text-amber-700 dark:text-amber-300">No bus assigned</span>}
          </div>
        );
      },
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      enableGlobalFilter: false,
      filterFn: (row, id, value: string[] | string) =>
        Array.isArray(value) ? value.includes(row.getValue(id)) : row.getValue(id) === value,
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div>
            <span className={`inline-flex min-w-[6.5rem] justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[r.status]}`}>
              {DAILY_STATUS_LABEL[r.status]}
            </span>
            {r.status === 'not_marked' && r.unmarkedDays > 1 && (
              <span className="mt-0.5 block whitespace-nowrap text-xs text-muted-foreground">
                {r.unmarkedDays} days in a row
              </span>
            )}
          </div>
        );
      },
    },
    count('learners', 'Total learners', (r) => r.roster, { always: true }),
    count('marked', 'Marked', (r) => r.marked),
    count('present', 'Present', (r) => r.present, { tone: 'font-medium text-green-700 dark:text-green-400' }),
    count('absent', 'Absent', (r) => r.absent, { tone: 'font-medium text-red-600 dark:text-red-400' }),
    {
      ...count('notMarked', 'Not marked', (r) => r.notMarked, { always: true, tone: 'font-medium text-amber-700 dark:text-amber-300' }),
    },
    {
      id: 'presentPct',
      accessorFn: (r) => r.presentPct ?? -1,
      enableGlobalFilter: false,
      meta: { label: 'Present %' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Present %" />,
      cell: ({ row }) => {
        const p = row.original.presentPct;
        if (p === null) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="mx-auto w-24">
            <span className="text-sm tabular-nums">{p}%</span>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full rounded-full ${row.original.status === 'low' ? 'bg-amber-500' : 'bg-green-600'}`}
                style={{ width: `${Math.min(p, 100)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    scanTime('firstScan', 'First scan', (r) => r.firstScan),
    scanTime('lastScan', 'Last scan', (r) => r.lastScan),
    {
      id: 'scannedBy',
      accessorFn: (r) => r.markers,
      enableGlobalFilter: false,
      meta: { label: 'Scanned by' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scanned by" />,
      cell: ({ row }) => {
        const r = row.original;
        if (r.status === 'no_service') return <span className="text-muted-foreground">—</span>;
        if (r.incharges === 0 && r.markers === 0) {
          return <span className="whitespace-nowrap text-xs font-medium text-red-600 dark:text-red-400">No in-charge</span>;
        }
        return (
          <div className="whitespace-nowrap text-sm">
            <span className="tabular-nums">{r.markers}</span>
            <span className="text-muted-foreground"> of {r.incharges} in-charges</span>
          </div>
        );
      },
    },
  ];
}
