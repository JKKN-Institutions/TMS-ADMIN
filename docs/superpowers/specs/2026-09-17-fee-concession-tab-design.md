# Fee Concession tab — design

Date: 2026-09-17 · Status: approved in chat, awaiting spec review

## Problem

Two groups of learners pay less than their fee structure says:

- **Final year (50%)** — cohorts whose batch closes in the first half of the
  transport year pay half the annual transport maintenance fee.
- **7.5% scheme** — learners on the Tamil Nadu 7.5% scholarship pay a flat
  Rs 500 per year, all in Term 1.

Billing already honours per-person exceptions (`tms_fee_override`, applied by
`lib/fees/overrides.ts` inside `lib/fees/generate.ts`), but there is no UI or
API to write them. Every concession so far was hand-written SQL, and each
learner billed *after* a one-off run was missed until someone ran a sweep
(PB22025, PB22007, PB22008, PB22042, PB22057 in September 2026).

## Goal

A **Fee Concession** tab in Bill Management where an admin sees, per transport
year, who qualifies for each concession and whether it is already applied, and
applies it to selected learners with one click. Nothing changes without a click.

Out of scope: refunds, partially-paid bills, automatic application by the
billing cron, fixing mislabelled scholarship data in MyJKKN, staff.

## 1. Who is on each list

### New table `tms_fee_concession_rule`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| transport_year_id | uuid not null | FK `tms_transport_year` |
| kind | text not null | `final_year` \| `scheme_75` |
| institution_id | uuid null | required for `final_year` |
| admission_year | int null | required for `final_year` (`admission_years.year`) |
| program_id | uuid null | optional narrowing for `final_year` |
| percent | numeric(5,2) null | required for `final_year` (e.g. 50) |
| annual_amount | numeric(12,2) null | required for `scheme_75` (e.g. 500) |
| is_active | bool not null default true | inactive rules list nobody |
| label | text not null | shown in the UI, e.g. "Pharmacy BPHARM 2022-2026" |
| created_at / created_by / updated_at / updated_by | audit | |

Check constraints enforce the per-kind required columns. At most one active
`scheme_75` rule per transport year (partial unique index).

Seeded for transport year 2026-2027 (`6b3768f9…`):
- `final_year` — JKKN College of Pharmacy, BPHARM, admission 2022, 50%
- `final_year` — Allied Health Sciences (`9c1554e8…`), admission 2023, 50%
- `scheme_75` — Rs 500

**Why admission year, not batch/semester:** `terminal_semester` is unset for four
colleges and `learners_profiles.batch_id` often points at another college's batch
row. `admission_years.year` is the only key that held for both past cohorts.

### Candidates

Base population for every list: `learners_profiles` with
`lifecycle_status = 'active'` and `bus_required = true`.

- **Final Year tab:** base ∩ (for any active `final_year` rule of the year:
  institution matches, admission year matches, program matches if set).
  A learner matching two rules uses the first by `created_at`.
- **7.5% tab:** base ∩ `scholarship_type = '7.5% SCHOLARSHIP'`. No manual
  additions; mislabelled learners appear once MyJKKN is corrected.

### Linking overrides to rules

`tms_fee_override` gains nullable `concession_rule_id uuid` (FK, on delete set
null). Overrides written by Apply carry it. Legacy hand-written overrides are
recognised by reason prefix (`FINAL-YEAR BATCH CLOSURE`, `7.5% SCHOLARSHIP`).

## 2. Row status

For each candidate the API computes:

- **full terms** — `resolvePersonTerms()` from `lib/fees/resolve-terms.ts`,
  i.e. exactly what the generator would bill *without* overrides.
- **target terms** — final_year: each full term × percent, rounded to the
  rupee; scheme_75: term 1 = `annual_amount`, every other term not billable.
- **target total** — sum of billable target terms.
- **bill** — the learner's `tms_fee_bill` for the year (learners have one
  folded bill, `term_no = 1`) and its `billing_student_bills` money row with
  receipt total (`billing_receipt_items.amount_paid`).

| status | condition |
|---|---|
| `applied` | overrides equal the target terms AND (no bill, or money final_amount = ledger amount = target total) |
| `needs_fix` | not applied and one of the fixable bill states below |
| `review` | receipts > 0 and money final_amount ≠ target total (e.g. paid in full, KAMALESH PB22033), or anything the function cannot classify |
| `unresolved` | `resolvePersonTerms` returns no terms (no structure/stop) — nothing to apply |

Only `needs_fix` rows are selectable.

## 3. What Apply does

API computes target terms (section 2) and calls, per learner,
`tms_apply_fee_concession(p_person_id, p_rule_id, p_terms jsonb, p_actor uuid)`
where `p_terms` = `[{term_no, billable, amount}]`. One transaction per learner:

1. Snapshot the ledger row, money row and instalments into
   `tms_fee_concession_log` (id, rule_id, person_id, transport_year_id,
   action, before jsonb, after jsonb, actor, created_at).
2. Upsert the overrides from `p_terms` (on conflict (person_id,
   transport_year_id, term_no) update), setting `concession_rule_id`, `reason`
   = `<KIND PREFIX> - <rule label> - <name, roll> - <date>`, audit columns.
3. Fix the bill by state:

| bill state | action | result |
|---|---|---|
| no bill | none — cron bills the target | `override_only` |
| money unpaid, no receipts, final_amount ≠ target | set money unit/total/final_amount = target; ledger amount = target (triggers recompute balance + rescale instalments) | `repriced` |
| money final_amount = target (paid or not), ledger ≠ target | ledger amount = target | `ledger_aligned` |
| receipts > 0 and money final_amount ≠ target | **raise** — the whole transaction rolls back, so no override is written either | `review` (error) |
| ledger `status` = `cancelled` / `error`, or money row missing | **raise** | `review` (error) |

   The function re-checks the state itself (it does not trust the API's
   classification), so a payment landing between list and Apply is caught.

   Bills from the older per-term shape (separate term-2 money rows, 7.5%
   learners): an **unpaid, receipt-free** money row for a term the target marks
   non-billable is deleted **after** the override is written (a `tms_fee_bill`
   row cannot be deleted directly — the ledger row follows via the
   `billing_student_bill_id` cascade link, and without the override cron 23
   would re-raise it within 2 minutes); a paid one makes the learner `review`.
4. Write the `after` snapshot.

Never hand-write `balance_amount`/`status` — the `update_bill_balance_on_amount_change`
and `trg_bbi_rescale_on_amount_change` triggers own them.

The function is `SECURITY INVOKER`, called only with the service-role client;
`REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`. Verify with
`has_function_privilege` after applying.

The API applies learners sequentially, collects per-learner results
(`override_only` / `repriced` / `ledger_aligned` / error message), and writes one
`logActivity` entry per Apply call (module `fee-concessions`, action `apply`,
metadata = counts + person ids).

## 4. API

All under `app/api/admin/fees/concessions/`, `withAuth` + service-role client,
local `requirePerm` as in sibling fee routes:

| route | perm | purpose |
|---|---|---|
| `GET ?year=&kind=` | `tms.fees.concession.view` | rows + counts per status |
| `POST apply` `{year, kind, personIds[]}` | `tms.fees.concession.apply` | applies; max 200 ids per call; returns per-person results |
| `GET rules?year=` | view | list rules |
| `POST rules` / `PUT rules/[id]` | apply | create / edit / deactivate `final_year` rules and the `scheme_75` amount |

Large id lists use `selectByIds` from `lib/supabase/chunked.ts` (chunks of 150).

Row shape: `personId, rollNumber, name, institutionName, programName,
admissionYear, fullTotal, targetTotal, billAmount (money final_amount),
paidAmount, billStatus, status, reason?`.

## 5. Permissions & activity log

- New keys `tms.fees.concession.view`, `tms.fees.concession.apply` in
  `lib/constants/tms-permissions.ts`; migration grants both to
  `transport_head` — the only custom role holding any `tms.fees.*` key today —
  via the `custom_roles.permissions ||` pattern. Super admins bypass (they hold
  no custom role).
- `lib/activity/log.ts`: add module `fee-concessions` and action `apply`.

## 6. UI

`app/(admin)/bill-management/page.tsx`: `View` gains `'concessions'`; new
`ToggleBtn` "Fee Concession", disabled for "All years" (same rule as Unbilled).
The view renders `concessions/concession-panel.tsx`:

- Sub-toggle **Final Year 50%** | **7.5% Scheme**.
- Count cards: Needs fix · Applied · Needs review · Unresolved.
- `DataTable` (checkbox selection only on `needs_fix`), columns: Roll, Name,
  College, Program, Admission yr, Full fee, Concession fee, Current bill, Paid,
  Status badge (+ reason tooltip for review). Filters: status, college.
- "Apply concession to selected (n)" → `ConfirmDialog` listing count and total
  reduction → POST → toast with result counts → invalidate
  `['fee-concessions', year, kind]`, `['bill-management', year]`,
  `['bill-management-unbilled', year]`.
- Final Year tab: "Cohort rules" card listing rules with Add / Edit /
  Deactivate (dialog: college, admission year, program optional, percent,
  label). 7.5% tab: shows the annual amount with Edit.
- Apply and rule controls hidden without `tms.fees.concession.apply`.

Files: `concessions/concession-panel.tsx`, `concession-columns.tsx`,
`rule-dialog.tsx`, `concessions-api.ts`; shared logic in
`lib/fees/concessions.ts` (candidate query, target-term math, status
classification).

## 7. Testing

- `lib/fees/concessions.test.ts` (vitest, `makeFakeSupabase`): target math
  (50% of 5500 → 2750; stop-wise shares; scheme_75 drops term 2), status
  classification for each row of the section 2 table, rule matching (program
  filter, first-rule-wins).
- SQL function: exercised inside `begin … rollback` on the live DB against the
  real shapes seen today — unpaid 5500 (PB22008 before fix), money-already-
  correct (PB22042), paid-in-full (PB22033 → error), 7.5% merged unpaid
  (SUBHAPRADHA shape), no bill.
- `next build` in the worktree; scoped `tsc` on touched files (repo tsc is red).
- Final check in the user's authenticated browser: open the tab for 2026-2027,
  confirm PB22008/PB22042/PB22057 show Applied and PB22033 shows Needs review.

## Rollout

1. Migration: rule table + seed, override column, log table, function,
   permission grants. Apply to live DB, commit the `.sql`.
2. Code: lib, API, UI. Build + tests.
3. Push, user smoke test.

Existing hand-written overrides keep working unchanged; the new column is
nullable and only read for status.
