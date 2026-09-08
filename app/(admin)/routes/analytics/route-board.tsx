'use client';

// The operations board — the dashboard's hero.
//
// A transport officer's first question is never "how many routes exist"; it is
// "which bus has a problem this morning, and who is driving it". So the main
// object on this page is the route itself, one row each, carrying the full
// operating detail: timings, stops, driver, bus, load and turnout.
//
// Built as a real <table> rather than a div grid: this is genuinely tabular
// data, so semantic markup gives screen readers row/column context for free
// and lets the header cells carry the sort controls.
//
// Triage rules live in lib/dashboard/route-state.ts so they stay testable;
// this file only decides how each state looks. Colour encodes operational
// state and nothing else.

import React, { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, Bus, CheckCircle2, CircleDot, MapPin, Search, UserPlus, UserX, X,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { card, num } from '../../_viz/kit';
import { formatTime } from '@/lib/dashboard/format';
import {
  countFlagged, decorateRoutes, filterRoutes, loadOf, sortRoutes, turnoutOf,
  type DecoratedRoute, type RouteSortKey, type RouteStateKind,
} from '@/lib/dashboard/route-state';
import type { DashboardRouteRow } from '@/lib/dashboard/types';

const SORTS: Array<{ key: RouteSortKey; label: string }> = [
  { key: 'attention', label: 'Issues first' },
  { key: 'busiest', label: 'Busiest' },
  { key: 'number', label: 'Route no.' },
];

const TONE: Record<RouteStateKind, string> = {
  'no-bus': 'var(--viz-critical)',
  'none-boarded': 'var(--viz-critical)',
  'no-driver': 'var(--viz-serious)',
  'walk-ups': 'var(--viz-warning)',
  quiet: 'var(--viz-neutral)',
  ok: 'var(--viz-accent)',
};

const STATE_ICON: Record<RouteStateKind, typeof AlertCircle> = {
  'no-bus': Bus,
  'none-boarded': AlertCircle,
  'no-driver': UserX,
  'walk-ups': UserPlus,
  quiet: CircleDot,
  ok: CheckCircle2,
};

export function RouteBoard({ routes }: { routes: DashboardRouteRow[] }) {
  const [sort, setSort] = useState<RouteSortKey>('attention');
  const [query, setQuery] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);

  // Keeps typing responsive: the 25-row re-filter runs at a lower priority
  // than the keystroke that caused it.
  const deferredQuery = useDeferredValue(query);

  const decorated = useMemo(() => decorateRoutes(routes), [routes]);
  const flagged = useMemo(() => countFlagged(decorated), [decorated]);
  const rows = useMemo(
    () => sortRoutes(filterRoutes(decorated, { query: deferredQuery, issuesOnly }), sort),
    [decorated, deferredQuery, issuesOnly, sort]
  );

  if (routes.length === 0) {
    return (
      <section className={`${card} p-5`}>
        <h2 className="text-base font-semibold text-foreground">Routes today</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          No active routes yet. Add a route to start tracking daily runs.
        </p>
        <Link
          href="/routes/new"
          className="mt-4 inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Add a route
        </Link>
      </section>
    );
  }

  return (
    <section className={`${card} overflow-hidden`}>
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Routes today</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {flagged > 0
                ? `${flagged} of ${routes.length} need a look`
                : `All ${routes.length} routes running normally`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Route, place, bus or driver"
                aria-label="Filter routes"
                className="h-8 w-56 rounded-lg border border-border bg-background pl-8 pr-7 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear filter"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIssuesOnly((v) => !v)}
              aria-pressed={issuesOnly}
              className={`h-8 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                issuesOnly
                  ? 'border-transparent bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              Only issues
            </button>

            <div className="flex h-8 rounded-lg border border-border p-0.5" role="group" aria-label="Sort routes">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={sort === s.key}
                  onClick={() => setSort(s.key)}
                  className={`cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    sort === s.key
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          No routes match that filter. Clear it to see all {routes.length}.
        </p>
      ) : (
        // Table already provides its own overflow-auto wrapper, so a wide
        // operating table scrolls horizontally on a phone rather than wrapping
        // into something unreadable.
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th className="w-14">No.</Th>
              <Th className="min-w-[200px]">Route</Th>
              <Th className="min-w-[150px]">Driver</Th>
              <Th className="min-w-[140px]">Timing</Th>
              <Th className="min-w-[140px]">Bus</Th>
              <Th className="text-right">Booked</Th>
              <Th className="text-right">Boarded</Th>
              <Th className="min-w-[150px]">Turnout</Th>
              <Th className="min-w-[160px]">Status</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <RouteRow key={row.route.id} {...row} />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/**
 * Column header, with two defaults from the shared TableHead undone.
 *
 * That component hardcodes `uppercase` and `text-gray-500`. All-caps labels
 * are a decorative tic that costs legibility on a dense board, and a literal
 * grey ignores the theme, so it stays mid-grey on a dark background instead of
 * following `--muted-foreground`. Overridden here rather than in the shared
 * component, which ~20 other admin pages depend on looking as it does.
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

function RouteRow({ route: r, state }: DecoratedRoute) {
  const turnout = turnoutOf(r);
  const load = loadOf(r);
  const tone = TONE[state.kind];
  const Icon = STATE_ICON[state.kind];
  // Turnout can exceed 100% on walk-up routes; the bar fills and the note
  // carries the overflow rather than the number being clamped to a tidy lie.
  const fill = turnout === null ? 0 : Math.min(turnout, 100);

  // The row highlights on hover to keep the eye on one route across nine
  // columns, but it is NOT itself clickable — only the route number and name
  // are links. cursor-pointer on the whole row would promise a click target
  // that seven of the cells do not honour.
  return (
    <TableRow className="transition-colors duration-200 hover:bg-muted/60">
      {/* The route number anchors the row: officers know buses by number. */}
      <TableCell className="align-top">
        <Link
          href={`/routes/${r.id}`}
          className="text-lg font-semibold leading-none tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {r.routeNumber}
        </Link>
      </TableCell>

      <TableCell className="align-top">
        <Link href={`/routes/${r.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block truncate font-medium text-foreground">{r.routeName}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">
              {r.startLocation ?? '—'} to {r.endLocation ?? '—'}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {num(r.stops)} {r.stops === 1 ? 'stop' : 'stops'}
          </span>
        </Link>
      </TableCell>

      <TableCell className="align-top">
        {r.driverName ? (
          <span className="text-sm text-foreground">{r.driverName}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: TONE['no-driver'] }}>
            <UserX className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Unassigned
          </span>
        )}
      </TableCell>

      <TableCell className="align-top">
        <span className="block text-sm tabular-nums text-foreground">
          {formatTime(r.departureTime)} – {formatTime(r.arrivalTime)}
        </span>
        {r.duration && <span className="mt-0.5 block text-xs text-muted-foreground">{r.duration}</span>}
      </TableCell>

      <TableCell className="align-top">
        {r.vehicleRegistration ? (
          <>
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <Bus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{r.vehicleRegistration}</span>
            </span>
            {load !== null && (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {load}% of {r.capacity} seats
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: TONE['no-bus'] }}>
            <Bus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            No bus
          </span>
        )}
      </TableCell>

      <TableCell className="text-right align-top text-sm tabular-nums text-foreground">
        {num(r.booked)}
      </TableCell>
      <TableCell className="text-right align-top text-sm tabular-nums text-foreground">
        {num(r.boarded)}
      </TableCell>

      <TableCell className="align-top">
        <span className="flex items-center gap-2">
          <span
            className="h-1.5 flex-1 overflow-hidden rounded-full"
            style={{ background: 'color-mix(in oklab, var(--viz-neutral) 22%, transparent)' }}
            role="meter"
            aria-valuenow={turnout ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Turnout on route ${r.routeNumber}`}
          >
            {/* motion-reduce disables the width animation for anyone who has
                asked the OS for reduced motion. */}
            <span
              className="block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${fill}%`, background: tone }}
            />
          </span>
          <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {turnout === null ? '—' : `${turnout}%`}
          </span>
        </span>
      </TableCell>

      <TableCell className="align-top">
        {/* Icon plus text, never colour alone: colour is not the only carrier
            of the state, so it survives colour-blindness and greyscale. */}
        <span className="flex items-center gap-1.5 text-xs" style={{ color: tone }}>
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{state.note || 'Running normally'}</span>
        </span>
        {r.tripStatus && (
          <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
            Trip {r.tripStatus}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
