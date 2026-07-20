# Bill Management — Analytics tab (design)

- **Date:** 2026-07-20
- **Module:** `/bill-management` (admin), gated `tms.fees.view`
- **Status:** Approved design → implementation plan next
- **Related:** `project_fees_module`, `project_analytics_module` (dataviz rebuild)

## Goal

Add an **Analytics** view to the existing Bill Management module that visualizes transport
billing for the selected transport year (or All years):

1. **Billed / Collected / Pending** money split.
2. **How many learners are paid vs pending** (counted by distinct learner).
3. **Per-term analytics** (Term 1 / Term 2 / …).

Built with the project's existing dataviz chart toolkit.

## Key facts driving the design

- `/api/admin/bill-management?year=<id|all>` already returns `{ summary, rows }`, where
  `rows: TransportBillRow[]` is **one row per term-bill**, each carrying `term_no`, `amount`,
  `paid_amount`, `pending_amount`, `status`, `person_id`, `person_type`, `institution_name`,
  `structure_name`. The page already fetches this under React Query key
  `['bill-management', selectedYear]`. **All required numbers are derivable client-side.**
- A dataviz-compliant chart kit already exists, private to
  `app/(admin)/analytics/analytics-view.tsx`: `ChartCard` (chart⇄table toggle + CSV),
  `StatTile`, `Meter`, `Legend`, `EmptyState`, `VizTooltip`, `downloadCsv`, the validated
  `.viz-scope` light/dark palette (`VIZ_CSS`), formatters, axis consts.
- recharts (~390 KB) is loaded **only** via `next/dynamic({ ssr:false })` on `/analytics`.
  Bill Management is currently recharts-free and must stay so until the tab is opened.
- The reconciliation rule (from `summarizeBills` / the `project_fees_module` memory):
  money counts only `person_type==='learner' && status!=='cancelled'`. Cancelled (vacated)
  bills are voided; staff are `staff_deferred` (no money). Analytics MUST use the same rule
  so charts and KPI tiles never disagree.

## Decisions (confirmed with user)

1. **Placement:** third segment in the existing `Bills / Unbilled` toggle → `Bills / Unbilled / Analytics`.
   The 6 KPI cards stay above the toggle; the Analytics view does **not** repeat the
   billed/collected/pending amounts.
2. **Learner split granularity:** `Fully paid / Partially paid / Unpaid` (3 buckets by distinct
   learner) with **overdue** shown as a red sub-stat (a flag, not a 4th bucket).
3. **Shared chart code:** **extract** the reusable primitives into a shared module
   (`app/(admin)/_viz/kit.tsx`); refactor `/analytics` to import them; build the new tab on the
   same kit. (Rejected: duplicating ~200 lines into bill-management.)

Rejected overall alternative: a server-side analytics endpoint — it would re-query the ledger
for data already shipped to the client. Client-side aggregation is cheaper and simpler.

## Architecture

### New / changed files

| Action | File | Purpose |
|---|---|---|
| New | `app/(admin)/_viz/kit.tsx` | Shared viz primitives: `VIZ_CSS`, `ChartCard`, `DataTable`, `StatTile`, `Meter`, `Legend`, `EmptyState`, `VizTooltip`, `downloadCsv`, formatters (`inr`, `inrCompact`, `num`, `titleCase`), axis consts (`gridProps`, `axisTick`, `axisLine`), `card`, and a shared `PAYMENT_STATUS_META` (paid/partially_paid/unpaid/overdue/… → label+color+icon). |
| Edit | `app/(admin)/analytics/analytics-view.tsx` | Remove the now-shared local defs; import from `_viz/kit`. Pure relocation — no behavior/visual change. Domain-specific charts (RouteLoad, FleetCompliance, etc.) and their metadata stay local. |
| New | `lib/fees/bill-analytics.ts` | Pure, React-free aggregation over `TransportBillRow[]`: `learnerPaymentBreakdown(rows)` and `termBreakdown(rows)`. |
| New | `lib/fees/bill-analytics.test.ts` | Vitest unit tests (mirrors `bills.test.ts`). |
| New | `app/(admin)/bill-management/bill-analytics.tsx` | The Analytics view. `'use client'`; imports recharts + `_viz/kit`; props `{ rows: TransportBillRow[]; summary: BillSummary; yearLabel?: string }`. |
| Edit | `app/(admin)/bill-management/page.tsx` | `View` gains `'analytics'`; add third `ToggleBtn`; load `BillAnalytics` via `next/dynamic({ ssr:false, loading })`; render it (with `rows`/`summary`/`yearLabel`) when `view==='analytics'`. Works for a specific year and All years. |

### Aggregation contract (`lib/fees/bill-analytics.ts`)

"Active learner rows" = `person_type==='learner' && status!=='cancelled'`.

```ts
export interface LearnerPaymentBreakdown {
  fullyPaid: number;      // distinct learners, Σpending <= 0
  partiallyPaid: number;  // Σpaid > 0 && Σpending > 0
  unpaid: number;         // Σpaid <= 0 && Σpending > 0
  overdue: number;        // distinct learners with any status==='overdue' row (subset)
  totalLearners: number;  // distinct active learners
}
export function learnerPaymentBreakdown(rows: TransportBillRow[]): LearnerPaymentBreakdown;

export interface TermStat {
  term_no: number;
  billed: number; collected: number; pending: number;
  paidBills: number;    // rows with pending <= 0
  pendingBills: number; // rows with pending > 0
  learners: number;     // distinct learners billed in this term
}
export function termBreakdown(rows: TransportBillRow[]): TermStat[]; // ascending by term_no
```

Money split for the headline/chart 1 is read from the `summary` prop
(`totalBilledAmount`/`collectedAmount`/`pendingAmount`) — no recompute.

### What the Analytics view renders

Headline strip (non-redundant with the KPI row):
- `Meter` **Collection rate** = collected ÷ billed %.
- `StatTile` **Fully paid learners** (of total billed learners).
- `StatTile` **Overdue** (red tone).

Three `ChartCard`s (each ships its table-view twin + CSV; theme-aware palette):
- **Collection progress** — one part-to-whole horizontal stacked bar: Collected (`--viz-good`) +
  Pending (`--viz-context`) = Billed.
- **Learner payment status** — horizontal bars of distinct-learner counts
  (Fully paid / Partially / Unpaid), good→warning→serious; "of which overdue: N".
- **By term** — stacked columns per term (Collected + Pending money); table twin adds
  Billed / Paid-bills / Pending-bills / Learners per term.

### Edge & empty handling

- No rows (empty year; `42P01` table-missing already returns empty) → each card's `EmptyState`.
- "All years" aggregates across all returned rows; subtitles note "across all years".
- Optional small note: "Staff deferred: N (recorded, not billed)".

## Testing & verification

- **TDD** the pure functions: write `lib/fees/bill-analytics.test.ts` first, covering
  distinct-learner classification, cancelled/staff exclusion, term grouping/sort, and empty input.
- `vitest run lib/fees/bill-analytics.test.ts`; existing `lib/fees/bills.test.ts` stays green.
- `next build` passes (the real gate — tsc is not build-gated on this project); new/edited files
  introduce **no new** type errors.
- Confirm recharts stays out of `/bill-management`'s initial JS chunk (dynamic-import boundary).
- Probe `/bill-management` and `/analytics` both still load; user visually confirms the
  `/analytics` extraction is regression-free.

## Out of scope

- Server-side analytics endpoint; payment recording / per-bill drill-down (that is the module's
  separate phase-2); staff billing; per-institution or per-structure analytics (can follow later).
