'use client';

// The operations board — the dashboard's hero.
//
// A transport officer's first question is never "how many routes exist"; it is
// "which bus has a problem this morning, and who is driving it". So the main
// object on this page is the route itself, one row each, carrying the full
// operating detail: timings, stops, driver, bus, load and turnout.
//
// Rendered on the shared DataTable engine: this is genuinely tabular data, so
// a real <table> gives screen readers row/column context, the headers sort,
// and below 900px each route becomes a card instead of a sideways scroll.
// The board keeps its own search / "Only issues" / sort controls because they
// run the triage rules below, which the engine's generic search can't.
//
// Triage rules live in lib/dashboard/route-state.ts so they stay testable;
// this file only decides how each state looks. Colour encodes operational
// state and nothing else.

import React, { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle, Bus, CheckCircle2, CircleDot, MapPin, Search, UserPlus, UserX, X,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
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

      <div className="p-4">
        {/* Keyed on the sort control: a header sort lives inside the table, so
            without a remount picking "Busiest" after sorting by Driver would
            change the data underneath while the header sort still won. */}
        <DataTable
          key={sort}
          columns={ROUTE_COLUMNS}
          data={rows}
          compact
          pageSize={100}
          getRowId={(row) => row.route.id}
          emptyMessage={`No routes match that filter. Clear it to see all ${routes.length}.`}
        />
      </div>
    </section>
  );
}

/**
 * Header with two defaults from the shared TableHead undone.
 *
 * That component hardcodes `uppercase` and `text-gray-500`. All-caps labels
 * are a decorative tic that costs legibility on a dense board, and a literal
 * grey ignores the theme, so it stays mid-grey on a dark background instead of
 * following `--muted-foreground`. Overridden here rather than in the shared
 * component, which ~20 other admin pages depend on looking as it does.
 */
const headCls = 'normal-case tracking-normal text-muted-foreground';

// The rows arrive already ordered by the sort control (DataTable has no
// default-sort prop); a header click re-sorts within that.
//
// No row is itself clickable — only the route number and name are links.
// cursor-pointer on the whole row would promise a click target that seven of
// the cells do not honour.
const ROUTE_COLUMNS: ColumnDef<DecoratedRoute>[] = [
  {
    // The route number anchors the row: officers know buses by number.
    id: 'number',
    accessorFn: ({ route }) => route.routeNumber,
    sortingFn: (a, b) =>
      a.original.route.routeNumber.localeCompare(b.original.route.routeNumber, undefined, { numeric: true }),
    size: 64,
    meta: { label: 'No.' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="No." className={headCls} />,
    cell: ({ row: { original: { route: r } } }) => (
      <Link
        href={`/routes/${r.id}`}
        className="text-lg font-semibold leading-none tabular-nums text-foreground hover:text-green-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {r.routeNumber}
      </Link>
    ),
  },
  {
    id: 'route',
    accessorFn: ({ route }) => route.routeName,
    meta: { label: 'Route' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Route" className={headCls} />,
    cell: ({ row: { original: { route: r } } }) => (
      <Link href={`/routes/${r.id}`} className="block min-w-[200px] max-w-[280px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
    ),
  },
  {
    id: 'driver',
    accessorFn: ({ route }) => route.driverName ?? '',
    meta: { label: 'Driver' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Driver" className={headCls} />,
    cell: ({ row: { original: { route: r } } }) =>
      r.driverName ? (
        <span className="text-sm text-foreground">{r.driverName}</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: TONE['no-driver'] }}>
          <UserX className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Unassigned
        </span>
      ),
  },
  {
    id: 'timing',
    accessorFn: ({ route }) => route.departureTime ?? '',
    meta: { label: 'Timing' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Timing" className={headCls} />,
    cell: ({ row: { original: { route: r } } }) => (
      <>
        <span className="block text-sm tabular-nums text-foreground">
          {formatTime(r.departureTime)} – {formatTime(r.arrivalTime)}
        </span>
        {r.duration && <span className="mt-0.5 block text-xs text-muted-foreground">{r.duration}</span>}
      </>
    ),
  },
  {
    id: 'bus',
    accessorFn: ({ route }) => route.vehicleRegistration ?? '',
    meta: { label: 'Bus' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" className={headCls} />,
    cell: ({ row: { original: { route: r } } }) => {
      const load = loadOf(r);
      return r.vehicleRegistration ? (
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
      );
    },
  },
  {
    id: 'booked',
    accessorFn: ({ route }) => route.booked,
    meta: { label: 'Booked' },
    header: ({ column }) => (
      <div className="flex justify-end"><DataTableColumnHeader column={column} title="Booked" className={headCls} /></div>
    ),
    cell: ({ row }) => (
      <span className="block text-right text-sm tabular-nums text-foreground">{num(row.original.route.booked)}</span>
    ),
  },
  {
    id: 'boarded',
    accessorFn: ({ route }) => route.boarded,
    meta: { label: 'Boarded' },
    header: ({ column }) => (
      <div className="flex justify-end"><DataTableColumnHeader column={column} title="Boarded" className={headCls} /></div>
    ),
    cell: ({ row }) => (
      <span className="block text-right text-sm tabular-nums text-foreground">{num(row.original.route.boarded)}</span>
    ),
  },
  {
    id: 'turnout',
    // No-booking routes have no turnout at all; sort them below a real 0%.
    accessorFn: ({ route }) => turnoutOf(route) ?? -1,
    meta: { label: 'Turnout' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Turnout" className={headCls} />,
    cell: ({ row: { original: { route: r, state } } }) => {
      const turnout = turnoutOf(r);
      // Turnout can exceed 100% on walk-up routes; the bar fills and the note
      // carries the overflow rather than the number being clamped to a tidy lie.
      const fill = turnout === null ? 0 : Math.min(turnout, 100);
      return (
        <span className="flex min-w-[150px] items-center gap-2">
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
              style={{ width: `${fill}%`, background: TONE[state.kind] }}
            />
          </span>
          <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {turnout === null ? '—' : `${turnout}%`}
          </span>
        </span>
      );
    },
  },
  {
    // Not header-sortable: "Issues first" in the board's sort control is the
    // status ordering, with its own priority rules.
    id: 'status',
    accessorFn: ({ state }) => state.note || 'Running normally',
    enableSorting: false,
    meta: { label: 'Status' },
    header: () => <span className={headCls}>Status</span>,
    cell: ({ row: { original: { route: r, state } } }) => {
      const tone = TONE[state.kind];
      const Icon = STATE_ICON[state.kind];
      return (
        <>
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
        </>
      );
    },
  },
];
