# Bus In-Charge Attendance Enforcement Loop — Design

**Date:** 2026-07-20
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/incharge-attendance-fee-enforcement`

## Problem

A `bus_required` staff member may opt in as **bus in-charge** via the willingness toggle at
`/boarding/in-charge`. The rule shown on screen is: *willing to be bus in-charge → no transport
fees; not willing → fees apply.* In exchange for the fee exemption, the in-charge is expected to
**mark the booked students' attendance** on their route each travel day.

Today nothing enforces the duty. An in-charge can hold the exemption indefinitely without ever
marking attendance.

**Required behaviour:** a recurring daily loop checks each active in-charge. If they marked no
attendance on a real travel day, warn them. After **two** such days, automatically revoke the
in-charge assignment and **generate a staff transport fee bill** — the exemption is forfeited.

## Verified current state

Established by reading the code and querying the live database (project `kvizhngldtiuufknvehv`)
on 2026-07-20. All claims below were checked, not assumed.

### In-charge assignment
- One row in `tms_staff_route_assignment`: `staff_email`, `route_id`, `is_active`, `source ∈
  {'admin','self'}`, `assigned_by`, `assigned_at`, `notes`.
- Created by `POST /api/boarding/self-assign` (`app/api/boarding/self-assign/route.ts:54-64`) with
  **no request body** — the route is resolved server-side from the eligibility RPC. Grants the
  `transport_boarding` role via `grantBoardingRole` (`lib/boarding/roles.ts:8-22`).
- Unique index `uq_tms_sra_email_route_active (staff_email, route_id) WHERE is_active`.
- The fee exemption is **policy text only**. `app/api/boarding/self-assign/route.ts:50-52` holds a
  literal `// ── PHASE 2 SEAM (staff fees) ──` no-op comment. No billing linkage exists.

### Attendance (the duty signal)
- `tms_attendance`: `learner_id`, `route_id`, `stop_id`, `trip_date`, `direction ∈
  {'onward','return'}`, `status ∈ {'present','absent'}`, `method`, `scanned_by → profiles.id`,
  `scanned_at`. Unique `(learner_id, trip_date, direction)`.
- Written by `POST /api/boarding/attendance` (`app/api/boarding/attendance/route.ts:74-94`), gated
  on `tms.attendance.manage`, upserting on `learner_id,trip_date,direction`.
- Because every mark carries `scanned_by` and `route_id`, "did the in-charge do their duty on day
  X" is directly answerable from this table.

### Billing
- `billing_student_bills.student_id` is `NOT NULL` with FK
  `fk_billing_student_bills_learner_profile → learners_profiles(id)`. **A staff member can never be
  inserted there.** This is a hard database constraint on a table shared with MyJKKN.
- `tms_fee_bill` (TMS-owned) *can* hold a real staff bill: `person_id`, `person_type`, `amount NOT
  NULL`, `due_date NOT NULL`, `term_no`, `billing_category_id`, nullable `billing_student_bill_id`,
  `status`.
- **The staff write path already exists.** `app/api/admin/fees/[id]/generate/route.ts:320-336`
  inserts staff rows with a real `amount` and `due_date`, `person_id = staff.id`,
  `billing_student_bill_id: null`, `status: 'staff_deferred'`.
- Idempotency is free: `tms_fee_bill_idem_unique (fee_structure_id, person_id, term_no,
  transport_year_id)`.

### Scheduling
- **No recurring-job infrastructure exists.** `vercel.json` contains only `regions: ["bom1"]` — no
  `crons` key. No `pg_cron` in any migration. No cron routes. No `CRON_SECRET` convention.
- Closest precedent: `app/api/admin/bookings/send-reminders/route.ts`, a manual idempotent POST
  whose own comment says "wire to a scheduler / pg_cron later".

### Live data (2026-07-20)
| Fact | Value |
|---|---|
| Active in-charge assignments | **3** (2 `admin`, 1 `self`), 3 distinct staff |
| All 3 map to `profiles.id` / `staff.id` | Yes — notifications are deliverable |
| `tms_fee_structure WHERE audience='staff'` | **0 rows** |
| Staff rows in `tms_fee_bill` | **0** (1,950 learner `generated`, 2 `cancelled`) |
| Current transport year | `2026-2027` (`6b3768f9-…`), `is_current = true` |

## Prerequisites and accepted limitations

1. **A staff fee structure must exist before any bill can be generated.** Zero exist today. The
   loop bills *from* a `tms_fee_structure` (audience `staff`) — it does not invent amounts, which
   are a business decision. Creating one is a config task in the existing Fees module UI, not code.
   Until then the loop still revokes and records `billing_status = 'no_structure'`.
2. **Staff bills are not payable through the payment gateway.** With no `billing_student_bills`
   row there is no receipt/Razorpay path. The amount is *recorded* in `tms_fee_bill`; collection is
   offline/manual until MyJKKN provides a staff billing target.
3. **Bill Management money KPIs exclude staff.** `summarizeBills` in `lib/fees/bills.ts` filters to
   `person_type === 'learner'`. Surfacing staff bills in those tiles is a deliberate follow-on
   increment, out of scope here.
4. **Data oddity:** the current transport year ends `2026-07-09`, already past. Generated due dates
   may land in the past. Not blocking; flagged for the transport office.

## Design

### Bill representation — decision

| Option | Verdict |
|---|---|
| **Staff bill in `tms_fee_bill`** (same shape the generate route already writes) | **Chosen.** No new billing concepts, free idempotency, Bill Management already reads the table |
| Relax `billing_student_bills` to accept staff | **Rejected.** Shared MyJKKN table; changing its FK breaks another app and the `Billed == Collected + Pending` reconciliation |
| New `tms_staff_bill` table | **Rejected.** Splits the ledger; Bill Management would need two sources |

### The loop

New `app/api/cron/incharge-attendance/route.ts`, protected by a `CRON_SECRET` bearer token,
scheduled from `vercel.json` at `30 15 * * *` **UTC** = **21:00 IST**, after both legs close.

> Vercel cron expressions are UTC. The IST offset must be applied deliberately — this is a classic
> source of off-by-one-day bugs.

```
for each active tms_staff_route_assignment:            # both sources
  d = istToday()                                       # IST, never new Date().toISOString()
  skip if strike.last_evaluated_date == d              # idempotent re-fire
  skip if date(assignment.assigned_at IST) == d        # one-day grace
  roster = loadBookedRoster(route_id, d)
  if roster is empty     -> not a travel day; no strike, no reset
  if marked(route_id, d) -> consecutive_misses = 0     # see coverage rule below
  else:
    consecutive_misses += 1; append d to missed_dates
    == 1  -> warning notification
    >= 2  -> final notification + REVOKE + GENERATE STAFF BILL
```

**Coverage rule (`marked(route_id, d)`)** — the day is covered if **at least one** `tms_attendance`
row exists with that `route_id` and `trip_date = d`, in **either** direction, regardless of which
staff member's `scanned_by` stamped it. Marking the onward leg alone counts. This is the
route-level rule justified under *Decisions* below.

**Revoke** = set `is_active = false` → `maybeRevokeBoardingRole()` → `logActivity({module:
'staff-route-assignments', action: 'unassign', metadata: {reason: 'attendance_auto_removal',
missed_dates}})`. Both helpers already exist; `'unassign'` is already in the `ActivityAction` union.

**Generate bill** = resolve the applicable staff fee structure for the current transport year →
write one `tms_fee_bill` row per term (`person_type: 'staff'`, `person_id: staff.id`, real `amount`
and `due_date`, `billing_category_id` = Staff Transport Fee `81944c0b-7066-4289-9e65-433707ea5803`,
`billing_student_bill_id: null`).

### Components

Each unit has one purpose and can be understood and tested on its own.

1. **Migration** — `tms_incharge_attendance_strike`:
   `assignment_id`, `staff_email`, `route_id`, `consecutive_misses int`, `missed_dates date[]`,
   `last_evaluated_date date`, `warned_at`, `removed_at`,
   `billing_status text CHECK (billing_status IN ('billed','no_structure','error'))`, timestamps.
   **`UNIQUE (assignment_id)`** — exactly one strike row per assignment, so the loop can upsert on
   it. FK `assignment_id → tms_staff_route_assignment(id) ON DELETE CASCADE`.
   Purpose: an audit trail of exactly which dates triggered a financial action, plus the
   per-day idempotency guard.

2. **`lib/boarding/incharge-attendance.ts`** — *pure* decision logic: travel-day detection,
   coverage check, streak arithmetic, grace handling. No I/O. This is where the real risk lives,
   so it is isolated and unit-tested.

3. **`lib/fees/staff-bill.ts`** — the per-person staff-bill writer, extracted from
   `generate/route.ts:320-336` so the bulk generate route and the loop share **one**
   implementation instead of diverging.

4. **`app/api/cron/incharge-attendance/route.ts`** — thin orchestrator: auth, fan out over active
   assignments, persist strikes, dispatch notifications, return a run summary.

5. **`vercel.json`** — add the `crons` entry.

6. **Warning surface** — `notifyProfile(svc, {profileId, actorId, title, body, url})`
   (`lib/notifications/notify.ts:19-35`), plus a strike banner on `/boarding/attendance` so the
   warning is visible in-portal, not only in the 🔔 inbox.

### Error handling

- **Per-staffer `try/catch`.** One staffer's failure must never abort the run for the others.
- **A billing failure never blocks the revoke.** Revoke first, then bill; record
  `billing_status ∈ {'billed','no_structure','error'}` on the strike row.
- **No staff fee structure** → revoke proceeds, `billing_status = 'no_structure'`, and the
  transport office is notified so they can configure one and bill manually.
- **Idempotency at two levels:** `last_evaluated_date` guards the strike arithmetic;
  `tms_fee_bill_idem_unique` guards the bill insert. A double-fire cannot double-bill.
- The route returns a structured summary (evaluated / skipped / warned / removed / billed / errors)
  for observability.

### Testing

- **Unit (vitest)** on `lib/boarding/incharge-attendance.ts` — the highest-risk surface:
  streak increments, reset on a covered day, no-strike on a non-travel day, grace day, the exact
  2-miss removal boundary, IST date handling.
- **Unit** on `lib/fees/staff-bill.ts` — correct row shape, idempotent re-invocation.
- **Integration** — the cron route with a stubbed Supabase client: auth rejection without the
  secret, per-staffer isolation on failure, revoke-succeeds-when-billing-fails.
- Manual smoke test against the 3 real in-charges before enabling the schedule.

## Decisions and rationale

- **Shared routes use route-level coverage.** If anyone marked that route that day, no in-charge on
  it is struck. Because the penalty is now *financial*, the design biases toward not wrongly
  billing someone whose colleague marked first. Accepted trade-off: a passive co-in-charge could
  coast. Revisit if routes routinely carry multiple in-charges.
- **Only days with booked riders count as travel days.** Holidays and empty-roster days must not
  accumulate strikes.
- **Any mark that day = duty done.** Requiring every rider to be marked is brittle and would
  penalise partial rosters.
- **Two *consecutive* missed travel days.** A covered day resets the streak.
- **Applies to all active in-charges**, both `self` and `admin` sourced — the duty is the same
  regardless of how the route was assigned.
- **One-day grace on a new assignment**, so opting in late in the day cannot strike immediately.
- **The bill survives re-opt-in.** A removed staffer can re-opt via the existing toggle; the
  generated bill stays and the transport office cancels it manually if warranted (mirrors the
  Transport-Vacate cancellation precedent).

## Out of scope

- Building a real staff payment/collection path (blocked by the shared-table FK; needs MyJKKN).
- Surfacing staff bills in Bill Management money KPIs.
- Pro-rating the bill by removal date — the full structure's terms are generated.
- Seeding a staff fee structure (business decision on amounts).
- Fixing the pre-existing UTC/IST bug on the attendance page date picker (noted, unrelated).
