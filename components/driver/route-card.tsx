import type { ComponentType } from 'react';
import {
  MapPin, Flag, Bus, ArrowRight, IndianRupee, Milestone, Clock, CircleDot, Navigation, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStopTime } from '@/lib/driver/format';
import { Stat, DetailTile, Tag, TILE } from '@/components/driver/ui';
import type { TimetableStop } from '@/components/driver/route-timetable';

export interface DriverRouteDTO {
  id: string;
  routeNumber: string | null;
  routeName: string | null;
  startLocation: string | null;
  endLocation: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  distance: number | null;
  duration: string | null;
  totalCapacity: number | null;
  currentPassengers: number | null;
  passengerCount?: number | null; // allocated riders (counted live; current_passengers is stale)
  fare: number | null;
  status: string | null;
  label: string;
  stops: TimetableStop[];
  vehicle: { registrationNumber: string | null; model: string | null; capacity: number | null } | null;
}

const STATUS_TONE: Record<string, string> = {
  active: 'bg-white/20 text-white ring-1 ring-white/40',
  inactive: 'bg-white/10 text-white/80 ring-1 ring-white/20',
  maintenance: 'bg-amber-400/90 text-amber-950 ring-1 ring-amber-200/60',
};

function cap(s: string | null): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
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
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <div
        className={cn(
          'flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/70',
          align === 'right' && 'justify-end'
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate text-lg font-bold text-white">{place}</p>
      <p className="text-sm text-white/80">{time}</p>
    </div>
  );
}

/** Gradient "ticket" banner + a 4-up stat strip. */
export function RouteHero({ route }: { route: DriverRouteDTO }) {
  const statusKey = (route.status ?? '').toLowerCase();
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="relative isolate overflow-hidden bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-emerald-300/20 blur-2xl" />

        <div className="relative space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/30 backdrop-blur">
                <Bus className="h-3.5 w-3.5" />
                Route {route.routeNumber ?? '—'}
              </span>
              <h2 className="mt-2 text-xl font-bold leading-tight text-white sm:text-2xl">
                {route.routeName ?? 'Route'}
              </h2>
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

          <div className="flex items-center gap-3 sm:gap-5">
            <Endpoint label="From" place={route.startLocation ?? '—'} time={formatStopTime(route.departureTime)} icon={MapPin} />
            <ArrowRight className="h-5 w-5 shrink-0 text-white/70 sm:hidden" />
            <div className="hidden min-w-[96px] flex-col items-center justify-center sm:flex">
              <div className="relative flex w-full items-center">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
                <span className="flex-1 border-t-2 border-dashed border-white/50" />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
                <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md">
                  <Bus className="h-4 w-4 text-green-600" />
                </span>
              </div>
              <span className="mt-2 text-[10px] font-medium uppercase tracking-wide text-white/80">
                {route.duration ?? '—'}
              </span>
            </div>
            <Endpoint label="To" place={route.endLocation ?? '—'} time={formatStopTime(route.arrivalTime)} icon={Flag} align="right" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-gray-800 lg:grid-cols-4">
        <Stat icon={IndianRupee} label="Fare" value={route.fare != null ? `₹${route.fare}` : '—'} tone="orange" />
        <Stat icon={Milestone} label="Distance" value={route.distance != null ? `${route.distance} km` : '—'} tone="blue" />
        <Stat icon={Clock} label="Travel time" value={route.duration ?? '—'} tone="purple" />
        <Stat icon={CircleDot} label="Total stops" value={String(route.stops.length)} tone="green" />
      </div>
    </section>
  );
}

/** Vertical stops timeline with morning + evening times. */
function StopsTimeline({ stops }: { stops: TimetableStop[] }) {
  if (stops.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No stops configured for this route yet.</p>;
  }
  return (
    <ol className="relative">
      {stops.map((s, i) => {
        const isFirst = i === 0;
        const isLast = i === stops.length - 1;
        return (
          <li key={s.id} className="relative flex gap-4 pb-7 last:pb-0">
            {!isLast && (
              <span className="absolute left-4 top-8 bottom-0 w-0.5 -translate-x-1/2 bg-gray-200 dark:bg-gray-700" />
            )}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white dark:ring-gray-900',
                s.isMajor
                  ? 'border-2 border-green-500 bg-white text-green-700 dark:bg-gray-900 dark:text-green-300'
                  : 'border border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
              )}
            >
              {s.order ?? i + 1}
            </span>
            <div className="-mt-0.5 flex flex-1 flex-col gap-1.5 rounded-lg px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p
                  className={cn(
                    'break-words font-medium sm:truncate',
                    s.isMajor ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  {s.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {isFirst && <Tag tone="green">Start</Tag>}
                  {isLast && <Tag tone="indigo">Destination</Tag>}
                  {s.isMajor && !isFirst && !isLast && <Tag tone="gray">Major</Tag>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-sm tabular-nums sm:flex-col sm:items-end sm:gap-0.5 sm:text-right">
                <div className="flex items-baseline gap-1 text-gray-700 dark:text-gray-300">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Morning</span>
                  {formatStopTime(s.time)}
                </div>
                <div className="flex items-baseline gap-1 text-gray-700 dark:text-gray-300">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Evening</span>
                  {formatStopTime(s.eveningTime)}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Full route view: hero + stat strip, then stops timeline (2/3) + vehicle tile (1/3). */
export function RouteCard({ route }: { route: DriverRouteDTO }) {
  // Seat capacity comes from the assigned vehicle (reliable); fall back to the route's
  // total_capacity only when it's a real number (it's 0 for most routes).
  const seats =
    route.vehicle?.capacity ??
    (route.totalCapacity && route.totalCapacity > 0 ? route.totalCapacity : null);
  return (
    <div className="space-y-6">
      <RouteHero route={route} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="order-2 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:order-1 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
            <Navigation className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Route stops</h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {route.stops.length}
            </span>
          </div>
          <div className="px-6 py-5">
            <StopsTimeline stops={route.stops} />
          </div>
        </section>

        <div className="order-1 grid content-start gap-6 sm:grid-cols-2 lg:order-2 lg:grid-cols-1">
          <DetailTile
            icon={Bus}
            tone="green"
            label="Vehicle"
            value={route.vehicle?.registrationNumber ?? 'Not assigned'}
            sub={
              route.vehicle && (route.vehicle.model || route.vehicle.capacity != null) ? (
                <span className="flex items-center gap-2">
                  {route.vehicle.model && <span className="truncate">{route.vehicle.model}</span>}
                  {route.vehicle.capacity != null && (
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <Users className="h-3 w-3" />
                      {route.vehicle.capacity} seats
                    </span>
                  )}
                </span>
              ) : undefined
            }
          />
          <DetailTile
            icon={Users}
            tone="blue"
            label="Occupancy"
            value={
              seats != null
                ? `${route.passengerCount ?? 0} / ${seats}`
                : route.passengerCount != null
                  ? `${route.passengerCount} riders`
                  : '—'
            }
            sub={seats != null ? `${seats}-seat bus` : undefined}
          />
        </div>
      </div>
    </div>
  );
}
