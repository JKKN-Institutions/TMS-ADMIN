'use client';

import { useQuery } from '@tanstack/react-query';
import type { ComponentType, ReactNode } from 'react';
import {
  Bus, MapPin, Flag, Clock, IndianRupee, Milestone, Navigation, User, Users,
  ArrowRight, AlertTriangle, Route as RouteIcon, CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Stop {
  id: string;
  name: string;
  time: string | null; // morning / inbound (to-college) pickup
  eveningTime: string | null; // evening / outbound (from-college) drop
  order: number | null;
  isMajor: boolean | null;
}
interface RouteData {
  id: string;
  routeNumber: string;
  routeName: string;
  startLocation: string | null;
  endLocation: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  distance: number | null;
  duration: number | null;
  fare: number | null;
  status: string | null;
  driverName: string | null;
  vehicle: { registrationNumber: string; model: string | null; capacity: number | null } | null;
  stops: Stop[];
}
type RouteResp = {
  data?: { route: RouteData | null; boardingStopId: string | null };
  notFound?: boolean;
};

async function fetchRoute(): Promise<RouteResp> {
  const res = await fetch('/api/student/route', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load route');
  const json = await res.json();
  return { data: json.data };
}

/* ----------------------------- formatting helpers ----------------------------- */

function fmtTime(t: string | null): string {
  if (!t) return '—';
  const parts = t.split(':');
  const hour = parseInt(parts[0], 10);
  if (Number.isNaN(hour)) return t;
  const minute = parts[1] ?? '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${ampm}`;
}

function fmtDuration(mins: number | null): string {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function fmtDistance(km: number | null): string {
  if (km == null) return '—';
  return `${km} km`;
}

function cap(s: string | null): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATUS_TONE: Record<string, string> = {
  active: 'bg-white/20 text-white ring-1 ring-white/40',
  inactive: 'bg-white/10 text-white/80 ring-1 ring-white/20',
  maintenance: 'bg-amber-400/90 text-amber-950 ring-1 ring-amber-200/60',
};

/* --------------------------------- sub-views ---------------------------------- */

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className={cn('w-9 h-9 shrink-0 rounded-lg flex items-center justify-center shadow-sm', tone)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {label}
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Endpoint({
  label,
  place,
  time,
  icon: Icon,
  align = 'left',
}: {
  label: string;
  place: string;
  time: string;
  icon: ComponentType<{ className?: string }>;
  align?: 'left' | 'right';
}) {
  return (
    <div className={cn('flex-1 min-w-0', align === 'right' && 'text-right')}>
      <div
        className={cn(
          'flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/70',
          align === 'right' && 'justify-end'
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-white truncate">{place}</p>
      <p className="text-sm text-white/80">{time}</p>
    </div>
  );
}

/* ---------------------------------- page -------------------------------------- */

export default function StudentRoutesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['student-route'], queryFn: fetchRoute });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load your route"
        body="Something went wrong while loading your route. Please refresh the page or try again shortly."
      />
    );
  }

  if (data?.notFound) {
    return (
      <NoticeCard
        tone="amber"
        icon={AlertTriangle}
        title="No transport profile"
        body="No learner record is linked to your account yet. Please contact the transport office to complete your setup."
      />
    );
  }

  const route = data?.data?.route ?? null;
  const boardingStopId = data?.data?.boardingStopId ?? null;

  if (!route) {
    return (
      <NoticeCard
        tone="amber"
        icon={RouteIcon}
        title="No route allocated yet"
        body="You don't have a transport route allocated yet. Once enrolled, your route and stops will appear here."
      />
    );
  }

  const statusKey = (route.status ?? '').toLowerCase();
  const stops = route.stops;
  const boardingStop = stops.find((s) => s.id === boardingStopId) ?? null;

  return (
    <div className="space-y-6">
      {/* ============================ HERO / TICKET ============================ */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {/* gradient banner */}
        <div className="relative isolate overflow-hidden bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 px-6 py-7 sm:px-8">
          {/* decorative depth */}
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-emerald-300/20 blur-2xl" />

          <div className="relative space-y-6">
            {/* title row */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/30 backdrop-blur">
                  <RouteIcon className="w-3.5 h-3.5" />
                  Route {route.routeNumber}
                </span>
                <h1 className="mt-2 text-xl sm:text-2xl font-bold text-white leading-tight">
                  {route.routeName}
                </h1>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize backdrop-blur',
                  STATUS_TONE[statusKey] ?? 'bg-white/15 text-white ring-1 ring-white/30'
                )}
              >
                {cap(route.status)}
              </span>
            </div>

            {/* journey strip */}
            <div className="flex items-center gap-3 sm:gap-5">
              <Endpoint
                label="From"
                place={route.startLocation ?? '—'}
                time={fmtTime(route.departureTime)}
                icon={MapPin}
              />

              {/* mobile arrow */}
              <ArrowRight className="w-5 h-5 shrink-0 text-white/70 sm:hidden" />

              {/* desktop connector */}
              <div className="hidden sm:flex flex-col items-center justify-center min-w-[96px]">
                <div className="relative flex w-full items-center">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
                  <span className="flex-1 border-t-2 border-dashed border-white/50" />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
                  <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md">
                    <Bus className="h-4 w-4 text-green-600" />
                  </span>
                </div>
                <span className="mt-2 text-[10px] font-medium uppercase tracking-wide text-white/80">
                  {fmtDuration(route.duration)}
                </span>
              </div>

              <Endpoint
                label="To"
                place={route.endLocation ?? '—'}
                time={fmtTime(route.arrivalTime)}
                icon={Flag}
                align="right"
              />
            </div>
          </div>
        </div>

        {/* stat strip — gap-px over a tinted bg renders crisp 1px dividers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 dark:bg-gray-800">
          <Stat
            icon={IndianRupee}
            label="Fare"
            value={route.fare != null ? `₹${route.fare}` : '—'}
            tone="bg-gradient-to-br from-orange-500 to-amber-600"
          />
          <Stat
            icon={Milestone}
            label="Distance"
            value={fmtDistance(route.distance)}
            tone="bg-gradient-to-br from-blue-500 to-indigo-600"
          />
          <Stat
            icon={Clock}
            label="Travel time"
            value={fmtDuration(route.duration)}
            tone="bg-gradient-to-br from-purple-500 to-violet-600"
          />
          <Stat
            icon={CircleDot}
            label="Total stops"
            value={String(stops.length)}
            tone="bg-gradient-to-br from-green-500 to-emerald-600"
          />
        </div>
      </section>

      {/* =================== STOPS (main) + DETAILS (sidebar) =================== */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---- stops timeline: spans 2/3 on desktop ---- */}
        <section className="order-2 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:order-1 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Route Stops</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {stops.length}
            </span>
          </div>
          {/* legend */}
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-600 ring-2 ring-green-200 dark:ring-green-900/50" />
              Your stop
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-green-500 bg-white dark:bg-gray-900" />
              Major
            </span>
          </div>
        </div>

        <div className="px-6 py-5">
          {stops.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No stops listed for this route.</p>
          ) : (
            <ol className="relative">
              {stops.map((s, i) => {
                const isBoarding = s.id === boardingStopId;
                const isFirst = i === 0;
                const isLast = i === stops.length - 1;
                return (
                  <li key={s.id} className="relative flex gap-4 pb-7 last:pb-0">
                    {/* connector line */}
                    {!isLast && (
                      <span className="absolute left-4 top-8 bottom-0 w-0.5 -translate-x-1/2 bg-gray-200 dark:bg-gray-700" />
                    )}

                    {/* node */}
                    <span
                      className={cn(
                        'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white dark:ring-gray-900',
                        isBoarding
                          ? 'bg-green-600 text-white ring-green-100 dark:ring-green-900/40'
                          : s.isMajor
                            ? 'border-2 border-green-500 bg-white text-green-700 dark:bg-gray-900 dark:text-green-300'
                            : 'border border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      )}
                    >
                      {s.order ?? i + 1}
                    </span>

                    {/* content — stacks on mobile (name wraps full-width over a compact
                        times row) and switches to name-left / times-right from sm up, so a
                        long stop name can never get squeezed/clipped on a narrow phone. */}
                    <div
                      className={cn(
                        '-mt-0.5 flex flex-1 flex-col gap-1.5 rounded-lg px-3 py-2 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3',
                        isBoarding
                          ? 'bg-green-50 dark:bg-green-950/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      )}
                    >
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'font-medium break-words sm:truncate',
                            isBoarding
                              ? 'text-green-700 dark:text-green-300'
                              : s.isMajor
                                ? 'text-gray-900 dark:text-white'
                                : 'text-gray-600 dark:text-gray-300'
                          )}
                        >
                          {s.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {isFirst && <Tag tone="green">Start</Tag>}
                          {isLast && <Tag tone="indigo">Destination</Tag>}
                          {isBoarding && <Tag tone="solid">Your stop</Tag>}
                          {s.isMajor && !isFirst && !isLast && !isBoarding && <Tag tone="gray">Major</Tag>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-sm tabular-nums sm:flex-col sm:items-end sm:gap-0.5 sm:text-right">
                        <div className="flex items-baseline gap-1 text-gray-700 dark:text-gray-300">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                            Morning
                          </span>
                          {fmtTime(s.time)}
                        </div>
                        <div className="flex items-baseline gap-1 text-gray-700 dark:text-gray-300">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                            Evening
                          </span>
                          {fmtTime(s.eveningTime)}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        </section>

        {/* ---- details sidebar: spans 1/3 on desktop, stacks on top on mobile ---- */}
        <div className="order-1 grid content-start gap-6 sm:grid-cols-2 lg:order-2 lg:grid-cols-1">
          {boardingStop && (
            <div className="flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm dark:border-green-900/50 dark:bg-green-950/30">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg">
                <MapPin className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-green-700/80 dark:text-green-300/70">
                  Your boarding stop
                </p>
                <p className="truncate text-base font-semibold text-green-800 dark:text-green-200">
                  {boardingStop.name}
                </p>
                <p className="text-xs text-green-700/80 dark:text-green-300/80">
                  Pickup {fmtTime(boardingStop.time)} · Drop {fmtTime(boardingStop.eveningTime)}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
              <User className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Driver
              </p>
              <p className="truncate text-base font-semibold text-gray-900 dark:text-white">
                {route.driverName ?? 'Not assigned'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg">
              <Bus className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Vehicle
              </p>
              <p className="truncate text-base font-semibold text-gray-900 dark:text-white">
                {route.vehicle ? route.vehicle.registrationNumber : 'Not assigned'}
              </p>
              {route.vehicle && (route.vehicle.model || route.vehicle.capacity != null) && (
                <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  {route.vehicle.model && <span className="truncate">{route.vehicle.model}</span>}
                  {route.vehicle.capacity != null && (
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <Users className="h-3 w-3" />
                      {route.vehicle.capacity} seats
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ small primitives ------------------------------ */

function Tag({ children, tone }: { children: ReactNode; tone: 'green' | 'indigo' | 'gray' | 'solid' }) {
  const tones: Record<string, string> = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    solid: 'bg-green-600 text-white',
  };
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
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
