'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { AlertTriangle, Bus, MapPin, Crosshair, Play, Wifi, Satellite } from 'lucide-react';
import { Spinner, NoticeCard } from '@/components/driver/ui';
import { useLiveTracking } from '@/lib/driver/use-live-tracking';
import { cn } from '@/lib/utils';
import { CAMPUS } from '@/lib/gps/campus';
import { PreTripCheckForm, type SavedPreTripCheck } from '@/components/driver/pre-trip-check-form';
import type { StopPin, TripDirection } from '@/lib/stops/progress';
import { useRouteStops } from '@/components/map/use-route-stops';
import { sharingHealth } from '@/lib/driver/sharing-health';

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

  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showSignal, setShowSignal] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  // The driver opened the check themselves before starting (closable).
  const [checkOpenedEarly, setCheckOpenedEarly] = useState(false);

  // Daily pre-trip check — a must-see reminder that NEVER blocks the trip (Director,
  // 8 Nov). START TRIP always works. Once a trip is running on a bus with no check
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
    const startAfter = checkOpenedEarly && !trip && !check.any_issue;
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
    // All OK before starting: go straight on to the trip, as before.
    if (startAfter && selectedRouteId) await startTrip(selectedRouteId);
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
    <div className="driver-trip-screen -mx-4 -mb-24 -mt-6 flex h-[calc(100dvh_-_7.5rem_-_env(safe-area-inset-bottom)_-_var(--pwa-banner-h,0px))] flex-col overflow-hidden sm:-mx-6 lg:-mb-6 lg:h-[calc(100dvh_-_4rem_-_var(--pwa-banner-h,0px))]">
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
          busState={fix ? 'live' : 'none'}
        />
        {!fix && (
          <p className="pointer-events-none absolute inset-x-0 top-3 z-[1000] mx-auto w-fit max-w-[85%] rounded-full bg-white/95 px-3 py-1.5 text-center text-xs font-medium text-gray-700 shadow-[0_1px_6px_rgba(0,0,0,0.25)] dark:bg-gray-900/95 dark:text-gray-200">
            {trip ? 'Finding your location…' : 'Tap START TRIP to turn on location and show the bus here'}
          </p>
        )}
      </div>

      {/* Bottom row: small notices, then the one button. */}
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
            {checkDueBeforeStart && (
              <button
                type="button"
                onClick={() => setCheckOpenedEarly(true)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/50"
              >
                <span>Today&apos;s pre-trip check is not done yet.</span>
                <span className="shrink-0 font-semibold underline">Do it now</span>
              </button>
            )}
            {/* START TRIP is never hidden or blocked by the pre-trip check or by the
                location state (Director, 8 Nov: it always works). */}
            <button
              type="button"
              disabled={busy || !selectedRouteId}
              onClick={() => selectedRouteId && void startTrip(selectedRouteId)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 px-6 py-4 text-xl font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Play className="h-6 w-6" />
              {busy ? 'Starting…' : 'START TRIP'}
            </button>
          </>
        )}

        {trip &&
          (confirmEnd ? (
            // A second tap is required: one accidental touch used to end the trip and
            // hide the bus from every learner on the route.
            <div>
              <p className="text-base font-semibold text-red-800 dark:text-red-200">End this trip?</p>
              <p className="text-sm text-red-700 dark:text-red-300">Learners and the transport office will stop seeing the bus.</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmEnd(false)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-base font-semibold text-gray-800 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  Keep driving
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void endTrip().then(() => setConfirmEnd(false))}
                  className="rounded-xl bg-red-600 px-4 py-3.5 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy ? 'Ending…' : 'Yes, end trip'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="truncate text-xs text-gray-600 dark:text-gray-400">
                {routeLabel} · {trip.direction === 'return' ? 'From college' : 'To college'} · running{' '}
                {formatDuration(trip.started_at, now)} · {Number(trip.distance_km).toFixed(1)} km
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmEnd(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-4 text-xl font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
              >
                <Crosshair className="h-6 w-6" />
                END TRIP
              </button>
            </>
          ))}
      </div>
    </div>
  );
}
