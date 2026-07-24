# Bill Management → Analytics: institution / department / term breakdowns — Design

**Date:** 2026-07-24
**Status:** Awaiting user confirmation
**Module:** `/bill-management` Analytics tab (adds grouped reports; no change to Bills/Unbilled)

## Goal

Add to the Analytics tab: **institution-wise** and **department-wise** breakdown reports, an
**overall paid-learners** figure, and **term-wise paid details** — all reconciling with the
existing KPI tiles.

## Decisions (confirmed with the user)

1. **Grouped reports, no filter dropdowns.** The tab shows the existing overall charts PLUS an
   institution-wise report table and a department-wise report table (one row each). No narrowing
   dropdowns — every section always shows the whole selected transport year. (Dropdown narrowing
   is an easy future add if wanted.)
2. **Term-wise = paid learners + amounts.** Per term: distinct learners fully paid / partial /
   unpaid, plus collected & pending amount.
3. **"Paid learner" = paid > 0** for the single headline figure, shown as **"Paid (incl.
   partial)"**. Report tables still break out the three exclusive buckets so nothing is hidden.

## Locked definitions (reconcile Q2 + Q3)

A learner's status in a scope = fold their active (non-cancelled, learner) term rows:
`paid = Σ paid_amount`, `pending = Σ pending_amount`.

- **Fully paid**: `pending == 0`
- **Partial**: `paid > 0 && pending > 0`
- **Unpaid**: `paid == 0`

Buckets are mutually exclusive and exhaustive. The headline **"Paid (incl. partial)" = Fully +
Partial** (`paid > 0`). Report tables show all three columns; only the one headline number uses
the inclusive rule, and it is labeled so it can't be confused with the "Fully paid" column.

Term-wise uses the same three buckets computed **per term** (one row per learner per term, so a
learner's per-term status is that row's paid/pending). Staff are excluded everywhere (every
aggregator filters `isActiveLearnerBill` — learner && not cancelled), matching the KPI tiles.

## The one data-layer gap: department

`TransportBillRow` already carries `institution_id`/`institution_name`, so institution-wise and
term-wise are pure client-side re-aggregation of the rows already in the React Query cache.
**Department is not on the row.** Confirmed against the live DB: `learners_profiles.department_id`
exists, the `departments` table has `id, department_code, department_name`, and the current year
has 990 billed learners across 7 institutions / 18 departments.

**Fix (one-time, additive, at the data layer — `lib/fees/bills.ts`):**
- `resolvePeople`: add `department_id` to the learners_profiles and staff selects; return it.
- Add a `departments` name map (`nameMapFor(supabase, 'departments', 'department_name', ids)`),
  fetched in parallel with the existing institutions map (batch 2).
- Add `department_id` + `department_name` to `TransportBillRow`; populate in the row builder.
- No API-route change — the enriched fields flow through `loadTransportBills` automatically.
- Bills/Unbilled tables are untouched (they ignore the new fields). A Department column/filter on
  the Bills table is a trivial future add, out of scope here.

## Aggregations (`lib/fees/bill-analytics.ts`, pure/tested)

- **New `GroupStat` + `groupLearnerPayments(rows, pickKey, pickLabel)`** — folds each learner's
  terms within a group, buckets once, sums collected/pending. A learner belongs to exactly one
  institution and one department, so no double counting. `null` key → an "Unassigned" bucket
  (real: some rows may lack institution/department). Returns rows sorted by learner count desc.
  - `groupByInstitution(rows)` = `groupLearnerPayments(rows, r=>r.institution_id, r=>r.institution_name)`
  - `groupByDepartment(rows)` = `groupLearnerPayments(rows, r=>r.department_id, r=>r.department_name)`
  - `GroupStat = { key, label, learners, fullyPaid, partiallyPaid, unpaid, collected, pending }`
- **Extend `termBreakdown`** → add per-term distinct-learner counts `fullyPaidLearners`,
  `partialLearners`, `unpaidLearners` (existing amount/bill-count fields stay).
- `learnerPaymentBreakdown` is unchanged; the UI derives "Paid (incl. partial)" = fullyPaid +
  partiallyPaid from it.

## UI (`app/(admin)/bill-management/bill-analytics.tsx` — same lazy recharts chunk)

Keep the existing headline strip + 3 charts (the "overall" view). Update the middle headline tile
to **"Paid (incl. partial): (fully+partial) / total"** with sub `"X fully · Y partial · Z unpaid"`.
Extend the By-term table with the three learner columns + CSV. Add two new sections:

- **Institution-wise report** — VizTable + a horizontal bar (collection rate per institution),
  columns: Institution · Learners · Fully paid · Partial · Unpaid · Collected · Pending · Rate.
  CSV export.
- **Department-wise report** — same shape, per department. CSV export.

All built on the shared viz kit (`_viz/kit`), reconciling with the KPI tiles by construction
(same rows, same `isActiveLearnerBill`). ~2000 rows → 7/18 groups is trivial `useMemo` compute.

## Testing

Extend `lib/fees/bill-analytics.test.ts`: `groupLearnerPayments` (grouping, Unassigned bucket,
distinct-learner folding across terms, the three bucket rules, amount sums), and the new
`termBreakdown` learner-count fields. Data-layer department enrichment is verified by build +
a dry read (institution enrichment already has the same shape and is trusted).

## Out of scope
- No filter dropdowns (chosen: grouped reports only).
- No Department column/filter on the Bills table (future, trivial once the field exists).
- No named per-term learner lists (chosen against — the Bills export already covers that).
- No new API route, permission, or DB migration.

## Verification
Build ✓ + vitest green (new aggregator tests) + `tsc` clean on touched files. Live-DB sanity:
a SQL replica of institution/department grouping matches the aggregator output for the current
year. Rendered tab is auth-gated → human browser check.
