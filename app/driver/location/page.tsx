'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  AlertTriangle, Bus, MapPin, Navigation, Gauge, Clock, Radio, Crosshair, Play, Wifi, Satellite, Square, ClipboardCheck,
} from 'lucide-react';
import { Spinner, NoticeCard, PageHeader } from '@/components/driver/ui';
import { useLiveTracking } from '@/lib/driver/use-live-tracking';
import { cn } from '@/lib/utils';
import { CAMPUS } from '@/lib/gps/campus';
import { PreTripCheckForm, type SavedPreTripCheck } from '@/components/driver/pre-trip-check-form';
import { inferDirection, type StopPin, type TripDirection } from '@/lib/stops/progress';
import { useRouteStops } from '@/components/map/use-route-stops';
import { sharingHealth } from '@/lib/driver/sharing-health';
import { StopsCaption } from '@/components/live/stops-caption';

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
  /** The route's stops that have a confirmed map location. */
  stops?: StopPin[];
  vehicle: VehicleLocation | null;
}
type Resp = { data?: { routes: RouteLocation[] }; notFound?: boolean };

type RoutePaths = Record<string, { onward: [number, number][] | null; return: [number, number][] | null }>;

/** The road each of the driver's routes follows. Asked for once per visit. */
async function fetchRoutePaths(): Promise<RoutePaths> {
  const res = await fetch('/api/driver/location?path=1', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return {};
  const routes = ((await res.json()).data?.routes ?? []) as Array<{ id: string; paths?: RoutePaths[string] }>;
  const out: RoutePaths = {};
  for (const r of routes) if (r.paths) out[r.id] = r.paths;
  return out;
}

async function fetchLocation(): Promise<Resp> {
  const res = await fetch('/api/driver/location', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load location');
  return { data: (await res.json()).data as { routes: RouteLocation[] } };
}

interface Trip {
  id: string;
  route_id: string;
  vehicle_id: string;
  direction: string;
  started_at: string;
  fix_count: number;
  distance_km: number;
}
interface AssignableRoute {
  id: string;
  label: string;
  startLocation: string | null;
  endLocation: string | null;
  vehicleId: string | null;
}
interface TripResp {
  trip: Trip | null;
  route: AssignableRoute | null;
  routes: AssignableRoute[];
  /** Today's pre-trip checks. enabled=false until the check table is deployed. */
  preTrip?: { enabled: boolean; doneVehicleIds: string[] };
  status: string | null;
}

async function fetchTrip(): Promise<TripResp> {
  const res = await fetch('/api/driver/trips', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data as TripResp;
}

/** "1h 24m" / "12m" — trip duration, coarse enough to read at a glance. */
function formatDuration(fromIso: string, nowMs: number): string {
  const startMs = Date.parse(fromIso);
  if (Number.isNaN(startMs)) return '—';
  const mins = Math.max(0, Math.round((nowMs - startMs) / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatUpdated(ts: string | null): string {
  if (!ts) return 'never';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

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

  const { data: tripData, refetch: refetchTrip } = useQuery({
    queryKey: ['driver-active-trip'],
    queryFn: fetchTrip,
    refetchInterval: 15000,
  });
  const trip = tripData?.trip ?? null;
  const tripId = trip?.id ?? null;
  const tripRoute = tripData?.route ?? null;

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  // Depend on the id STRING, never on `routes` itself: the query polls, so the array
  // has a fresh identity every 15s and would re-run this effect forever.
  const firstRouteId = routes.length > 0 ? routes[0].id : null;
  useEffect(() => {
    if (!selectedRouteId && firstRouteId) setSelectedRouteId(firstRouteId);
  }, [firstRouteId, selectedRouteId]);

  // Once a trip exists the broadcast route is the TRIP's route, not the picker's —
  // the two can only disagree if the picker changed after the trip started.
  const activeRouteId = trip?.route_id ?? selectedRouteId;

  const { status, banner, network, onDuty, fix, lastSentAt, unsentCount, start } =
    useLiveTracking(activeRouteId, tripId);

  // Stop pins for the route being driven, coloured passed / next from the trip's direction.
  const tripDirection: TripDirection | null =
    trip?.direction === 'onward' || trip?.direction === 'return' ? trip.direction : null;
  const { mapStops, summary: stopSummary } = useRouteStops(
    routes.find((r) => r.id === activeRouteId)?.stops,
    tripDirection,
    fix?.lat,
    fix?.lng,
  );

  const { data: routePaths } = useQuery({ queryKey: ['driver-route-paths'], queryFn: fetchRoutePaths, staleTime: Infinity });

  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showSignal, setShowSignal] = useState(false);
  // null until measured. lg (1024px) is where the bottom bar gives way to the sidebar.
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // On the phone layout the floating bug button is lifted clear of the trip button.
  useEffect(() => {
    if (wide !== false) return;
    document.body.classList.add('driver-trip-phone');
    return () => document.body.classList.remove('driver-trip-phone');
  }, [wide]);
  const [tripError, setTripError] = useState<string | null>(null);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  // The driver opened the check themselves before starting (closable).
  const [checkOpenedEarly, setCheckOpenedEarly] = useState(false);

  // Daily pre-trip check. Before a trip it comes first (see startControl below). Should
  // a trip be running on a bus with no check
  // or skip today, the check takes the whole screen and cannot be closed: the ways
  // out are SAVE CHECK or a recorded skip. Derived from the server's list, so a
  // refresh does not make it go away. Tracking keeps running underneath.
  const preTrip = tripData?.preTrip;
  const doneToday = (vehicleId: string | null | undefined) =>
    !!vehicleId && !!preTrip?.doneVehicleIds.includes(vehicleId);
  const selectedVehicleId =
    tripData?.routes.find((r) => r.id === selectedRouteId)?.vehicleId ?? null;
  const checkMandatory = !!trip && !!preTrip?.enabled && !doneToday(trip.vehicle_id);
  const checkDueBeforeStart = !trip && !!preTrip?.enabled && !!selectedVehicleId && !doneToday(selectedVehicleId);
  const checkRouteId = trip?.route_id ?? selectedRouteId;

  const startTrip = async (routeId: string) => {
    setBusy(true);
    setTripError(null);
    try {
      const res = await fetch('/api/driver/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ routeId }),
      });
      // 409 = a trip is already live for this route/driver/bus. Adopt it rather than
      // showing an error the driver can do nothing about.
      if (!res.ok && res.status !== 409) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setTripError(j?.error ?? 'Could not start the trip. Please try again.');
        return;
      }
      await refetchTrip();
    } catch {
      setTripError('Network problem. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const onCheckSaved = async (check: SavedPreTripCheck) => {
    setCheckOpenedEarly(false);
    await refetchTrip();
    if (check.any_issue) {
      // alerted === 0: nobody received it. null: already recorded earlier today
      // (the alert went out then).
      const what = check.skipped ? 'that the check was skipped' : 'about the NOT OK items';
      setCheckNotice(
        check.alerted !== 0
          ? `Saved. The transport head has been told ${what}.`
          : `Saved, but the alert could not be sent. Please phone the transport office ${what}.`
      );
      return;
    }
    setCheckNotice(null);
  };

  const endTrip = async () => {
    if (!tripId) return;
    setBusy(true);
    setTripError(null);
    try {
      // Close the trip FIRST so /end records its final position. GPS is released by
      // the hook once the refetch shows no trip; stopping it here instead would let
      // the auto-start effect below restart capture while tripId is still set.
      const res = await fetch(`/api/driver/trips/${tripId}/end`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      // 404 = already ended or expired — the outcome the driver wanted.
      if (!res.ok && res.status !== 404) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setTripError(j?.error ?? 'Could not end the trip. Please try again.');
        return;
      }
      await refetchTrip();
    } catch {
      setTripError('Network problem. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Capture follows the trip: the driver taps START TRIP once and never touches the
  // phone again. Primitives only in the dependency array.
  useEffect(() => {
    if (tripId && !onDuty && status !== 'permission_denied' && status !== 'no_active_trip') {
      void start();
    }
  }, [tripId, onDuty, status, start]);

  // A clock for "can learners see the bus?" — the answer changes with time alone
  // (nothing sent for a minute), so it cannot wait for the next poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  // When this screen began trying to share on the current trip: grace time is counted
  // from here, so reopening the page mid-trip does not flash an alarm.
  const [sharingSince, setSharingSince] = useState<number | null>(null);
  useEffect(() => {
    setSharingSince(tripId ? Date.now() : null);
  }, [tripId]);
  const health = trip
    ? sharingHealth({ status, network, lastSentAt, sinceMs: sharingSince ?? now, nowMs: now })
    : null;
  // A buzz when sharing breaks: the driver is looking at the road, not the screen.
  const healthLevel = health?.level ?? null;
  useEffect(() => {
    if (healthLevel === 'bad' && typeof navigator !== 'undefined') navigator.vibrate?.([300, 150, 300]);
  }, [healthLevel]);

  // Whether the phone will let this site read location, checked BEFORE the trip starts
  // so a blocked phone is found at the bus stand, not after learners are waiting.
  const [locationPerm, setLocationPerm] = useState<'granted' | 'prompt' | 'denied' | null>(null);
  useEffect(() => {
    let cancelled = false;
    const perms = (navigator as Navigator & {
      permissions?: { query: (d: { name: 'geolocation' }) => Promise<{ state: string }> };
    }).permissions;
    perms
      ?.query({ name: 'geolocation' })
      .then((p) => {
        if (!cancelled && (p.state === 'granted' || p.state === 'prompt' || p.state === 'denied')) setLocationPerm(p.state);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (isLoading || wide === null) return <Spinner />;
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

  // Check first, then start (transport office, 11 Nov 2026 — replaces the 8 Nov rule
  // that START TRIP always shows). While today's check for this bus is not saved or
  // skipped, the button in START TRIP's place opens the check; START TRIP appears only
  // afterwards. The driver is never stuck: the check form can record a skip with a
  // reason, which counts and alerts the transport head. Where the check table is not
  // deployed (preTrip.enabled false) nothing is due and START TRIP shows as before.
  const startControl = (size: string) => {
    const cls = cn(
      'inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60',
      size,
    );
    if (!tripData) {
      return (
        <button type="button" disabled className={cn(cls, 'bg-gray-400')}>
          Loading…
        </button>
      );
    }
    if (checkDueBeforeStart) {
      return (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setCheckOpenedEarly(true)}
            className={cn(cls, 'bg-gradient-to-br from-amber-500 to-orange-600')}
          >
            <ClipboardCheck className="h-6 w-6" />
            DO PRE-TRIP CHECK
          </button>
          <p className="text-center text-xs text-gray-600 dark:text-gray-400">
            START TRIP appears after today&apos;s check for this bus is saved.
          </p>
        </div>
      );
    }
    return (
      <button
        type="button"
        disabled={busy || !selectedRouteId}
        onClick={() => selectedRouteId && void startTrip(selectedRouteId)}
        className={cn(cls, 'bg-gradient-to-br from-green-600 to-emerald-600')}
      >
        <Play className="h-6 w-6" />
        {busy ? 'Starting…' : 'START TRIP'}
      </button>
    );
  };

  // Desktop keeps the page exactly as it was. The full-page map below is the phone layout.
  if (wide) {
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
            {!trip && (
              <>
                {/* Explained BEFORE the browser permission prompt, not after. */}
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
                  <p className="font-semibold">Location sharing starts when you tap START TRIP.</p>
                  <p className="mt-1">
                    Your phone will share the bus&apos;s position with the transport office and the
                    students on this route until you tap END TRIP. Keep this screen on while driving.
                  </p>
                </div>

                {routes.length > 1 && (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Route you are driving
                    </span>
                    <select
                      value={selectedRouteId ?? ''}
                      onChange={(e) => setSelectedRouteId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}

            {trip && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-semibold text-gray-900 dark:text-white">
                    {tripRoute?.label ?? routes.find((r) => r.id === trip.route_id)?.label ?? 'Trip in progress'}
                  </p>
                  <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium capitalize text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {trip.direction}
                  </span>
                </div>
                {(tripRoute?.startLocation || tripRoute?.endLocation) && (
                  <p className="mt-1 truncate text-sm text-gray-600 dark:text-gray-400">
                    {tripRoute?.startLocation ?? '—'} → {tripRoute?.endLocation ?? '—'}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>Running {formatDuration(trip.started_at, Date.now())}</span>
                  <span>{trip.fix_count} fixes sent</span>
                  <span>{Number(trip.distance_km).toFixed(1)} km</span>
                </div>
              </div>
            )}

            {tripError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{tripError}</span>
              </div>
            )}

            {banner && (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1',
                  banner.tone === 'error' && 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50',
                  banner.tone === 'warn' && 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50',
                  banner.tone === 'info' && 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/50'
                )}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-semibold">{banner.title}</span> {banner.body}
                </span>
              </div>
            )}

            {checkNotice && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{checkNotice}</span>
              </div>
            )}

            {(checkMandatory || (checkOpenedEarly && checkDueBeforeStart)) && checkRouteId && (
              <PreTripCheckForm
                key={checkRouteId}
                routeId={checkRouteId}
                routeLabel={routes.find((r) => r.id === checkRouteId)?.label ?? 'this route'}
                onSaved={(c) => void onCheckSaved(c)}
                onClose={checkMandatory ? undefined : () => setCheckOpenedEarly(false)}
                // END TRIP stays reachable on top of the check while a trip runs.
                onEndTrip={trip ? () => void endTrip() : undefined}
                endingTrip={busy}
                endTripError={tripError}
              />
            )}

            {/* One control, sized for a thumb. Nothing else needs pressing while driving. */}
            {trip ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void endTrip()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-red-600 to-rose-600 px-6 py-5 text-lg font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Crosshair className="h-5 w-5" />
                {busy ? 'Ending…' : 'END TRIP'}
              </button>
            ) : (
              startControl('py-5 text-lg')
            )}

            {trip && (
              <div className="space-y-4">
                {/* GPS and network are SEPARATE signals — a phone can have a perfect fix
                    and no signal, or full bars and no satellites. */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Satellite className="h-4 w-4 shrink-0 text-gray-400" />
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        status === 'live' ? 'bg-green-500' : 'bg-amber-500'
                      )}
                    />
                    <span>GPS: {status === 'live' ? 'Connected' : 'Acquiring…'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Wifi className="h-4 w-4 shrink-0 text-gray-400" />
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        network === 'connected' ? 'bg-green-500' : network === 'reconnecting' ? 'bg-amber-500' : 'bg-gray-400'
                      )}
                    />
                    <span>
                      Network:{' '}
                      {network === 'connected'
                        ? 'Connected'
                        : network === 'reconnecting'
                          ? 'Reconnecting…'
                          : 'Waiting'}
                      {unsentCount > 0 ? ` (${unsentCount} fixes not sent)` : ''}
                    </span>
                  </div>
                </div>

                {(() => {
                  const live = status === 'live';
                  const paused = status === 'paused' || status === 'starting';
                  const label = live ? 'Sharing live' : paused ? 'Paused — no fresh GPS' : 'Not sharing';
                  const dot = live ? 'bg-green-600' : paused ? 'bg-amber-500' : 'bg-gray-400';
                  const wrap = live
                    ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50'
                    : paused
                      ? 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50'
                      : 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300';
                  return (
                    <div className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1', wrap)}>
                      <span className="relative flex h-2 w-2">
                        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />}
                        <span className={cn('relative inline-flex h-2 w-2 rounded-full', dot)} />
                      </span>
                      {label}
                    </div>
                  );
                })()}

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

                {fix && <StopsCaption summary={stopSummary} pinCount={mapStops.length} />}
                {fix && (
                  <div className="h-[50dvh] max-h-[560px] min-h-[320px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                    <LivePositionMap
                      latitude={fix.lat}
                      longitude={fix.lng}
                      label="You are here"
                      accuracyM={fix.accuracy}
                      destination={CAMPUS}
                      stops={mapStops}
                    />
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
                    {/* gps_speed is GeolocationCoordinates.speed in METRES PER SECOND.
                        This previously printed the raw m/s value labelled "km/h". */}
                    <LiveStat
                      icon={Gauge}
                      label="Speed"
                      value={v.speed != null ? `${Math.round(v.speed * 3.6)} km/h` : '—'}
                    />
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

  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? routes[0];
  const routeLabel = trip ? tripRoute?.label ?? activeRoute.label : activeRoute.label;

  // What the map is centred on before the phone's location is on: the route's first
  // placed stop, or the college.
  const firstPin = mapStops[0];
  const centre = fix ? { lat: fix.lat, lng: fix.lng } : firstPin ? { lat: firstPin.lat, lng: firstPin.lng } : CAMPUS;

  const tone = !health
    ? ''
    : health.level === 'ok'
      ? 'bg-green-600 text-white'
      : health.level === 'wait'
        ? 'bg-amber-100 text-amber-950 dark:bg-amber-900/70 dark:text-amber-50'
        : 'bg-red-600 text-white';

  // One screen for both states: the map fills it, and the single button sits in its own
  // row at the bottom. The page itself never scrolls, so a finger on the map always
  // moves the map.
  return (
    <div className="driver-trip-screen -mx-4 -mb-24 -mt-6 flex h-[calc(100dvh_-_7.0625rem_-_env(safe-area-inset-bottom)_-_var(--pwa-banner-h,0px))] flex-col overflow-hidden sm:-mx-6 lg:-mb-6 lg:h-[calc(100dvh_-_4rem_-_var(--pwa-banner-h,0px))]">
      {/* Top strip: before the trip, which route and bus; during it, whether learners can see the bus. */}
      {trip && health ? (
        <div role="status" aria-live="polite" className={cn('shrink-0 px-4 py-2.5', tone)}>
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3 shrink-0">
              {health.level === 'ok' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
              )}
              <span className={cn('relative inline-flex h-3 w-3 rounded-full', health.level === 'wait' ? 'bg-amber-600' : 'bg-white')} />
            </span>
            <p className="min-w-0 flex-1 text-base font-bold uppercase leading-tight tracking-wide">{health.title}</p>
            <button
              type="button"
              onClick={() => setShowSignal((v) => !v)}
              aria-expanded={showSignal}
              aria-label="Signal details"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10"
            >
              <Wifi className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-0.5 text-sm">{health.body}</p>
          {health.steps.length > 0 && (
            <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">
              {health.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {health.level === 'bad' && (
            <button
              type="button"
              onClick={() => void start()}
              className="mt-2 w-full rounded-lg bg-white px-4 py-2.5 text-base font-semibold text-red-700"
            >
              Try again
            </button>
          )}
          {showSignal && (
            <div className="mt-2 space-y-1 rounded-lg bg-black/10 px-3 py-2 text-sm">
              <p className="flex items-center gap-2">
                <Satellite className="h-4 w-4 shrink-0" />
                Phone location: {status === 'live' ? 'found' : 'searching…'}
                {fix?.accuracy != null ? ` (within ${Math.round(fix.accuracy)} m)` : ''}
              </p>
              <p className="flex items-center gap-2">
                <Wifi className="h-4 w-4 shrink-0" />
                Internet: {network === 'connected' ? 'connected' : network === 'reconnecting' ? 'reconnecting…' : 'waiting'}
                {unsentCount > 0 ? ` (${unsentCount} positions not sent)` : ''}
              </p>
              <p>
                {routeLabel} · {trip.direction === 'return' ? 'From college' : 'To college'} · running{' '}
                {formatDuration(trip.started_at, now)} · {Number(trip.distance_km).toFixed(1)} km
              </p>
              <p>
                Last position sent: {lastSentAt ? `${Math.max(0, Math.round((now - lastSentAt) / 1000))} seconds ago` : 'none yet'}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900">
          <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">{routeLabel}</p>
          {activeRoute.vehicle && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <Bus className="h-3.5 w-3.5" />
              {activeRoute.vehicle.registrationNumber ?? '—'}
            </span>
          )}
        </div>
      )}

      {trip && stopSummary && mapStops.length > 0 && (
        <div className="shrink-0 border-b border-violet-200 bg-violet-50 px-4 py-2 dark:border-violet-900/50 dark:bg-violet-950/40">
          <p className="truncate text-base font-bold text-gray-900 dark:text-white">{stopSummary.headline}</p>
          {stopSummary.detail && <p className="truncate text-sm text-gray-700 dark:text-gray-300">{stopSummary.detail}</p>}
        </div>
      )}

      {/* The map. Before START TRIP the phone's location is off, so no bus is drawn —
          just the college and the route's stops. */}
      <div className="relative min-h-0 flex-1">
        <LivePositionMap
          latitude={centre.lat}
          longitude={centre.lng}
          label="You are here"
          accuracyM={fix?.accuracy ?? null}
          destination={CAMPUS}
          stops={mapStops}
          // The road this route follows, for the run being driven (or the one the clock says is next).
          routePath={activeRouteId ? routePaths?.[activeRouteId]?.[tripDirection ?? inferDirection(null, now)] ?? null : null}
          busState={fix ? 'live' : 'none'}
        />
        {!fix && (
          <p className="pointer-events-none absolute inset-x-0 top-3 z-[1000] mx-auto w-fit max-w-[85%] rounded-full bg-white/95 px-3 py-1.5 text-center text-xs font-medium text-gray-700 shadow-[0_1px_6px_rgba(0,0,0,0.25)] dark:bg-gray-900/95 dark:text-gray-200">
            {trip ? 'Finding your location…' : 'Tap START TRIP to turn on location and show the bus here'}
          </p>
        )}
        {trip && !confirmEnd && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmEnd(true)}
            aria-label="End trip"
            className="absolute bottom-5 left-1/2 z-[1000] flex h-16 w-16 -translate-x-1/2 flex-col items-center justify-center gap-0.5 rounded-full border-4 border-white bg-red-600 text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)] active:bg-red-700 disabled:opacity-60"
          >
            <Square className="h-5 w-5 fill-current" />
            <span className="text-[10px] font-bold leading-none tracking-wide">END</span>
          </button>
        )}
        {trip && confirmEnd && (
          // A second tap is required: one accidental touch used to end the trip and
          // hide the bus from every learner on the route.
          <div className="absolute inset-x-3 bottom-3 z-[1000] rounded-2xl border border-red-200 bg-white p-4 shadow-[0_6px_24px_rgba(0,0,0,0.3)] dark:border-red-900/50 dark:bg-gray-900">
            <p className="text-base font-semibold text-gray-900 dark:text-white">End this trip?</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Learners and the transport office will stop seeing the bus.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmEnd(false)}
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-800 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                Keep driving
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void endTrip().then(() => setConfirmEnd(false))}
                className="rounded-xl bg-red-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
              >
                {busy ? 'Ending…' : 'Yes, end trip'}
              </button>
            </div>
          </div>
        )}
      </div>

      {(checkMandatory || (checkOpenedEarly && checkDueBeforeStart)) && checkRouteId && (
        <PreTripCheckForm
          key={checkRouteId}
          routeId={checkRouteId}
          routeLabel={routes.find((r) => r.id === checkRouteId)?.label ?? 'this route'}
          onSaved={(c) => void onCheckSaved(c)}
          onClose={checkMandatory ? undefined : () => setCheckOpenedEarly(false)}
          // END TRIP stays reachable on top of the check while a trip runs.
          onEndTrip={trip ? () => void endTrip() : undefined}
          endingTrip={busy}
          endTripError={tripError}
        />
      )}

      {/* Bottom row: small notices and START TRIP. During a trip it only appears when
          there is something to say, so the map keeps the room. */}
      {(!trip || tripError || checkNotice) && (
      <div className="shrink-0 space-y-2 border-t border-gray-200 bg-white px-4 pb-3 pt-2.5 shadow-[0_-6px_18px_rgba(0,0,0,0.10)] dark:border-gray-800 dark:bg-gray-900">
        {tripError && (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{tripError}</span>
          </p>
        )}
        {checkNotice && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{checkNotice}</span>
          </p>
        )}

        {!trip && (
          <>
            {locationPerm === 'denied' && (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-200 dark:ring-red-900/50">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-semibold">Location is blocked on this phone.</span> Tap the lock icon next to
                  the web address, open Permissions and set Location to Allow.
                </span>
              </p>
            )}
            {banner && locationPerm !== 'denied' && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50">
                <span className="font-semibold">{banner.title}</span> {banner.body}
              </p>
            )}
            {routes.length > 1 && (
              <select
                aria-label="Route you are driving"
                value={selectedRouteId ?? ''}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
            {startControl('py-4 text-xl')}
          </>
        )}

      </div>
      )}
    </div>
  );
}
