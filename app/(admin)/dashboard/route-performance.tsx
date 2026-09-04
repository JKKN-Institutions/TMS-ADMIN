'use client';

// Compact route performance table for the dashboard: route, capacity,
// occupancy.
//
// This is NOT the nine-column operations board — that lives at Routes >
// Analytics, where you go to dig. Here it is a scannable top-N so the dashboard
// can answer "which buses are full and which are running empty" without
// becoming a second copy of the routes module.

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { num, panel } from '../_viz/kit';
import { routeOccupancy } from '@/lib/dashboard/occupancy';
import type { DashboardRouteRow } from '@/lib/dashboard/types';

const LIMIT = 8;

export function RoutePerformance({ routes }: { routes: DashboardRouteRow[] }) {
  const rows = routeOccupancy(routes).slice(0, LIMIT);
  // Routes with no resolvable bus have no seat count, so they cannot appear in
  // an occupancy table. Say how many are missing rather than silently dropping
  // them — a table that quietly shows 19 of 25 routes is a small lie.
  const withoutBus = routes.filter((r) => !r.vehicleRegistration).length;

  return (
    <section className={`${panel} overflow-hidden`}>
      <header
        className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5"
        style={{ borderColor: 'var(--viz-panel-border)' }}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Route performance</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rows.length > 0
              ? `Fullest ${rows.length} of ${routes.length} routes`
              : 'No route has an assigned bus'}
            {withoutBus > 0 && ` · ${withoutBus} without a bus`}
          </p>
        </div>
        <Link
          href="/routes/analytics"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          All routes
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Assign a bus to a route to start measuring occupancy.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th className="w-14">Route</Th>
              <Th className="min-w-[160px]">Destination</Th>
              <Th className="text-right">Booked</Th>
              <Th className="text-right">Capacity</Th>
              <Th className="min-w-[130px]">Occupancy</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const over = r.occupancy > 100;
              const colour = over
                ? 'var(--viz-critical)'
                : r.occupancy >= 70
                  ? 'var(--viz-good)'
                  : r.occupancy >= 50
                    ? 'var(--viz-warning)'
                    : 'var(--viz-serious)';
              return (
                <TableRow key={r.id} className="transition-colors duration-200 hover:bg-muted/60">
                  <TableCell>
                    <Link
                      href={`/routes/${r.id}`}
                      className="font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {r.routeNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {r.routeName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {num(r.booked)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {num(r.capacity)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 flex-1 overflow-hidden rounded-full"
                        style={{ background: 'color-mix(in oklab, var(--viz-neutral) 20%, transparent)' }}
                        role="meter"
                        aria-valuenow={r.occupancy}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Route ${r.routeNumber} occupancy`}
                      >
                        {/* Bar is capped for drawing; the figure beside it is
                            not — a bus at 114% of seats is genuinely overloaded. */}
                        <span
                          className="block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                          style={{ width: `${Math.min(r.occupancy, 100)}%`, background: colour }}
                        />
                      </span>
                      <span
                        className="w-11 shrink-0 text-right text-xs font-medium tabular-nums"
                        style={{ color: colour }}
                      >
                        {r.occupancy}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/**
 * Column header with two shared-component defaults undone.
 *
 * TableHead hardcodes `uppercase` and `text-gray-500`. All-caps labels cost
 * legibility on a dense table, and a literal grey ignores the theme so it stays
 * mid-grey on a dark background instead of following --muted-foreground.
 */
function Th({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <TableHead
      scope="col"
      className={`normal-case tracking-normal text-muted-foreground ${className ?? ''}`}
    >
      {children}
    </TableHead>
  );
}
