'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { CoverageRouteRow, CoverageState } from '@/lib/attendance/coverage';

/**
 * Cell colours. Deliberately NOT a red/green pair: 'auto_only' must read as a
 * warning rather than a success, because an auto-closed trip means nobody was
 * marking. Every colour has a dark-mode counterpart -- Tailwind v4 in this
 * project does not derive tints for coloured backgrounds automatically.
 */
const CELL_CLASS: Record<CoverageState, string> = {
  marked: 'bg-emerald-500/80 dark:bg-emerald-500/70',
  partial: 'bg-amber-400/80 dark:bg-amber-400/70',
  auto_only: 'bg-sky-400/70 dark:bg-sky-500/60',
  not_marked: 'bg-red-500/80 dark:bg-red-500/70',
  holiday: 'bg-muted',
};

const CELL_LABEL: Record<CoverageState, string> = {
  marked: 'Marked',
  partial: 'Partly marked',
  auto_only: 'Auto-closed, nobody marked',
  not_marked: 'Not marked',
  holiday: 'No service',
};

/** 'YYYY-MM-DD' -> '18' for the column header. */
const dayOf = (d: string) => d.slice(8, 10);
/** 'YYYY-MM-DD' -> 'M' (weekday initial) under the day number. */
const weekdayOf = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'narrow' });
const longDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {(Object.keys(CELL_CLASS) as CoverageState[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] ${CELL_CLASS[s]}`} aria-hidden="true">
            {s === 'holiday' ? '–' : ''}
          </span>
          {CELL_LABEL[s]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 rounded-sm bg-emerald-500/80 opacity-40" aria-hidden="true" />
        Faded row: no learners on that route
      </span>
      <span>Click a square to open that day.</span>
    </div>
  );
}

/** A route with no learners renders faded. Per cell: the table owns the <tr>. */
const fade = (r: CoverageRouteRow) => (r.roster === 0 ? 'opacity-40' : '');

export function CoverageGrid({
  routes,
  dates,
  direction,
}: {
  routes: CoverageRouteRow[];
  dates: string[];
  direction: 'onward' | 'return';
}) {
  const columns = useMemo<ColumnDef<CoverageRouteRow>[]>(
    () => [
      {
        id: 'route',
        accessorFn: (r) => `${r.routeNumber ?? ''} ${r.routeName ?? ''}`.trim(),
        enableHiding: false,
        meta: { label: 'Route' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div
              className={`max-w-[13rem] truncate text-xs ${fade(r)}`}
              title={`${r.routeNumber ?? ''} ${r.routeName ?? ''}`.trim()}
            >
              <span className="font-medium">{r.routeNumber ?? '—'}</span>{' '}
              <span className="text-muted-foreground">{r.routeName ?? ''}</span>
              {r.roster === 0 && <span className="ml-1 text-muted-foreground">(no learners allocated)</span>}
            </div>
          );
        },
      },
      ...dates.map<ColumnDef<CoverageRouteRow>>((d) => ({
        id: d,
        enableSorting: false,
        // 31 dates would bury the Columns menu.
        enableHiding: false,
        enableGlobalFilter: false,
        meta: { label: longDate(d) },
        header: () => (
          // Negative margins hand back the header cell's px-3 so a month fits.
          <div className="-mx-2 text-center font-normal normal-case leading-tight tracking-normal" title={longDate(d)}>
            {dayOf(d)}
            <span className="block text-[10px] opacity-70">{weekdayOf(d)}</span>
          </div>
        ),
        cell: ({ row, table }) => {
          const r = row.original;
          const c = r.cells.find((x) => x.date === d);
          if (!c) return null;
          // The first two rows of the page open their hover card downward, or it
          // would be clipped by the table's scroll box. Position on the CURRENT
          // page, not row.index (the row's place in the unsorted data).
          const nearTop = table.getRowModel().rows.findIndex((x) => x.id === row.id) < 2;
          return (
            // Negative margins hand back the cell's px-3/py-3: the squares stay
            // 24px and the grid stays about as tight as the old border-spacing table.
            <div className={`-mx-2 -my-2 flex justify-center ${fade(r)}`}>
              {/* CSS hover card instead of a Radix tooltip per cell: a month
                  of 35 routes is ~1,000 cells, too many tooltip roots. */}
              <Link
                href={`/attendance/${r.routeId}/${c.date}?direction=${direction}`}
                className={`group/cell relative flex h-6 w-6 items-center justify-center rounded-sm text-[10px] text-gray-500 ${CELL_CLASS[c.state]}`}
              >
                {c.state === 'holiday' ? '–' : null}
                <span className={`pointer-events-none absolute left-1/2 z-20 hidden ${nearTop ? 'top-full mt-1' : 'bottom-full mb-1'} w-max max-w-[14rem] -translate-x-1/2 whitespace-normal rounded-md bg-gray-900 px-2 py-1.5 text-left text-[11px] leading-snug text-white shadow-lg group-hover/cell:block group-focus-visible/cell:block`}>
                  <span className="block font-semibold">
                    Route {r.routeNumber ?? '—'} · {longDate(c.date)}
                  </span>
                  <span className="block">{CELL_LABEL[c.state]}</span>
                  {c.state !== 'holiday' && (
                    <span className="block text-gray-300">
                      {c.human} marked by staff{c.auto > 0 ? ` · ${c.auto} auto-absent` : ''}
                      {r.roster ? ` · ${r.roster} on roster` : ''}
                    </span>
                  )}
                </span>
                <span className="sr-only">
                  {r.routeNumber} {c.date} {CELL_LABEL[c.state]}
                </span>
              </Link>
            </div>
          );
        },
      })),
      {
        id: 'days',
        accessorFn: (r) => r.humanDays,
        enableGlobalFilter: false,
        meta: { label: 'Days' },
        header: ({ column }) => (
          <div className="flex justify-end">
            <DataTableColumnHeader column={column} title="Days" />
          </div>
        ),
        cell: ({ row }) => (
          <div className={`text-right text-xs tabular-nums text-muted-foreground ${fade(row.original)}`}>
            {row.original.humanDays}/{row.original.serviceDays}
          </div>
        ),
      },
    ],
    [dates, direction],
  );

  if (routes.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">No routes to show for this range.</p>;
  }

  return (
    <div>
      <Legend />
      <DataTable
        columns={columns}
        data={routes}
        getRowId={(r) => r.routeId}
        entityName="routes"
        searchPlaceholder="Search route…"
        // A matrix makes no sense as cards; it scrolls sideways instead, with
        // the route column pinned.
        mobileCards={false}
      />
    </div>
  );
}
