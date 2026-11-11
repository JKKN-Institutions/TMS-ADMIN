'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { AlertTriangle, Bus, MapPin, Radio, Crosshair, Play, Wifi, Satellite } from 'lucide-react';
import { Spinner, NoticeCard, PageHeader } from '@/components/driver/ui';
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

  const routeLabel = trip
    ? tripRoute?.label ?? routes.find((r) => r.id === trip.route_id)?.label ?? 'Trip in progress'
    : null;

  const notices = (
    <>
      {tripError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{tripError}</span>
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
    </>
  );

  // ── Trip running: one screen that answers "can learners see the bus?" first. ──
  if (trip && health) {
    const tone =
      health.level === 'ok'
        ? 'border-green-600 bg-green-600 text-white'
        : health.level === 'wait'
          ? 'border-amber-400 bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50'
          : 'border-red-600 bg-red-600 text-white';
    return (
      <div className="space-y-4">
        <div role="status" aria-live="polite" className={cn('rounded-2xl border-2 px-4 py-4', tone)}>
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              {health.level === 'ok' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
              )}
              <span className={cn('relative inline-flex h-3.5 w-3.5 rounded-full', health.level === 'wait' ? 'bg-amber-600' : 'bg-white')} />
            </span>
            <p className="text-xl font-bold uppercase leading-tight tracking-wide">{health.title}</p>
          </div>
          <p className="mt-1 text-base">{health.body}</p>
          {health.steps.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-base">
              {health.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {health.level === 'bad' && (
            <button
              type="button"
              onClick={() => void start()}
              className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-base font-semibold text-red-700"
            >
              Try again
            </button>
          )}
        </div>

        {notices}

        {stopSummary && mapStops.length > 0 && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900/50 dark:bg-violet-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              {stopSummary.headline.startsWith('Next stop') ? 'Next stop' : 'Now'}
            </p>
            <p className="mt-0.5 text-2xl font-bold leading-tight text-gray-900 dark:text-white">
              {stopSummary.headline.replace(/^Next stop: /, '')}
            </p>
            {stopSummary.detail && <p className="mt-0.5 text-base text-gray-700 dark:text-gray-300">{stopSummary.detail}</p>}
          </div>
        )}

        {fix ? (
          <div className="h-[46dvh] max-h-[560px] min-h-[300px] overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
            <LivePositionMap
              latitude={fix.lat}
              longitude={fix.lng}
              label="You are here"
              accuracyM={fix.accuracy}
              destination={CAMPUS}
              stops={mapStops}
            />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
            The map appears here once your phone finds its location.
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate font-semibold text-gray-900 dark:text-white">{routeLabel}</p>
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {trip.direction === 'return' ? 'From college' : 'To college'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Running {formatDuration(trip.started_at, now)} · {Number(trip.distance_km).toFixed(1)} km
          </p>

          <div className="mt-4">
            {confirmEnd ? (
              // A second tap is required: one accidental touch on a big red button used
              // to end the trip and hide the bus from every learner on the route.
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
                <p className="text-base font-semibold text-red-800 dark:text-red-200">End this trip?</p>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  Learners and the transport office will stop seeing the bus.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmEnd(false)}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-800 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  >
                    Keep driving
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void endTrip().then(() => setConfirmEnd(false))}
                    className="rounded-xl bg-red-600 px-4 py-4 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {busy ? 'Ending…' : 'Yes, end trip'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmEnd(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-600 bg-white px-6 py-4 text-lg font-semibold text-red-700 disabled:opacity-60 dark:bg-gray-900 dark:text-red-400"
              >
                <Crosshair className="h-5 w-5" />
                END TRIP
              </button>
            )}
          </div>
        </div>

        {/* The separate GPS / network signals, for whoever is helping the driver fix a problem. */}
        <details className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          <summary className="cursor-pointer font-medium">Signal details</summary>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Satellite className="h-4 w-4 shrink-0 text-gray-400" />
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', status === 'live' ? 'bg-green-500' : 'bg-amber-500')} />
              <span>
                Phone location: {status === 'live' ? 'found' : 'searching…'}
                {fix?.accuracy != null ? ` (within ${Math.round(fix.accuracy)} m)` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 shrink-0 text-gray-400" />
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  network === 'connected' ? 'bg-green-500' : network === 'reconnecting' ? 'bg-amber-500' : 'bg-gray-400'
                )}
              />
              <span>
                Internet: {network === 'connected' ? 'connected' : network === 'reconnecting' ? 'reconnecting…' : 'waiting'}
                {unsentCount > 0 ? ` (${unsentCount} positions not sent)` : ''}
              </span>
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              Last position sent: {lastSentAt ? `${Math.max(0, Math.round((now - lastSentAt) / 1000))} seconds ago` : 'none yet'}
            </p>
          </div>
        </details>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Keep this screen open and the phone unlocked while driving. Sharing pauses if you switch apps or the
          screen locks.
        </p>
      </div>
    );
  }

  // ── No trip yet: get ready and start. ──
  return (
    <div className="space-y-6">
      <PageHeader
        title="Start trip"
        subtitle="Your phone shares the bus's location with the transport office and learners until you end the trip."
      />

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        {locationPerm === 'denied' ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            <p className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-5 w-5 shrink-0" /> Location is blocked on this phone
            </p>
            <p className="mt-1 text-sm">Learners will not see the bus until this is fixed:</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              <li>Tap the lock icon next to the web address.</li>
              <li>Open Permissions and set Location to Allow.</li>
              <li>Come back to this screen.</li>
            </ol>
          </div>
        ) : locationPerm === 'granted' ? (
          <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
            <Radio className="h-4 w-4 shrink-0" /> Location is ready on this phone.
          </p>
        ) : (
          <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            <span className="font-semibold">When you tap START TRIP your phone will ask to share location.</span>{' '}
            Tap <span className="font-semibold">Allow</span>, or learners cannot see the bus.
          </p>
        )}

        {routes.length > 1 ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Route you are driving</span>
            <select
              value={selectedRouteId ?? ''}
              onChange={(e) => setSelectedRouteId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-base font-semibold text-gray-900 dark:text-white">{routes[0].label}</p>
            {routes[0].vehicle && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <Bus className="h-3.5 w-3.5" />
                {routes[0].vehicle.registrationNumber ?? '—'}
              </span>
            )}
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

        {notices}

        {checkDueBeforeStart && (
          <button
            type="button"
            onClick={() => setCheckOpenedEarly(true)}
            className="flex w-full items-center justify-between gap-2 rounded-lg bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/50"
          >
            <span>Today&apos;s pre-trip check is not done yet.</span>
            <span className="shrink-0 font-semibold underline">Do it now</span>
          </button>
        )}

        {/* One control, sized for a thumb. START TRIP is never hidden or blocked by the
            pre-trip check or by the location state (Director, 8 Nov: it always works). */}
        <button
          type="button"
          disabled={busy || !selectedRouteId}
          onClick={() => selectedRouteId && void startTrip(selectedRouteId)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 px-6 py-6 text-xl font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Play className="h-6 w-6" />
          {busy ? 'Starting…' : 'START TRIP'}
        </button>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Keep this screen open and the phone unlocked while driving. Sharing pauses if you switch apps or the
          screen locks.
        </p>
      </section>
    </div>
  );
}
