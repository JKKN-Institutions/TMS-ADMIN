# Bill Management Analytics Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Analytics view to the `/bill-management` admin module that charts billed/collected/pending money, learners paid-vs-pending, and per-term breakdown — all from data the page already fetches.

**Architecture:** Client-side only. The module's existing React Query fetch already returns `{ summary, rows: TransportBillRow[] }` (one row per term-bill). New **pure** aggregation functions (`lib/fees/bill-analytics.ts`) turn `rows` into learner/term stats; a new **lazy-loaded** chart component (`bill-analytics.tsx`) renders them using a shared viz kit extracted from the existing Transport Analytics page. No new API route, DB query, or permission.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · recharts ^2.15.4 (lazy via `next/dynamic`) · Tailwind v4 (class-based dark mode) · vitest ^4 · `@tanstack/react-query`.

## Global Constraints

- **Reconciliation rule (verbatim from `summarizeBills`):** money/learner math counts only `person_type === 'learner' && status !== 'cancelled'`. Cancelled (vacated) bills are voided; staff are `staff_deferred` (no money). Charts MUST match the KPI tiles.
- **recharts stays lazy:** it must NOT enter the `/bill-management` route's first-load JS. Load the chart component via `next/dynamic(() => import('./bill-analytics'), { ssr: false })`.
- **Palette is fixed & pre-validated:** reuse the `.viz-scope` CSS vars only. Introduce **no new hex colors**. If a new hue is ever needed, run `dataviz/scripts/validate_palette.js` first.
- **Every chart ships a table-view twin** (the `ChartCard` `table` prop) — established dataviz convention in this codebase.
- **Verification reality (per project memory):** `npm run lint` is broken and global `tsc` is chronically red (not build-gated). Verify with `npm run test` (vitest), `npm run build`, and route probes — NOT global tsc.
- **Currency in charts:** use the kit's `inr` / `inrCompact` (rounded), not the 2-decimal `inr` from `bill-management/columns.tsx`.

---

### Task 1: Pure billing-analytics aggregation (`lib/fees/bill-analytics.ts`)

Pure, React-free, DB-free functions over `TransportBillRow[]`. TDD — test first. This is the foundation both the UI and the tests rely on.

**Files:**
- Create: `lib/fees/bill-analytics.ts`
- Test: `lib/fees/bill-analytics.test.ts`

**Interfaces:**
- Consumes: `TransportBillRow` from `lib/fees/bills.ts` (existing; fields used: `person_type`, `person_id`, `status`, `term_no`, `amount`, `paid_amount`, `pending_amount`).
- Produces:
  - `learnerPaymentBreakdown(rows: TransportBillRow[]): LearnerPaymentBreakdown` where `LearnerPaymentBreakdown = { fullyPaid: number; partiallyPaid: number; unpaid: number; overdue: number; totalLearners: number }` (counts of **distinct learners**).
  - `termBreakdown(rows: TransportBillRow[]): TermStat[]` where `TermStat = { term_no: number; billed: number; collected: number; pending: number; paidBills: number; pendingBills: number; learners: number }`, sorted ascending by `term_no`.

- [ ] **Step 1: Write the failing tests**

Create `lib/fees/bill-analytics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { learnerPaymentBreakdown, termBreakdown } from './bill-analytics';
import type { TransportBillRow } from './bills';

// Minimal row factory — only the fields the aggregators read matter.
function row(over: Partial<TransportBillRow> = {}): TransportBillRow {
  return {
    id: 'r', person_id: 'p', person_type: 'learner', person_name: '—', code: null,
    institution_id: null, institution_name: null, structure_id: 's', structure_name: null,
    transport_year_id: 'y', year_name: null, academic_year_id: null, academic_year_name: null,
    term_no: 1, amount: 0, due_date: '2026-12-31', paid_amount: 0, pending_amount: 0,
    status: 'unpaid', payment_date: null, billing_student_bill_id: null, ...over,
  };
}

describe('learnerPaymentBreakdown', () => {
  it('counts distinct learners, not bills, across their terms', () => {
    // One learner, two fully-paid term rows → 1 fully-paid learner, not 2.
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', term_no: 1, amount: 1000, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'a', term_no: 2, amount: 1000, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
    ]);
    expect(b.fullyPaid).toBe(1);
    expect(b.totalLearners).toBe(1);
  });

  it('classifies a learner with one paid + one pending term as partially paid', () => {
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', term_no: 1, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'a', term_no: 2, paid_amount: 0, pending_amount: 1000, status: 'unpaid' }),
    ]);
    expect(b).toMatchObject({ fullyPaid: 0, partiallyPaid: 1, unpaid: 0 });
  });

  it('classifies a learner who has paid nothing as unpaid', () => {
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', paid_amount: 0, pending_amount: 2000, status: 'unpaid' }),
    ]);
    expect(b).toMatchObject({ fullyPaid: 0, partiallyPaid: 0, unpaid: 1 });
  });

  it('flags overdue as a subset — still counted in its money bucket', () => {
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', paid_amount: 0, pending_amount: 2000, status: 'overdue' }),
    ]);
    expect(b.overdue).toBe(1);
    expect(b.unpaid).toBe(1); // overdue learner still sits in the unpaid bar
  });

  it('excludes cancelled and staff rows', () => {
    const b = learnerPaymentBreakdown([
      row({ person_id: 'a', paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'b', status: 'cancelled', amount: 5500 }),
      row({ person_id: 'x', person_type: 'staff', status: 'staff_deferred', amount: 9999 }),
    ]);
    expect(b.totalLearners).toBe(1);
    expect(b.fullyPaid).toBe(1);
  });

  it('returns all-zero for empty input', () => {
    expect(learnerPaymentBreakdown([])).toEqual({
      fullyPaid: 0, partiallyPaid: 0, unpaid: 0, overdue: 0, totalLearners: 0,
    });
  });
});

describe('termBreakdown', () => {
  it('groups by term, sums money, counts paid/pending bills and distinct learners, sorted', () => {
    const stats = termBreakdown([
      row({ person_id: 'a', term_no: 2, amount: 1000, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
      row({ person_id: 'a', term_no: 1, amount: 1000, paid_amount: 0, pending_amount: 1000, status: 'unpaid' }),
      row({ person_id: 'b', term_no: 1, amount: 1000, paid_amount: 1000, pending_amount: 0, status: 'paid' }),
    ]);
    expect(stats.map((s) => s.term_no)).toEqual([1, 2]); // ascending
    const t1 = stats[0];
    expect(t1).toMatchObject({
      term_no: 1, billed: 2000, collected: 1000, pending: 1000,
      paidBills: 1, pendingBills: 1, learners: 2,
    });
    const t2 = stats[1];
    expect(t2).toMatchObject({ term_no: 2, billed: 1000, collected: 1000, pending: 0, paidBills: 1, pendingBills: 0, learners: 1 });
  });

  it('excludes cancelled and staff rows', () => {
    const stats = termBreakdown([
      row({ person_id: 'a', term_no: 1, amount: 1000, paid_amount: 0, pending_amount: 1000, status: 'unpaid' }),
      row({ person_id: 'b', term_no: 1, amount: 5500, status: 'cancelled' }),
      row({ person_id: 'x', term_no: 1, person_type: 'staff', status: 'staff_deferred', amount: 9999 }),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0].billed).toBe(1000);
    expect(stats[0].learners).toBe(1);
  });

  it('returns [] for empty input', () => {
    expect(termBreakdown([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- lib/fees/bill-analytics.test.ts`
Expected: FAIL — `Failed to resolve import "./bill-analytics"` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/fees/bill-analytics.ts`:

```ts
// lib/fees/bill-analytics.ts
// Pure, React-free, DB-free aggregation for the Bill Management analytics tab.
// Operates on the same TransportBillRow[] the module already fetches. The active
// filter (learner && not cancelled) mirrors summarizeBills so charts and KPI
// tiles reconcile — staff are staff_deferred (no money), cancelled bills are void.

import type { TransportBillRow } from './bills';

export interface LearnerPaymentBreakdown {
  fullyPaid: number;
  partiallyPaid: number;
  unpaid: number;
  overdue: number; // distinct learners with any overdue row (subset of the above)
  totalLearners: number;
}

export interface TermStat {
  term_no: number;
  billed: number;
  collected: number;
  pending: number;
  paidBills: number;
  pendingBills: number;
  learners: number;
}

const activeLearnerRows = (rows: TransportBillRow[]) =>
  rows.filter((r) => r.person_type === 'learner' && r.status !== 'cancelled');

// Distinct-learner payment status. A learner spans several term rows, so we fold
// their terms together first, then bucket once.
export function learnerPaymentBreakdown(rows: TransportBillRow[]): LearnerPaymentBreakdown {
  const byLearner = new Map<string, { paid: number; pending: number; overdue: boolean }>();
  for (const r of activeLearnerRows(rows)) {
    const cur = byLearner.get(r.person_id) ?? { paid: 0, pending: 0, overdue: false };
    cur.paid += r.paid_amount;
    cur.pending += r.pending_amount;
    if (r.status === 'overdue') cur.overdue = true;
    byLearner.set(r.person_id, cur);
  }

  let fullyPaid = 0;
  let partiallyPaid = 0;
  let unpaid = 0;
  let overdue = 0;
  for (const l of byLearner.values()) {
    if (l.overdue) overdue++;
    if (l.pending <= 0) fullyPaid++;
    else if (l.paid > 0) partiallyPaid++;
    else unpaid++;
  }
  return { fullyPaid, partiallyPaid, unpaid, overdue, totalLearners: byLearner.size };
}

// Per-term money + bill counts + distinct learners, ascending by term.
export function termBreakdown(rows: TransportBillRow[]): TermStat[] {
  const byTerm = new Map<
    number,
    { billed: number; collected: number; pending: number; paidBills: number; pendingBills: number; learners: Set<string> }
  >();
  for (const r of activeLearnerRows(rows)) {
    const t =
      byTerm.get(r.term_no) ??
      { billed: 0, collected: 0, pending: 0, paidBills: 0, pendingBills: 0, learners: new Set<string>() };
    t.billed += r.amount;
    t.collected += r.paid_amount;
    t.pending += r.pending_amount;
    if (r.pending_amount > 0) t.pendingBills++;
    else t.paidBills++;
    t.learners.add(r.person_id);
    byTerm.set(r.term_no, t);
  }
  return [...byTerm.entries()]
    .map(([term_no, t]) => ({
      term_no,
      billed: t.billed,
      collected: t.collected,
      pending: t.pending,
      paidBills: t.paidBills,
      pendingBills: t.pendingBills,
      learners: t.learners.size,
    }))
    .sort((a, b) => a.term_no - b.term_no);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- lib/fees/bill-analytics.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Confirm no existing test regressed**

Run: `npm run test -- lib/fees`
Expected: PASS — `bills.test.ts` and `bill-analytics.test.ts` both green.

- [ ] **Step 6: Commit**

```bash
git add lib/fees/bill-analytics.ts lib/fees/bill-analytics.test.ts
git commit -m "feat(bill-management): pure learner + term billing aggregations"
```

---

### Task 2: Extract shared viz kit and refactor Transport Analytics onto it

Move the reusable, recharts-free primitives out of `analytics-view.tsx` into a shared `_viz/kit.tsx`, then re-point the analytics page at them. Pure relocation — no behavior or visual change. This is the higher-risk task (it edits a working page), so it gets its own review + build gate.

**Files:**
- Create: `app/(admin)/_viz/kit.tsx`
- Modify: `app/(admin)/analytics/analytics-view.tsx`

**Interfaces:**
- Produces (all exported from `app/(admin)/_viz/kit.tsx`): `VIZ_CSS`, `card`, `inr`, `inrCompact`, `num`, `titleCase`, `downloadCsv`, `StatusMeta` (type), `StatTile`, `Meter`, `Legend`, `EmptyState`, `ChartCard`, `VizTable`, `VizTooltip`, `gridProps`, `axisTick`, `axisLine`.
- Consumes: `lucide-react`, `react`. **No recharts import** (keeps the kit out of any recharts bundle).

- [ ] **Step 1: Create the shared kit**

Create `app/(admin)/_viz/kit.tsx` (this is the existing analytics-view primitives, moved verbatim; the only rename is `DataTable` → `VizTable`):

```tsx
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
```

- [ ] **Step 2: Refactor `analytics-view.tsx` to import from the kit**

In `app/(admin)/analytics/analytics-view.tsx`:

1. **Delete** these now-relocated definitions (they currently sit roughly at lines 49–327): the `VIZ_CSS` const; the `inr`, `inrCompact`, `num`, `titleCase` consts; the `downloadCsv` function; the `StatusMeta` type alias; the `card` const; and the `StatTile`, `Meter`, `Legend`, `EmptyState`, `ChartCard`, `DataTable`, `VizTooltip` functions; and the `gridProps`, `axisTick`, `axisLine` consts. **Keep** everything else: the domain metadata (`BILL_STATUS`, `COMPLIANCE_META`, `GRIEVANCE_META`), every chart function (`RouteLoadChart`, `CollectionStatusChart`, `FleetComplianceChart`, `BillingByMonthChart`, `CollectionProgressChart`), `GrievancesPanel`, and the `AnalyticsPage` component.

2. **Add** this import directly below the existing `lucide-react` import block (note the `VizTable as DataTable` alias so the file's existing `<DataTable …>` JSX keeps working unchanged):

```ts
import {
  VIZ_CSS, card, inr, inrCompact, num, titleCase,
  StatTile, Meter, Legend, EmptyState, ChartCard, VizTable as DataTable, VizTooltip,
  gridProps, axisTick, axisLine, type StatusMeta,
} from '../_viz/kit';
```

3. The three `BILL_STATUS` / `COMPLIANCE_META` / `GRIEVANCE_META` maps are typed `Record<string, StatusMeta>` — `StatusMeta` now comes from the import above, so no other change is needed there.

- [ ] **Step 3: Build to verify the refactor compiles and the analytics route is intact**

Run: `npm run build`
Expected: build succeeds; no errors referencing `analytics-view` or `_viz/kit`. (Warnings unrelated to these files are pre-existing.)

- [ ] **Step 4: Probe the analytics page renders unchanged**

Start the app if not running: `npm run dev` (note: this project's TMS-ADMIN runs on **:3001**; :3000 is a sibling app).
Visually confirm `/analytics` still renders all tabs (Overview / Financial / Operations), charts draw, chart⇄table toggles and CSV download work, and dark mode still recolors the charts. (Auth-gated — use the user's authenticated browser.)

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/_viz/kit.tsx" "app/(admin)/analytics/analytics-view.tsx"
git commit -m "refactor(analytics): extract shared viz kit into app/(admin)/_viz/kit"
```

---

### Task 3: Analytics tab component + wire into the module

Build the lazy-loaded chart component and add the third toggle segment. The deliverable is the working tab in the running app.

**Files:**
- Create: `app/(admin)/bill-management/bill-analytics.tsx`
- Modify: `app/(admin)/bill-management/page.tsx`

**Interfaces:**
- Consumes: `learnerPaymentBreakdown`, `termBreakdown` (Task 1); `VIZ_CSS`, `ChartCard`, `VizTable`, `StatTile`, `Meter`, `Legend`, `VizTooltip`, `EmptyState`, `gridProps`, `axisTick`, `axisLine`, `inr`, `inrCompact`, `num` (Task 2 kit); `TransportBillRow`, `BillSummary` (existing `lib/fees/bills.ts`).
- Produces: default-exported React component `BillAnalytics` with props `{ rows: TransportBillRow[]; summary: BillSummary; yearLabel?: string }`.

- [ ] **Step 1: Create the analytics component**

Create `app/(admin)/bill-management/bill-analytics.tsx`:

```tsx
'use client';

// Bill Management → Analytics view. Lazy-loaded (recharts is heavy) from page.tsx.
// All figures come from `rows`/`summary` already fetched by the module; money math
// mirrors summarizeBills so charts reconcile with the KPI tiles above.

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { CheckCircle2, Clock, AlertTriangle, Wallet, Users } from 'lucide-react';
import {
  VIZ_CSS, ChartCard, VizTable, StatTile, Meter, Legend, EmptyState, VizTooltip,
  gridProps, axisTick, axisLine, inr, inrCompact, num,
} from '../_viz/kit';
import type { TransportBillRow, BillSummary } from '@/lib/fees/bills';
import { learnerPaymentBreakdown, termBreakdown } from '@/lib/fees/bill-analytics';

// Learner buckets on the reserved good→serious status scale (icon + label, never color-alone).
const BUCKETS = [
  { key: 'fullyPaid', label: 'Fully paid', color: 'var(--viz-good)', Icon: CheckCircle2 },
  { key: 'partiallyPaid', label: 'Partially paid', color: 'var(--viz-warning)', Icon: Clock },
  { key: 'unpaid', label: 'Unpaid', color: 'var(--viz-serious)', Icon: AlertTriangle },
] as const;

export default function BillAnalytics({
  rows, summary, yearLabel,
}: {
  rows: TransportBillRow[];
  summary: BillSummary;
  yearLabel?: string;
}) {
  const learners = useMemo(() => learnerPaymentBreakdown(rows), [rows]);
  const terms = useMemo(() => termBreakdown(rows), [rows]);

  const billed = summary.totalBilledAmount;
  const collected = summary.collectedAmount;
  const pending = summary.pendingAmount;
  const rate = billed > 0 ? (collected / billed) * 100 : 0;
  const scope = yearLabel ? `for ${yearLabel}` : 'across all years';
  const hasData = billed > 0 || learners.totalLearners > 0;

  // Learner status chart rows.
  const learnerData = BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    color: b.color,
    Icon: b.Icon,
    count: learners[b.key],
  }));

  // Per-term chart rows (money, stacked collected + pending).
  const termData = terms.map((t) => ({
    name: `Term ${t.term_no}`,
    collected: t.collected,
    pending: t.pending,
  }));

  if (!hasData) {
    return (
      <div className="viz-scope">
        <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />
        <EmptyState message={`No transport billing ${scope} yet.`} />
      </div>
    );
  }

  return (
    <div className="viz-scope space-y-6">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      {/* Headline strip — deliberately NOT repeating the billed/collected/pending
          amounts already shown in the KPI cards above the toggle. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Meter label="Collection rate" rate={rate} caption={`${inrCompact(collected)} of ${inrCompact(billed)} collected`} />
        <StatTile
          label="Fully paid learners"
          value={`${num(learners.fullyPaid)} / ${num(learners.totalLearners)}`}
          sub={`${num(learners.partiallyPaid)} partial · ${num(learners.unpaid)} unpaid`}
          Icon={Wallet}
          tone="text-[var(--viz-good)]"
        />
        <StatTile
          label="Overdue learners"
          value={num(learners.overdue)}
          sub="past a due date, still owing"
          Icon={AlertTriangle}
          tone="text-[var(--viz-critical)]"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Chart 1 — Collection progress (part-to-whole: collected + pending = billed) */}
        <ChartCard
          title="Collection progress"
          subtitle={`Collected vs pending, by amount ${scope}`}
          hasData={billed > 0}
          legend={
            <Legend items={[
              { label: 'Collected', color: 'var(--viz-good)', Icon: CheckCircle2 },
              { label: 'Pending', color: 'var(--viz-context)' },
            ]} />
          }
          chart={
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={[{ name: 'Transport fees', collected, pending }]} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} tickFormatter={inrCompact} />
                <YAxis type="category" dataKey="name" width={100} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={inr} />} />
                <Bar dataKey="collected" name="Collected" stackId="p" fill="var(--viz-good)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} />
                <Bar dataKey="pending" name="Pending" stackId="p" fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={34} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          }
          table={
            <VizTable head={['', 'Amount']} rows={[['Collected', inr(collected)], ['Pending', inr(pending)], ['Total billed', inr(billed)]]} />
          }
        />

        {/* Chart 2 — Learner payment status (distinct learners; status scale) */}
        <ChartCard
          title="Learner payment status"
          subtitle={`${num(learners.totalLearners)} billed learners${learners.overdue ? ` · ${num(learners.overdue)} overdue` : ''}`}
          hasData={learners.totalLearners > 0}
          legend={<Legend items={learnerData.map((d) => ({ label: d.label, color: d.color, Icon: d.Icon }))} />}
          chart={
            <ResponsiveContainer width="100%" height={Math.max(160, learnerData.length * 46 + 24)}>
              <BarChart data={learnerData} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap="30%">
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={axisLine} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={110} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={(v: number) => `${num(v)} learners`} />} />
                <Bar dataKey="count" name="Learners" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {learnerData.map((d) => <Cell key={d.key} fill={d.color} />)}
                  <LabelList dataKey="count" position="right" fill="var(--viz-tick)" fontSize={11} formatter={(v: number) => num(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          }
          table={
            <VizTable
              head={['Status', 'Learners']}
              rows={learnerData.map((d) => [d.label, num(d.count)])}
            />
          }
        />
      </div>

      {/* Chart 3 — Per-term breakdown (money stacked; counts in the table twin) */}
      <ChartCard
        title="By term"
        subtitle={`Collected vs pending per term ${scope}`}
        hasData={terms.length > 0}
        emptyMessage="No term data yet."
        legend={
          <Legend items={[
            { label: 'Collected', color: 'var(--viz-good)', Icon: CheckCircle2 },
            { label: 'Pending', color: 'var(--viz-context)' },
          ]} />
        }
        chart={
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={termData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap="34%">
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={axisLine} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={inrCompact} width={56} />
              <Tooltip cursor={{ fill: 'var(--viz-grid)', opacity: 0.4 }} content={<VizTooltip valueFmt={inr} />} />
              <Bar dataKey="collected" name="Collected" stackId="t" fill="var(--viz-good)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={56} />
              <Bar dataKey="pending" name="Pending" stackId="t" fill="var(--viz-context)" stroke="var(--viz-surface)" strokeWidth={2} maxBarSize={56} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        }
        table={
          <VizTable
            head={['Term', 'Billed', 'Collected', 'Pending', 'Paid bills', 'Pending bills', 'Learners']}
            rows={terms.map((t) => [
              `Term ${t.term_no}`, inr(t.billed), inr(t.collected), inr(t.pending),
              num(t.paidBills), num(t.pendingBills), num(t.learners),
            ])}
          />
        }
        csv={{
          filename: `bill-analytics-by-term${yearLabel ? `-${yearLabel}` : ''}.csv`,
          head: ['Term', 'Billed', 'Collected', 'Pending', 'Paid bills', 'Pending bills', 'Learners'],
          rows: terms.map((t) => [t.term_no, t.billed, t.collected, t.pending, t.paidBills, t.pendingBills, t.learners]),
        }}
      />

      {summary.staffDeferred > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {num(summary.staffDeferred)} staff record(s) are deferred (tracked, not billed) and excluded from the figures above.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab into `page.tsx`**

In `app/(admin)/bill-management/page.tsx`, make these edits:

**(a)** Add `next/dynamic` and `Loader2` to the imports. Change the lucide import line:

```ts
import { Download, IndianRupee, Wallet, Clock, AlertTriangle, Users, FileX } from 'lucide-react';
```

to:

```ts
import dynamic from 'next/dynamic';
import { Download, IndianRupee, Wallet, Clock, AlertTriangle, Users, FileX, Loader2 } from 'lucide-react';
```

**(b)** Change the `View` type:

```ts
type View = 'bills' | 'unbilled';
```

to:

```ts
type View = 'bills' | 'unbilled' | 'analytics';
```

**(c)** Add the lazy component right after the `TYPE_FILTER` const (top-level, module scope):

```ts
// recharts (~390 KB) is heavy — load the analytics view as its own lazy chunk so
// Bills/Unbilled never ship it. ssr:false: it renders client-only from cached rows.
const BillAnalytics = dynamic(() => import('./bill-analytics'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-green-600" />
    </div>
  ),
});
```

**(d)** Add the third toggle button. After the Unbilled `ToggleBtn` (the one ending `</ToggleBtn>` before the closing `</div>` of the toggle group), insert:

```tsx
        <ToggleBtn active={view === 'analytics'} onClick={() => setView('analytics')}>
          Analytics
        </ToggleBtn>
```

**(e)** Add the analytics render branch. Change the start of the main conditional from:

```tsx
      {!selectedYear ? (
        <EmptyMsg>Select a transport year to view billing.</EmptyMsg>
      ) : view === 'bills' ? (
```

to:

```tsx
      {!selectedYear ? (
        <EmptyMsg>Select a transport year to view billing.</EmptyMsg>
      ) : view === 'analytics' ? (
        billsLoading || !summary ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : (
          <BillAnalytics rows={rows} summary={summary} yearLabel={isAll ? undefined : yearLabel} />
        )
      ) : view === 'bills' ? (
```

(The rest of the ternary — the Bills `DataTable` and the Unbilled `DataTable` branches — stays exactly as-is. Note the Analytics toggle is intentionally NOT disabled for "All years"; only Unbilled is.)

- [ ] **Step 3: Build to verify everything compiles**

Run: `npm run build`
Expected: build succeeds. No errors from `bill-analytics.tsx` or `bill-management/page.tsx`.

- [ ] **Step 4: Verify recharts stays out of the module's first-load JS**

In the `npm run build` route summary, note the First Load JS for `/bill-management`. recharts should live in a **separate lazy chunk**, not the route's first-load bundle (i.e., `/bill-management` first-load should not balloon by ~390 KB vs. before this task). Optionally, in the running app with the browser Network tab open, confirm the recharts chunk is fetched only when the **Analytics** toggle is first clicked.

- [ ] **Step 5: Probe the tab in the running app**

With `npm run dev` (on :3001) and the user's authenticated browser:
1. Open `/bill-management`, pick a transport year with bills → click **Analytics**.
2. Confirm: the Collection-rate meter, Fully-paid & Overdue tiles, and all three charts render; each chart's chart⇄table toggle works; the "By term" CSV downloads.
3. Toggle the app to dark mode → charts recolor (class-based `.viz-scope`).
4. Verify the analytics numbers reconcile with the KPI cards: chart "Collected" + "Pending" == the Billed KPI; Collection-progress "Total billed" == Billed KPI.
5. Switch the year selector to **All years** → Analytics still renders (aggregated); switch to a year with zero bills → the empty state shows.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/bill-management/bill-analytics.tsx" "app/(admin)/bill-management/page.tsx"
git commit -m "feat(bill-management): add lazy-loaded Analytics tab (money, learners, per-term)"
```

---

## Self-Review

**Spec coverage:**
- Billed/Collected/Pending → Task 3 headline Meter + Collection-progress chart (reads `summary`). ✓
- Learners paid vs pending (count) → Task 1 `learnerPaymentBreakdown` + Task 3 Learner-payment-status chart (Fully paid / Partially / Unpaid + overdue sub-stat). ✓
- Term 1 & Term 2 analytics → Task 1 `termBreakdown` + Task 3 "By term" chart & table. ✓
- Placement as 3rd toggle segment, KPIs stay on top → Task 3 (e)(d). ✓
- Shared viz kit extracted, /analytics refactored onto it → Task 2. ✓
- recharts stays lazy → Task 3 dynamic import + Step 4 verification. ✓
- Reconciliation rule (learner && not cancelled; staff excluded) → Task 1 `activeLearnerRows`, tested. ✓
- Table twins + CSV + dark mode + no new hues → Task 2 kit + Task 3 usage. ✓
- All-years and empty-state handling → Task 3 `hasData` / `scope` + Step 5.5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. ✓

**Type consistency:** `LearnerPaymentBreakdown` keys (`fullyPaid`/`partiallyPaid`/`unpaid`/`overdue`/`totalLearners`) are indexed via `learners[b.key]` where `BUCKETS[].key` is exactly `fullyPaid|partiallyPaid|unpaid` — a strict subset, so the index type-checks. `TermStat` fields used in Task 3 (`term_no`,`billed`,`collected`,`pending`,`paidBills`,`pendingBills`,`learners`) match Task 1's definition. `VizTable` (kit) is the same symbol imported in both consumers; analytics-view aliases it back to `DataTable`. `BillAnalytics` prop shape matches the `page.tsx` call site (`rows`,`summary`,`yearLabel`). ✓

## Out of scope

Server-side analytics endpoint; payment recording / per-bill drill-down (module phase-2); staff billing; per-institution or per-structure analytics.
