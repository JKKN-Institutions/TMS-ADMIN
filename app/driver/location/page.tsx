'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  MapPin, Navigation, AlertTriangle, Gauge, Clock, Bus, Radio, Crosshair,
} from 'lucide-react';
import { Spinner, NoticeCard, PageHeader } from '@/components/driver/ui';
import { useLiveTracking } from '@/lib/driver/use-live-tracking';
import { cn } from '@/lib/utils';
import { isNativeApp } from '@/lib/native/platform';

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

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedRouteId && routes.length > 0) setSelectedRouteId(routes[0].id);
  }, [routes, selectedRouteId]);

  const { status, banner, onDuty, fix, lastSentAt, start, stop } = useLiveTracking(selectedRouteId);

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

          <button
            type="button"
            onClick={() => (onDuty ? void stop(true) : void start())}
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

              {fix && (
                <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                  <LivePositionMap latitude={fix.lat} longitude={fix.lng} label="You are here" />
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isNativeApp()
              ? 'Location keeps sharing in the background while you are On Duty — you can lock the phone or switch apps. A notification shows while sharing.'
              : 'Keep this page open with the screen on while driving. Sharing pauses if you switch apps or the screen locks — that’s a limitation of web browsers.'}
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
