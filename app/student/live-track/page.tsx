'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { AlertTriangle, Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewerLocation } from '@/lib/hooks/use-viewer-location';
import { useLiveBus } from '@/hooks/use-live-bus';
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
  /** The learner's own boarding stop. */
  myStopId?: string | null;
  direction?: TripDirection;
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
  // A failed background refresh keeps the last good answer on screen.
  if (error && !data) {
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

  const bus = data?.data;
  const route = bus?.route ?? null;
  const v = bus?.vehicle ?? null;
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

  // A broadcast fix outranks the polled snapshot when it is genuinely newer.
  // Compared as parsed epoch milliseconds — primitives, never object identity.
  const polledAtMs = v?.lastUpdate ? Date.parse(v.lastUpdate) : 0;
  const liveAtMs = liveFix?.at ? Date.parse(liveFix.at) : 0;
  const useLive = !!liveFix && liveAtMs > polledAtMs;

  const lat = useLive ? liveFix.latitude : v?.latitude ?? null;
  const lng = useLive ? liveFix.longitude : v?.longitude ?? null;
  // Both sources report speed in METRES PER SECOND.
  const speedMs = useLive ? liveFix.speed : v?.speed ?? null;
  // A broadcast we just received IS live, whatever the last poll said.
  const fresh = useLive || (!!v && v.hasFix && v.status !== 'offline');

  return (
    <LiveTrackScreen
      routeLabel={route.label}
      busNumber={v?.registrationNumber ?? null}
      position={lat != null && lng != null ? { lat, lng } : null}
      fresh={fresh && lat != null && lng != null}
      liveNow={useLive || v?.status === 'online'}
      minutesAgo={v?.minutesAgo ?? null}
      lastUpdateIso={useLive ? liveFix.at : v?.lastUpdate ?? null}
      heading={useLive ? liveFix.heading : v?.heading ?? null}
      accuracyM={useLive ? liveFix.accuracyM : v?.accuracyM ?? null}
      speedKmh={speedMs != null ? speedMs * 3.6 : null}
      pins={bus?.stops ?? []}
      timetable={bus?.timetable ?? []}
      direction={bus?.direction ?? inferDirection(null, Date.now())}
      myStopId={bus?.myStopId ?? null}
      roadGeometry={bus?.roadRoute?.geometry}
      viewer={viewer}
      viewerStatus={viewerStatus}
      viewerMessage={viewerMessage}
      onLocateMe={onLocateMe}
    />
  );
}
