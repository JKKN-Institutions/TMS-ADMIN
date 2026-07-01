'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  MapPin, Navigation, AlertTriangle, Gauge, Clock, Bus, Radio, Crosshair,
} from 'lucide-react';
import { Spinner, NoticeCard, PageHeader } from '@/components/driver/ui';
import { geoErrorOutcome } from '@/lib/driver/geo';
import { isFixStale } from '@/lib/driver/tracking';
import { cn } from '@/lib/utils';

const LivePositionMap = dynamic(() => import('@/components/live-position-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

interface VehicleLocation {
  registrationNumber: string | null;
  model: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  lastUpdate: string | null;
  liveTrackingEnabled: boolean;
  hasFix: boolean;
}
interface RouteLocation {
  id: string;
  label: string;
  vehicle: VehicleLocation | null;
}
type Resp = { data?: { routes: RouteLocation[] }; notFound?: boolean };

async function fetchLocation(): Promise<Resp> {
  const res = await fetch('/api/driver/location', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load location');
  return { data: (await res.json()).data as { routes: RouteLocation[] } };
}

function formatUpdated(ts: string | null): string {
  if (!ts) return 'never';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

const SEND_INTERVAL_MS = 12000;

// Loose WakeLock typing (not in older TS DOM libs).
type WakeLock =
  | { release: () => Promise<void>; addEventListener?: (type: 'release', cb: () => void) => void }
  | null;

function LiveStat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate font-semibold text-gray-900 tabular-nums dark:text-white">{value}</p>
    </div>
  );
}

export default function DriverLocationPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-location'],
    queryFn: fetchLocation,
    refetchInterval: 15000,
  });
  const routes = data?.data?.routes ?? [];

  const [onDuty, setOnDuty] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number | null; speed: number | null } | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestFixRef = useRef<GeolocationPosition | null>(null);
  const wakeLockRef = useRef<WakeLock>(null);
  const selectedRouteRef = useRef<string | null>(null);

  // Default the active route to the first one once routes load.
  useEffect(() => {
    if (!selectedRouteId && routes.length > 0) setSelectedRouteId(routes[0].id);
  }, [routes, selectedRouteId]);
  useEffect(() => {
    selectedRouteRef.current = selectedRouteId;
  }, [selectedRouteId]);

  const sendPing = useCallback(async () => {
    const pos = latestFixRef.current;
    const routeId = selectedRouteRef.current;
    if (!pos || !routeId) return;
    // Don't broadcast a frozen fix: if watchPosition has stopped refreshing
    // (backgrounded, GPS lost) the position is stale, and re-sending it would drag
    // every reader's marker back to this point. Go quiet until a fresh fix arrives.
    if (isFixStale(pos.timestamp, Date.now())) return;
    try {
      const res = await fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          routeId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          // Capture time of THIS fix, so the server can reject a stale/duplicate
          // re-send under its monotonic guard (never regress the live position).
          capturedAt: new Date(pos.timestamp).toISOString(),
        }),
      });
      if (res.ok) setLastSentAt(Date.now());
    } catch {
      /* transient network error — the next tick retries */
    }
  }, []);

  const stopSharing = useCallback(async (notifyServer: boolean) => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null;
    }
    latestFixRef.current = null;
    setOnDuty(false);
    setFix(null);
    setLastSentAt(null);
    if (notifyServer) {
      try {
        await fetch('/api/driver/location', { method: 'DELETE', credentials: 'same-origin', keepalive: true });
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Best-effort screen Wake Lock. The browser auto-releases it whenever the page is
  // hidden (tab switch / screen lock), so we null the ref on release and re-acquire it
  // on return — otherwise the screen is free to sleep again and freeze the broadcast.
  const acquireWakeLock = useCallback(async () => {
    if (wakeLockRef.current || typeof navigator === 'undefined') return;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
      const sentinel = (await nav.wakeLock?.request('screen')) ?? null;
      wakeLockRef.current = sentinel;
      sentinel?.addEventListener?.('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      /* unsupported or denied — fine, capture still works while visible */
    }
  }, []);

  const startSharing = useCallback(async () => {
    setGeoError(null);
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError('Geolocation is not available on this device or browser.');
      return;
    }
    if (!selectedRouteRef.current) {
      setGeoError('Select the route you are driving first.');
      return;
    }

    await acquireWakeLock();

    const onPos = (pos: GeolocationPosition) => {
      latestFixRef.current = pos;
      setGeoError(null); // a fresh fix clears any transient "reacquiring GPS" warning
      setFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
      });
    };
    const onErr = (err: GeolocationPositionError) => {
      // Only PERMISSION_DENIED is terminal — nothing will ever arrive, so stop.
      // Transient TIMEOUT / POSITION_UNAVAILABLE errors (routine on a moving bus:
      // tunnels, buildings, GPS re-acquisition) must NOT tear down the session:
      // the 12s interval keeps re-sending the last good fix and watchPosition
      // recovers on its own. Killing the watch here was the bug that froze the
      // admin map at the driver's start point while the DB still said "Active".
      const outcome = geoErrorOutcome(err.code);
      setGeoError(outcome.message);
      if (outcome.stopSharing) void stopSharing(false);
    };

    const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 };
    // Immediate fix (prompts permission) + send right away, then stream.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPos(pos);
        void sendPing();
      },
      onErr,
      opts
    );
    watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, opts);
    intervalRef.current = setInterval(() => {
      void sendPing();
    }, SEND_INTERVAL_MS);
    setOnDuty(true);
  }, [sendPing, stopSharing, acquireWakeLock]);

  // Stop + notify server if the page unmounts while on duty.
  useEffect(() => {
    return () => {
      void stopSharing(true);
    };
  }, [stopSharing]);

  // Re-acquire the Wake Lock when the driver returns to the tab while on duty
  // (the browser releases it on hide). Keeps the screen awake so the ~12s ping
  // interval and watchPosition keep running instead of freezing at the last fix.
  useEffect(() => {
    if (!onDuty || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [onDuty, acquireWakeLock]);

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load live location"
        body="Something went wrong loading your routes. Please refresh or try again shortly."
      />
    );
  }
  if (data?.notFound) {
    return (
      <NoticeCard
        tone="amber"
        icon={AlertTriangle}
        title="Driver profile not found"
        body="We couldn't find a driver record linked to your account. Please contact the transport office."
      />
    );
  }
  if (routes.length === 0) {
    return (
      <NoticeCard
        tone="amber"
        icon={MapPin}
        title="No routes assigned"
        body="You have no routes assigned yet, so there's nothing to broadcast."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Location"
        subtitle="Share your phone's GPS while driving so admins and students can track the bus."
      />

      {/* Broadcast control */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <Radio className={cn('h-5 w-5', onDuty ? 'text-green-600 dark:text-green-400' : 'text-gray-400')} />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Broadcast my location</h2>
        </div>

        <div className="space-y-4 px-6 py-5">
          {routes.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Route you are driving</span>
              <select
                value={selectedRouteId ?? ''}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                disabled={onDuty}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {geoError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{geoError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => (onDuty ? void stopSharing(true) : void startSharing())}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 sm:w-auto',
              onDuty ? 'bg-gradient-to-br from-red-600 to-rose-600' : 'bg-gradient-to-br from-green-600 to-emerald-600'
            )}
          >
            <Crosshair className="h-4 w-4" />
            {onDuty ? 'Go Off Duty (stop sharing)' : 'Go On Duty (share my location)'}
          </button>

          {onDuty && (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 ring-1 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                </span>
                Sharing live
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <LiveStat
                  icon={Navigation}
                  label="Position"
                  value={fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : 'acquiring…'}
                />
                <LiveStat icon={Gauge} label="Accuracy" value={fix?.accuracy != null ? `±${Math.round(fix.accuracy)} m` : '—'} />
                <LiveStat
                  icon={Clock}
                  label="Last sent"
                  value={lastSentAt ? `${Math.max(0, Math.round((Date.now() - lastSentAt) / 1000))}s ago` : '—'}
                />
              </div>

              {fix && (
                <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                  <LivePositionMap latitude={fix.lat} longitude={fix.lng} label="You are here" />
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Keep this page open with the screen on while driving. Sharing pauses if you switch apps or the screen
            locks — that&apos;s a limitation of web browsers.
          </p>
        </div>
      </section>

      {/* Where's my bus — last-known vehicle fix per route */}
      {routes.map((r) => {
        const v = r.vehicle;
        return (
          <section
            key={r.id}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{r.label}</h2>
              </div>
              {v && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Bus className="h-3.5 w-3.5" />
                  {v.registrationNumber ?? '—'}
                </span>
              )}
            </div>

            <div className="px-6 py-5">
              {!v ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No vehicle assigned to this route.</p>
              ) : v.hasFix ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <LiveStat icon={Navigation} label="Coordinates" value={`${v.latitude}, ${v.longitude}`} />
                  <LiveStat icon={Gauge} label="Speed" value={v.speed != null ? `${v.speed} km/h` : '—'} />
                  <LiveStat icon={Clock} label="Last update" value={formatUpdated(v.lastUpdate)} />
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 p-5 dark:border-gray-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">No live location yet</p>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      This vehicle isn&apos;t broadcasting GPS{' '}
                      {v.liveTrackingEnabled ? '(tracking is on, awaiting a fix).' : '(tracking is off).'} Last update:{' '}
                      {formatUpdated(v.lastUpdate)}.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
