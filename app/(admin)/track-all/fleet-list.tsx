'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Inbox } from 'lucide-react';
import { RouteRow } from './route-row';
import { STATUS_GROUPS, groupOf, type GroupKey } from './status-groups';
import type { FleetRoute } from './types';

/**
 * The route list, grouped by severity (Can't track → Paused/stuck → Not sharing
 * → Reporting → Not set up). The status filter is owned by the page's summary
 * cards; this component only applies it and the search box.
 */
export function FleetList({
  routes, filter, selectedRouteId, onSelectRoute, onNudge, nudges,
}: {
  routes: FleetRoute[];
  /** null = every group. */
  filter: GroupKey | null;
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
  onNudge: (routeId: string) => void;
  nudges: Record<string, { state: 'idle' | 'sending' | 'sent' | 'cooldown'; cooldownMin: number | null }>;
}) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return routes.filter((r) => {
      if (filter && groupOf(r.state).key !== filter) return false;
      if (!q) return true;
      return [r.routeNumber, r.routeName, r.driver?.name, r.vehicle?.registrationNumber]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [routes, query, filter]);

  // Rows bucketed by group, in severity order; route number orders within a group.
  const grouped = useMemo(
    () =>
      STATUS_GROUPS.map((g) => ({
        group: g,
        rows: visible
          .filter((r) => groupOf(r.state).key === g.key)
          .sort((a, b) => (a.routeNumber ?? '').localeCompare(b.routeNumber ?? '', undefined, { numeric: true })),
      })).filter((x) => x.rows.length > 0),
    [visible]
  );

  // Opening a row also selects it on the map; closing clears the selection.
  const toggle = (routeId: string) => {
    const next = expandedId === routeId ? null : routeId;
    setExpandedId(next);
    onSelectRoute(next);
  };

  const rowNodesRef = useRef<Map<string, HTMLLIElement>>(new Map());
  const setRowNode = (routeId: string, el: HTMLLIElement | null) => {
    if (el) rowNodesRef.current.set(routeId, el);
    else rowNodesRef.current.delete(routeId);
  };

  // A marker click selects a route — bring its row into view and open it, so
  // row and marker are always selected together. Keyed on the id (a primitive)
  // so the 5s poll never re-fires it.
  useEffect(() => {
    if (!selectedRouteId) return;
    setExpandedId(selectedRouteId);
    rowNodesRef.current.get(selectedRouteId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedRouteId]);

  // A row hidden by the search or a card filter can't stay open or selected —
  // otherwise its panel (or the map's road line) points at nothing in the list.
  const expandedStillVisible = expandedId ? visible.some((r) => r.routeId === expandedId) : true;
  useEffect(() => {
    if (!expandedStillVisible) setExpandedId(null);
  }, [expandedStillVisible]);
  const selectedStillVisible = selectedRouteId ? visible.some((r) => r.routeId === selectedRouteId) : true;
  useEffect(() => {
    if (!selectedStillVisible) onSelectRoute(null);
  }, [selectedStillVisible, onSelectRoute]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-100 p-3 dark:border-gray-800">
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
      </div>

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Inbox className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {routes.length === 0 ? 'No routes configured' : 'No routes match'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {routes.length === 0 ? 'Routes will appear here once they are created.' : 'Clear the search or pick another status card.'}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {grouped.map(({ group, rows }) => (
            <section key={group.key}>
              <h3 className="sticky top-0 z-[1] flex items-center gap-2 border-b border-gray-100 bg-gray-50/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 backdrop-blur dark:border-gray-800 dark:bg-gray-800/95 dark:text-gray-400">
                <span className={`h-2 w-2 rounded-full ${group.dot}`} aria-hidden />
                {group.label} <span className="font-normal tabular-nums">({rows.length})</span>
              </h3>
              <ul>
                {rows.map((r) => (
                  <RouteRow
                    key={r.routeId}
                    route={r}
                    expanded={expandedId === r.routeId}
                    selected={selectedRouteId === r.routeId}
                    onToggle={() => toggle(r.routeId)}
                    onNudge={() => onNudge(r.routeId)}
                    nudgeState={nudges[r.routeId]?.state ?? 'idle'}
                    cooldownMin={nudges[r.routeId]?.cooldownMin ?? null}
                    rowRef={(el) => setRowNode(r.routeId, el)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
