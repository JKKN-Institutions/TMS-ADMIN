# Term-1-gated pre-booking — design

**Date:** 2026-08-10
**Status:** Approved (writing plan)
**Area:** Student portal payment gate + shared booking window (`lib/booking`, `lib/settings/scheduling`, `tms_student_transport_access` RPC)

## Problem

Two independent rules must change for learner bus booking.

1. **Fee precondition.** Today the portal gate is *fail-open*: `tms_student_transport_access`
   blocks a learner only when a term whose `due_date` has already passed is unpaid. A learner
   who has never been billed, or whose Term 1 is not yet due, rides free. The transport office
   wants the inverse posture: **only a learner whose first-term transport fee is fully paid may
   use the student portal at all.**

2. **Pre-booking horizon.** Today booking opens for a rolling `bookingDaysAhead` (default 6)
   calendar days. That lets a learner stockpile a week of travel — measurably so: on 31 Jul 2026,
   the last day before their fees went overdue, 52 unpaid learners booked 176 dates stretching to
   6 Aug. The office wants **one working day at a time**: you book a travel day on the previous
   working day.

## Decisions

Taken during brainstorming on 2026-08-10:

1. **Saturday stays bookable.** Sunday remains the only hard weekly holiday. The institution runs
   alternate Saturdays and already marks the off ones as `holiday` rows in `tms_service_calendar`
   ("Saturday Holiday" on 2026-07-11, 07-25, 08-01). ~150 learners book each working Saturday;
   hardcoding Mon–Fri would strand them.
2. **Horizon = the next *working* day, not the next calendar day.** On a Friday whose Saturday is
   marked off, the bookable day is Monday. Nobody depends on opening the app on a Sunday.
3. **Fee rule is fail-closed on Term 1.** Term 1 must exist and be fully paid. No bill = blocked.
   Partially paid = blocked.
4. **Scope is the whole student portal**, not booking alone — the existing proxy redirect to
   `/student/fees` governs it.

## Measured impact (live DB `kvizhngldtiuufknvehv`, 2026-08-10)

Current transport year is **2026-2027** (`6b3768f9-c9fb-48d5-a955-41949983c3b0`, starts 2026-06-01).

Learners **holding a login profile**, by outcome under the new rule:

| Outcome | Learners | of which hold a route |
|---|---|---|
| Not `bus_required` → allowed, no obligation | 4,164 | 0 |
| Term 1 paid → allowed | 313 | 311 |
| Term 1 unpaid → blocked (*already* blocked today by the overdue gate) | 809 | 808 |
| Term 1 never billed → **newly blocked** | **2** | 2 |
| Term 1 cancelled (vacated) → newly blocked | 2 | 0 |

The fail-closed choice is nearly free: of the 231 `bus_required` learners with no Term-1 bill,
**229 have no `profile_id`** and could never log in. Only **2 real users** lose access.

The existing overdue gate is confirmed working: bookings by Term-1-unpaid learners collapsed from
~176/day to ~5/day the day after 31 Jul, when Term 1 fell overdue.

Exactly one Term-1 `tms_fee_bill` row exists per learner per current year (verified: zero
duplicates). No DB constraint enforces this, so the lookup is still written defensively.

## Part A — Term-1 fee gate

### Architecture

One change in one place: rewrite the `public.tms_student_transport_access(uuid)` RPC
(`supabase/migrations/20260613110000_create_tms_student_transport_access_rpc.sql`, idempotent
`create or replace`). It is already the single source of truth consumed by:

- `proxy.ts` — the hard gate (step 5b), redirecting to `/student/fees` / returning HTTP 402
- `app/api/student/transport-access/route.ts` → `lib/student/use-transport-access.ts` — the
  fees page and dashboard card

Because all three read the RPC's `allowed` field, **no TypeScript change is required to enforce
the rule**. The application-layer work is limited to explaining the new reasons to the learner.

### Rule

Evaluated in order; the first match wins:

| # | Condition | `allowed` | `reason` |
|---|---|---|---|
| 1 | Not a learner, or `bus_required = false` | true | `no_transport_obligation` |
| 2 | No `tms_transport_year` with `is_current = true` | true | `no_current_transport_year` |
| 3 | No Term-1 `tms_fee_bill` with `status = 'generated'` for the current year | **false** | `term1_not_billed` |
| 4 | Term-1 money row `status <> 'paid'` | **false** | `term1_unpaid` |
| 5 | Any generated term past its `due_date` is unpaid | **false** | `overdue` |
| 6 | otherwise | true | `current` |

Step 2 is deliberately **fail-open**. If an admin leaves `is_current = false` on every transport
year, a fail-closed rule would lock all 1,126 transport learners out of the portal at once — a
misconfiguration this project has hit before (see the "transport fees current-year gate" issue).
An admin config gap must not read as unpaid debt.

Step 5 preserves the current overdue rule for terms 2..N unchanged, so a learner who pays Term 1
and then lets Term 2 lapse is still blocked.

### Term-1 lookup

Selected defensively in case a duplicate row is ever generated — a paid row wins, then the
earliest due date:

```sql
select true, b.status, b.due_date, b.balance_amount
  into v_t1_found, v_t1_status, v_t1_due, v_t1_balance
from tms_fee_bill fb
join billing_student_bills b on b.id = fb.billing_student_bill_id
where fb.person_id = v_learner_id
  and fb.person_type = 'learner'
  and fb.transport_year_id = v_year_id
  and fb.status = 'generated'
  and fb.term_no = 1
order by (b.status = 'paid') desc, b.due_date asc
limit 1;
```

`v_t1_found` is left NULL when no row matches, so every read of it is `coalesce(..., false)`.

A vacated learner's Term-1 row carries `fb.status = 'cancelled'` and is therefore excluded by the
`status = 'generated'` filter, landing them on `term1_not_billed`. That is correct: they have
surrendered transport. Both such learners already hold no route, and `/student/fees` stays exempt
from the gate, so they can still see their own ledger.

### Response shape

Existing fields keep their exact shape and meaning (`allowed`, `reason`, `transport_year_id`,
`transport_year_name`, `overdue_count`, `total_owed`, `terms[]`) so the fees page and dashboard
card cannot break. Four fields are added:

- `term1_paid: boolean`
- `term1_status: text | null` — the money-row status, or null when never billed
- `term1_due_date: date | null`
- `term1_balance: numeric`

`lib/student/use-transport-access.ts` gains the same four on its `TransportAccess` interface.

### Learner-facing messaging

`/student/fees` must explain the two new reasons distinctly — `term1_unpaid` ("Pay your first
term transport fee to unlock the portal", with the amount and due date) and `term1_not_billed`
("Your transport fee has not been generated yet — contact the transport office"), because the
second is not something the learner can resolve by paying.

## Part B — Previous-working-day booking window

### The setting

`bookingDaysAhead` is **redefined from calendar days to working days**, default **1**, range
1..10 (down from 1..14). With the default it yields exactly one bookable day; an admin can widen
it later without a deploy. `DEFAULT_SCHEDULING_CONFIG.daysAhead` changes 6 → 1 and the clamp in
`parseSchedulingConfig` changes accordingly. `SchedulingConfig.daysAhead` keeps its name; only its
meaning and documentation change.

### The rule

`bookableDates(now, opts)` walks forward from tomorrow and returns the first `daysAhead` dates
that satisfy **all** of:

1. not a Sunday (`isSunday`)
2. not in `offDates` — the `holiday` / `no_service` dates from `tms_service_calendar`
3. its cutoff has not already passed (`now < cutoffFor(date, cutoffHour)`)

The walk is capped at **21 calendar days** so a long holiday block cannot loop unbounded; it
returns fewer dates (possibly zero) rather than throwing.

Condition 3 is what removes the nightly dead zone. Without it, `daysAhead = 1` would leave a
learner with nothing bookable between 20:00 and midnight every night, because tomorrow has closed
and nothing else is in range. Skipping already-closed days advances the window instead.

Resulting behaviour at `daysAhead = 1`:

| Now (IST) | Bookable |
|---|---|
| Mon 10 Aug 09:00 | Tue 11 |
| Mon 10 Aug 20:01 | Wed 12 (Tue's cutoff passed) |
| Fri 14 Aug, Sat 15 marked off | Mon 17 |
| Sat 15 / Sun 16 Aug | Mon 17 |
| Fri, working Saturday ahead | Sat |

### Purity and the `offDates` injection

`bookableDates` stays a **pure function** — no Supabase client, fully unit-testable, consistent
with the module's existing design. The off-days arrive as an injected `offDates?: Set<string>`
inside `WindowOpts`. The route edge loads them with the existing `loadExceptions(svc, routeId,
from, to)` over `today+1 … today+21` and passes the resulting key set in.

`WindowOpts` becomes:

```ts
export interface WindowOpts {
  cutoffHour?: number;        // 0..23 IST (24 = time window disabled), default 20
  daysAhead?: number;         // 1..10 WORKING days, default 1
  offDates?: Set<string>;     // service-calendar holiday / no_service dates
}
```

### What stays a post-horizon gate

Per-date `tms_booking_window` overrides are **not** consulted by the walk:

- `booking_enabled = false` still blocks the date in `effectiveOpen` after the horizon check. If
  an admin disables the single bookable day, learners have nothing to book that day — which is
  precisely the intent of disabling it.
- A per-date `deadline` override still overrides the cutoff in `effectiveOpen`, but the walk uses
  the standard `cutoffFor`. A date whose deadline is set *later* than the standard cutoff may
  therefore drop out of the horizon while `effectiveOpen` would still accept it. This is the
  pre-existing gap already documented at `app/api/student/bookings/route.ts:246`; widening it is
  out of scope.

Keeping these post-horizon avoids loading per-route window overrides for a 21-day lookahead on
every board render.

### Cancellation decoupled from the horizon

`isCancelable(travelDate, now, opts)` currently requires the date to be *inside* the horizon.
Shrinking the horizon to one day would strand every existing forward booking — learners currently
hold seats through 15 Aug, and one account through 8 Oct — with no way to release them.

New rule: **cancellable iff the travel date is in the future and its cutoff has not passed.** The
horizon no longer participates. This also closes the deadline-override gap noted above for the
cancel path, and preserves the existing "a pre-existing Sunday booking stays cancellable"
behaviour (cancellation still does not gate on Sunday).

### Call sites to move

All six `bookableDates` consumers, mapped:

| File | Change |
|---|---|
| `lib/booking/window.ts` | the walk, `WindowOpts.offDates`, new `isCancelable` rule, default 1 |
| `lib/booking/calendar.ts:47,69,71,75` | `effectiveOpen` / `cellStatus` accept + forward `offDates` |
| `app/api/student/bookings/route.ts:37` | load exceptions for `today+1…today+21`, pass `offDates` into `bookableDates` and the cell builder |
| `lib/booking/reminders.ts:36` | replace `bookableDates()[0]`; see below |
| `app/api/admin/bookings/summary/route.ts:26` | default date becomes the next working day, not blind tomorrow |
| `app/student/bookings/page.tsx:84` | client fallback for `maxMonth` — degrades to "no off days known", acceptable since the server value wins |

### Reminders

`lib/booking/reminders.ts` has two defects under the new rule:

1. It hardcodes `bookableDates()[0]` as "tomorrow". On a Friday whose Saturday is marked off it
   would nag learners to book a non-service day. It must use the same next-working-day walk, with
   `offDates` loaded from the service calendar. The reminder run is route-agnostic (one date for
   the whole cohort), so it calls `loadExceptions(svc, null, …)`, which returns **all-routes**
   exceptions only. A holiday declared for a single route therefore does not shift the reminder
   date; those learners still receive the nudge and are blocked at booking time by the per-route
   check in the route handler. Accepted — the alternative is a per-route reminder fan-out, which
   is a larger change than this work justifies.
2. It targets every `bus_required` learner with a route and a profile — **809 of whom cannot
   book** because Term 1 is unpaid. Targeting must intersect with the Term-1-paid set.

A new `lib/fees/term1.ts` provides:

- `isTerm1Paid(ledgerStatus, moneyStatus)` — pure, unit-testable
- `term1PaidLearnerIds(svc, transportYearId): Promise<Set<string>>` — batch lookup

The batch lookup reads the Term-1 ledger rows for the year, then resolves their
`billing_student_bill_id`s in **chunks of 150** with the error checked, per the documented
Supabase gateway limit (~500+ UUIDs in a single `.in()` returns HTTP 400, which an unchecked
`{ data }` destructure silently turns into an empty result).

### Copy and settings UI

- `app/student/bookings/page.tsx:146` — the hint still reads *"this week's days, up to Saturday.
  Next week opens on Saturday"*, stale since the rolling horizon shipped on 2026-07-20. Replace
  with the working-day rule.
- `app/(admin)/settings/page.tsx:171` — relabel the field to "Working days ahead" with helper text
  explaining that non-service days are skipped; `:195` — fix the summary line, which currently
  claims "Booking opens for the next N day(s); Sundays remain closed".

## Error handling

- Missing `tms_service_calendar` (`42P01`) → `loadExceptions` already returns an empty map; the
  walk then skips only Sundays and closed cutoffs. Degrades safely.
- `loadSchedulingConfig` already falls back to `DEFAULT_SCHEDULING_CONFIG` on any error.
- The walk returning zero dates is a valid state (e.g. a 3-week holiday block). The board renders
  an explicit "no bookable day right now" message rather than an empty grid.
- The RPC keeps `security definer` + `set search_path = public` and its
  `grant execute … to authenticated, service_role`. Losing that grant has silently broken this
  project before, so the migration re-issues it.

## Testing

Pure-function unit tests (vitest), extending the existing `lib/booking/window.test.ts` and
`lib/booking/calendar.test.ts`:

- next working day skips a Sunday
- next working day skips a service-calendar off Saturday and lands on Monday
- a *working* Saturday is returned from Friday
- the window advances past a date whose cutoff has passed (the 20:01 case)
- the 21-day cap returns `[]` under a long holiday block
- `daysAhead = 3` returns three *working* days, not three calendar days
- `isCancelable` allows a date far outside the horizon whose cutoff has not passed
- `isCancelable` rejects a past date and a date past its cutoff
- `isTerm1Paid` truth table: paid / partially_paid / unpaid / cancelled / missing

RPC verification via `execute_sql` against the live DB, asserting the bucket counts in the impact
table above are reproduced exactly, plus a spot check of one learner from each bucket.

Per the project's typecheck debt, verification is **path-scoped `tsc` + `vitest` + route probes**,
not a whole-repo `tsc` (which is chronically red on main and not gated by `next build`).

## Out of scope

- Staff booking — staff do not book seats; `tms_booking` is learner-only.
- The `bookingWindowEndHour` cutoff itself (still 20:00 IST default, still admin-configurable).
- Capacity remains advisory: an over-capacity booking is flagged, never blocked.
- Backfilling or purging the existing forward bookings beyond the new horizon. They remain valid
  and, under the new cancellation rule, remain cancellable.
- The `tms_booking_window.deadline` vs horizon gap described above.
- Route optimization, boarding roster, and admin manifest read `tms_booking` only and are
  unaffected.

## Verification

- `npx vitest run lib/booking lib/fees` — green
- `npx tsc --noEmit` scoped to the changed paths — no new errors
- `mcp__supabase__execute_sql` — RPC returns the expected verdict for one learner per bucket
- Authenticated browser smoke test by the user (the agent's Chrome is unauthenticated): a
  Term-1-paid learner sees exactly one bookable day; a Term-1-unpaid learner is redirected to
  `/student/fees` with the new message
