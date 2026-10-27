'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { humanizeAge } from '@/lib/gps/route-status';
import { haversineKm } from '@/lib/gps/distance';
import { CAMPUS } from '@/lib/gps/campus';
import { useLiveBus, POLL_SUBSCRIBED_MS } from '@/hooks/use-live-bus';
import { FLEET_TOPIC } from '@/lib/tracking/broadcast';
import { FleetList } from './fleet-list';
import { STATUS_GROUPS, groupOf, type GroupKey } from './status-groups';
import { PageHeader } from '@/components/ui/page-header';
import { SummaryCard, SummaryCards } from '@/components/ui/summary-cards';
import type { FleetResponse, FleetRoute } from './types';
import type { MapBus } from '@/components/live-tracking-map';

const LiveTrackingMap = dynamic(() => import('@/components/live-tracking-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

type NudgeState = { state: 'idle' | 'sending' | 'sent' | 'cooldown'; cooldownMin: number | null };

async function fetchFleet(): Promise<FleetResponse> {
  const res = await fetch('/api/admin/track-all/routes', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load fleet');
  return (await res.json()) as FleetResponse;
}

function toMapBus(r: FleetRoute): MapBus | null {
  if (!r.position) return null;
  return {
    routeId: r.routeId,
    routeNumber: r.routeNumber,
    routeName: r.routeName,
    driverName: r.driver?.name ?? null,
    registrationNumber: r.vehicle?.registrationNumber ?? null,
    lat: r.position.lat,
    lng: r.position.lng,
    heading: r.heading,
    accuracyM: r.accuracyM,
    state: r.state,
    reason: r.reason,
    driverPhone: r.driver?.phone ?? null,
    speedKmh: r.speedKmh,
  };
}

/** True from 900px — where the sidebar appears and Track All splits list | map. */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Phone layout: the list lives in a sheet over the bottom of the screen, above
 * the bottom navigation. Drag the handle up/down (or tap it) to switch between
 * peek and expanded.
 */
function MobileSheet({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const startY = useRef<number | null>(null);
  return (
    <div
      className="fixed inset-x-0 z-30 flex flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] transition-[height] duration-300 ease-out dark:border-gray-800 dark:bg-gray-900"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))', height: expanded ? '72dvh' : '34dvh' }}
    >
      <button
        type="button"
        aria-label={expanded ? 'Collapse route list' : 'Expand route list'}
        aria-expanded={expanded}
        className="flex shrink-0 touch-none flex-col items-center gap-1 px-4 pb-1 pt-2"
        onPointerDown={(e) => {
          startY.current = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const dy = startY.current == null ? 0 : e.clientY - startY.current;
          startY.current = null;
          if (Math.abs(dy) < 8) setExpanded((v) => !v);
          else setExpanded(dy < 0);
        }}
      >
        <span className="h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{title}</span>
      </button>
      <div className="min-h-0 flex-1 px-2 pb-2">{children}</div>
    </div>
  );
}

export default function TrackAllPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Record<string, NudgeState>>({});
  const [filter, setFilter] = useState<GroupKey | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const wide = useWide();

  // Live fixes for the whole fleet. Gated by RLS on realtime.messages to holders of
  // tms.tracking.fleet.view — a student subscribing to this topic receives nothing.
  const { fix: liveFix, channelStatus } = useLiveBus(FLEET_TOPIC);
  const socketUp = channelStatus === 'subscribed';

  const { data, isLoading, error, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['track-all-fleet'],
    queryFn: fetchFleet,
    // Poll fast only while something is actually moving. With no bus reporting —
    // the normal case on this fleet — a 5s poll is pure waste. When the realtime
    // socket is up the poll drops to a slow reconcile, because positions now arrive
    // by broadcast; if the socket drops we fall straight back to the 5s cadence.
    // Auto-refresh (on by default) polls every 15s with no bus reporting. While
    // something moves, positions come by broadcast and the poll is a slow
    // reconcile — or 5s if the realtime socket is down.
    refetchInterval: (q) => {
      if (!autoRefresh) return false;
      if ((q.state.data?.summary.reporting ?? 0) === 0) return 15_000;
      return socketUp ? POLL_SUBSCRIBED_MS : 5_000;
    },
    refetchIntervalInBackground: false,
  });

  // Same cadence the query above uses, mirrored here (not read back from the query)
  // purely to judge how stale the on-screen snapshot is — see the banner below.
  const pollMs =
    (data?.summary.reporting ?? 0) > 0 ? (socketUp ? POLL_SUBSCRIBED_MS : 5_000) : 15_000;

  // Ticks so the staleness banner's age advances on screen instead of freezing at
  // whatever render happened to run when the poll last failed or the tab was hidden.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // 1s so "Updated 8s ago" counts up live.
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // A background poll can fail (endpoint down, flapping network) or simply not have
  // run yet (tab was hidden — refetchIntervalInBackground is false, and
  // query-provider.tsx disables refetchOnWindowFocus globally) while the page keeps
  // asserting server-computed `reason` strings ("Updated 45s ago") that never tick
  // on their own. Surface it rather than let a stale snapshot read as current.
  const dataAgeMs = dataUpdatedAt > 0 ? now - dataUpdatedAt : 0;
  // Only meaningful while auto-refresh is on; paused means the admin chose a snapshot.
  const showStale = autoRefresh && dataUpdatedAt > 0 && (isError || dataAgeMs > pollMs * 2);

  // Broadcast payload flattened to PRIMITIVES before it goes anywhere near a
  // dependency array. This page polls, so any object/array from fetched data has a
  // fresh identity every tick — the defect class that caused four separate bugs here
  // (markers crawling, rows stuck on "Locating…", selection stranded).
  const liveRouteId = liveFix?.routeId ?? null;
  const liveAt = liveFix?.at ?? null;
  const liveLat = liveFix?.latitude ?? null;
  const liveLng = liveFix?.longitude ?? null;
  const liveHeading = liveFix?.heading ?? null;
  const liveSpeedMs = liveFix?.speed ?? null;
  const liveAccuracyM = liveFix?.accuracyM ?? null;

  const routes = useMemo(() => {
    const base = data?.routes ?? [];
    if (!liveRouteId || !liveAt || liveLat === null || liveLng === null) return base;
    return base.map((r) => {
      if (r.routeId !== liveRouteId) return r;
      // Only overlay a fix that is genuinely newer than the polled snapshot.
      if (!(Date.parse(liveAt) > Date.parse(r.lastFixAt ?? ''))) return r;
      const position = { lat: liveLat, lng: liveLng };
      return {
        ...r,
        position,
        heading: liveHeading,
        // speed arrives in METRES PER SECOND; FleetRoute.speedKmh is km/h.
        speedKmh: liveSpeedMs != null ? liveSpeedMs * 3.6 : null,
        accuracyM: liveAccuracyM,
        distanceToCampusKm: haversineKm(position, CAMPUS),
        lastFixAt: liveAt,
      };
    });
  }, [data, liveRouteId, liveAt, liveLat, liveLng, liveHeading, liveSpeedMs, liveAccuracyM]);
  const buses = useMemo(
    () => routes.map(toMapBus).filter((b): b is MapBus => b !== null),
    [routes],
  );

  // Drop-out decision (requirement 3, revised after review): keep the user's
  // selection in PAGE state exactly as they made it — including selecting a route
  // that has no position yet, which is deliberately reachable: FleetList lets the
  // user open/select ANY row, not just positioned ones, and
  // components/live-tracking-map.tsx depends on `selectedRouteId` surviving that
  // gap so its self-heal (`selectedBus != null` flipping once the bus appears)
  // can fire at all. Clearing page state here would make that unreachable.
  //
  // Only the MAP needs "nothing to draw" when its selected route currently has no
  // position: the map only clears its road line + address when its
  // `selectedRouteId` PROP changes, so we hand it null while the bus is absent
  // (clearing the artifact immediately) and the real id back the instant the bus
  // reports (re-arming the self-heal). `selectedRouteStillPresent` is a plain
  // boolean computed at render time — never `buses` itself — so no object/array
  // reaches a dependency array, and no effect is needed at all.
  const selectedRouteStillPresent = selectedRouteId
    ? buses.some((b) => b.routeId === selectedRouteId)
    : true;
  const mapSelectedRouteId = selectedRouteStillPresent ? selectedRouteId : null;

  const handleRefresh = useCallback(async () => {
    const res = await refetch();
    if (res.error) toast.error("Couldn't refresh — check your connection");
    else toast.success('Fleet refreshed');
  }, [refetch]);

  const handleNudge = useCallback(async (routeId: string) => {
    setNudges((p) => ({ ...p, [routeId]: { state: 'sending', cooldownMin: null } }));
    try {
      const res = await fetch('/api/admin/track-all/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setNudges((p) => ({
          ...p,
          [routeId]: { state: 'cooldown', cooldownMin: json?.retryAfterMin ?? null },
        }));
        return;
      }
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      setNudges((p) => ({ ...p, [routeId]: { state: 'sent', cooldownMin: null } }));
      toast.success('Reminder sent to the driver');
    } catch {
      setNudges((p) => ({ ...p, [routeId]: { state: 'idle', cooldownMin: null } }));
      toast.error("Couldn't send the reminder");
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
      </div>
    );
  }

  // Only replace the page with the error card when there is genuinely nothing to
  // show. TanStack sets `error` on a background refetch failure too, while keeping
  // `data` from the last success — treating that as fatal would unmount the map
  // (losing the admin's pan/zoom to its own re-fit) on every transient blip.
  if (error && !data) {
    return (
      <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Couldn&apos;t load the fleet</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Something went wrong reading route and vehicle data.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Try again
        </button>
      </div>
    );
  }

  // Not an error, but genuinely nothing to show yet (e.g. the query hasn't settled
  // for some reason `isLoading` didn't catch). Practically unreachable once loaded,
  // but keeps `data` below narrowed instead of risking a crash on `data.summary`.
  if (!data) return null;

  const s = data.summary;
  const groupCounts = Object.fromEntries(
    STATUS_GROUPS.map((g) => [g.key, routes.filter((r) => groupOf(r.state).key === g.key).length])
  ) as Record<GroupKey, number>;
  const updatedSec = dataUpdatedAt > 0 ? Math.max(0, Math.round((now - dataUpdatedAt) / 1000)) : null;

  const list = (
    <FleetList
      routes={routes}
      filter={filter}
      selectedRouteId={selectedRouteId}
      onSelectRoute={setSelectedRouteId}
      onNudge={(id) => void handleNudge(id)}
      nudges={nudges}
    />
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
      {STATUS_GROUPS.map((g) => (
        <span key={g.key} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${g.dot}`} aria-hidden /> {g.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-400 opacity-50" aria-hidden /> Faded = last known position
      </span>
    </div>
  );

  // `isolate` keeps Leaflet's z-indexed panes (400+) inside the map box, so the
  // phone sheet and bottom bar can sit above it.
  const map = (
    <div className="isolate h-full overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
      <LiveTrackingMap
        buses={buses}
        selectedRouteId={mapSelectedRouteId}
        onSelectRoute={setSelectedRouteId}
        emptyMessage={{
          title: 'No buses are live right now',
          detail: 'Buses appear here once a driver goes on duty and their phone sends a GPS position.',
        }}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {showStale && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Showing data from {humanizeAge(dataAgeMs)} ago
          {isError ? " — couldn't reach the server." : '.'}
        </div>
      )}

      <PageHeader
        description={
          <>
            <span className="font-semibold text-gray-900 dark:text-white">{s.reporting} of {s.trackable}</span> buses
            reporting right now. Click a status to filter; click a row or a bus to see it on the map.
          </>
        }
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300" aria-live="polite">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  autoRefresh ? (s.reporting > 0 ? 'animate-pulse bg-green-500' : 'bg-green-500') : 'bg-gray-400'
                )}
                aria-hidden
              />
              {autoRefresh ? 'Live' : 'Paused'}
              {updatedSec != null && ` · Updated ${updatedSec < 60 ? `${updatedSec}s` : humanizeAge(updatedSec * 1000)} ago`}
            </span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 accent-green-600"
              />
              Auto-refresh
            </label>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isFetching}
              className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        }
      />

      {/* Each card is a filter for the list (click again to clear). */}
      <SummaryCards>
        {STATUS_GROUPS.map((g) => (
          <SummaryCard
            key={g.key}
            label={g.label}
            value={groupCounts[g.key]}
            tone={groupCounts[g.key] ? g.tone : 'neutral'}
            active={filter === g.key}
            onClick={() => setFilter((f) => (f === g.key ? null : g.key))}
          />
        ))}
      </SummaryCards>

      {wide ? (
        // Desktop: list ~35% | map ~65%, each scrolling on its own.
        <div className="grid h-[calc(100dvh-19rem)] min-h-[480px] grid-cols-[minmax(300px,35%)_minmax(0,1fr)] gap-4">
          <div className="min-h-0">{list}</div>
          <div className="flex min-h-0 flex-col gap-2">
            {legend}
            <div className="min-h-0 flex-1">{map}</div>
          </div>
        </div>
      ) : (
        // Phone: map first, list in a draggable sheet. Bottom padding lets the
        // map scroll clear of the collapsed sheet.
        <div className="space-y-2 pb-[34dvh]">
          {legend}
          <div className="h-[55dvh]">{map}</div>
          <MobileSheet title={filter ? `${STATUS_GROUPS.find((g) => g.key === filter)?.label} · ${groupCounts[filter]}` : `All routes · ${routes.length}`}>
            {list}
          </MobileSheet>
        </div>
      )}
    </div>
  );
}
