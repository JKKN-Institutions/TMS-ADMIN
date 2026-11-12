'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveBus } from '@/hooks/use-live-bus';
import { clockOffsetMs } from '@/lib/gps/liveness';
import type { ComponentType } from 'react';
import { AlertTriangle, Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewerLocation } from '@/lib/hooks/use-viewer-location';
import type { RoadRoute } from '@/lib/geo/route-to-campus';
import { inferDirection, type StopPin, type TripDirection } from '@/lib/stops/progress';
import type { TimetableStop } from '@/lib/stops/arrival';
import { LiveTrackScreen } from '@/components/live/live-track-screen';

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
  /** The route's stops that have a confirmed map location. */
  stops?: StopPin[];
  /** Every stop on the route, located or not. */
  timetable?: TimetableStop[];
  direction?: TripDirection;
  /** Server-supplied Realtime topic; never constructed client-side. */
  realtimeTopic?: string | null;
  /** The server's time when it answered. */
  serverNow?: string;
  /** Only in the answer to ?path=1: the road the bus drives. */
  routePath?: [number, number][] | null;
}

async function fetchBus(): Promise<BusData> {
  const res = await fetch('/api/boarding/location', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load location');
  return (await res.json()).data as BusData;
}

/** The road the bus drives. Asked for once per visit — it does not change while you watch. */
async function fetchRoutePath(): Promise<[number, number][] | null> {
  const res = await fetch('/api/boarding/location?path=1', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return null;
  return ((await res.json()).data as BusData | undefined)?.routePath ?? null;
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

export default function BoardingLiveTrackPage() {
  // Subscribed BEFORE the query reads `pollIntervalMs`: the poll starts at the 5 s
  // fallback and slows only once the live feed is actually connected.
  const [topic, setTopic] = useState<string | null>(null);
  const { fix: liveFix, pollIntervalMs } = useLiveBus(topic);

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['boarding-live-track'],
    queryFn: fetchBus,
    refetchInterval: pollIntervalMs,
  });
  // The topic is a string from the server: safe in a dependency array.
  const serverTopic = data?.realtimeTopic ?? null;
  useEffect(() => {
    setTopic(serverTopic);
  }, [serverTopic]);
  const { data: routePath } = useQuery({
    queryKey: ['boarding-route-path'],
    queryFn: fetchRoutePath,
    staleTime: Infinity,
  });
  const { viewer, status: viewerStatus, message: viewerMessage, request: onLocateMe } = useViewerLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
      </div>
    );
  }
  // A failed background refresh keeps the last good answer on screen.
  if (error && !data) {
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
  const roadRoute = data?.roadRoute ?? null;

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

  // A broadcast position outranks the polled one when it is genuinely newer.
  const polledAtMs = v?.lastUpdate ? Date.parse(v.lastUpdate) : 0;
  const useLive = !!liveFix && (liveFix.at ? Date.parse(liveFix.at) : 0) > polledAtMs;
  const lat = useLive ? liveFix.latitude : v?.latitude ?? null;
  const lng = useLive ? liveFix.longitude : v?.longitude ?? null;
  const speedMs = useLive ? liveFix.speed : v?.speed ?? null;
  const hasPosition = lat != null && lng != null;

  return (
    <LiveTrackScreen
      routeLabel={route.label}
      busNumber={v?.registrationNumber ?? null}
      position={hasPosition ? { lat, lng } : null}
      fresh={hasPosition && (useLive || (!!v && v.hasFix && v.status !== 'offline'))}
      lastUpdateIso={useLive ? liveFix.at : v?.lastUpdate ?? null}
      heading={useLive ? liveFix.heading : v?.heading ?? null}
      accuracyM={useLive ? liveFix.accuracyM : v?.accuracyM ?? null}
      speedKmh={speedMs != null ? speedMs * 3.6 : null}
      pins={data?.stops ?? []}
      timetable={data?.timetable ?? []}
      direction={data?.direction ?? inferDirection(null, Date.now())}
      roadGeometry={roadRoute?.geometry}
      routePath={routePath ?? null}
      clockOffsetMs={clockOffsetMs(data?.serverNow, dataUpdatedAt)}
      viewer={viewer}
      viewerStatus={viewerStatus}
      viewerMessage={viewerMessage}
      onLocateMe={onLocateMe}
    />
  );
}
