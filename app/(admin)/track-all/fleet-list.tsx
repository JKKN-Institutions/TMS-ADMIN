'use client';

import { useMemo, useState } from 'react';
import { Search, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RouteRow } from './route-row';
import type { FleetRoute, FleetSummary, TrackingState } from './types';

/** Actionable rows first. Ties broken by route number so the order is stable. */
const SORT_RANK: Record<TrackingState, number> = {
  live: 0, recent: 1, paused: 2, stuck: 3,
  off: 4, no_vehicle: 5, no_driver: 6, unconfigured: 7,
};

type FilterKey = 'all' | 'reporting' | 'problem' | 'off' | 'setup';

/** Which states each filter chip admits. `all` is handled separately. */
const FILTERS: { key: FilterKey; label: string; states: TrackingState[] }[] = [
  { key: 'all', label: 'All', states: [] },
  { key: 'reporting', label: 'Reporting', states: ['live', 'recent'] },
  { key: 'problem', label: 'Paused or stuck', states: ['paused', 'stuck'] },
  { key: 'off', label: 'Not sharing', states: ['off'] },
  { key: 'setup', label: 'Not set up', states: ['no_vehicle', 'no_driver', 'unconfigured'] },
];

export function FleetList({
  routes, summary, selectedRouteId, onSelectRoute, onNudge, nudges,
}: {
  routes: FleetRoute[];
  summary: FleetSummary;
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
  onNudge: (routeId: string) => void;
  nudges: Record<string, { state: 'idle' | 'sending' | 'sent' | 'cooldown'; cooldownMin: number | null }>;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter by search only; counts are derived from this, not the active filter.
  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return routes.filter((r) => {
      if (!q) return true;
      return [r.routeNumber, r.routeName, r.driver?.name, r.vehicle?.registrationNumber]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [routes, query]);

  // Counts answer: "how many rows match this state group given the search?"
  // They are independent of the active filter, so clicking a chip reveals rows.
  const counts: Record<FilterKey, number> = useMemo(() => {
    const stateCounts: Record<TrackingState, number> = {
      live: 0, recent: 0, paused: 0, stuck: 0,
      off: 0, no_vehicle: 0, no_driver: 0, unconfigured: 0,
    };
    searchFiltered.forEach((r) => {
      stateCounts[r.state]++;
    });
    return {
      all: searchFiltered.length,
      reporting: stateCounts.live + stateCounts.recent,
      problem: stateCounts.paused + stateCounts.stuck,
      off: stateCounts.off,
      setup: stateCounts.no_vehicle + stateCounts.no_driver + stateCounts.unconfigured,
    };
  }, [searchFiltered]);

  const visible = useMemo(() => {
    const allowed = FILTERS.find((f) => f.key === filter)?.states ?? [];
    return searchFiltered
      .filter((r) => (filter === 'all' ? true : allowed.includes(r.state)))
      .sort((a, b) => {
        const d = SORT_RANK[a.state] - SORT_RANK[b.state];
        if (d !== 0) return d;
        return (a.routeNumber ?? '').localeCompare(b.routeNumber ?? '', undefined, { numeric: true });
      });
  }, [searchFiltered, filter]);

  // Opening a row also selects it on the map; closing clears the selection.
  const toggle = (routeId: string) => {
    const next = expandedId === routeId ? null : routeId;
    setExpandedId(next);
    onSelectRoute(next);
  };

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="space-y-3 border-b border-gray-100 p-4 dark:border-gray-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search route, driver or bus…"
            aria-label="Search routes"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors',
                filter === f.key
                  ? 'bg-blue-600 text-white ring-blue-600'
                  : 'bg-gray-50 text-gray-600 ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700',
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Inbox className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          {routes.length === 0 ? (
            <>
              <p className="text-sm font-medium text-gray-900 dark:text-white">No routes configured</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Routes will appear here once they are created.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900 dark:text-white">No routes match</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Try clearing the search or choosing a different filter.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((r) => (
            <RouteRow
              key={r.routeId}
              route={r}
              expanded={expandedId === r.routeId}
              selected={selectedRouteId === r.routeId}
              onToggle={() => toggle(r.routeId)}
              onNudge={() => onNudge(r.routeId)}
              nudgeState={nudges[r.routeId]?.state ?? 'idle'}
              cooldownMin={nudges[r.routeId]?.cooldownMin ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
