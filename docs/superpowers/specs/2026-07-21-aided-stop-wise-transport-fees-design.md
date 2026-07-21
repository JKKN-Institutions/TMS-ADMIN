# Stop-Wise Transport Fees (Arts Aided) — Design

**Date:** 2026-07-21
**Module:** Fees Structure (`tms_fee_structure` + generation into `billing_student_bills`)
**Status:** Approved — implementation not started

## Problem

**JKKN College of Arts and Science (Aided)** prices transport by **boarding stop**: a student
boarding further from campus pays more. The existing fee module has no per-stop dimension —
a structure carries one `total_amount`, optionally varied by year of study.

This must apply **only to Arts Aided** and must **not change** any other college's existing
fee structures, generated bills, or the current generation flow.

## Source data analysis — `AIDED_BUS_FEES_2022-2023_ENGLISH.xlsx`

The supplied workbook was analysed in full before designing. **Its amounts are not usable**;
its *shape* is.

**Contents.** 4 sheets, 2 populated. `FEES 22-23` is operative: 22 route blocks, 385 stop rows,
361 carrying an amount, 66 distinct values spanning ₹4,400–₹30,250. Each block is
`Sl.No | R.No | Bus No. (registration) | S.T | E.T | Stop | Annual fee`, terminating at a
fee-less "College" row. `BUS TICKETS 22-23` shows the derivation: one-way `RATE` → `×2` per day
→ `×25` days → `×11` months → rounded.

**Finding 1 — fee is a property of *(route, stop)*, never of the stop name.**
30 stop names appear on multiple routes with **different** amounts. "Bypass" is ₹5,500 on routes
81/84/79 but ₹18,150 on route 86. "Kanapathipalaiyam" is ₹21,000 on route 96 and ₹6,600 on
route 79. A schema keyed on stop name alone would silently mis-bill. *(Drives decision 3.)*

**Finding 2 — identifiers in the sheet are not unique.**
22 blocks carry only 19 distinct route numbers and 20 distinct registrations. Routes 79, 90 and
98 each appear twice; 79 and 90 each reuse one registration across both blocks. Neither
`R.No` nor `Bus No.` is a safe key.

**Finding 3 — the 2022-23 route network no longer exists.**

| Comparison | Result |
|---|---|
| Excel route numbers (74–100) vs live route numbers (01–40) | **0 overlap** |
| Excel registrations matched to route-assigned vehicles | **4 / 20** |
| Stop names matched exactly | **12%** |
| Stop names matched fuzzily (transliteration-folded + Levenshtein ≥ 0.80) | **35%** |
| Excel blocks reaching ≥ 70% stop overlap with any live route | **1 / 22** |
| Live routes with no Excel counterpart | **10 / 24** |

Fuzzy matching recovers *route identity* (Excel "Pulampatti" → live `07 POOLAMPATTI` at 89%;
"Kuruvarettiyur" → `06 GURUVUREDIYUR`; "SANKARI RS" → `32 SANKAGIRI RS`) but stop-level recovery
stalls at 35%. The network was restructured — routes split and merged, not merely renamed.

**Matching on vehicle registration — the originally requested join — is the weakest available
signal.** Only 4 of 20 match, and where they do the bus has usually moved routes: `TN56Y5666`
ran Excel route 75 "Nangkavalli"; today it runs live route 12 "EADAPPADI". A registration
identifies a *bus*, and buses are reassigned between years. The stable identity is the route.

**Finding 4 — the sheet is silent on every stop actually in use.**
The 4 stops where Aided bus students board today (`KANDA KULA MANIKKAM` r13, `KUPPANOOR` r24,
`KACHU PALLI` r37, `METTUPALAYAM` r37) have **zero** exact matches in the workbook. The nearest
partial hit, "Kuppanur Bypass", itself carries two conflicting amounts (₹7,150 and ₹13,400).

**Conclusion.** Build the mechanism; source the amounts from a current 2026-27 sheet keyed to
live routes and stops. *(Decision 1.)*

## Current state (verified against live DB, 2026-07-21)

- `tms_fee_structure` scopes on exactly three dimensions: `institution_ids uuid[]`,
  `lifecycle_statuses text[]`, and a hard-wired `bus_required = true`. The academic dimensions
  (degree/department/programme/semester/quota) were dropped in
  `20260617000000_fee_structure_institution_multi.sql`. There is **no** `route_id`, **no** stop,
  and **no** aided/self column anywhere in the schema.
- `fee_mode` is `'flat' | 'tiered'`; tiered varies by year of study via
  `tms_fee_structure_year_band`. Amounts come from `tms_fee_structure_term` rows **verbatim** —
  the generator performs no per-student computation.
- 3 structures exist (1 tiered "Transport Fees 2026-2027(Arts Self)", 2 flat); 1,952 bills
  generated to date.
- The Aided/Self split is already clean: separate `institutions` rows,
  `JKKN College of Arts and Science (Aided)` = `a33138b6-4eea-4675-941f-1071bf88b127`,
  `institution_type = 'aided'`. No new scoping mechanism is needed.
- `learners_profiles.transport_stop_id` is a hard FK to `tms_route_stop.id`, validated against
  the learner's route on assignment (`app/api/admin/enrollment-requests/route.ts:160-168`). A
  student's boarding stop is therefore already precisely known.
- **No per-stop fare exists.** `tms_route.fare` is a single flat number, hardcoded to `0` by the
  route importer (`lib/routes/parse-route-workbook.ts:255`). `tms_route_stop` has no amount column.
- Arts Aided: **389 learners, 6 with `bus_required = true`**, all 6 `active` and all 6 carrying a
  `transport_stop_id`, spread across 4 stops on routes 13, 24 and 37.

## Decisions

1. **Amounts come from a current 2026-27 sheet, not the 2022-23 workbook.** The workbook prices
   a network that no longer runs and omits every stop in use. To unblock the college, the system
   **generates a pre-filled template** from `tms_route_stop` for them to complete — inverting the
   problem so their sheet speaks our vocabulary rather than being reconciled after the fact.
2. **New `fee_mode = 'stop_wise'`**, opt-in per structure, alongside `flat` and `tiered`.
   Restricted to `audience = 'student'`.
3. **The rate hangs off the fee structure, not off `tms_route_stop`.** Aided and Self students
   board the *same physical stops*; a fare column on the stop cannot be Aided-specific.
   Rejected on that basis.
4. **One shared instalment schedule; per-stop annual amount split across it.** Each stop carries
   a single annual figure (matching the workbook's shape and keeping the college's sheet to one
   amount column); terms define due dates and percentage shares once.
5. **Scope = Arts Aided only, by configuration** (the structure's `institution_ids`), not
   hard-coded — consistent with the Arts Self tiered precedent.
6. **Missing data is never guessed.** A student with no stop, or whose stop has no rate, is
   `unresolved`: skipped, counted, and reported by name. Same precedent tiered mode sets.

## Schema

Two **new** tables. No existing table's columns change; `tms_fee_structure_term` and
`tms_fee_structure_year_band` are untouched.

```sql
-- additive CHECK value only
alter table tms_fee_structure drop constraint tms_fee_structure_fee_mode_check;
alter table tms_fee_structure add constraint tms_fee_structure_fee_mode_check
  check (fee_mode in ('flat','tiered','stop_wise'));

-- per-stop annual rate. stop_id only: route is derived via tms_route_stop.route_id,
-- so a denormalised route_id cannot drift out of sync.
create table tms_fee_structure_stop_rate (
  id               uuid primary key default gen_random_uuid(),
  fee_structure_id uuid not null references tms_fee_structure(id) on delete cascade,
  stop_id          uuid not null references tms_route_stop(id)    on delete cascade,
  annual_amount    numeric(12,2) not null check (annual_amount >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (fee_structure_id, stop_id)
);
create index idx_tms_fee_stop_rate_structure on tms_fee_structure_stop_rate (fee_structure_id);

-- the shared instalment schedule for stop_wise structures
create table tms_fee_structure_stop_term (
  id               uuid primary key default gen_random_uuid(),
  fee_structure_id uuid not null references tms_fee_structure(id) on delete cascade,
  term_no          int  not null,
  term_label       text,
  due_date         date not null,
  share_percent    numeric(5,2) not null check (share_percent > 0 and share_percent <= 100),
  created_at       timestamptz not null default now(),
  unique (fee_structure_id, term_no)
);
```

A stop-wise term stores a **percentage share**, not a rupee amount — the rupee value is unknown
until the student's stop is known. That is why it does not reuse `tms_fee_structure_term`, whose
`amount` column is meaningless here.

**Application-level invariant:** shares for a structure must sum to exactly 100. Enforced in the
API on write (a DB constraint cannot span rows without a trigger; not worth one at this scale).

## Amount resolution

Pure function, `lib/fees/stop-rate.ts`:

```ts
splitAnnual(annual: number, shares: number[]): number[]
// terms 1..n-1: Math.round(annual * share / 100)
// term n:       annual - sum(previous)
```

The remainder lands on the **final** term so `sum(terms) === annual` exactly. Without this,
₹9,999 at 50/50 yields two ₹5,000 bills and over-charges by ₹1 — drift that surfaces months
later as an unexplained balance.

## Generation — and how the current flow stays intact

`app/api/admin/fees/[id]/generate/route.ts` is the **only** shared file that changes. It today
discriminates on a single boolean `isTiered` across ~6 decision points; a third mode falls
through them wrongly (at line 123 a `stop_wise` structure would take the `!isTiered` path and
bill the term's `amount` **verbatim, which is 0**). It cannot be a passive addition.

Strategy — **extract, characterize, then extend**:

1. Extract the decision logic into a pure function, `lib/fees/resolve-terms.ts`:
   ```ts
   resolvePersonTerms(mode, person, { flatTerms, bands, stopTerms, stopRates })
     → { terms: BillableTerm[] } | { unresolved: reason }
   ```
   No Supabase, no I/O.
2. **Write characterization tests pinning today's `flat` and `tiered` output before touching
   anything.** They must pass against current behaviour.
3. Move the existing branch logic into the function unchanged; the tests prove the move faithful.
4. Add `stop_wise` as a third branch **inside the pure function**, where it is cheap to test
   exhaustively.

The route keeps **one** write loop — no duplicated idempotency, conflict-check or insert logic,
so fixes land once. Its remaining edits shrink to term-loading and the preview summary. A
regression to flat/tiered becomes a failing test rather than a wrong bill.

`lib/fees/applicability.ts` is **not** modified (the staff cron also calls it). The stop-wise
path calls `resolveApplicablePeople` unchanged for the cohort, then fetches
`transport_stop_id` for those ids in a separate chunked query.

Dry-run reports both unresolved categories by name before anything is written. This is the
safety gate.

## Template export and import

- `GET /api/admin/fees/[id]/stop-rates/template` → `.xlsx` generated from `tms_route_stop`:
  `route_number, route_name, sequence_order, stop_name, stop_id, annual_amount` (blank).
- `POST /api/admin/fees/[id]/stop-rates/import` → matches on **`stop_id`** (authoritative),
  cross-checks `route_number` + `stop_name` and rejects rows where they disagree. Reports
  per-row errors; imports nothing on structural failure.

Keying on `stop_id` is what makes this exact rather than fuzzy. The visible name columns exist
so a human can read and edit the sheet, and act as a tripwire if rows are reordered or pasted.

## UI

- `/fees/[id]`: a **Stop rates** SectionCard, rendered only when `fee_mode = 'stop_wise'` —
  grouped by route, showing stop, sequence, amount, and the count of Aided students at that
  stop; with template download, sheet upload and inline edit.
- `fee-structure-form.tsx`: gains the mode. Selecting it hides year bands and switches the term
  editor from rupee amounts to percentage shares (validated to sum to 100).
- `/student/fees`: shows the student their route, stop, annual rate and term breakdown.

## Non-goals

- Combining stop-wise with year-of-study tiering. The three modes stay mutually exclusive.
- Making staff bills *payable*. See the amendment below — staff are now in scope, but only on the
  existing deferred-ledger path.
- Backfilling or reconciling the 2022-23 workbook.
- Any change to flat or tiered behaviour.

## Amendment — 2026-07-21: staff are in scope

**User directive:** *"create the new fee structure for the aided, it's also applicable for all
institution staffs for the above stopwise fees, so not update the arts self fee structure."*

This reverses the original non-goal. Stop-wise now serves **two audiences**, via **two separate
structures** — `tms_fee_structure.audience` is `'student' | 'staff'`, so one structure cannot do both:

| | Structure A | Structure B |
|---|---|---|
| `fee_mode` | `stop_wise` | `stop_wise` |
| `audience` | `student` | `staff` |
| `institution_ids` | `[a33138b6-…]` (Arts Aided) | `NULL` = **all institutions** |
| `staff_role_keys` | — | `NULL` = all roles |
| Cohort (verified 2026-07-21) | 6 learners | **105 active staff, all with a boarding stop, across 9 institutions** |

**Feasibility confirmed:** `staff` carries the same transport columns as `learners_profiles` —
`transport_stop_id`, `transport_route_id`, `bus_required`, `institution_id`, `role_key`, `is_active`.

**Rates:** identical amounts for both. Stop rates hang off the structure, so the same filled template
is uploaded to each. Keeping them separate preserves the option of subsidised staff rates later.

**Staff bills stay LEDGER-ONLY — decided knowingly.** The generator writes staff a `tms_fee_bill` row
with `status = 'staff_deferred'` and `billing_student_bill_id = null`. It cannot do otherwise:
`billing_student_bills.student_id` has a NOT NULL FK to `learners_profiles`, which rejects a staff id.
So staff get a *record* of what they owe — visible in Bill Management, exportable — but **no payable
bill in MyJKKN and no payment gate**. Making staff genuinely billable would need a schema change on a
MyJKKN-owned table or a separate staff billing table; that is out of scope.

**Code impact:** two surgical changes to `app/api/admin/fees/[id]/generate/route.ts` —
(1) drop the `audience === 'student'` guard on stop-wise; (2) read boarding stops from `staff` when
`audience = 'staff'`, from `learners_profiles` otherwise. Plus the form (Task 10) must allow
`stop_wise` with `audience = 'staff'`.

## Risks

- **Blast radius is 6 students.** Excellent for safe rollout, but if hundreds are expected then
  `bus_required` is unset on the learner records — a separate data problem to fix before this
  feature does anything visible.
- **Rates are year-scoped; stops are not.** A stop rate belongs to a structure, which belongs to
  one `transport_year`. Next year means a new structure and a fresh sheet — the template/import
  cycle is annual, not one-time.
- **External dependency.** Phases 1–4 ship without the amounts; the template is the deliverable
  that unblocks the college. Nothing bills until rates are loaded and the structure activated.
- **Route/stop edits after import.** Deleting a stop cascades its rate away (`on delete
  cascade`); students at that stop then become `unresolved` rather than mis-billed — correct,
  but the dry-run must be re-run after any route restructure.

## Verification

`npm run lint` crashes on a circular config and `tsc` is chronically red on `main` without
gating `next build` (`ignoreBuildErrors: true`), so neither is a usable regression gate here.

1. `vitest` — characterization tests for flat/tiered, plus new cases for `splitAnnual`
   (remainder placement, zero amount, uneven shares), share-sum validation, the import
   row-matcher, and every `unresolved` path.
2. `next build` must pass.
3. Path-scoped `tsc` on changed files only.
4. Live smoke: create structure → download template → upload → **dry-run** → confirm counts
   against the 6 known Aided students → generate.
5. Confirm an existing flat and an existing tiered structure still dry-run to identical counts
   as before the change.

## Phases

| Phase | Contents |
|---|---|
| 1 | Migration; `lib/fees/stop-rate.ts`; extract `resolve-terms.ts`; characterization tests |
| 2 | Stop-rate CRUD API; template export; sheet import |
| 3 | Admin UI — form mode + Stop rates card |
| 4 | Generator branch + dry-run unresolved reporting |
| 5 | Student portal display |
