# Transport Fine — manual, stop-wise fines on bus fee bills

Date: 2026-08-20
Status: Approved design, not yet implemented

## Problem

Admins need to charge a **fine** to selected bus-fee learners. Today there is no
fine concept anywhere in TMS-ADMIN (`grep -i fine` over `app/` and `lib/` returns
only unrelated matches). Fines must be:

- created **manually** — the admin picks who is fined, the system never decides;
- priced **per boarding stop**, the same way transport fees already are;
- raised **against the learner's bill** so the learner sees and pays them in
  MyJKKN alongside their transport fee.

## Decisions taken (confirmed with the user, 2026-08-20)

| Question | Decision |
|---|---|
| How is the fine amount decided? | A **separate fine rate per stop** — a new sheet, independent of the fee stop rates |
| Where does the fine appear as money? | A **separate FINE bill row**, never added onto an existing fee bill |
| Who can be fined? | **Learners only** (staff have no `learners_profiles` row → FK violation) |
| Does an unpaid fine block the student portal? | **No** — fines are outside the overdue lockout gate |
| Where does the fine sheet live? | **One sheet per transport year**, not per fee structure |
| Repeat fines? | **Yes, unlimited** — each fine is its own row with its own reason |
| Where is the action? | **Bill Management**, on the existing row selection |
| Due date | **Admin picks** in the dialog; default today + 15 days |
| Permission | Reuse `tms.fees.view` / `tms.fees.edit` (no new permission to seed) |
| Notify the learner | Yes — opt-out checkbox in the dialog, default ON |

## Constraints discovered in the live system

These are facts verified against the production database (project
`kvizhngldtiuufknvehv`) on 2026-08-20, and they drive the whole design.

1. **`tms_fee_bill` cannot hold fines.** It carries
   `UNIQUE (fee_structure_id, person_id, term_no, transport_year_id)`
   (`tms_fee_bill_idem_unique`). Repeat fines for one learner in one year would
   collide on any fixed sentinel `term_no`.
2. **The portal lockout gate reads `tms_fee_bill`.** The SECURITY DEFINER RPC
   `tms_student_transport_access(uuid)` counts every row with
   `status='generated'` and `due_date < current_date` as overdue, and separately
   looks up `term_no = 1` to decide `term1_paid`. A fine row in that table would
   lock learners out — and a fine landing on `term_no = 1` would corrupt the
   Term-1 gate. Keeping fines out of `tms_fee_bill` satisfies "fines do not lock
   out" with **zero changes to a live SECURITY DEFINER function**.
3. **MyJKKN renders transport dues by billing category, not by any TMS table.**
   `fn_list_transport_collectables` joins
   `billing_categories bc ON bc.id = bsb.item_category_id AND bc.kind='transport'`.
   So a fine written to `billing_student_bills` with the existing **Transport
   Fee** category (`bb5bbf2b-5777-4802-8113-8178b28c88af`, kind `transport`)
   appears on MyJKKN's transport screen and is payable there, with no MyJKKN
   repo change. This is intended.
4. **Bill Management's reconciliation invariant** (`Billed == Collected +
   Pending`) and its per-term analytics are computed from `tms_fee_bill`. Fines
   living elsewhere means every existing KPI stays numerically identical.
5. **`billing_late_charges` exists but is empty and MyJKKN-owned** (0 rows,
   period-based, `student_id NOT NULL`). It is not repurposed here: it models a
   recurring late charge, not a manual per-stop fine, and writing into another
   app's table would couple TMS to their roadmap.
6. **`billing_student_bills.fine_effective_date`** exists but is a
   `school_term_calendars` (K-12) concept. Not used by this design.
7. The shared bill table's UPDATE triggers are inert for the writes here
   (`fee_source='ad_hoc'` skips the hostel-category trigger; the balance trigger
   is guarded on `final_amount IS DISTINCT FROM`).

## Data model

Two new TMS-owned tables (modern pattern: `tms_` prefix, RLS enabled with no
policies, service-role writes only).

### `tms_fine_stop_rate` — the fine sheet

```
id                uuid pk default gen_random_uuid()
transport_year_id uuid not null references tms_transport_year(id)
stop_id           uuid not null references tms_route_stop(id) on delete cascade
fine_amount       numeric not null check (fine_amount >= 0)
created_at        timestamptz not null default now()
updated_at        timestamptz not null default now()
created_by        uuid
updated_by        uuid
unique (transport_year_id, stop_id)
```

Keyed to the **transport year**, not a fee structure, so it prices flat, tiered
and stop-wise learners alike — every learner carries
`learners_profiles.transport_stop_id` regardless of which fee structure bills
them.

### `tms_fee_fine` — the fine ledger

```
id                      uuid pk default gen_random_uuid()
transport_year_id       uuid not null references tms_transport_year(id)
person_id               uuid not null                      -- learners_profiles.id
person_type             text not null default 'learner'
                          check (person_type = 'learner')  -- widened deliberately later
stop_id                 uuid references tms_route_stop(id) -- snapshot at fine time
route_id                uuid references tms_route(id)      -- snapshot at fine time
fine_amount             numeric not null check (fine_amount > 0)
due_date                date not null
reason                  text not null
source_bill_id          uuid references tms_fee_bill(id) on delete set null
billing_student_bill_id uuid references billing_student_bills(id) on delete cascade
status                  text not null default 'generated'
                          check (status in ('generated','cancelled'))
idempotency_key         text not null unique
created_at              timestamptz not null default now()
created_by              uuid
cancelled_at            timestamptz
cancelled_by            uuid
cancel_reason           text
index (transport_year_id, person_id)
index (transport_year_id, status)
```

`stop_id`/`route_id` are **snapshots**: a learner who later changes stop must not
retroactively change what an issued fine was priced from. `source_bill_id` is
provenance only (which Bill Management row was ticked) and is
`ON DELETE SET NULL` so a fee-bill cleanup can never cascade-delete money history.

**One status, one owner.** `tms_fee_fine.status` tracks only what TMS decides —
`generated` or `cancelled`. Whether a fine is *paid* is owned by the money row
(`billing_student_bills.status` / `balance_amount`), because collection happens
in MyJKKN and TMS never observes the payment event. The Fines tab therefore
displays `cancelled` from the ledger and paid / partially paid / unpaid /
overdue from the joined money row — the same read shape `lib/fees/bills.ts`
already uses for fee bills. Duplicating a `paid` state in the ledger would
create a second source of truth that nothing keeps in sync.

`idempotency_key` is minted client-side per dialog submission. A double-click or
a retried request cannot double-fine, while genuinely repeated fines (a second
month, a second offence) are unlimited because the key differs.

## The money row

One `billing_student_bills` insert per fine:

| Column | Value |
|---|---|
| `student_id` | learner id |
| `institution_id` | learner's institution |
| `item_category_id` | **Transport Fee** category id, resolved by name at run time (never hard-coded) |
| `fee_source` | `'ad_hoc'` |
| `bill_description` | `Transport Fine — <reason>` |
| `due_date` | admin-picked |
| `quantity` | 1 |
| `unit_amount` / `total_amount` / `final_amount` / `balance_amount` | fine amount |
| `tax_amount` | 0 |
| `status` | `'unpaid'` |
| `transport_year_id` | selected year |
| `academic_year_id` | resolved the same way `lib/fees/generate.ts` resolves it |
| `created_by` | actor |

**Write order is money row first, ledger row second, with a compensating delete
if the ledger insert fails.** This is the exact orphan-race fix already made in
`lib/fees/generate.ts`; the reverse order would leave a bill MyJKKN charges for
and TMS knows nothing about.

## Amount resolution

`lib/fines/resolve.ts`, pure and unit-tested:

```ts
type FineSkipReason = 'no_stop' | 'no_stop_rate';

resolveFine(
  learner: { person_id: string; transport_stop_id: string | null },
  rateByStop: Map<string, number>,
): { ok: true; amount: number; stop_id: string }
 | { ok: false; reason: FineSkipReason }
```

- learner with no `transport_stop_id` → `no_stop`
- stop with no row in the year's fine sheet → `no_stop_rate`
- **never** defaults to 0 and never guesses

The reason vocabulary matches `lib/fees/resolve-terms.ts` (`no_stop`,
`no_stop_rate`) so existing `UNBILLABLE_LABEL`-style copy reads consistently.

The preview endpoint and the create endpoint call the **same** resolver on the
server, so what the confirm dialog shows is exactly what gets written. Client-sent
amounts are never trusted or accepted.

## API

Modern pattern throughout: `withAuth` + `createServiceRoleClient` +
`requirePerm`, returning `{ success, data }` / `{ error }`.

| Route | Method | Perm | Behaviour |
|---|---|---|---|
| `/api/admin/fees/fine-rates?year=<id>` | GET | `FEES_VIEW` | every stop (route, stop, sequence) left-joined to its fine amount, `null` where unpriced |
| `/api/admin/fees/fine-rates` | PUT | `FEES_EDIT` | bulk upsert `{ year, rates: [{stop_id, fine_amount}] }`; a `null` amount deletes that stop's rate |
| `/api/admin/fees/fine-rates/template?year=` | GET | `FEES_VIEW` | XLSX pre-filled from live stops (mirrors `stop-template.ts`) |
| `/api/admin/fees/fine-rates/import` | POST | `FEES_EDIT` | all-or-nothing sheet import with per-row errors |
| `/api/admin/fines/preview` | POST | `FEES_VIEW` | `{ year, person_ids[] }` → resolved amounts + skips + total. No writes |
| `/api/admin/fines` | GET | `FEES_VIEW` | Fines tab feed for a year |
| `/api/admin/fines` | POST | `FEES_EDIT` | `{ year, person_ids[], due_date, reason, notify, idempotency_key }` → creates; returns `{ created, skipped[], totalAmount }` |
| `/api/admin/fines/[id]/cancel` | POST | `FEES_EDIT` | waive: fine → `cancelled`, money row → `cancelled` |

Field whitelists live in `lib/fines/fields.ts`, matching the project's
write-whitelist convention.

`withAuth` drops Next's route context, so `[id]` is parsed from
`request.nextUrl.pathname` exactly as `app/api/admin/fees/[id]/stop-rates/route.ts`
does.

## UI

### Fees → Fine Rates (`/fees/fine-rates`)

Transport-year selector, then a `DataTable` of every route stop with its current
fine amount (`null` shown as "not set"), inline editing, bulk Save, plus Download
template / Upload sheet controls gated on `FEES_EDIT`. Structurally a copy of
`stop-rates-card.tsx`, retargeted at the year-level endpoints.

### Bill Management → "Generate Fine" toolbar action

`components/ui/data-table.tsx` already exposes
`toolbarActions({ selectedRows, resetSelection })`, and Bill Management already
runs with `enableRowSelection`. The button is added there — no table changes.

Dialog contents:

- **Deduped learners.** Selection is over *bill* rows, so ticking Term 1 and
  Term 2 of one learner must produce **one** fine. Dedupe on `person_id`.
- **Staff rows are dropped** with a visible note ("N staff row(s) skipped —
  fines apply to learners only").
- Preview table from `/api/admin/fines/preview`: learner, code, stop, fine ₹, or
  a skip reason in place of an amount.
- Due date picker, default today + 15 days.
- Required reason text (goes into both `reason` and the bill description).
- "Notify learner" checkbox, default ON.
- Footer: fine count and total ₹. Confirm is disabled when zero learners resolve.

### Bill Management → "Fines" tab

Fourth tab beside Bills / Unbilled / Analytics: learner, code, stop, amount, due
date, reason, status, created by/at, and a **Cancel (waive)** action requiring a
reason. Cancel sets the fine row and its `billing_student_bills` row to
`cancelled` — never deletes, matching the Transport Vacate module's semantics.
A KPI tile shows fines raised / collected / outstanding for the year, computed
separately from the fee KPIs.

## Notifications

On create, when the checkbox is on, `notifyLearner(svc, {...})` per fined learner
— title "Transport fine raised", body carrying amount, reason and due date, and a
url to the learner's fees screen. `notifyLearner` is best-effort and never
throws, so a notification failure cannot roll back or block a fine.

## Activity log

`lib/activity/log.ts`'s unions are **closed** — routes will not compile against
unknown values. Required additions:

- `ActivityAction`: add `'cancel'` (existing set has no waive-like verb).
- `ActivityModule`: `'fees'` already exists and is reused; no new module.

Logged events: fine-rate sheet update/import, fine generate (with count and
total), fine cancel (with reason).

## Testing

- `lib/fines/resolve.test.ts` — resolver: priced stop, unpriced stop, no stop,
  zero-amount rate rejected at write time, amount taken from the *year's* sheet.
- `lib/fines/create.test.ts` — the create engine against the existing
  `lib/fees/__testing__/fake-supabase.ts` harness: happy path writes both rows;
  a ledger failure deletes the money row (no orphan); a duplicate
  `idempotency_key` creates nothing the second time; staff ids are refused.
- `lib/fines/fields.test.ts` — whitelist rejects unknown columns.
- Manual smoke test after deploy: raise one ₹1 fine against a test learner,
  confirm it appears on MyJKKN's transport screen, confirm
  `tms_student_transport_access` for that learner is byte-identical before and
  after, then cancel it.

## Invariants this design commits to

1. `tms_student_transport_access` returns the same JSON before and after any
   fine is raised. No fine ever locks a learner out.
2. Bill Management's Billed / Collected / Pending / Overdue tiles are unchanged
   to the rupee; fines are reported separately.
3. `Billed == Collected + Pending` continues to hold over `tms_fee_bill`.
4. No fine exists without its money row, and no fine money row exists without
   its ledger row (compensated write).
5. Nothing is ever deleted to reverse a fine — cancellation only.

## Build order

1. **Migration + fine rate sheet.** Tables, then the Fine Rates page and its
   endpoints. Config only — no money is written in this phase, so it can ship
   and be reviewed independently.
2. **Fine generation.** Resolver + tests, preview/create endpoints, the Generate
   Fine dialog on Bill Management, learner notification.
3. **Fines tab + cancel/waive + activity log**, plus the fines KPI tile.

## Out of scope

- Staff fines (structurally impossible in `billing_student_bills`; would need a
  TMS-only ledger path like today's `staff_deferred` bills).
- Automatic/scheduled fines (this is deliberately a manual action).
- Fines affecting the portal access gate.
- Recording fine *payments* inside TMS — collection happens in MyJKKN, and the
  Fines tab reads status back from the money row.
