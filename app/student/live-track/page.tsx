'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Bus, MapPin, AlertTriangle, Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BusContextStrip } from '@/components/live/bus-context-strip';
import { useViewerLocation } from '@/lib/hooks/use-viewer-location';
import { CAMPUS } from '@/lib/gps/campus';
import { useLiveBus } from '@/hooks/use-live-bus';
import type { RoadRoute } from '@/lib/geo/route-to-campus';

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
  heading: number | null;
  accuracyM: number | null;
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
interface BusData {
  route: RouteInfo | null;
  vehicle: Vehicle | null;
  roadRoute?: RoadRoute | null;
  /** Server-supplied Realtime topic; never constructed client-side. */
  realtimeTopic?: string | null;
}
type Resp = { data?: BusData; notFound?: boolean };

async function fetchBus(): Promise<Resp> {
  const res = await fetch('/api/student/location', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load location');
  return { data: (await res.json()).data as BusData };
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

export default function StudentLiveTrackPage() {
  // Subscribed BEFORE the query below reads `pollIntervalMs`, so the poll starts at
  // the fallback cadence and slows only once the socket is actually up.
  const [topic, setTopic] = useState<string | null>(null);
  const { fix: liveFix, pollIntervalMs } = useLiveBus(topic);

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-live-track'],
    queryFn: fetchBus,
    refetchInterval: pollIntervalMs,
  });

  // The topic comes from the server response — a string, so it is safe in a
  // dependency array and cannot be forged by the client.
  const serverTopic = data?.data?.realtimeTopic ?? null;
  useEffect(() => {
    setTopic(serverTopic);
  }, [serverTopic]);

  const { viewer, status: viewerStatus, message: viewerMessage, request: onLocateMe } = useViewerLocation();

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
        title="Couldn't load your bus"
        body="Something went wrong. Please refresh or try again shortly."
      />
    );
  }
  if (data?.notFound) {
    return (
      <NoticeCard
        tone="amber"
        icon={AlertTriangle}
        title="No transport profile"
        body="We couldn't find a transport profile linked to your account. Contact the transport office."
      />
    );
  }

  const route = data?.data?.route ?? null;
  const v = data?.data?.vehicle ?? null;
  const roadRoute = data?.data?.roadRoute ?? null;

  // A broadcast fix outranks the polled snapshot when it is genuinely newer.
  // Compared as parsed epoch milliseconds — primitives, never object identity.
  const polledAtMs = v?.lastUpdate ? Date.parse(v.lastUpdate) : 0;
  const liveAtMs = liveFix?.at ? Date.parse(liveFix.at) : 0;
  const useLive = !!liveFix && liveAtMs > polledAtMs;

  const shownLat = useLive ? liveFix.latitude : v?.latitude ?? null;
  const shownLng = useLive ? liveFix.longitude : v?.longitude ?? null;
  const shownHeading = useLive ? liveFix.heading : v?.heading ?? null;
  const shownAccuracyM = useLive ? liveFix.accuracyM : v?.accuracyM ?? null;
  // Both sources report speed in METRES PER SECOND.
  const shownSpeedMs = useLive ? liveFix.speed : v?.speed ?? null;
  const shownUpdatedIso = useLive ? liveFix.at : v?.lastUpdate ?? null;
  // A live broadcast proves the bus is reporting right now, whatever the last poll said.
  const hasShownFix = shownLat != null && shownLng != null;

  if (!route) {
    return (
      <NoticeCard
        tone="amber"
        icon={RouteIcon}
        title="No route allocated yet"
        body="You don't have a transport route allocated, so there's no bus to track."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Track my bus</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          Live position of the bus on your route ({route.label}).
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-800 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">{route.label}</h2>
          </div>
          {v && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <Bus className="h-3.5 w-3.5" />
              {v.registrationNumber ?? '—'}
            </span>
          )}
        </div>

        <div className="px-4 py-5 sm:px-6">
          {hasShownFix && (useLive || (v && v.hasFix && v.status !== 'offline')) ? (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 ring-1 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                </span>
                {/* A broadcast we just received IS live, whatever the last poll said. */}
                {useLive || v?.status === 'online' ? 'Live now' : `Updated ${v?.minutesAgo ?? '?'} min ago`}
              </div>

              <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <LivePositionMap
                  latitude={shownLat as number}
                  longitude={shownLng as number}
                  label={`Bus ${v?.registrationNumber ?? ''}`}
                  heading={shownHeading}
                  accuracyM={shownAccuracyM}
                  destination={CAMPUS}
                  viewer={viewer}
                  routeGeometry={roadRoute?.geometry}
                />
              </div>

              <BusContextStrip
                position={{ lat: shownLat as number, lng: shownLng as number }}
                heading={shownHeading}
                speedKmh={shownSpeedMs != null ? shownSpeedMs * 3.6 : null}
                accuracyM={shownAccuracyM}
                viewer={viewer}
                viewerStatus={viewerStatus}
                viewerMessage={viewerMessage}
                onLocateMe={onLocateMe}
              />

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last update: {formatUpdated(shownUpdatedIso)}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 p-5 dark:border-gray-700">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Bus isn&apos;t sharing its location right now</p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Your driver hasn&apos;t started sharing, or the last update is too old. This page refreshes
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
