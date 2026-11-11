'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Bus, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAMPUS } from '@/lib/gps/campus';
import type { LatLng } from '@/lib/gps/distance';
import type { ViewerLocationStatus } from '@/lib/hooks/use-viewer-location';
import type { StopPin, TripDirection } from '@/lib/stops/progress';
import { delayText, estimateArrival, type TimetableStop } from '@/lib/stops/arrival';
import { STOP_COLORS } from '@/lib/stops/map-stops';
import { useRouteStops } from '@/components/map/use-route-stops';
import { BusContextStrip } from '@/components/live/bus-context-strip';

const LivePositionMap = dynamic(() => import('@/components/live-position-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-100 dark:bg-gray-800">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

export interface LiveTrackScreenProps {
  routeLabel: string;
  busNumber: string | null;
  /** Last position we have for the bus, however old. Null when it has never reported. */
  position: LatLng | null;
  /** The position is current (the bus is reporting). False = it is only the last known one. */
  fresh: boolean;
  /** Reporting within the last couple of minutes. */
  liveNow: boolean;
  minutesAgo: number | null;
  lastUpdateIso: string | null;
  heading: number | null;
  accuracyM: number | null;
  speedKmh: number | null;
  /** Stops with a confirmed map location. */
  pins: StopPin[];
  /** Every stop on the route, located or not. */
  timetable: TimetableStop[];
  direction: TripDirection;
  /** The viewer's own boarding stop, when they have one. */
  myStopId?: string | null;
  roadGeometry?: [number, number][];
  viewer: LatLng | null;
  viewerStatus: ViewerLocationStatus;
  viewerMessage: string | null;
  onLocateMe: () => void;
}

function clockOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * The learner / boarding-staff "where is my bus" screen.
 *
 * The map fills the screen and the page itself does not scroll: a map inside a
 * scrolling page gives one finger-drag two meanings, and the map always wins. Details
 * live in a panel under the map on a phone and beside it on a desktop.
 *
 * The screen is useful with NO live bus too — most buses are not sharing most of the
 * time — so the stops, the viewer's own stop and its timetable time always show.
 */
export function LiveTrackScreen(props: LiveTrackScreenProps) {
  const {
    routeLabel, busNumber, position, fresh, liveNow, minutesAgo, lastUpdateIso,
    heading, accuracyM, speedKmh, pins, timetable, direction, myStopId, roadGeometry,
    viewer, viewerStatus, viewerMessage, onLocateMe,
  } = props;
  const [expanded, setExpanded] = useState(false);

  // The floating bug button sits bottom-right, exactly over this screen's details
  // panel on a phone. While this screen is open it moves up beside the map instead.
  useEffect(() => {
    document.body.classList.add('live-track-open');
    return () => document.body.classList.remove('live-track-open');
  }, []);

  // Minute clock for the arrival estimate.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Passed / next is only claimed from a CURRENT position. A stale one says nothing
  // about where the bus is now.
  const { mapStops, summary, progress } = useRouteStops(
    pins, direction, fresh ? position?.lat : null, fresh ? position?.lng : null, myStopId,
  );
  const arrival = estimateArrival({ timetable, pins, progress, direction, myStopId, nowMs: now });
  const myStop = myStopId ? timetable.find((s) => s.id === myStopId) ?? null : null;

  // What the map is centred on when there is no bus to show.
  const myPin = myStopId ? pins.find((p) => p.id === myStopId) : undefined;
  const centre = position ?? (myPin ? { lat: myPin.lat, lng: myPin.lng } : pins[0] ? { lat: pins[0].lat, lng: pins[0].lng } : CAMPUS);
  const busState = !position ? 'none' : fresh ? 'live' : 'stale';

  const lastSeen = clockOf(lastUpdateIso);
  const status = fresh
    ? { dot: 'bg-green-500', ping: true, text: liveNow ? 'Live now' : `Updated ${minutesAgo ?? '?'} min ago` }
    : position
      ? { dot: 'bg-gray-400', ping: false, text: `Not sharing now${lastSeen ? ` · last seen ${lastSeen}` : ''}` }
      : { dot: 'bg-gray-400', ping: false, text: 'The driver has not started the trip' };

  // The one line that answers the viewer's question.
  let headline: string;
  let detail: string | null = null;
  if (myStop && arrival) {
    if (arrival.passed) {
      headline = `The bus has passed your stop`;
      detail = myStop.name;
    } else if (arrival.stopsAway === 0) {
      headline = 'The bus is at your stop';
      detail = myStop.name;
    } else if (arrival.eta) {
      headline = `Reaches ${myStop.name} about ${arrival.eta}`;
      detail = [
        delayText(arrival.delayMin),
        arrival.stopsAway === 1 ? 'your stop is next' : arrival.stopsAway ? `${arrival.stopsAway} stops away` : null,
      ].filter(Boolean).join(' · ') || null;
    } else {
      headline = `Your stop: ${myStop.name}`;
      detail = arrival.scheduled
        ? `Timetable ${arrival.scheduled}${fresh ? '' : direction === 'return' ? ' (evening)' : ' (morning)'}`
        : null;
    }
  } else if (fresh && summary) {
    headline = summary.headline;
    detail = summary.detail;
  } else {
    headline = fresh ? 'The bus is on the road' : 'Waiting for the bus to start';
    detail = null;
  }

  const travel = [...timetable].sort((a, b) => (direction === 'onward' ? a.order - b.order : b.order - a.order));
  const stateOf = new Map(mapStops.map((s) => [s.id, s.state]));

  return (
    <div className="-mx-4 -mb-24 -mt-6 flex h-[calc(100dvh_-_7.0625rem_-_env(safe-area-inset-bottom)_-_var(--pwa-banner-h,0px))] flex-col overflow-hidden sm:-mx-6 lg:-mb-6 lg:h-[calc(100dvh_-_4rem_-_var(--pwa-banner-h,0px))] lg:flex-row">
      {/* `isolate` keeps Leaflet's high z-indexes inside the map box. */}
      <div className="relative isolate min-h-0 flex-1">
        <LivePositionMap
          latitude={centre.lat}
          longitude={centre.lng}
          label={busNumber ? `Bus ${busNumber}` : 'Bus'}
          heading={fresh ? heading : null}
          accuracyM={fresh ? accuracyM : null}
          destination={CAMPUS}
          viewer={viewer}
          stops={mapStops}
          routeStopCount={timetable.length || undefined}
          routeGeometry={fresh ? roadGeometry : undefined}
          busState={busState}
        />
      </div>

      <section
        aria-label="Bus details"
        className="flex shrink-0 flex-col border-t border-gray-200 bg-white shadow-[0_-6px_18px_rgba(0,0,0,0.10)] dark:border-gray-800 dark:bg-gray-900 lg:w-[380px] lg:border-l lg:border-t-0 lg:shadow-none"
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full px-4 pb-3 pt-2 text-left lg:pointer-events-none lg:pt-4"
        >
          <span className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600 lg:hidden" />
          <span className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {status.ping && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />}
                <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', status.dot)} />
              </span>
              <span className="truncate">{status.text}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-2">
              {busNumber && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Bus className="h-3.5 w-3.5" />
                  {busNumber}
                </span>
              )}
              <ChevronUp className={cn('h-5 w-5 text-gray-400 transition-transform lg:hidden', expanded && 'rotate-180')} />
            </span>
          </span>
          <span className="mt-2 block text-lg font-bold leading-snug text-gray-900 dark:text-white">{headline}</span>
          {detail && <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-400">{detail}</span>}
          <span className="mt-1 block truncate text-xs text-gray-500 dark:text-gray-400">
            {routeLabel}
            <span className="lg:hidden"> · {expanded ? 'tap to close' : 'tap for all stops'}</span>
          </span>
        </button>

        <div
          className={cn(
            'min-h-0 overflow-y-auto border-t border-gray-100 px-4 dark:border-gray-800 lg:block lg:flex-1',
            expanded ? 'block max-h-[38dvh] lg:max-h-none' : 'hidden',
          )}
        >
          {travel.length > 0 && (
            <ol className="py-3">
              {travel.map((s) => {
                const st = stateOf.get(s.id);
                const mine = s.id === myStopId;
                const t = (direction === 'return' ? s.eveningTime : s.time)?.slice(0, 5) ?? '—';
                return (
                  <li
                    key={s.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2 py-2',
                      mine && 'bg-pink-50 dark:bg-pink-950/30',
                    )}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: mine ? STOP_COLORS.mine : st === 'passed' ? STOP_COLORS.passed : STOP_COLORS.upcoming }}
                    >
                      {s.order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', st === 'passed' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white', (mine || st === 'next') && 'font-semibold')}>
                        {s.name}
                      </span>
                      {(mine || st === 'next' || st === 'passed') && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {[mine ? 'Your stop' : null, st === 'next' ? 'Bus is heading here' : st === 'passed' ? 'Bus has passed' : null].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-gray-600 dark:text-gray-300">{t}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {fresh && position && (
            <div className="border-t border-gray-100 py-3 dark:border-gray-800">
              <BusContextStrip
                position={position}
                heading={heading}
                speedKmh={speedKmh}
                accuracyM={accuracyM}
                direction={direction}
                viewer={viewer}
                viewerStatus={viewerStatus}
                viewerMessage={viewerMessage}
                onLocateMe={onLocateMe}
              />
            </div>
          )}

          <p className="border-t border-gray-100 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            {fresh
              ? 'Times marked "about" are estimates from the timetable and how late the bus is running.'
              : 'The bus appears on the map when its driver starts the trip. This screen updates by itself.'}
            {mapStops.length === 0 && timetable.length > 0 ? ' Stop positions for this route are not on the map yet.' : ''}
          </p>
        </div>
      </section>
    </div>
  );
}
