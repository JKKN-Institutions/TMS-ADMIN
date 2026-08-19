# Bus in-charge monthly attendance verdict, bill cancellation, and the fee gate

**Date:** 2026-08-18
**Status:** Design approved, ready for implementation planning
**Supersedes parts of:** `2026-08-12-incharge-attendance-enforcement-design.md`

## Problem

The bus in-charge scheme trades a transport fee exemption for a duty: mark your
bus's attendance. Today only the punitive half exists. A daily job counts three
consecutive unmarked weekdays and then removes the in-charge and raises a bill.
Nothing ever gives the exemption back, and nothing ever cancels a bill.

Two consequences are live in production right now.

**The exemption leaks.** `app/api/boarding/self-assign/route.ts` carries a block
labelled `── PHASE 2 SEAM (staff fees) ──` reading "When staff transport fees
exist, block here if this staffer is not cleared. No-op in Phase 1." Staff fees
now exist. The seam was never closed, so a staffer who was removed and billed can
open `/boarding/in-charge`, flip the willingness toggle, and re-grant themselves
the exemption the bill was raised to replace.

**Duty performed earns nothing.** An in-charge who marks their bus every day
still carries whatever bill was raised, with no mechanism to discharge it.

## Measured state (2026-08-18)

| Fact | Value |
| --- | --- |
| Active in-charge assignments | 102 across 21 routes |
| Staff bills | 38, all `staff_deferred`, ₹5,05,750 |
| Bills that are `generated` / have a money row / are paid | 0 / 0 / 0 |
| Strike rows / with `removed_at` | 114 / 38 |
| **Billed *and* still actively assigned** | **26** |
| Enforcement mode | `shadow` |

All 26 leaked assignments have `source='self'` and were created on 2026-08-17
(17 people) and 2026-08-18 (9 people) — after the 2026-08-14 enforcement run
removed and billed them. Nine of the 26 share route `EADAPPADI (KONGANAPURM)`;
four share `SANKAGIRI RS`.

Attendance coverage, Aug 3–18 (12 service weekdays, 21 routes carrying
in-charges): the best route was marked on 11 days; **no route was marked on every
day it carried booked riders.** Only 11 of 102 in-charges personally scanned on
six or more days, and 50 never personally scanned at all — their routes were
being marked, by colleagues.

## Decisions

Each was chosen explicitly by the product owner during design.

1. **Held-bill model.** Every active in-charge carries a `staff_deferred` bill.
   The month's attendance either cancels it or makes it payable. The exemption is
   earned monthly, not assumed.
2. **Route-level credit.** A day counts for you if *your route* was marked that
   day, by anyone assigned to it. Attendance is one shared roster per route per
   day and the first mark wins, so person-level credit would fail people who
   opened the app second. Accepted weakness: on a nine-in-charge route, one
   diligent person carries the rest.
3. **Ordinary monthly rule: zero misses.** The route must be marked on every
   service day of the month. See *Accepted consequence* below.
4. **Probation rule: zero misses**, over the window from the accept date to the
   last day of the month.
5. **The daily job warns only.** It keeps counting misses and keeps sending
   warnings; it no longer removes anyone or raises any bill. The month-end
   verdict becomes the sole authority over money and roles, so nobody is punished
   twice for the same misses.
6. **Payment is recorded by an admin in TMS.** The transport office collects the
   fee however it does today and marks the bill paid on the enforcement board.
   Staff cannot be inserted into `billing_student_bills` (its `student_id` is
   `NOT NULL` referencing `learners_profiles`), so no external payment path
   exists. `tms_fee_bill` already carries `paid_at`, `paid_amount`,
   `payment_reference` and `marked_paid_by` — the columns exist and were never
   wired up.

### Accepted consequence of the zero-miss rule

Measured against the fairest available denominator — counting only days a route
actually carried booked riders, so holidays and non-running days cannot be held
against anyone — **zero of 21 routes were perfect over Aug 3–18. All 102
in-charges would fail and be billed, roughly ₹13 lakh.**

This was surfaced with those figures on screen and chosen deliberately. It is
recorded here so that no future reader mistakes it for an oversight. The rollout
rails in the final section exist because of it: the first live run must be a
button a human presses, never a cron that wakes up.

### Where the "held bill" physically lives

The held-bill model is a statement about *what is at stake each month*, not an
instruction to write 102 bill rows. Only 38 in-charges have a bill row today, and
creating one for the other 64 would produce phantom rows that exist only to be
cancelled a fortnight later.

Resolved: **the bill is raised lazily by the verdict.**

- **Passes, has a `staff_deferred` bill** → cancelled.
- **Passes, has no bill** → nothing to do; no row is written.
- **Fails, has a `staff_deferred` bill** → `staff_deferred` → `generated`.
- **Fails, has no bill** → `generateStaffBill` raises it directly, and the
  verdict marks it `generated`.

The staffer still sees the amount at stake. `resolveStaffBillPlan` computes what
they *would* owe without writing anything, and the portal displays that figure
during the month. Outcomes are identical to eagerly-held bills; the difference is
64 rows that never need to exist.

The 38 existing `staff_deferred` bills are exactly the held bills of this model
and flow through the ordinary paths above with no special handling.

## The state machine

Every active in-charge is in exactly one state.

```
                    ┌─────────────┐
                    │   IN DUTY   │  bill HELD (staff_deferred)
                    │ portal open │  toggle ON
                    └──────┬──────┘
                           │  month-end verdict
              ┌────────────┴────────────┐
         route marked                route missed
         every service day            a service day
              │                            │
     bill → CANCELLED              bill → GENERATED (payable)
     stays in duty                 assignment revoked, role revoked
              │                            │
              └──► IN DUTY            ┌────▼─────┐
                                      │  BILLED  │  portal CLOSED
                                      │  locked  │  toggle hidden
                                      └────┬─────┘
                                           │ pledge screen
                              ┌────────────┴────────────┐
                          [ OK, I accept ]         [ Not OK ]
                              │                         │
                    ┌─────────▼──────────┐       ┌──────▼───────┐
                    │     PROBATION      │       │   MUST PAY   │
                    │ reassigned NOW     │       │ portal shut  │
                    │ portal open        │       │ "pay fees to │
                    │ mark EVERY day     │       │  continue"   │
                    │ accept → month end │       └──────┬───────┘
                    └─────────┬──────────┘              │
                     month-end verdict          admin records payment
              ┌───────────────┴─────────┐               │
          no misses                  missed        paid_at set
              │                          │               │
      bill CANCELLED              bill stands ──────► toggle unlocked
      → IN DUTY                   → MUST PAY          → IN DUTY
```

**Load-bearing property:** accepting the pledge is what reassigns the staffer,
and being reassigned is what reopens the portal. Marking attendance requires the
portal, so without this ordering the promise "mark daily and the bill is
cancelled" would be unkeepable and the lock permanent.

## Definitions

| Term | Definition | Rationale |
| --- | --- | --- |
| **Service day** | A Monday–Friday on which the route had at least one booked rider | If nobody booked, there is nothing to mark. The daily job already applies this test via `hasBookedRiders`. |
| **Marked** | Any `tms_attendance` row for that `route_id` + date, either leg, by anyone | Route-level credit (decision 2). |
| **Ordinary window** | The 1st to the last day of the month | |
| **Probation window** | Accept date to the last day of the month, inclusive | |

Weekends and no-rider days are neither credit nor blame; they are absent from the
denominator entirely.

`tms_service_calendar` is deliberately **not** consulted. It has almost no rows,
and the 2026-08-12 design already established that treating it as authoritative
punishes people for days the office never recorded.

## Data model

### `tms_incharge_month_verdict`

One row per person per month. The audit trail behind every cancellation and every
bill.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `staff_email` | text not null | matches the assignment key |
| `person_id` | uuid | `staff.id`, resolved via `resolveStaffId` |
| `route_id` | uuid | |
| `month` | date not null | first day of the month |
| `window_start`, `window_end` | date not null | ordinary or probation window |
| `required_days` | int not null | service days in the window |
| `marked_days` | int not null | |
| `missed_dates` | date[] not null default '{}' | |
| `outcome` | text not null | `passed` \| `failed` |
| `bill_action` | text | `cancelled` \| `generated` \| `none` |
| `was_probation` | boolean not null default false | |
| `mode` | text not null | `shadow` \| `enforce` at decision time |
| `decided_at` | timestamptz not null default now() | |

Unique on `(staff_email, month)` — one verdict per person per month, so a re-run
is idempotent.

### `tms_incharge_probation`

The pledge.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `staff_email` | text not null | |
| `person_id` | uuid | |
| `route_id` | uuid | |
| `assignment_id` | uuid | the assignment created on acceptance |
| `accepted_at` | timestamptz not null default now() | |
| `window_start`, `window_end` | date not null | |
| `status` | text not null default 'active' | `active` \| `passed` \| `failed` |

Partial unique index on `staff_email WHERE status='active'` — at most one live
probation per person. This index, not a check-then-act guard, is what settles a
double-submit race, following the precedent already set by the active
`(staff_email, route_id)` index on `tms_staff_route_assignment`.

### `tms_fee_bill`

No schema change. `status` gains the value `cancelled` (the Vacate module's
precedent: bills are cancelled, never deleted). `paid_at`, `paid_amount`,
`payment_reference` and `marked_paid_by` already exist and get their first writer.

## Modules

Nothing punitive lives in a React component. The rules that decide money are pure
functions with unit tests.

### Pure logic

**`lib/boarding/incharge-month.ts`**

- `serviceDays(bookedDates: string[], from: string, to: string): string[]` —
  weekdays in range that carried booked riders.
- `evaluateMonth(input: { serviceDays: string[]; markedDates: string[] }):
  { outcome: 'passed' | 'failed'; requiredDays: number; markedDays: number;
    missedDates: string[] }` — zero-miss rule.
- `probationWindow(acceptDate: string): { start: string; end: string }` —
  accept date to month end.

**`lib/boarding/incharge-gate.ts`**

- `deriveInChargeGate(input): 'in_duty' | 'pledge' | 'probation' | 'must_pay'` —
  the single owner of the state machine. Mirrors the existing
  `deriveBoardingAccess` in shape and testing style.

**`lib/fees/cancel-staff-bill.ts`**

- `cancelStaffBills(svc, { personId, transportYearId, reason })` — sets
  `status='cancelled'` on uncancelled, unpaid current-year staff bills.
- `makeStaffBillPayable(svc, { personId, transportYearId })` — `staff_deferred`
  → `generated`.

Both must **check the error on every write.** A silently failed cancellation
leaves a staffer billed for a month they passed.

### Routes

**`POST /api/boarding/incharge-pledge`** — accepts the deal. Order is
load-bearing: insert the probation row, then the assignment, then grant the
boarding role. A failure at any step must not leave a probation without an
assignment (the staffer would be promised a portal they cannot open).

**`POST /api/boarding/self-assign`** — closes the `PHASE 2 SEAM`. Rejects with
`403` when the staffer has an uncancelled, unpaid staff bill and no active
probation. **This is the hole the 26 walked through.**

**`GET /api/boarding/access`** — returns the gate state plus the outstanding bill
amount, so the portal can render the right screen. Keeps its existing fail-closed
`catch`.

**`GET /api/cron/incharge-month-verdict`** — the month-end job. Supports
`dryRun=1` and honours `inchargeEnforcementMode`. Requires the exact path in
`proxy.ts`. **Gotcha:** `proxy.test.ts` matches on raw source text — writing the
`/api/cron/` prefix as a quoted string anywhere in `proxy.ts`, even inside a
comment, fails the guard test.

Every staffer's `staff.id` is resolved with `resolveStaffId` from
`lib/identity/staff-lookup.ts`, never by matching `staff.email` alone. Matching
one column lost 34 of 114 in-charges in the 2026-08-14 run.

### UI

**`/boarding/in-charge`** — renders the pledge screen (bill amount, the exact
commitment, `[OK, I accept]` / `[Not OK]`) and the must-pay screen ("Once you pay
the fees you can continue the transport service"). The existing willingness
toggle continues to serve never-billed eligible staff.

**`/staff-route-assignments/enforcement`** — a new **Monthly** tab: dry-run
preview of the coming verdict, per-person required/marked/missed breakdown, and
**[Mark bill paid]** writing `paid_at`, `paid_amount`, `payment_reference`,
`marked_paid_by`. Gated on `tms.drivers.assign`, matching the existing board.

Every mutation is instrumented through `lib/activity/log.ts`. Its module and
action unions are closed — extend them or the routes will not compile.

## Changes to the daily job

`app/api/cron/incharge-attendance/route.ts` keeps evaluating, keeps persisting
strikes and keeps sending warnings. The `performRemoval` call and its
`generateStaffBill` are removed from this path. `REMOVAL_THRESHOLD` becomes the
threshold at which the warning copy escalates rather than the point of removal.

## One-time cleanup of the 26

Reversible and logged, following the pattern that made the 2026-08-14 run
recoverable:

1. Back up the affected rows to `tms_staff_route_assignment_backup_20260818`.
2. Set `is_active=false` on the 26 assignments; revoke the boarding role via
   `maybeRevokeBoardingRole`.
3. Write one `tms_activity_log` row each, reason `billed_reassignment_reversal`.

Nobody is stranded: at their next login these 26 land on the pledge screen,
accept, and are reassigned the same day.

## Suggested build order

The work is one coherent feature but too large for a single sitting. Four phases,
each independently verifiable, ordered so the leak is stopped first:

1. **Stop the leak** — close the `PHASE 2 SEAM` in `self-assign`, plus the
   one-time cleanup of the 26. Smallest change, highest urgency: without it every
   later phase is undermined by staff re-granting themselves the exemption.
2. **The rules** — `incharge-month.ts`, `incharge-gate.ts`,
   `cancel-staff-bill.ts` and their unit tests. Pure logic, no user-visible
   change.
3. **The month-end job** — the cron, both migrations, the `proxy.ts` allowlist.
   Runs in shadow; verdicts recorded, nothing enforced.
4. **The surfaces** — the pledge and must-pay screens, the pledge route, the
   Monthly tab and `[Mark bill paid]`, and demoting the daily job to warnings.

## Testing

- Unit tests for `incharge-month.ts`, `incharge-gate.ts` and the cancellation
  helpers — these decide money and roles, so they carry the heaviest coverage.
  Boundary cases: empty window, a window with no service days, an accept on the
  last day of the month, a route with no bookings all month.
- Tests live under `lib/` (vitest resolves `@/*` there).
- Route-level verification by dry-run against production data before any live
  run, since the honest end-to-end check needs an authenticated browser session
  the agent does not have.

## Rollout

1. Ship with `inchargeEnforcementMode` still `shadow`. Verdicts are computed and
   recorded; nothing is cancelled, billed, removed or locked.
2. Review a full `dryRun=1` run on the admin board.
3. Run the one-time cleanup of the 26.
4. Only then, deliberately, flip to `enforce` for a single run — as was done on
   2026-08-14 — and flip back.

The first live month-end verdict must be a button a human presses. Given the
accepted consequence recorded above, a cron waking up and billing 102 people
unattended is not an acceptable failure mode.
