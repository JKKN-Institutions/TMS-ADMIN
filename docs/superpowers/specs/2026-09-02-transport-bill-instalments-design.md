# Transport bills: one bill per learner, with instalments

**Date:** 2026-09-02
**Status:** Approved for implementation
**Scope:** Learner transport bills only. Staff billing is deliberately unchanged.

## Problem

A transport learner today receives one `billing_student_bills` row **per term**. For
TY 2026-2027 that is 1,524 bills across 928 learners — most people carry a separate
"Term 1" and "Term 2" debt.

College fees, in the same shared table, use a different grain: **one bill for the
year**, with the payment timeline held as child rows in `billing_bill_instalments`
and rendered on `/billing/schedule/students/{id}`. That is the format the office
recognises as a fee schedule.

Transport should use the same format.

## Decisions taken

| Question | Decision |
|---|---|
| What does "one bill format" mean? | One **bill** per learner per transport year. The five fee structures stay as they are. |
| Existing 2026-2027 bills? | Convert the 490 fully-unpaid learners. Leave the 423 settled and the 15 part-paid alone. |
| Staff? | Unchanged. Learners only. |

## What the platform already does for us

Measured live on 2026-09-02 inside a `DO $$ … RAISE EXCEPTION` block that rolled back:

```
A) insert bill Rs 5,500 + instalments 2,750 / 2,750  -> bill.due_date = 2026-07-31
B) pay instalment 1 (balance -> 2,750)               -> bill.due_date AUTO-ADVANCED to 2026-08-31
                                                        status = partially_paid
                                                        state[1] settled=true, state[2] settled=false
C) reprice 5,500 -> 9,600                            -> instalments rescaled to 4,800 / 4,800,
                                                        due dates preserved
```

The relevant machinery:

- **`bbi_validate_sum_equals_bill`** — a `DEFERRABLE INITIALLY DEFERRED` constraint
  trigger. Instalments must total `final_amount` exactly. Consequence for us:
  **every instalment of a bill must be written in ONE array insert.** Inserting
  them one at a time fails on the first row, because at that moment the sum is
  short.
- **`trg_z_bbi_sync_due_date_after_payment`** — on any `balance_amount` change,
  the bill's `due_date` moves to the next unsettled instalment (step B above).
- **`billing_bill_instalment_state(bill_id)`** / `vw_bill_instalment_state` —
  waterfall-allocates the bill's paid amount oldest-instalment-first and reports
  `allocated_amount`, `outstanding`, `is_settled`, `is_due`. `billing_receipt_items`
  carries only `bill_id`, so this derivation is the only allocation model there is.
- **`bbi_rescale_on_bill_amount_change`** — repricing rescales instalments
  proportionally (step C).

Step B is load-bearing: because the platform advances `due_date` itself, the
**overdue half of the portal gate keeps working unchanged**. `due_date < today`
already means "the next instalment is late".

## Constraint that fixes the ledger grain

`uq_tms_fee_bill_billing_student_bill` is a **unique** index on
`tms_fee_bill.billing_student_bill_id` (partial, where not null). Two ledger rows
cannot point at one merged bill. Therefore `tms_fee_bill` becomes **one row per
bill**, not one per instalment. This is a database fact, not a preference.

With `term_no` pinned to 1, the existing idempotency index
`(fee_structure_id, person_id, term_no, transport_year_id)` becomes exactly
"one bill per person per structure per year" — which is what we want.

## Design

### Config: unchanged

`tms_fee_structure_term` rows (and tiered band terms, and `tms_fee_structure_stop_term`
share percentages) **already describe an instalment schedule**. `resolvePersonTerms()`
returns a `BillableTerm[]` for all three fee modes.

Today the engine loops that array into N bills. It will instead fold it into
1 bill + N instalments.

`lib/fees/resolve-terms.ts`, `lib/fees/overrides.ts`, `lib/fees/applicability.ts`
and `lib/fees/year-of-study.ts` are **not touched**, and their characterization
tests must stay byte-identical green. A rejected alternative was mirroring
`admission_fee_structure_item_schedules` with a new TMS schedule table; it
duplicates configuration that already exists.

### Write path — `lib/fees/generate.ts`

Per learner, replacing the `for (const t of r.terms)` loop:

| Today | New |
|---|---|
| N `billing_student_bills` rows | **1** row: `final_amount` = sum of terms, `due_date` = first term's date |
| — | **N** `billing_bill_instalments` rows in **one array insert**: `sequence_no` = `term_no`, `amount`, `due_date`, `label` = `term_label` |
| N `tms_fee_bill` rows, `term_no` 1..N | **1** row: `term_no = 1`, `amount` = year total, `due_date` = first term's date |
| `bill_description` = `"Transport Fee - 2026-2027 - Term 1"` | `"Transport Fee - 2026-2027"` (no term suffix; band prefix and academic-year part retained) |

Ordering and compensation: bill -> instalments -> ledger. A failure at the
instalments step deletes the bill; a failure at the ledger step deletes both
(the instalments cascade). The existing `ORPHANED BILL` console error is kept as
the last-resort trace. An orphaned money row must remain impossible, because
`Billed == Collected + Pending` depends on it.

`skipEmptyRun`, the born-overdue counter, the activity log and the staff branch
keep their current behaviour. `bornOverdue` now counts **bills**, not terms.

### The two blockers

Both encode "term 1 is paid" as *a bill row whose money status is exactly `'paid'`*.
Under one merged bill, a learner who pays instalment 1 leaves the bill
`partially_paid` — so without this work **every instalment-paying learner is
locked out of the student portal**. This is the highest-consequence part of the
change.

**1. `tms_student_transport_access(p_profile_id)` (SECURITY DEFINER RPC).**

- `term1_paid` becomes "**instalment 1 is settled**", from
  `billing_bill_instalment_state(bill_id)`.
- The `terms` JSON array is rebuilt from instalments: `term_no` <- `sequence_no`,
  `amount` <- instalment amount, `balance` <- `outstanding`, `paid` <- `is_settled`,
  `overdue` <- `is_due AND NOT is_settled`.
- The overdue count / total owed clauses stay on the bill (`due_date < current_date`),
  because the platform keeps `due_date` pointed at the next unsettled instalment.
- Bills with **no** instalment rows (every pre-change bill, and the 15 part-paid
  learners we are not converting) must fall back to today's behaviour. The RPC has
  to serve both shapes for the rest of the year.
- The returned JSON keys are **unchanged**, so `/student/fees` and
  `lib/student/use-transport-access.ts` need no shape change.
- Fail-closed is preserved: never billed still means not cleared
  (`term1_not_billed`).

**2. `lib/fees/term1.ts`.** `isTerm1Paid()` gets the same rule and the same
fallback. It stays pure and fail-closed. `term1PaidLearnerIds()` keeps its
`IN_CHUNK = 150` chunking and its throw-on-error contract — a quietly empty set
here locks out every learner.

### Backfill

One committed migration under `supabase/migrations/`, covering the 490 learners
with no payment activity on their 2026-2027 transport bills:

- **228 learners with two unpaid bills** — raise bill 1's
  `unit_amount`/`total_amount`/`final_amount`/`balance_amount` to the year total,
  delete bill 2 **via `billing_student_bills`** (never via `tms_fee_bill`: that
  path aborts with `27000`, because a BEFORE DELETE trigger deletes the parent and
  the FK cascade returns to the row being deleted). Deleting the money row removes
  bill 2's ledger row **by FK cascade** — do not delete it separately. Then update
  bill 1's ledger row to the year total and insert both instalments in one
  statement.
- **262 learners with one unpaid bill** — attach instalments to the existing bill.
  No money moves.
- **Not touched:** 353 fully paid, 70 paid-single, **15 part-paid**.

Guards:

- Pre-check: every targeted bill has zero rows in `billing_receipt_items` and
  `payment_transaction_items`. Abort the migration if not.
- Post-check: `Billed == Collected + Pending` is unchanged to the rupee, and the
  per-learner year total is unchanged for every converted learner.
- Because `bbi_rescale_on_bill_amount_change` fires on `final_amount` changes,
  raise the amount **before** inserting instalments, never after.

### Read paths

- **`lib/fees/bills.ts`** — `loadTransportBills` returns one row per learner
  instead of one per term. `isActiveBill` / `isActiveLearnerBill` / `summarizeBills`
  keep their current rules; `scoreStaffLedgerRow` is untouched.
- **`lib/fees/bill-analytics.ts`** — `termBreakdown` groups by `term_no`, which
  now collapses to a single bucket. It should read instalments instead so the
  per-term chart keeps its meaning. `learnerPaymentBreakdown`,
  `groupByInstitution` and `groupByDepartment` fold per learner and are unaffected.
- **Bill Management columns / export** — the Term column becomes an instalment
  summary.
- `lib/vacate/requests.ts` references `term_no`; the module is retired but must be
  checked for compile breakage.

### Not in scope

- Staff billing (`lib/fees/staff-bill.ts`, `/boarding/fees`, mark-paid, the staff
  branch of `fn_list_transport_collectables`).
- `fn_list_transport_collectables` itself. It is **MyJKKN-owned**; its learner
  branch aggregates with `SUM`/`array_agg` over `billing_student_bills` and keeps
  reconciling. `bill_count` simply drops from 2 to 1. Do not add a copy of this
  function to this repo.
- Stop-rate repricing reshaping instalment amounts. Real, out of scope, noted below.

## Known consequences

- **`partially_paid` reaches transport for the first time.** 2,180 academic bills
  already carry it; transport has zero. `summarizeBills` and the gate both handle
  it, but any new transport money code must stop assuming unpaid-or-paid.
- **Repricing reshapes instalments.** `bbi_rescale_on_bill_amount_change` rewrites
  amounts proportionally on any `final_amount` change, so the stop-rate repricing
  flow will silently re-split a schedule. Follow-up, not a blocker.
- **Mixed shapes until year end.** The 15 part-paid learners keep two bills. Every
  read path must tolerate both a bill with instalments and a bill without.
- **MyJKKN collection UX shifts.** `PaymentSelectionModal` supports partial amounts
  (`select` -> `amount` step, `OnlinePaymentAmountSelector`, validated against the
  balance), so instalment-sized payments remain possible — but the operator now
  types an amount instead of ticking a term. The instalment schedule itself is
  visible at `/billing/schedule/students/{id}`, which MyJKKN's transport table
  already links to.

## Verification

- Vitest for the pure parts: folding terms into a bill, the new term-1 predicate
  (including the no-instalments fallback), the backfill classifier.
- Fake-supabase engine tests: one bill + N instalments written, instalments in a
  single insert, compensation on each failure point.
- **Execute the rewritten RPC once** via a `DO $$ … RAISE EXCEPTION` rollback block
  before committing the migration. A TypeScript parity test proves agreement, not
  that plpgsql parses — this project has shipped a dead SQL function before.
- `npm run build` plus the full fees suite. `npm run lint` is broken in this repo
  and proves nothing; `tsc` is chronically red on main and is not a regression
  signal.
- Post-backfill live checks: the reconciliation invariant, per-learner totals,
  and `tms_student_transport_access` on a converted learner.
