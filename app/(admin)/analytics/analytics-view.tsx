'use client';

/**
 * Transport Analytics — rebuilt on the dataviz method.
 *
 * Every figure traces to a live row (via /api/admin/analytics). Color is assigned
 * by the job it does (accent = one brand hue; status = the reserved good→critical
 * scale) and the palette was validated with the six-checks validator against the
 * app's real surfaces (white / #020817). No gradients, no dual axes, no cycled
 * hues, no fabricated series. Charts that need temporal depth render adaptively:
 * a stat tile until there's enough history, a chart once there is.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { istToday, addDays } from '@/lib/booking/window';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
} from 'recharts';
import {
  RefreshCw,
  Loader2,
  Wallet,
  TrendingUp,
  Users,
  Bus,
  Route as RouteIcon,
  UserCheck,
  CalendarCheck,
  MessageSquareWarning,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import {
  VIZ_CSS, card, inr, inrCompact, num, titleCase,
  StatTile, Meter, Legend, EmptyState, ChartCard, VizTable as DataTable, VizTooltip,
  gridProps, axisTick, axisLine, type StatusMeta,
} from '../_viz/kit';
import toast from 'react-hot-toast';

// ── Types (mirror /api/admin/analytics) ─────────────────────────────────────────
interface Kpis {
  billed: number; collected: number; outstanding: number; overdue: number;
  collectionRate: number; transportBillCount: number;
  learnersWithTransport: number; learnersActive: number;
  activeRoutes: number; totalRoutes: number; activeVehicles: number; totalVehicles: number;
  drivers: number; openGrievances: number; bookingsInRange: number;
}
interface PeriodFigures { billed: number; collected: number; bookings: number }
interface Analytics {
  range: { from: string; to: string };
  comparison?: { previousRange: { from: string; to: string }; current: PeriodFigures; previous: PeriodFigures };
  kpis: Kpis;
  collectionStatus: { status: string; count: number; amount: number }[];
  revenueTrend: { month: string; billed: number; collected: number }[];
  routeLoad: { name: string; riders: number }[]; // learners + staff allocated to the route
  bookingsTrend: { date: string; count: number }[];
  fleetCompliance: { type: string; expired: number; expiring: number; valid: number; unknown: number }[];
  grievances: {
    byStatus: { status: string; count: number }[];
    byCategory: { category: string; count: number }[];
    total: number;
  };
}

// ── Status metadata: reserved good→critical scale, always with an icon + label ──
const BILL_STATUS: Record<string, StatusMeta> = {
  paid: { label: 'Paid', color: 'var(--viz-good)', Icon: CheckCircle2 },
  partially_paid: { label: 'Partially paid', color: 'var(--viz-warning)', Icon: Clock },
  unpaid: { label: 'Unpaid', color: 'var(--viz-serious)', Icon: AlertTriangle },
  cancelled: { label: 'Cancelled', color: 'var(--viz-neutral)', Icon: XCircle },
  superseded: { label: 'Superseded', color: 'var(--viz-neutral)', Icon: XCircle },
  unknown: { label: 'Unknown', color: 'var(--viz-neutral)', Icon: HelpCircle },
};
const COMPLIANCE_META: Record<string, StatusMeta> = {
  valid: { label: 'Valid', color: 'var(--viz-good)', Icon: CheckCircle2 },
  expiring: { label: 'Expiring ≤30d', color: 'var(--viz-warning)', Icon: Clock },
  expired: { label: 'Expired', color: 'var(--viz-critical)', Icon: AlertTriangle },
  unknown: { label: 'Not recorded', color: 'var(--viz-neutral)', Icon: HelpCircle },
};
const GRIEVANCE_META: Record<string, StatusMeta> = {
  open: { label: 'Open', color: 'var(--viz-serious)', Icon: AlertTriangle },
  in_progress: { label: 'In progress', color: 'var(--viz-warning)', Icon: Clock },
  resolved: { label: 'Resolved', color: 'var(--viz-good)', Icon: CheckCircle2 },
  closed: { label: 'Closed', color: 'var(--viz-neutral)', Icon: XCircle },
  unknown: { label: 'Unknown', color: 'var(--viz-neutral)', Icon: HelpCircle },
};

// ── Charts ───────────────────────────────────────────────────────────────────

// Route load: nominal categories, magnitude value → ONE accent hue for every bar
// (never a value-ramp), value at the tip, table twin for the full list.
function RouteLoadChart({ data }: { data: Analytics['routeLoad'] }) {
  const rows = data.slice(0, 20);
  const height = Math.max(200, rows.length * 30 + 24);
  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barCategoryGap="28%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={148}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + '…' : v)}
        />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        <Bar dataKey="riders" name="Riders" fill="var(--viz-accent)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="riders" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  const table = <DataTable head={['Route', 'Riders']} rows={data.map((r) => [r.name, num(r.riders)])} />;
  return { chart, table };
}

// Collection status: length = bill count, color = status meaning (icon+label legend).
function CollectionStatusChart({ data }: { data: Analytics['collectionStatus'] }) {
  const rows = data.map((d) => ({ ...d, meta: BILL_STATUS[d.status] ?? BILL_STATUS.unknown }));
  const chart = (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 46 + 24)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap="30%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="status" width={110} tick={axisTick} axisLine={false} tickLine={false}
          tickFormatter={(s: string) => (BILL_STATUS[s] ?? BILL_STATUS.unknown).label} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }}
          content={<VizTooltip valueFmt={(v: number) => `${num(v)} bills`} />} />
        <Bar dataKey="count" name="Bills" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {rows.map((r) => <Cell key={r.status} fill={r.meta.color} />)}
          <LabelList dataKey="count" position="right" fill="var(--viz-tick)" fontSize={11} formatter={(v: number) => num(v)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  const legend = <Legend items={rows.map((r) => ({ label: r.meta.label, color: r.meta.color, Icon: r.meta.Icon }))} />;
  const table = (
    <DataTable head={['Status', 'Bills', 'Amount']} rows={rows.map((r) => [r.meta.label, num(r.count), inr(r.amount)])} />
  );
  return { chart, legend, table };
}

// Fleet compliance: stacked status bar per document type (2px surface gaps).
function FleetComplianceChart({ data }: { data: Analytics['fleetCompliance'] }) {
  const segs = ['valid', 'expiring', 'expired', 'unknown'] as const;
  const chart = (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44 + 24)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap="30%">
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="type" width={80} tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip />} />
        {segs.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            name={COMPLIANCE_META[s].label}
            stackId="c"
            fill={COMPLIANCE_META[s].color}
            stroke="var(--viz-surface)"
            strokeWidth={2}
            maxBarSize={22}
            radius={i === segs.length - 1 ? [0, 4, 4, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
  const legend = <Legend items={segs.map((s) => ({ label: COMPLIANCE_META[s].label, color: COMPLIANCE_META[s].color, Icon: COMPLIANCE_META[s].Icon }))} />;
  const table = (
    <DataTable
      head={['Document', 'Valid', 'Expiring', 'Expired', 'Not recorded']}
      rows={data.map((d) => [d.type, num(d.valid), num(d.expiring), num(d.expired), num(d.unknown)])}
    />
  );
  return { chart, legend, table };
}

// Billing by month: single accent series, columns. Adaptive (renders only ≥2 months).
function BillingByMonthChart({ data }: { data: Analytics['revenueTrend'] }) {
  const chart = (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap="34%">
        <CartesianGrid {...gridProps} vertical={false} />
        <XAxis dataKey="month" tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={inrCompact} width={56} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={inr} />} />
        <Bar dataKey="billed" name="Billed" fill="var(--viz-accent)" radius={[4, 4, 0, 0]} maxBarSize={48}>
          <LabelList dataKey="billed" position="top" fill="var(--viz-tick)" fontSize={11} formatter={inrCompact} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  const table = (
    <DataTable head={['Month', 'Billed', 'Collected']} rows={data.map((d) => [d.month, inr(d.billed), inr(d.collected)])} />
  );
  return { chart, table };
}

// Collection progress: one part-to-whole bar (collected vs outstanding by amount).
function CollectionProgressChart({ collected, outstanding }: { collected: number; outstanding: number }) {
  const row = [{ name: 'Transport fees', collected, outstanding }];
  const chart = (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={row} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} tickFormatter={inrCompact} />
        <YAxis type="category" dataKey="name" width={100} tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={inr} />} />
        <Bar dataKey="collected" name="Collected" stackId="p" fill="var(--viz-good)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} />
        <Bar dataKey="outstanding" name="Outstanding" stackId="p" fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
  const legend = (
    <Legend items={[{ label: 'Collected', color: 'var(--viz-good)', Icon: CheckCircle2 }, { label: 'Outstanding', color: 'var(--viz-context)' }]} />
  );
  const table = (
    <DataTable head={['', 'Amount']} rows={[['Collected', inr(collected)], ['Outstanding', inr(outstanding)], ['Total billed', inr(collected + outstanding)]]} />
  );
  return { chart, legend, table };
}

// ── Period comparison ────────────────────────────────────────────────────────
function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) {
    return <span className="text-xs text-muted-foreground">{now === 0 ? 'no change' : 'new this period'}</span>;
  }
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span className={`text-xs font-medium ${flat ? 'text-muted-foreground' : up ? 'text-[var(--viz-good)]' : 'text-[var(--viz-critical)]'}`}>
      {flat ? '–' : up ? '▲' : '▼'} {Math.abs(pct)}% vs previous
    </span>
  );
}

function PeriodComparison({ c }: { c: NonNullable<Analytics['comparison']> }) {
  const items = [
    { label: 'Billed this period', now: c.current.billed, before: c.previous.billed, fmt: inrCompact },
    { label: 'Collected this period', now: c.current.collected, before: c.previous.collected, fmt: inrCompact },
    { label: 'Bookings this period', now: c.current.bookings, before: c.previous.bookings, fmt: num },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{i.label}</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{i.fmt(i.now)}</p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <Delta now={i.now} before={i.before} />
            <span className="text-[11px] text-muted-foreground">({i.fmt(i.before)} in {c.previousRange.from} → {c.previousRange.to})</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Filter row (date range presets) ──────────────────────────────────────────
const RANGES = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: '365d', label: 'Last 12 months', days: 365 },
] as const;

function AnalyticsPage() {
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]['id']>('90d');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'financial' | 'operations'>('overview');

  const fetchData = useCallback(async (days: number, isRefresh: boolean) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      // IST calendar dates (the browser's clock gave the wrong day near midnight).
      const to = istToday();
      const qs = `from=${addDays(to, -days)}&to=${to}`;
      const res = await fetch(`/api/admin/analytics?${qs}`);
      const json = await res.json();
      if (res.ok && json.success) setData(json.data as Analytics);
      else toast.error('Failed to load analytics');
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const r = RANGES.find((x) => x.id === rangeId)!;
    fetchData(r.days, data !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeId]);

  const k = data?.kpis;
  const adoption = useMemo(
    () => (k && k.learnersActive > 0 ? Math.round((k.learnersWithTransport / k.learnersActive) * 1000) / 10 : 0),
    [k]
  );

  if (loading || !data || !k) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading analytics…</p>
        </div>
      </div>
    );
  }

  const routeLoad = RouteLoadChart({ data: data.routeLoad });
  const collectionStatus = CollectionStatusChart({ data: data.collectionStatus });
  const fleet = FleetComplianceChart({ data: data.fleetCompliance });
  const billing = BillingByMonthChart({ data: data.revenueTrend });
  const progress = CollectionProgressChart({ collected: k.collected, outstanding: k.outstanding });

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'financial', label: 'Financial' },
    { id: 'operations', label: 'Operations' },
  ] as const;

  return (
    <div className="viz-scope space-y-6">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      <PageHeader
        description="Fees, riders, fleet and bookings over the chosen period. Route, bus and driver counts are as of today."
        actions={
          <button
            onClick={() => fetchData(RANGES.find((x) => x.id === rangeId)!.days, true)}
            disabled={refreshing}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {/* Pinned under the fixed app header (4rem + any install banner) so the
          period stays visible while scrolling through the charts. */}
      <div
        className="sticky z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/95 px-3 py-2 backdrop-blur"
        style={{ top: 'calc(4rem + var(--pwa-banner-h, 0px) + 0.5rem)' }}
      >
        <span className="text-xs font-medium text-muted-foreground">Period</span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeId(r.id)}
              aria-pressed={rangeId === r.id}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                rangeId === r.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {data.range.from} → {data.range.to}
        </span>
      </div>

      {data.comparison && <PeriodComparison c={data.comparison} />}

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Refetch keeps the frame: hold the render at reduced opacity, no skeleton flash */}
      <div className={refreshing ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'}>
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Transport fees collected" value={inrCompact(k.collected)} sub={`of ${inrCompact(k.billed)} billed`} Icon={Wallet} tone="text-[var(--viz-good)]" />
              <Meter label="Collection rate" rate={k.collectionRate} caption={`${inrCompact(k.outstanding)} still outstanding`} />
              <StatTile label="Transport learners" value={num(k.learnersWithTransport)} sub={`${adoption}% of ${num(k.learnersActive)} active learners`} Icon={Users} tone="text-primary" />
              <StatTile label="Open grievances" value={num(k.openGrievances)} sub={`${num(data.grievances.total)} total logged`} Icon={MessageSquareWarning} tone="text-[var(--viz-serious)]" />
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ChartCard title="Fee collection status" subtitle={`${num(k.transportBillCount)} transport bills by payment state`} hasData={data.collectionStatus.length > 0} legend={collectionStatus.legend} chart={collectionStatus.chart} table={collectionStatus.table} />
              <ChartCard title="Fleet document compliance" subtitle={`${num(k.totalVehicles)} vehicles · expiry within 30 days`} hasData={data.fleetCompliance.some((d) => d.valid + d.expiring + d.expired + d.unknown > 0)} legend={fleet.legend} chart={fleet.chart} table={fleet.table} />
            </div>
          </div>
        )}

        {tab === 'financial' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Total billed" value={inrCompact(k.billed)} sub={`${num(k.transportBillCount)} transport bills`} Icon={TrendingUp} tone="text-primary" />
              <StatTile label="Collected" value={inrCompact(k.collected)} sub={`${k.collectionRate.toFixed(1)}% collection rate`} Icon={Wallet} tone="text-[var(--viz-good)]" />
              <StatTile label="Outstanding" value={inrCompact(k.outstanding)} sub="unpaid + partially paid" Icon={Clock} tone="text-[var(--viz-serious)]" />
              <StatTile label="Overdue" value={inrCompact(k.overdue)} sub="past due date, unpaid" Icon={AlertTriangle} tone="text-[var(--viz-critical)]" />
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ChartCard title="Collection progress" subtitle="Collected vs outstanding, by amount" hasData={k.billed > 0} legend={progress.legend} chart={progress.chart} table={progress.table} />
              <ChartCard title="Fee collection status" subtitle={`${num(k.transportBillCount)} transport bills by payment state`} hasData={data.collectionStatus.length > 0} legend={collectionStatus.legend} chart={collectionStatus.chart} table={collectionStatus.table} />
            </div>
            <ChartCard
              title="Billing by month"
              subtitle="Transport fees billed per month"
              hasData={data.revenueTrend.length >= 2}
              emptyMessage="Not enough billing history yet — figures shown in the tiles above."
              chart={billing.chart}
              table={billing.table}
            />
          </div>
        )}

        {tab === 'operations' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Active routes" value={num(k.activeRoutes)} sub={`${num(k.totalRoutes)} total`} Icon={RouteIcon} tone="text-primary" />
              <StatTile label="Active vehicles" value={num(k.activeVehicles)} sub={`${num(k.totalVehicles)} in fleet`} Icon={Bus} tone="text-primary" />
              <StatTile label="Drivers" value={num(k.drivers)} sub="staff with driver role" Icon={UserCheck} tone="text-primary" />
              <StatTile label="Bookings in range" value={num(k.bookingsInRange)} sub={`${data.range.from} → ${data.range.to}`} Icon={CalendarCheck} tone="text-primary" />
            </div>
            <ChartCard
              title="Transport riders per route"
              subtitle="Bus-requiring learners and staff assigned per route (top 20)"
              hasData={data.routeLoad.length > 0}
              chart={routeLoad.chart}
              table={routeLoad.table}
              csv={{ filename: 'riders-per-route.csv', head: ['Route', 'Riders'], rows: data.routeLoad.map((r) => [r.name, r.riders]) }}
            />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ChartCard title="Fleet document compliance" subtitle={`${num(k.totalVehicles)} vehicles · expiry within 30 days`} hasData={data.fleetCompliance.some((d) => d.valid + d.expiring + d.expired + d.unknown > 0)} legend={fleet.legend} chart={fleet.chart} table={fleet.table} />
              <GrievancesPanel grievances={data.grievances} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Grievances: tiny volume → status tiles + a category table (no forced chart).
function GrievancesPanel({ grievances }: { grievances: Analytics['grievances'] }) {
  const order = ['open', 'in_progress', 'resolved', 'closed'];
  const byStatus = [...grievances.byStatus].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <section className={`${card} p-5`}>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Grievances</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{num(grievances.total)} logged</p>
      </div>
      {grievances.total === 0 ? (
        <EmptyState message="No grievances logged" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {byStatus.map((s) => {
              const meta = GRIEVANCE_META[s.status] ?? GRIEVANCE_META.unknown;
              return (
                <div key={s.status} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <meta.Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                    {meta.label}
                  </div>
                  <p className="mt-1 text-xl font-semibold text-foreground">{num(s.count)}</p>
                </div>
              );
            })}
          </div>
          {grievances.byCategory.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <DataTable head={['Category', 'Count']} rows={grievances.byCategory.map((c) => [titleCase(c.category), num(c.count)])} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default AnalyticsPage;
