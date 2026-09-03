'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, BarChart3, Bus, Calendar, Car, CalendarCheck, ClipboardCheck,
  GraduationCap, Plus, Receipt, RefreshCw, Route as RouteIcon, Settings, TrendingDown,
  TrendingUp, UserCheck, Wallet, type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/providers/auth-provider';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { trendOf, type TrendData } from '@/lib/stat-utils';
import { percentOf } from '@/lib/dashboard/format';
import type { DashboardPayload } from '@/lib/dashboard/types';
import { VIZ_CSS, card, inr, inrCompact, num } from '../_viz/kit';
import { ActivityPanel, AlertsPanel, MiniStat, Panel, Row } from './panels';
import { TrendChart } from './trend-chart';

async function fetchDashboard(): Promise<DashboardPayload> {
  const response = await fetch('/api/admin/dashboard');
  if (!response.ok) throw new Error(`Dashboard request failed: ${response.status}`);
  const result = await response.json();
  if (!result.success || !result.data) throw new Error('Invalid dashboard response');
  return result.data as DashboardPayload;
}

// ── Headline cards ───────────────────────────────────────────────────────────
// icon and href travel WITH the card definition. The previous page picked both
// by array index (`index === 0 ? Users : ...`, `routes[index]`), so reordering
// the cards silently mismatched every icon and link.
const HEADLINE = [
  {
    key: 'learners' as const,
    title: 'Transport learners',
    sub: 'Bus required, active',
    icon: GraduationCap,
    href: '/passengers/learners',
    permission: TMS_PERMISSIONS.ENROLLMENT_VIEW,
  },
  {
    key: 'routes' as const,
    title: 'Routes',
    sub: 'In the catalogue',
    icon: RouteIcon,
    href: '/routes',
    permission: TMS_PERMISSIONS.ROUTES_VIEW,
  },
  {
    key: 'drivers' as const,
    title: 'Drivers',
    sub: 'On staff',
    icon: UserCheck,
    href: '/drivers',
    permission: TMS_PERMISSIONS.DRIVERS_VIEW,
  },
  {
    key: 'vehicles' as const,
    title: 'Fleet',
    sub: 'Vehicles on record',
    icon: Car,
    href: '/vehicles',
    permission: TMS_PERMISSIONS.VEHICLES_VIEW,
  },
];

const QUICK_ACTIONS: Array<{
  title: string;
  desc: string;
  icon: LucideIcon;
  href: string;
  permission: string;
}> = [
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

  // While permissions are still resolving, show nothing rather than a menu that
  // pops items in a moment later. `can` returns false for everything mid-load.
  const quickActions = useMemo(
    () => (permsLoading ? [] : QUICK_ACTIONS.filter((a) => can(a.permission))),
    [can, permsLoading]
  );

  const headline = useMemo(
    () => HEADLINE.filter((h) => can(h.permission)),
    [can]
  );

  // Each headline card links somewhere, so rendering before permissions resolve
  // would briefly offer links the user cannot open and then remove them —
  // a layout shift AND a dead end. Skeletons until both are ready.
  const showSkeletons = isPending || permsLoading;

  const greetingName = profile?.full_name || profile?.email || 'Admin';
  const boardingRate = data ? percentOf(data.today.present, data.today.bookings) : null;

  return (
    <div className="viz-scope space-y-6">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      {/* Header — stacks on mobile so the title can't collide with the actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Welcome back, {greetingName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `Transport at a glance for ${formatHeaderDate(data.today.date)}.`
              : 'Loading today’s transport picture…'}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 sm:flex-none"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {can(TMS_PERMISSIONS.ENROLLMENT_VIEW) && (
            <button
              onClick={() => router.push('/passengers/learners')}
              className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 sm:flex-none"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add learner
            </button>
          )}
        </div>
      </div>

      {/* A metric whose query failed must not read as a confident zero. */}
      {data && data.degraded.length > 0 && (
        <div
          className={`${card} flex items-start gap-3 border-l-4 p-4`}
          style={{ borderLeftColor: 'var(--viz-warning)' }}
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--viz-warning)' }} />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">Some figures could not be loaded</p>
            <p className="mt-0.5 text-muted-foreground">
              {data.degraded.join(', ')} — these are shown as 0 and should not be relied on.
            </p>
          </div>
        </div>
      )}

      {/* Headline counts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {showSkeletons
          ? Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          : headline.map((h) => (
              <HeadlineCard
                key={h.key}
                title={h.title}
                sub={h.sub}
                icon={h.icon}
                href={h.href}
                value={data?.counts[h.key].current ?? 0}
                trend={data ? trendOf(data.counts[h.key], 'vs 30 days ago') : undefined}
              />
            ))}
      </div>

      {/* Today + money */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Today" icon={Activity} action={{ label: 'Bookings', href: '/bookings' }}>
          {isPending ? (
            <RowsSkeleton rows={3} />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <MiniStat
                  label="Seats booked"
                  value={data?.today.bookings ?? 0}
                  sub={`${num(data?.today.bookingsTomorrow ?? 0)} booked for tomorrow`}
                />
                <MiniStat
                  label="Boarded"
                  value={data?.today.present ?? 0}
                  sub={boardingRate === null ? 'No bookings to compare' : `${boardingRate}% of booked`}
                />
              </div>
              <div className="border-t border-border pt-1">
                <Row label="Marked absent" value={num(data?.today.absent ?? 0)} />
                <Row label="Trips today" value={num(data?.today.tripsToday ?? 0)} />
                <Row
                  label="Trips running now"
                  value={num(data?.today.tripsActive ?? 0)}
                  href="/track-all"
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Transport fees" icon={Wallet} action={{ label: 'Fees', href: '/fees' }}>
          {isPending ? (
            <RowsSkeleton rows={5} />
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-muted-foreground">Collected today</p>
                <p
                  className="mt-0.5 text-2xl font-semibold tabular-nums"
                  style={{ color: 'var(--viz-good)' }}
                  title={inr(data?.finance.collectedToday ?? 0)}
                >
                  {inr(data?.finance.collectedToday ?? 0)}
                </p>
              </div>
              <div className="border-t border-border pt-1">
                <Row label="This month" value={inrCompact(data?.finance.collectedMonth ?? 0)} />
                <Row label="Collected to date" value={inrCompact(data?.finance.collectedTotal ?? 0)} />
                <Row
                  label="Outstanding"
                  value={inrCompact(data?.finance.outstanding ?? 0)}
                  tone="var(--viz-serious)"
                  href="/fees"
                />
                <Row
                  label="Overdue bills"
                  value={num(data?.finance.overdueBills ?? 0)}
                  tone="var(--viz-critical)"
                  href="/fees"
                />
                <Row label="Bills paid" value={num(data?.finance.paidBills ?? 0)} />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Needs attention" icon={AlertTriangle}>
          {isPending ? (
            <RowsSkeleton rows={4} />
          ) : (
            <AlertsPanel alerts={data?.alerts ?? []} unknown={(data?.degraded.length ?? 0) > 0} />
          )}
        </Panel>
      </div>

      {/* Trend + activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isPending ? <ChartSkeleton /> : <TrendChart trend={data?.trend ?? []} />}
        </div>
        <Panel
          title="Recent activity"
          icon={Activity}
          action={can(TMS_PERMISSIONS.ACTIVITY_VIEW) ? { label: 'All', href: '/activity-log' } : undefined}
        >
          {isPending ? (
            <RowsSkeleton rows={6} />
          ) : (
            <ActivityPanel
              items={data?.activity ?? []}
              canView={can(TMS_PERMISSIONS.ACTIVITY_VIEW)}
            />
          )}
        </Panel>
      </div>

      {/* Quick actions — only what this user may actually open */}
      {quickActions.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Quick actions</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`${card} group flex items-center gap-3 p-4 transition-colors hover:bg-muted`}
              >
                <span className="shrink-0 rounded-lg bg-muted p-2 text-muted-foreground transition-colors group-hover:text-foreground">
                  <action.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{action.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{action.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function HeadlineCard({
  title, sub, icon: Icon, href, value, trend,
}: {
  title: string;
  sub: string;
  icon: LucideIcon;
  href: string;
  value: number;
  trend?: TrendData;
}) {
  // `trend` is undefined whenever no baseline was measurable. It used to be
  // filled in with Math.random(), so every card always showed an arrow.
  const showTrend = trend !== undefined && trend.direction !== 'neutral';
  const up = trend?.direction === 'up';

  return (
    <Link href={href} className={`${card} block p-5 transition-colors hover:bg-muted`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {num(value)}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {showTrend ? (
              <>
                {up ? (
                  <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--viz-good)' }} />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" style={{ color: 'var(--viz-serious)' }} />
                )}
                <span className="text-muted-foreground">
                  {trend!.value.toFixed(1)}% {trend!.timeframe}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">{sub}</span>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Link>
  );
}

/**
 * Skeletons rather than the old full-screen spinner, which returned a
 * `min-h-screen` centred loader and blanked the entire admin shell on first
 * paint. These keep the layout stable so nothing jumps when data lands.
 */
function CardSkeleton() {
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
    <div className={`${card} p-5`}>
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-[260px] w-full rounded bg-muted" />
      </div>
    </div>
  );
}

/** "Thursday, 3 September" — the IST date the server measured "today" as. */
function formatHeaderDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}
