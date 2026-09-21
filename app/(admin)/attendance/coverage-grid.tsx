'use client';

import React from 'react';
import Link from 'next/link';
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

export function CoverageGrid({
  routes,
  dates,
  direction,
}: {
  routes: CoverageRouteRow[];
  dates: string[];
  direction: 'onward' | 'return';
}) {
  if (routes.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">No routes to show for this range.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-medium">Route</th>
            {dates.map((d) => (
              <th key={d} className="px-0.5 py-1 text-center font-normal text-muted-foreground">
                {dayOf(d)}
              </th>
            ))}
            <th className="px-2 py-1 text-right font-medium">Days</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.routeId} className={r.roster === 0 ? 'opacity-40' : undefined}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[13rem] truncate bg-background px-2 py-1 text-left font-normal"
                title={`${r.routeNumber ?? ''} ${r.routeName ?? ''}`.trim()}
              >
                <span className="font-medium">{r.routeNumber ?? '—'}</span>{' '}
                <span className="text-muted-foreground">{r.routeName ?? ''}</span>
                {r.roster === 0 && (
                  <span className="ml-1 text-muted-foreground">(no learners allocated)</span>
                )}
              </th>
              {r.cells.map((c) => (
                <td key={c.date} className="p-0">
                  <Link
                    href={`/attendance/${r.routeId}/${c.date}?direction=${direction}`}
                    title={`${r.routeNumber ?? ''} · ${c.date} · ${CELL_LABEL[c.state]} · ${c.human} marked${c.auto > 0 ? ` (+${c.auto} auto)` : ''}`}
                    className={`block h-6 w-6 rounded-sm ${CELL_CLASS[c.state]}`}
                  >
                    <span className="sr-only">
                      {r.routeNumber} {c.date} {CELL_LABEL[c.state]}
                    </span>
                  </Link>
                </td>
              ))}
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-muted-foreground">
                {r.humanDays}/{r.serviceDays}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(CELL_CLASS) as CoverageState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${CELL_CLASS[s]}`} aria-hidden="true" />
            {CELL_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
