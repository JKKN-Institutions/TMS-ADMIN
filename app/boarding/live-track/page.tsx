'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Bus, MapPin, AlertTriangle, Gauge, Clock, Navigation, Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const LivePositionMap = dynamic(() => import('@/components/live-position-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

interface Vehicle {
  registrationNumber: string | null;
  model: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  lastUpdate: string | null;
  liveTrackingEnabled: boolean;
  hasFix: boolean;
  status: 'online' | 'recent' | 'offline';
  minutesAgo: number | null;
}
interface RouteInfo {
  id: string;
  label: string;
}

async function fetchBus(): Promise<{ route: RouteInfo | null; vehicle: Vehicle | null }> {
  const res = await fetch('/api/boarding/location', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load location');
  return (await res.json()).data as { route: RouteInfo | null; vehicle: Vehicle | null };
}

function formatUpdated(ts: string | null): string {
  if (!ts) return 'never';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function NoticeCard({
  tone,
  icon: Icon,
  title,
  body,
}: {
  tone: 'amber' | 'red';
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  const tones = {
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{body}</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
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

export default function BoardingLiveTrackPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['boarding-live-track'],
    queryFn: fetchBus,
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
      </div>
    );
  }
  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load the bus"
        body="Something went wrong. Please refresh or try again shortly."
      />
    );
  }

  const route = data?.route ?? null;
  const v = data?.vehicle ?? null;

  if (!route) {
    return (
      <NoticeCard
        tone="amber"
        icon={RouteIcon}
        title="No route assigned"
        body="You're not assigned to a route yet, so there's no bus to track. Ask an admin to assign you to a route."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Live bus location</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          Live position of the bus on your route ({route.label}).
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{route.label}</h2>
          </div>
          {v && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <Bus className="h-3.5 w-3.5" />
              {v.registrationNumber ?? '—'}
            </span>
          )}
        </div>

        <div className="px-6 py-5">
          {v && v.hasFix && v.status !== 'offline' ? (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 ring-1 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                </span>
                {v.status === 'online' ? 'Live now' : `Updated ${v.minutesAgo ?? '?'} min ago`}
              </div>

              <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <LivePositionMap
                  latitude={v.latitude as number}
                  longitude={v.longitude as number}
                  label={`Bus ${v.registrationNumber ?? ''}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat icon={Navigation} label="Coordinates" value={`${v.latitude}, ${v.longitude}`} />
                <Stat icon={Gauge} label="Speed" value={v.speed != null ? `${v.speed} km/h` : '—'} />
                <Stat icon={Clock} label="Last update" value={formatUpdated(v.lastUpdate)} />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 p-5 dark:border-gray-700">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Bus isn&apos;t sharing its location right now</p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  The driver hasn&apos;t started sharing, or the last update is too old. This page refreshes
                  automatically. {v ? `Last update: ${formatUpdated(v.lastUpdate)}.` : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
