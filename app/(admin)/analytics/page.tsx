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
  Table as TableIcon,
  BarChart3,
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
  Download,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Chart palette (validated) — scoped so it swaps with the app's .dark class ────
// Recharts renders SVG, which resolves CSS custom properties; keeping colors as
// vars means the light/dark values live in one place and follow the app's toggle.
const VIZ_CSS = `
.viz-scope{
  --viz-surface:#ffffff;
  --viz-accent:#00a63e; --viz-accent-soft:color-mix(in oklab,#00a63e 12%,#ffffff);
  --viz-context:#cbd5e1;
  --viz-good:#0ca30c; --viz-warning:#fab219; --viz-serious:#ec835a; --viz-critical:#d03b3b;
  --viz-neutral:#94a3b8;
  --viz-grid:#eef2f6; --viz-axis:#cbd5e1; --viz-tick:#64748b;
}
.dark .viz-scope{
  --viz-surface:#020817;
  --viz-accent:#00c950; --viz-accent-soft:color-mix(in oklab,#00c950 16%,#020817);
  --viz-context:#334155;
  --viz-good:#0ca30c; --viz-warning:#fab219; --viz-serious:#ec835a; --viz-critical:#d03b3b;
  --viz-neutral:#475569;
  --viz-grid:#1e293b; --viz-axis:#334155; --viz-tick:#94a3b8;
}
`;

// ── Types (mirror /api/admin/analytics) ─────────────────────────────────────────
interface Kpis {
  billed: number; collected: number; outstanding: number; overdue: number;
  collectionRate: number; transportBillCount: number;
  learnersWithTransport: number; learnersActive: number;
  activeRoutes: number; totalRoutes: number; activeVehicles: number; totalVehicles: number;
  drivers: number; openGrievances: number; bookingsInRange: number;
}
interface Analytics {
  range: { from: string; to: string };
  kpis: Kpis;
  collectionStatus: { status: string; count: number; amount: number }[];
  revenueTrend: { month: string; billed: number; collected: number }[];
  routeLoad: { name: string; learners: number }[];
  bookingsTrend: { date: string; count: number }[];
  fleetCompliance: { type: string; expired: number; expiring: number; valid: number; unknown: number }[];
  grievances: {
    byStatus: { status: string; count: number }[];
    byCategory: { category: string; count: number }[];
    total: number;
  };
}

// ── Formatters ───────────────────────────────────────────────────────────────
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const inrCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return '₹' + Math.round(n);
};
const num = (n: number) => n.toLocaleString('en-IN');
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Client-side CSV download (UTF-8 BOM so Excel reads it correctly).
function downloadCsv(filename: string, head: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = [head.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Status metadata: reserved good→critical scale, always with an icon + label ──
type StatusMeta = { label: string; color: string; Icon: LucideIcon };
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

// ── Small building blocks ────────────────────────────────────────────────────
const card = 'rounded-xl border border-border bg-card text-card-foreground';

// Stat tile: label (sentence case) · value (semibold, proportional figures) · sub.
function StatTile({
  label, value, sub, Icon, tone = 'text-muted-foreground',
}: { label: string; value: string; sub?: string; Icon: LucideIcon; tone?: string }) {
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground tracking-tight break-words">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`shrink-0 rounded-lg bg-muted p-2 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// Meter: fill carries severity; track is the same hue, faint. (rate: high = good)
function Meter({ label, rate, caption }: { label: string; rate: number; caption?: string }) {
  const color =
    rate >= 70 ? 'var(--viz-good)' : rate >= 40 ? 'var(--viz-warning)' : rate >= 15 ? 'var(--viz-serious)' : 'var(--viz-critical)';
  const pct = Math.max(0, Math.min(100, rate));
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground tracking-tight">{rate.toFixed(1)}%</p>
      </div>
      <div
        className="mt-3 h-3 w-full overflow-hidden rounded-full"
        style={{ background: `color-mix(in oklab, ${color} 18%, var(--viz-surface))` }}
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 1.5)}%`, background: color }} />
      </div>
      {caption && <p className="mt-2 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

// Legend row — swatch/line-key + label in ink tokens (never the data color as text).
function Legend({ items }: { items: { label: string; color: string; Icon?: LucideIcon }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {it.Icon ? (
            <it.Icon className="h-3.5 w-3.5" style={{ color: it.color }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// Chart card with a chart/table toggle — every chart ships its table-view twin.
function ChartCard({
  title, subtitle, legend, hasData, emptyMessage = 'No data in range', chart, table, csv,
}: {
  title: string; subtitle?: string; legend?: React.ReactNode; hasData: boolean;
  emptyMessage?: string; chart: React.ReactNode; table: React.ReactNode;
  csv?: { filename: string; head: string[]; rows: (string | number)[][] };
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={`${card} p-5`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {hasData && (
          <div className="flex shrink-0 items-center gap-1.5">
            {csv && (
              <button
                onClick={() => downloadCsv(csv.filename, csv.head, csv.rows)}
                className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                title="Download CSV"
                aria-label={`Download ${title} as CSV`}
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label={`${title} view`}>
              {(['chart', 'table'] as const).map((v) => {
                const Icon = v === 'chart' ? BarChart3 : TableIcon;
                return (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={`rounded-md p-1.5 transition-colors ${
                      view === v ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={v === 'chart' ? 'Chart view' : 'Table view'}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {!hasData ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          {view === 'chart' ? chart : <div className="overflow-x-auto">{table}</div>}
          {legend && view === 'chart' && <div className="mt-3">{legend}</div>}
        </>
      )}
    </section>
  );
}

// Accessible data table used by every ChartCard's table view.
function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} className={`py-2 pr-4 font-medium ${i > 0 ? 'text-right' : ''}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-border/60 last:border-0">
            {r.map((c, ci) => (
              <td key={ci} className={`py-2 pr-4 ${ci === 0 ? 'text-foreground' : 'text-right text-muted-foreground'}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Theme-aware tooltip — value leads, label follows (interaction.md).
function VizTooltip({ active, payload, label, valueFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`${card} px-3 py-2 shadow-lg`}>
      {label != null && <p className="mb-1 text-xs text-muted-foreground">{label}</p>}
      {payload.map((e: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-1 rounded-sm" style={{ background: e.color || e.payload?.fill }} />
          <span className="font-semibold text-foreground tabular-nums">{valueFmt ? valueFmt(e.value) : num(e.value)}</span>
          <span className="text-muted-foreground">{e.name}</span>
        </div>
      ))}
    </div>
  );
}

const gridProps = { stroke: 'var(--viz-grid)', strokeDasharray: '0' } as const;
const axisTick = { fill: 'var(--viz-tick)', fontSize: 11 } as const;
const axisLine = { stroke: 'var(--viz-axis)' } as const;

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
        <Bar dataKey="learners" name="Learners" fill="var(--viz-accent)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="learners" position="right" fill="var(--viz-tick)" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  const table = <DataTable head={['Route', 'Learners']} rows={data.map((r) => [r.name, num(r.learners)])} />;
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
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - days);
      const qs = `from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;
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

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Transport Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live figures from the transport fees, routes, fleet and bookings tables.
          </p>
        </div>
        <button
          onClick={() => fetchData(RANGES.find((x) => x.id === rangeId)!.days, true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* One filter row above everything it scopes */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Booking &amp; billing window</span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeId(r.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                rangeId === r.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Inventory counts are current.</span>
      </div>

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
              title="Transport learners per route"
              subtitle="Active, bus-requiring learners assigned per route (top 20)"
              hasData={data.routeLoad.length > 0}
              chart={routeLoad.chart}
              table={routeLoad.table}
              csv={{ filename: 'learners-per-route.csv', head: ['Route', 'Learners'], rows: data.routeLoad.map((r) => [r.name, r.learners]) }}
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
