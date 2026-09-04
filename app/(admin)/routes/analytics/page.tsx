'use client';

// Routes > Analytics.
//
// The operations board used to sit on the admin dashboard. It moved here
// because a nine-column operating table belongs in the module that owns
// routes: the dashboard's job is "is anything wrong", this page's job is
// "show me every route and let me dig".
//
// Reads as: how the fleet did today -> where the capacity went -> every route.

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Bus, MapPin, TrendingDown, UserX, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ChartCard, Legend, StatTile, VizTable, VizTooltip, VIZ_CSS, axisLine, axisTick, card,
  gridProps, num,
} from '../../_viz/kit';
import { RouteBoard } from './route-board';
import type { DashboardRouteRow } from '@/lib/dashboard/types';
import type { RouteAnalyticsSummary, RouteRankRow } from '@/lib/routes/analytics';

interface RouteAnalyticsPayload {
  date: string;
  routes: DashboardRouteRow[];
  summary: RouteAnalyticsSummary;
  busiest: RouteRankRow[];
  noShows: RouteRankRow[];
  degraded: string[];
}

async function fetchRouteAnalytics(): Promise<RouteAnalyticsPayload> {
  const res = await fetch('/api/admin/routes/analytics');
  if (!res.ok) throw new Error(`Route analytics request failed: ${res.status}`);
  const json = await res.json();
  if (!json.success || !json.data) throw new Error('Invalid route analytics response');
  return json.data as RouteAnalyticsPayload;
}

export default function RouteAnalyticsPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['route-analytics'],
    queryFn: fetchRouteAnalytics,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load route analytics');
  }, [isError]);

  const s = data?.summary;

  return (
    <div className="viz-scope space-y-5">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/routes"
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Routes
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Route analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `Every active route for ${formatDate(data.date)}.` : 'Loading today’s runs…'}
          </p>
        </div>
      </div>

      {data && data.degraded.length > 0 && (
        <div
          className={`${card} flex items-start gap-3 border-l-4 p-4`}
          style={{ borderLeftColor: 'var(--viz-warning)' }}
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--viz-warning)' }} aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">Some figures could not be loaded</p>
            <p className="mt-0.5 break-words text-muted-foreground">
              {data.degraded.join(', ')} — shown as 0, so don’t rely on them.
            </p>
          </div>
        </div>
      )}

      {/* Fleet roll-up */}
      {isPending ? (
        <TilesSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Seats booked"
            value={num(s?.totalBooked ?? 0)}
            sub={
              s?.seatUtilisation == null
                ? 'No buses assigned'
                : `${s.seatUtilisation}% of ${num(s.seatsRunning)} seats running`
            }
            Icon={Users}
          />
          <StatTile
            label="Boarded"
            value={num(s?.totalBoarded ?? 0)}
            sub={s?.turnout == null ? 'Nothing booked to compare' : `${s.turnout}% fleet turnout`}
            Icon={Bus}
          />
          <StatTile
            label="Routes running"
            value={`${num(s?.routesRunning ?? 0)} of ${num(s?.totalRoutes ?? 0)}`}
            sub={`${num(s?.totalStops ?? 0)} stops across the network`}
            Icon={MapPin}
          />
          <StatTile
            label="Need attention"
            value={num(s?.flagged ?? 0)}
            sub={`${num(s?.routesWithoutBus ?? 0)} without a bus, ${num(s?.routesWithoutDriver ?? 0)} without a driver`}
            Icon={AlertTriangle}
            tone={(s?.flagged ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : undefined}
          />
        </div>
      )}

      {/* Where the capacity went */}
      {!isPending && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ChartCard
            title="Busiest routes"
            subtitle="Seats booked against riders actually boarded"
            hasData={(data?.busiest.length ?? 0) > 0}
            emptyMessage="No bookings on any route today"
            legend={
              <Legend
                items={[
                  { label: 'Booked', color: 'var(--viz-context)' },
                  { label: 'Boarded', color: 'var(--viz-accent)' },
                ]}
              />
            }
            csv={{
              filename: `busiest-routes-${data?.date ?? 'today'}.csv`,
              head: ['Route', 'Destination', 'Booked', 'Boarded'],
              rows: (data?.busiest ?? []).map((r) => [r.routeNumber, r.routeName, r.booked, r.boarded]),
            }}
            chart={
              <ResponsiveContainer width="100%" height={Math.max(240, (data?.busiest.length ?? 0) * 34 + 24)}>
                <BarChart
                  data={data?.busiest ?? []}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
                  barGap={2}
                >
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="routeNumber"
                    tick={axisTick}
                    axisLine={axisLine}
                    tickLine={false}
                    width={34}
                  />
                  <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
                  <Bar dataKey="booked" name="Booked" fill="var(--viz-context)" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="boarded" name="Boarded" fill="var(--viz-accent)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            }
            table={
              <VizTable
                head={['Route', 'Destination', 'Booked', 'Boarded']}
                rows={(data?.busiest ?? []).map((r) => [
                  r.routeNumber, r.routeName, num(r.booked), num(r.boarded),
                ])}
              />
            }
          />

          <section className={`${card} p-5`}>
            <div className="flex items-start gap-2.5">
              <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">Seats reserved, not used</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ranked by riders missing, not percentage — a big gap on a full bus wastes more
                  capacity than a small one on a quiet route.
                </p>
              </div>
            </div>

            {(data?.noShows.length ?? 0) === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">
                Every booked seat was used today.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {(data?.noShows ?? []).map((r) => {
                  const gap = r.booked - r.boarded;
                  return (
                    <li key={r.routeNumber} className="flex items-center gap-3 py-2.5">
                      <span className="w-8 shrink-0 text-base font-semibold tabular-nums text-foreground">
                        {r.routeNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {r.routeName}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {num(r.boarded)} of {num(r.booked)}
                      </span>
                      <span
                        className="w-16 shrink-0 text-right text-sm font-medium tabular-nums"
                        style={{ color: 'var(--viz-serious)' }}
                      >
                        −{num(gap)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {(s?.routesWithoutDriver ?? 0) > 0 && (
              <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
                <UserX className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {num(s?.routesWithoutDriver ?? 0)} active{' '}
                {s?.routesWithoutDriver === 1 ? 'route has' : 'routes have'} no driver assigned.
              </p>
            )}
          </section>
        </div>
      )}

      {/* Every route */}
      {isPending ? <BoardSkeleton /> : <RouteBoard routes={data?.routes ?? []} />}
    </div>
  );
}

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

function TilesSkeletonCell() {
  return (
    <div className={`${card} p-5`}>
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-7 w-16 rounded bg-muted" />
        <div className="h-3 w-32 rounded bg-muted" />
      </div>
    </div>
  );
}

function TilesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <TilesSkeletonCell key={i} />
      ))}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className={`${card} animate-pulse overflow-hidden`}>
      <div className="border-b border-border px-5 py-4">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="mt-2 h-3 w-40 rounded bg-muted" />
      </div>
      <div className="space-y-4 p-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-5 w-7 shrink-0 rounded bg-muted" />
            <div className="h-3 w-48 shrink-0 rounded bg-muted" />
            <div className="h-3 w-32 shrink-0 rounded bg-muted" />
            <div className="h-3 w-28 shrink-0 rounded bg-muted" />
            <div className="h-3 flex-1 rounded bg-muted" />
            <div className="h-1.5 w-28 shrink-0 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
