'use client';

// Shared data-viz primitives, extracted from analytics-view.tsx so both the
// Transport Analytics page and the Bill Management analytics tab render on one
// validated kit. The .viz-scope palette (design-system parameters) lives here;
// recharts marks stay in each consumer, so this file pulls in NO recharts.

import React, { useState } from 'react';
import { Table as TableIcon, BarChart3, Download, type LucideIcon } from 'lucide-react';

// ── Chart palette (validated) — scoped so it swaps with the app's .dark class ────
export const VIZ_CSS = `
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

// ── Formatters ───────────────────────────────────────────────────────────────
export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const inrCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return '₹' + Math.round(n);
};
export const num = (n: number) => n.toLocaleString('en-IN');
export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Client-side CSV download (UTF-8 BOM so Excel reads it correctly).
export function downloadCsv(filename: string, head: string[], rows: (string | number)[][]) {
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

// ── Status metadata shape: reserved good→critical scale, always icon + label ────
export type StatusMeta = { label: string; color: string; Icon: LucideIcon };

// ── Small building blocks ────────────────────────────────────────────────────
export const card = 'rounded-xl border border-border bg-card text-card-foreground';

// Stat tile: label (sentence case) · value (semibold) · sub.
export function StatTile({
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
export function Meter({ label, rate, caption }: { label: string; rate: number; caption?: string }) {
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

// Legend row — swatch/icon key + label in ink tokens (never the data color as text).
export function Legend({ items }: { items: { label: string; color: string; Icon?: LucideIcon }[] }) {
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

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// Chart card with a chart/table toggle — every chart ships its table-view twin.
export function ChartCard({
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

// Accessible data table used by every ChartCard's table view. (Was `DataTable`.)
export function VizTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
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

// Theme-aware tooltip — value leads, label follows.
export function VizTooltip({ active, payload, label, valueFmt }: any) {
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

export const gridProps = { stroke: 'var(--viz-grid)', strokeDasharray: '0' } as const;
export const axisTick = { fill: 'var(--viz-tick)', fontSize: 11 } as const;
export const axisLine = { stroke: 'var(--viz-axis)' } as const;
