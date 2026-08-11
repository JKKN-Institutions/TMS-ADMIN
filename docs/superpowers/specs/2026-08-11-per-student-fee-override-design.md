# Per-student transport fee override — design

**Date:** 2026-08-11
**Status:** approved, not implemented
**Trigger:** SOORIYA B (`EE24032`, `sooriyab2024eee@jkkn.ac.in`) is a 7.5% scholarship
student whose annual transport fee should be ₹500, but who was billed and has
already paid the standard ₹5,500.

## Problem

TMS resolves a person's transport fee from structure configuration only. There is
no way to say "this individual owes a different amount". `scholarship_type` exists
on `learners_profiles` but is referenced in **zero** TypeScript files in this repo,
so a scholarship has no effect on billing.

Two consequences:

1. New scholarship students are billed the full fee at generation time.
2. Already-generated bills cannot be corrected from any admin screen. Generation is
   INSERT-only — `app/api/admin/fees/[id]/generate/route.ts` skips any
   `(person, term)` pair already present in `tms_fee_bill` — and Bill Management
   exports `GET` only.

## The subject

| Field | Value |
|---|---|
| Learner id | `27c52c59-cf30-490c-9991-0d94353e0569` |
| Profile id | `d6ffb143-c732-4e4e-ac2a-b9be0a86bfc5` |
| Roll number | `EE24032` |
| Institution | JKKN College of Engineering and Technology (EEE) |
| Route / stop | T GODU (THIMARATHAM PATTI) / THIRUCHENGODU |
| `scholarship_type` | `7.5% SCHOLARSHIP` |
| `transport_fee` | `NULL` (legacy column, display-only) |
| Structure | `Transport Fees 2026-2027` (flat) `6b2ebf76-f06d-4f40-95fb-f8654f152f16` |
| Transport year | 2026-2027 `6b3768f9-c9fb-48d5-a955-41949983c3b0` (`is_current`) |

Existing bills — **both paid, in cash**, receipt `RCP-2026-003412` dated 2026-07-31,
payer `SOORIYA.B`, ₹5,500 total:

| Term | Ledger `tms_fee_bill` | Money `billing_student_bills` | Amount | Due | Status |
|---|---|---|---|---|---|
| 1 | `3878f0d3-c561-465f-82d0-4c5239f1165a` | `55a59ad3-151f-4930-8a2a-0a6385e83933` | ₹3,000 | 2026-07-31 | paid, balance 0 |
| 2 | `13ebff31-3353-43b1-a72a-05ae492002e7` | `bcfbfa23-c6cd-4173-a347-52e2dab3b644` | ₹2,500 | 2026-08-31 | paid, balance 0 |

## Decisions

Confirmed with the requester on 2026-08-11:

| Question | Decision |
|---|---|
| Scope | **Only SOORIYA B.** The wider cohort (42 active bus-required 7.5% learners, 38 with unpaid Term 1) is explicitly out of scope. |
| Fee rule | **₹500 is the whole year.** Term 1 → ₹500; Term 2 → cancelled. |
| Already-paid bills | **Rewrite them** to match the ₹500 rule. The ₹5,000 excess stays as an overpayment; refunding is an accounts matter outside TMS. |
| Mechanism | **Build a durable per-student override**, not a one-off SQL patch. |

## Findings that constrain the design

1. **`resolvePersonTerms` (`lib/fees/resolve-terms.ts`) is the single decision point**
   for "what does this person owe". Its three branches (flat / tiered / stop_wise)
   are pinned by characterization tests and must not drift.
2. **`update_bill_balance_on_amount_change` is a no-op.** It is declared
   `AFTER UPDATE` but its body mutates `NEW` and returns it; PostgreSQL discards an
   AFTER row trigger's return value. It will **not** recompute `balance_amount` or
   `status` when `final_amount` changes. 4 bills in the database already have a
   balance inconsistent with their receipts, consistent with this. Any amount write
   must set `balance_amount` and `status` explicitly.
3. **`billing_enforce_once_per_learner` permits amount-only updates** — it returns
   early when `student_id` and `item_category_id` are unchanged and `OLD.status` is
   not cancelled/superseded. It will not block this work.
4. **`tms_student_transport_access` joins on `fb.status = 'generated'`.** Cancelling
   the Term-2 *ledger* row removes that term from `/student/fees` with no app change.
   Term 1 stays `generated` + `paid`, so `term1_paid` remains true and the
   fail-closed Term-1 gate keeps portal access open.
5. **`billedKey` does not filter status** (`generate/route.ts:339-344`), so a
   cancelled ledger row still blocks re-billing.
6. **The vacate RPC refuses to cancel paid bills.** `tms_approve_transport_vacate`
   filters `bsb.status <> 'paid' AND balance_amount > 0`. Cancelling a paid Term 2 is
   a deliberate departure from that rule, taken by explicit decision for this one
   student. See Risks.

## Design

### 1. `tms_fee_override` — the durable mechanism

One row per `(person, transport year, term)`. `amount` says what they owe;
`billable = false` says the term is not charged at all. Together they express the
agreed rule directly.

```sql
create table public.tms_fee_override (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null,
  person_type       text not null default 'learner'
                    check (person_type in ('learner','staff')),
  transport_year_id uuid not null
                    references public.tms_transport_year(id) on delete cascade,
  term_no           integer not null check (term_no > 0),
  billable          boolean not null default true,
  amount            numeric(12,2),
  reason            text not null,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz,
  updated_by        uuid,
  constraint tms_fee_override_amount_ck check (
    (billable and amount is not null and amount >= 0)
    or (not billable and amount is null)),
  constraint tms_fee_override_unique unique (person_id, transport_year_id, term_no)
);

alter table public.tms_fee_override enable row level security;
-- No policies: service-role access only, matching the modern tms_ pattern.

create index tms_fee_override_year_idx
  on public.tms_fee_override (transport_year_id, person_type);
```

`reason` is `NOT NULL` deliberately: this table quietly reduces what someone owes,
so every row must record why.

Scoping is by `(person, transport_year, term_no)` and **not** by `fee_structure_id`.
A person is billed by exactly one structure per transport year — the generator
already treats being billed by a second structure in the same year as a conflict —
so adding the structure would be redundant and would let an override silently miss
if the person moved structures.

Seed rows for SOORIYA:

| term_no | billable | amount | reason |
|---|---|---|---|
| 1 | true | 500.00 | `7.5% SCHOLARSHIP — annual transport fee fixed at ₹500` |
| 2 | false | NULL | `7.5% SCHOLARSHIP — annual fee fully covered by Term 1` |

### 2. `lib/fees/overrides.ts` — a pure applier

```ts
export interface TermOverride {
  term_no: number;
  billable: boolean;
  amount: number | null;
}

export function applyOverrides(
  terms: BillableTerm[],
  overrides: TermOverride[]
): BillableTerm[];
```

Rules:

- An override with `billable = false` **drops** that term.
- An override with `billable = true` **replaces** that term's amount; `due_date` and
  `term_label` are preserved from the structure.
- An override whose `term_no` is not among `terms` is **ignored**. A term cannot be
  invented, because there is no due date to give it.
- With an empty override list the input array is returned unchanged, by reference.
  The function never mutates its arguments.
- Returning an empty array is legal and means "this person is billed nothing".

### 3. Hook into `resolvePersonTerms`

`ResolvePerson` gains `overrides?: TermOverride[]`. `applyOverrides` is called
**once, at the end**, on the terms each branch produced — not inside the branches.

Two reasons: the flat/tiered/stop_wise branches stay byte-identical so their
characterization tests keep passing, and overrides work across all three fee modes
for free rather than needing three implementations.

### 4. The generator loads overrides

In `app/api/admin/fees/[id]/generate/route.ts`, before resolving people:

```ts
const { data: ovr, error: ovrErr } = await supabase
  .from('tms_fee_override')
  .select('person_id, term_no, billable, amount')
  .eq('transport_year_id', fs.transport_year_id);
if (ovrErr) { /* fail loud — see below */ }
```

Filtered by `transport_year_id` **only**, never by person id. Overrides are
exceptional and few, so one small query replaces an `.in()` over ~1,000 UUIDs and
sidesteps the gateway limit that has silently emptied result sets on this project
before.

The error **must** be checked and the run aborted. An unchecked failure reads as
"no overrides exist" and would bill a scholarship student the full amount — a
silent overcharge is the worst possible failure mode here.

Group into `Map<person_id, TermOverride[]>` and attach to each resolved person.

Dry-run and generate responses gain an `overridden` count, and the activity-log
metadata records it, so an admin sees the effect before and after committing.

### 5. The one-time correction

A single data-modifying CTE so the ledger and money tables cannot diverge on partial
failure — the shape already used for the due-date backfills.

```sql
with tgt as (
  select fb.id as ledger_id, fb.billing_student_bill_id as bill_id, fb.term_no
  from public.tms_fee_bill fb
  join public.learners_profiles lp on lp.id = fb.person_id
  where lower(lp.college_email) = 'sooriyab2024eee@jkkn.ac.in'
    and fb.person_type       = 'learner'
    and fb.transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
    and fb.status            = 'generated'
),
money_t1 as (
  update public.billing_student_bills b
     set unit_amount    = 500,
         total_amount   = 500,
         final_amount   = 500,
         balance_amount = 0,          -- explicit: the balance trigger is a no-op
         status         = 'paid',     -- explicit, same reason
         remarks        = concat_ws(' | ', nullif(b.remarks, ''),
                          '7.5% scholarship: annual transport fee revised to ₹500 on '
                          || '2026-08-11. ₹5,000 of receipt RCP-2026-003412 is excess '
                          || 'and refundable.'),
         updated_at     = now()
    from tgt
   where tgt.bill_id = b.id and tgt.term_no = 1
  returning b.id
),
ledger_t1 as (
  update public.tms_fee_bill fb set amount = 500
    from tgt where tgt.ledger_id = fb.id and tgt.term_no = 1
  returning fb.id
),
money_t2 as (
  update public.billing_student_bills b
     set status     = 'cancelled',
         remarks    = concat_ws(' | ', nullif(b.remarks, ''),
                      '7.5% scholarship: term cancelled on 2026-08-11, annual fee '
                      || 'fully covered by Term 1.'),
         updated_at = now()
    from tgt
   where tgt.bill_id = b.id and tgt.term_no >= 2
  returning b.id
),
ledger_t2 as (
  update public.tms_fee_bill fb set status = 'cancelled'
    from tgt where tgt.ledger_id = fb.id and tgt.term_no >= 2
  returning fb.id
)
select (select count(*) from money_t1)  as t1_money,
       (select count(*) from ledger_t1) as t1_ledger,
       (select count(*) from money_t2)  as t2_money,
       (select count(*) from ledger_t2) as t2_ledger;
```

Expected result: `1, 1, 1, 1`. Any other row counts means the target set was wrong —
stop and investigate rather than re-running.

Keyed by `college_email` rather than raw bill UUIDs so the statement is
self-describing and fails loudly (zero rows) if run against a database where the
learner does not exist. `term_no >= 2` rather than `= 2` so a structure that later
gains a Term 3 does not leave a stray billable term behind.

## Expected outcome

Transport year 2026-2027, learner bills, cancelled excluded:

| | Bills | Billed | Collected | Pending |
|---|---|---|---|---|
| Before | 2,272 | ₹61,30,150 | ₹18,90,500 | ₹42,39,650 |
| After | 2,271 | ₹61,25,150 | ₹18,85,500 | ₹42,39,650 |

`Billed == Collected + Pending` holds exactly on both sides
(₹61,25,150 = ₹18,85,500 + ₹42,39,650), so Bill Management stays reconciled with
MyJKKN. TMS "Collected" falls ₹5,000 because that cash is now unbilled excess rather
than revenue.

Student portal: `/student/fees` shows one term — ₹500, paid. `allowed` stays `true`
with `reason = 'current'` and `term1_paid = true`.

Cash actually held remains ₹5,500 against ₹500 billed: **₹5,000 refundable**,
recorded in `remarks` on both bills.

## Risks

1. **Cancelling a paid bill contradicts the vacate rule** (Finding 6). Accepted by
   explicit decision, for one student, with the reason recorded permanently in
   `tms_fee_override.reason`, `billing_student_bills.remarks`, and the activity log.
2. **MyJKKN will show ₹5,000 receipted above billed** for this learner. Accounts must
   be told; TMS cannot issue refunds and no refund has ever been recorded in
   `billing_student_bills` (`refunded_amount` is unused across the whole table).
3. **Silent overcharge if the override load fails.** Mitigated by aborting the run on
   a query error rather than treating it as an empty result.
4. **Re-generation** is guarded twice and independently: the cancelled ledger row
   still appears in `billedKey`, and the override marks Term 2 non-billable.

## Verification

- `applyOverrides` unit tests (pure, no database): replace, drop, ignore-unknown-term,
  empty-list identity, no mutation of inputs.
- Existing `resolve-terms.test.ts` must pass **unchanged** — proof that a person with
  no override is billed exactly as before.
- SQL assertions before and after the correction, against the table above.
- `select tms_student_transport_access('d6ffb143-…')` before and after; `allowed`
  must remain `true` and the `terms` array must shrink from 2 entries to 1.
- Re-assert `Billed == Collected + Pending` for the transport year.

## Out of scope

- **The wider 7.5% cohort.** 42 active bus-required learners carry this scholarship
  (30 flat, 12 Arts Self); 38 have an unpaid Term 1 totalling ₹1,14,000. None are
  touched. Once `tms_fee_override` exists, correcting them is a data task, not a
  build task.
- **Admin UI and API for overrides (Phase 4, deferred).** A CRUD screen for a
  two-row table is over-building today. When a second student needs an override,
  add `app/api/admin/fees/overrides/route.ts` (GET behind `tms.fees.view`,
  POST/DELETE behind `tms.fees.edit`, field whitelist in `lib/fees/fields.ts`,
  activity-logged) plus a management page. Until then overrides are written by
  migration.
- **Refunds.** No refund mechanism exists in the shared billing schema and building
  one is not this project.
- **Deriving fees from `scholarship_type` automatically.** The override is explicit
  per person by design; inferring discounts from a profile column would silently
  re-price cohorts.
