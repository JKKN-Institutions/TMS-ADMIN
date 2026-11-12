'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { X, Navigation, Clock, Gauge, Crosshair, ExternalLink, AlertTriangle } from 'lucide-react';
import { CAMPUS } from '@/lib/gps/campus';
import type { FleetResponse, FleetRoute } from '@/app/(admin)/track-all/types';
import type { StopPin, TripDirection } from '@/lib/stops/progress';
import { useRouteStops } from '@/components/map/use-route-stops';
import { StopsCaption } from '@/components/live/stops-caption';

const LivePositionMap = dynamic(() => import('@/components/live-position-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-100">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

interface LiveGPSTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The route the vehicle runs on — needs at least `id`. */
  route: { id: string; route_number?: string | null; route_name?: string | null } | null;
  title: string;
}

/**
 * The same fleet read Track All uses. This popup used to query a `routes` table that
 * no longer exists, so it could only ever say "No GPS data"; reading the shared
 * endpoint means it can never disagree with Track All about where a bus is.
 */
async function fetchRoute(routeId: string): Promise<FleetRoute | null> {
  const res = await fetch('/api/admin/track-all/routes', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load the bus position');
  const json = (await res.json()) as FleetResponse;
  return json.routes.find((r) => r.routeId === routeId) ?? null;
}

async function fetchStops(routeId: string): Promise<{ pins: StopPin[]; total: number; direction: TripDirection }> {
  const res = await fetch(`/api/admin/routes/${routeId}/stop-locations`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load stops');
  const json = (await res.json()) as {
    direction: TripDirection;
    stops: Array<{
      id: string; name: string; order: number; time: string | null; eveningTime: string | null;
      isMajor: boolean; lat: number | null; lng: number | null; confirmed: boolean;
    }>;
  };
  const pins: StopPin[] = [];
  for (const s of json.stops) {
    if (s.confirmed && s.lat != null && s.lng != null) {
      pins.push({ id: s.id, name: s.name, order: s.order, lat: s.lat, lng: s.lng, time: s.time, eveningTime: s.eveningTime, isMajor: s.isMajor });
    }
  }
  return { pins, total: json.stops.length, direction: json.direction };
}

const TONE: Record<FleetRoute['tone'], string> = {
  green: 'border-green-200 bg-green-50 text-green-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  gray: 'border-gray-200 bg-gray-50 text-gray-700',
};

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

export default function LiveGPSTrackingModal({ isOpen, onClose, route, title }: LiveGPSTrackingModalProps) {
  const routeId = route?.id ?? null;

  const { data: bus, isLoading, isError } = useQuery({
    queryKey: ['vehicle-live-track', routeId],
    queryFn: () => fetchRoute(routeId as string),
    enabled: isOpen && !!routeId,
    refetchInterval: 10_000,
  });
  const { data: stopData } = useQuery({
    queryKey: ['route-stop-locations', routeId],
    queryFn: () => fetchStops(routeId as string),
    enabled: isOpen && !!routeId,
    staleTime: 5 * 60_000,
  });

  const position = bus?.position ?? null;
  const { mapStops, summary } = useRouteStops(stopData?.pins, stopData?.direction, position?.lat, position?.lng);

  if (!isOpen) return null;

  const fresh = bus?.state === 'live' || bus?.state === 'recent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex max-h-[95dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">{title}</h2>
            <p className="truncate text-sm text-gray-600">
              Route {route?.route_number ?? '?'}
              {route?.route_name ? ` · ${route.route_name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
            </div>
          ) : isError || !bus ? (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Couldn&apos;t load this bus&apos;s position. Close and try again.
            </div>
          ) : (
            <>
              <div className={`rounded-lg border px-4 py-3 text-sm ${TONE[bus.tone]}`}>
                <span className="font-semibold">{bus.label}</span>
                <span> — {bus.reason}</span>
                {!fresh && position && <span> The map shows the last known position.</span>}
              </div>

              {position ? (
                <>
                  <StopsCaption summary={fresh ? summary : null} pinCount={mapStops.length} />
                  <div className="h-[55dvh] min-h-[340px] overflow-hidden rounded-xl border border-gray-200">
                    <LivePositionMap
                      latitude={position.lat}
                      longitude={position.lng}
                      label={bus.vehicle?.registrationNumber ? `Bus ${bus.vehicle.registrationNumber}` : 'Bus'}
                      busState={fresh ? 'live' : 'stale'}
                      heading={fresh ? bus.heading : null}
                      accuracyM={fresh ? bus.accuracyM : null}
                      destination={CAMPUS}
                      stops={mapStops}
                      routeStopCount={stopData?.total}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat
                      icon={Gauge}
                      label="Speed"
                      value={fresh && bus.speedKmh != null ? `${Math.round(bus.speedKmh)} km/h` : '—'}
                    />
                    <Stat
                      icon={Navigation}
                      label="To campus"
                      value={bus.distanceToCampusKm != null ? `${bus.distanceToCampusKm.toFixed(1)} km` : '—'}
                    />
                    <Stat
                      icon={Crosshair}
                      label="GPS accuracy"
                      value={bus.accuracyM != null ? `±${Math.round(bus.accuracyM)} m` : '—'}
                    />
                    <Stat
                      icon={Clock}
                      label="Last update"
                      value={bus.lastFixAt ? new Date(bus.lastFixAt).toLocaleString() : '—'}
                    />
                  </div>

                  {mapStops.length === 0 && (
                    <p className="text-sm text-gray-600">
                      This route has no stop pins yet.{' '}
                      <a href={`/routes/${bus.routeId}/stop-locations`} className="font-medium text-violet-700 underline">
                        Set stop locations
                      </a>{' '}
                      to see them here.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-start gap-3 rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  This bus has never sent a position, so there is nothing to show on a map yet. It appears
                  once its driver taps START TRIP in the driver app.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          {position ? (
            <a
              href={`https://www.google.com/maps?q=${position.lat},${position.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> Open this spot in Google Maps
            </a>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
