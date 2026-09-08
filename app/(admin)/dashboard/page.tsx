'use client';

// Admin dashboard, laid out as an operations console.
//
// Reading order: what the operation consists of (KPI cards) -> how demand is
// moving and how full the buses are -> what needs attention -> today's boarding
// and route performance -> fleet, money and recent activity.
//
// Two deliberate omissions:
//   - No live vehicle map. Measured 2026-09-04: 0 of 35 buses reporting, 0 GPS
//     devices registered. A map hero would render empty, and an "Online 0 /
//     Offline 35" card is worse than no card. Revisit once GPS is rolled out.
//   - No nine-column route board. That lives at Routes > Analytics, which is
//     where you go to dig; the compact table here is a top-N, not a copy.

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, BarChart3, Bus, Calendar, Car, CalendarCheck, ClipboardCheck,
  GraduationCap, Receipt, RefreshCw, Route as RouteIcon, Settings, UserCheck, Wallet,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/providers/auth-provider';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { percentOf } from '@/lib/dashboard/format';
import { LOW_OCCUPANCY_PCT, routeOccupancy } from '@/lib/dashboard/occupancy';
import type { DashboardPayload } from '@/lib/dashboard/types';
import { VIZ_CSS, inr, inrCompact, num, panel } from '../_viz/kit';
import { ActivityPanel, Panel, Row } from './panels';
import {
  AttentionStat, FeesDonut, HourBars, JumpCard, JumpGrid, KpiCard, KpiGrid,
  TurnoutRing, UtilisationBars, WarningPanel,
} from './console';
import { RoutePerformance } from './route-performance';
import { TrendChart } from './trend-chart';

async function fetchDashboard(): Promise<DashboardPayload> {
  const response = await fetch('/api/admin/dashboard');
  if (!response.ok) throw new Error(`Dashboard request failed: ${response.status}`);
  const result = await response.json();
  if (!result.success || !result.data) throw new Error('Invalid dashboard response');
  return result.data as DashboardPayload;
}

const QUICK_ACTIONS: Array<{
  title: string; desc: string; icon: LucideIcon; href: string; permission: string;
}> = [
  { title: 'Route analytics', desc: 'Every route, booked vs boarded', icon: RouteIcon, href: '/routes/analytics', permission: TMS_PERMISSIONS.ROUTES_VIEW },
  { title: 'Live tracking', desc: 'See every bus on the map', icon: Bus, href: '/track-all', permission: TMS_PERMISSIONS.TRACKING_VIEW },
  { title: 'Bookings', desc: 'Who is travelling and when', icon: CalendarCheck, href: '/bookings', permission: TMS_PERMISSIONS.BOOKINGS_VIEW },
  { title: 'Attendance', desc: 'Mark and review boardings', icon: ClipboardCheck, href: '/bookings/analytics', permission: TMS_PERMISSIONS.BOOKINGS_VIEW },
  { title: 'Fees', desc: 'Bills, payments and dues', icon: Receipt, href: '/fees', permission: TMS_PERMISSIONS.FEES_VIEW },
  { title: 'Schedules', desc: 'Routes, trips and timings', icon: Calendar, href: '/schedules', permission: TMS_PERMISSIONS.SCHEDULES_VIEW },
  { title: 'Analytics', desc: 'Full transport reporting', icon: BarChart3, href: '/analytics', permission: TMS_PERMISSIONS.REPORTS_VIEW },
  { title: 'Settings', desc: 'Configure the system', icon: Settings, href: '/settings', permission: TMS_PERMISSIONS.SETTINGS_MANAGE },
];

export default function DashboardPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { can, isLoading: permsLoading } = usePermissions();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    // isPending, not isFetching: the skeleton belongs to the first load only.
    // isFetching is also true during the silent 60s revalidation, which would
    // flash the whole page back to skeletons and throw away the cached render.
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ['dashboard-stats'], queryFn: fetchDashboard });

  useEffect(() => {
    if (isError) toast.error('Failed to load dashboard data');
  }, [isError]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
      toast.success('Dashboard refreshed');
    } finally {
      setRefreshing(false);
    }
  };

  const quickActions = useMemo(
    () => (permsLoading ? [] : QUICK_ACTIONS.filter((a) => can(a.permission))),
    [can, permsLoading]
  );
  const occupancy = useMemo(() => routeOccupancy(data?.routes ?? []), [data?.routes]);

  const loading = isPending || permsLoading;
  const today = data?.today;
  const prev = data?.yesterday ?? null;
  const turnout = today ? percentOf(today.present, today.bookings) : null;

  // Deltas are only drawn when a comparable earlier day was found; the API
  // walks back past non-running days so Monday isn't compared to a blank Sunday.
  const delta = (now?: number, before?: number) =>
    now === undefined || before === undefined ? null : now - before;

  // A KPI card links into its module only when the viewer can open it, so a
  // card never offers a jump that lands on /unauthorized. The figure itself
  // stays visible either way — the dashboard's own permission already allowed
  // it to be counted.
  const jump = (href: string, permission: string) =>
    can(permission) ? href : undefined;

  return (
    <div className="viz-scope space-y-5">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      {/* Header — greeting left, date right */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-foreground">
            Good {partOfDay()}, {firstName(profile?.full_name) || 'there'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Transport management overview</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end sm:shrink-0">
          <p className="text-sm text-muted-foreground">
            {data ? formatHeaderDate(data.today.date) : 'Loading'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
            {can(TMS_PERMISSIONS.ROUTES_VIEW) && (
              <button
                onClick={() => router.push('/routes/analytics')}
                className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-lg bg-green-600 px-3.5 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              >
                <RouteIcon className="mr-2 h-4 w-4" aria-hidden />
                Route analytics
              </button>
            )}
          </div>
        </div>
      </div>

      {/* A metric whose query failed must not read as a confident zero. */}
      {data && data.degraded.length > 0 && (
        <div
          className={`${panel} flex items-start gap-3 border-l-4 p-4`}
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

      {/* KPI cards — every figure jumps into the module that owns it */}
      {loading ? (
        <KpiSkeleton />
      ) : (
        <KpiGrid>
          <KpiCard
            label="Learners"
            value={num(data?.counts.learners.current ?? 0)}
            sub="bus required, active"
            icon={GraduationCap}
            href={jump('/passengers/learners', TMS_PERMISSIONS.ENROLLMENT_VIEW)}
          />
          {/* A count of expired documents is a problem, not a footnote, so the
              sub-line is toned rather than left as grey small print. */}
          <KpiCard
            label="Buses"
            value={num(data?.fleet.buses ?? 0)}
            sub={`${num(data?.fleet.expiredDocs ?? 0)} with an expired document`}
            subTone={(data?.fleet.expiredDocs ?? 0) > 0 ? 'var(--viz-warning)' : undefined}
            icon={Car}
            href={jump('/vehicles', TMS_PERMISSIONS.VEHICLES_VIEW)}
          />
          <KpiCard
            label="Routes"
            value={num(data?.fleet.routesActive ?? 0)}
            sub={`${num(data?.fleet.routesWithoutBus ?? 0)} without a bus`}
            subTone={(data?.fleet.routesWithoutBus ?? 0) > 0 ? 'var(--viz-warning)' : undefined}
            icon={RouteIcon}
            href={jump('/routes', TMS_PERMISSIONS.ROUTES_VIEW)}
          />
          <KpiCard
            label="Drivers"
            value={num(data?.counts.drivers.current ?? 0)}
            sub={`${num(data?.fleet.routesWithoutDriver ?? 0)} routes without one`}
            subTone={(data?.fleet.routesWithoutDriver ?? 0) > 0 ? 'var(--viz-warning)' : undefined}
            icon={UserCheck}
            href={jump('/drivers', TMS_PERMISSIONS.DRIVERS_VIEW)}
          />
          <KpiCard
            label="Collected today"
            value={inr(data?.finance.collectedToday ?? 0)}
            sub={`${inrCompact(data?.finance.collectedMonth ?? 0)} this month`}
            tone="var(--viz-good)"
            icon={Wallet}
            href={jump('/fees', TMS_PERMISSIONS.FEES_VIEW)}
          />
          <KpiCard
            label="Attendance"
            value={turnout === null ? '—' : `${turnout}%`}
            sub={`${num(today?.present ?? 0)} of ${num(today?.bookings ?? 0)} booked`}
            delta={delta(today?.present, prev?.present)}
            icon={ClipboardCheck}
            href={jump('/bookings/analytics', TMS_PERMISSIONS.BOOKINGS_VIEW)}
          />
        </KpiGrid>
      )}

      {/* Daily onboarding trend beside bus utilisation */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {loading ? <ChartSkeleton /> : <TrendChart trend={data?.trend ?? []} />}
        </div>

        <section className={`${panel} p-5`}>
          <h2 className="text-base font-semibold text-foreground">Bus utilisation</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Seats booked against the assigned bus, fullest first
          </p>
          <div className="mt-4">
            {loading ? <RowsSkeleton rows={5} /> : <UtilisationBars rows={occupancy} />}
          </div>
        </section>
      </div>

      {/* Needs attention — full width: three counted categories, then the list */}
      <section className={`${panel} overflow-hidden`}>
        <header
          className="flex items-center gap-2.5 border-b px-5 py-3.5"
          style={{ borderColor: 'var(--viz-panel-border)' }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--viz-warning)' }} aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Needs attention</h2>
        </header>

        {loading ? (
          <div className="p-5">
            <RowsSkeleton rows={4} />
          </div>
        ) : (
          <>
            <div
              className="flex flex-col divide-y sm:flex-row sm:divide-x sm:divide-y-0"
              style={{ borderColor: 'var(--viz-panel-border)' }}
            >
              <AttentionStat
                label="Bus pass requests"
                value={data?.attention.busPassOpen ?? 0}
                caption={`${num(data?.attention.busPassLast30 ?? 0)} raised in 30 days`}
                change={percentChange(data?.attention.busPassLast30, data?.attention.busPassPrev30)}
                href="/enrollment-requests"
              />
              <AttentionStat
                label="Document expiry"
                value={data?.attention.docsExpired ?? 0}
                caption={`${num(data?.attention.docsDueSoon ?? 0)} more due within 60 days`}
                href="/vehicles"
              />
              <AttentionStat
                label="Low occupancy"
                value={data?.attention.lowOccupancy ?? 0}
                caption={`of ${num(data?.attention.routesWithCapacity ?? 0)} routes, under ${LOW_OCCUPANCY_PCT}% full`}
                href="/routes/analytics"
              />
            </div>
            <div className="border-t p-5" style={{ borderColor: 'var(--viz-panel-border)' }}>
              <WarningPanel
                alerts={data?.alerts ?? []}
                unknown={(data?.degraded.length ?? 0) > 0}
                onRetry={handleRefresh}
              />
            </div>
          </>
        )}
      </section>

      {/* Boarding today beside route performance */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className={`${panel} p-5`}>
          <h2 className="text-base font-semibold text-foreground">Boarding today</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Riders scanned against seats booked
          </p>
          {loading ? (
            <RingSkeleton />
          ) : (
            <div className="mt-5 space-y-6">
              <TurnoutRing
                percent={turnout}
                boarded={today?.present ?? 0}
                booked={today?.bookings ?? 0}
              />
              <HourBars hours={today?.hourly ?? []} />
            </div>
          )}
        </section>

        <div className="xl:col-span-2">
          {loading ? <ChartSkeleton /> : <RoutePerformance routes={data?.routes ?? []} />}
        </div>
      </div>

      {/* Fleet, money and activity */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <Panel title="Fleet readiness" icon={Car} action={{ label: 'Vehicles', href: '/vehicles' }}>
          {loading ? (
            <RowsSkeleton rows={5} />
          ) : (
            <div>
              <Row label="Buses on record" value={num(data?.fleet.buses ?? 0)} href="/vehicles" />
              <Row
                label="Expired documents"
                value={num(data?.fleet.expiredDocs ?? 0)}
                tone={(data?.fleet.expiredDocs ?? 0) > 0 ? 'var(--viz-critical)' : undefined}
                href="/vehicles"
              />
              <Row label="Active routes" value={num(data?.fleet.routesActive ?? 0)} href="/routes" />
              <Row
                label="Routes without a bus"
                value={num(data?.fleet.routesWithoutBus ?? 0)}
                tone={(data?.fleet.routesWithoutBus ?? 0) > 0 ? 'var(--viz-serious)' : undefined}
                href="/routes"
              />
              <Row
                label="Routes without a driver"
                value={num(data?.fleet.routesWithoutDriver ?? 0)}
                tone={(data?.fleet.routesWithoutDriver ?? 0) > 0 ? 'var(--viz-serious)' : undefined}
                href="/routes"
              />
            </div>
          )}
        </Panel>

        <Panel title="Transport fees" icon={Wallet} action={{ label: 'Fees', href: '/fees' }}>
          {loading ? (
            <RowsSkeleton rows={4} />
          ) : (
            <FeesDonut
              paid={data?.finance.paidBills ?? 0}
              unpaid={data?.finance.unpaidBills ?? 0}
              outstanding={inrCompact(data?.finance.outstanding ?? 0)}
              collected={inr(data?.finance.collectedToday ?? 0)}
            />
          )}
        </Panel>

        <Panel
          title="Recent activity"
          icon={Activity}
          action={can(TMS_PERMISSIONS.ACTIVITY_VIEW) ? { label: 'All', href: '/activity-log' } : undefined}
        >
          {loading ? (
            <RowsSkeleton rows={6} />
          ) : (
            <ActivityPanel items={data?.activity ?? []} canView={can(TMS_PERMISSIONS.ACTIVITY_VIEW)} />
          )}
        </Panel>
      </div>

      {/* Jump to — the same card language as the KPI band, so the page has one
          idea of what a link into a module looks like. The heading sits outside
          the cards rather than wrapping them in a panel: a box of boxes reads
          as a settings list, which is what these shortcuts used to look like. */}
      {quickActions.length > 0 && (
        <section aria-labelledby="jump-to">
          <h2 id="jump-to" className="text-sm font-semibold text-foreground">Jump to</h2>
          <div className="mt-3">
            <JumpGrid>
              {quickActions.map((action) => (
                <JumpCard
                  key={action.href}
                  title={action.title}
                  desc={action.desc}
                  icon={action.icon}
                  href={action.href}
                />
              ))}
            </JumpGrid>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Loading states ───────────────────────────────────────────────────────────
// Skeletons rather than the old full-screen spinner, which returned a
// `min-h-screen` centred loader and blanked the entire admin shell on first
// paint. These hold the layout so nothing jumps when data lands.

function KpiSkeleton() {
  return (
    // Same grid, same card box and the same three text lines as the real
    // cards, so the row does not jump when the data lands.
    <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`${panel} min-h-[7rem] space-y-3 p-4`}>
          <div className="h-7 w-7 rounded-lg bg-muted" />
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-6 w-14 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function RingSkeleton() {
  return (
    <div className="mt-5 animate-pulse space-y-6">
      <div className="flex items-center gap-5">
        <div className="h-[132px] w-[132px] shrink-0 rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="h-4 w-24 rounded bg-muted" />
        </div>
      </div>
      <div className="h-16 w-full rounded bg-muted" />
    </div>
  );
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className={`${panel} animate-pulse p-5`}>
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="mt-4 h-[260px] w-full rounded bg-muted" />
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

/** "Thursday, 4 September" — the IST date the server measured "today" as. */
function formatHeaderDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Greeting matched to the two times of day this screen is actually used. */
function partOfDay(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/**
 * Percentage change between two measured periods, or null when the earlier
 * period is empty — a jump from zero has no meaningful percentage, and printing
 * "+Infinity%" or an arbitrary "+100%" would be inventing a figure.
 */
function percentChange(now?: number, before?: number): number | null {
  if (now === undefined || before === undefined || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

function firstName(fullName?: string | null): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}
