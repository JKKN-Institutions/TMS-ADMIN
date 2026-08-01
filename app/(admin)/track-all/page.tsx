'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { RefreshCw, AlertTriangle, Bus } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { humanizeAge } from '@/lib/gps/route-status';
import { FleetList } from './fleet-list';
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
  };
}

export default function TrackAllPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Record<string, NudgeState>>({});

  const { data, isLoading, error, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['track-all-fleet'],
    queryFn: fetchFleet,
    // Poll fast only while something is actually moving. With no bus reporting —
    // the normal case on this fleet — a 5s poll is pure waste.
    refetchInterval: (q) => ((q.state.data?.summary.reporting ?? 0) > 0 ? 5_000 : 30_000),
    refetchIntervalInBackground: false,
  });

  // Same cadence the query above uses, mirrored here (not read back from the query)
  // purely to judge how stale the on-screen snapshot is — see the banner below.
  const pollMs = (data?.summary.reporting ?? 0) > 0 ? 5_000 : 30_000;

  // Ticks so the staleness banner's age advances on screen instead of freezing at
  // whatever render happened to run when the poll last failed or the tab was hidden.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // A background poll can fail (endpoint down, flapping network) or simply not have
  // run yet (tab was hidden — refetchIntervalInBackground is false, and
  // query-provider.tsx disables refetchOnWindowFocus globally) while the page keeps
  // asserting server-computed `reason` strings ("Updated 45s ago") that never tick
  // on their own. Surface it rather than let a stale snapshot read as current.
  const dataAgeMs = dataUpdatedAt > 0 ? now - dataUpdatedAt : 0;
  const showStale = dataUpdatedAt > 0 && (isError || dataAgeMs > pollMs * 2);

  const routes = useMemo(() => data?.routes ?? [], [data]);
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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
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
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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
  const notSetUp = s.noVehicle + s.noDriver + s.unconfigured;

  return (
    <div className="space-y-5">
      {showStale && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Showing data from {humanizeAge(dataAgeMs)} ago
          {isError ? " — couldn't reach the server." : '.'}
        </div>
      )}

      {/* Coverage header — the honest headline the old stat cards never gave. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Live Tracking</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">
              {s.reporting} of {s.trackable}
            </span>{' '}
            buses reporting right now
            {notSetUp > 0 && (
              <span className="text-gray-500 dark:text-gray-500">
                {' '}· {notSetUp} route{notSetUp === 1 ? '' : 's'} not set up
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isFetching}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* List and map. Stacks on mobile, side by side from lg up. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 lg:grid lg:h-[calc(100vh-13rem)]">
          <FleetList
            routes={routes}
            summary={s}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            onNudge={(id) => void handleNudge(id)}
            nudges={nudges}
          />
        </div>

        <div className="min-w-0">
          {buses.length === 0 ? (
            <div className="flex h-[45vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 text-center dark:border-gray-700 lg:h-[calc(100vh-13rem)]">
              <Bus className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">No bus has a position yet</p>
              <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
                Buses appear here once a driver goes on duty and their phone sends a GPS fix.
              </p>
            </div>
          ) : (
            <div className="h-[45vh] overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 lg:h-[calc(100vh-13rem)]">
              <LiveTrackingMap
                buses={buses}
                selectedRouteId={mapSelectedRouteId}
                onSelectRoute={setSelectedRouteId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
