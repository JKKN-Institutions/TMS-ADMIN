# In-charge attendance enforcement: 2 warnings, then removal and bill

**Date:** 2026-08-12
**Branch:** `feat/incharge-attendance-enforcement`
**Status:** Design approved

## Problem

A bus in-charge holds a transport fee exemption in exchange for marking their
route's booked riders each travel day. The enforcement half of that bargain
exists in code but has **never executed in production**: `tms_incharge_attendance_strike`
holds zero rows because `proxy.ts` returns 401 for `/api/cron/incharge-attendance`
before the route handler runs.

Beyond the dormancy, the existing behaviour does not match the required policy,
and two facts about live data make a naive wake-up unsafe.

### Verified state of the world (live DB, 2026-08-12)

| Fact | Value |
|---|---|
| Strike rows ever written | 0 |
| Active in-charge assignments | 114 over 23 routes |
| In-charge routes marked on a typical weekday | 11-14 of 23 |
| In-charge routes marked on a Saturday | **0 of 23**, despite bookings on all 23 |
| `tms_service_calendar` rows, all time | 3 (latest 2026-08-01) |
| Active staff fee structures | 1 (`Transport Fees 2026-2027 (Staff - All Colleges)`) |
| Terms on that structure | **0** |
| Staff bills ever generated | 0 |
| `admin_settings.scheduling.autoGenerateBills` | `true` (live) |
| pg_cron `tms-auto-generate-bills` | active, `*/15 * * * *` |

Two consequences follow. First, **billing is a silent no-op**: with zero terms,
`generateStaffBill` returns `no_structure`, so removal would revoke a role and
raise no bill. Second, **the blast radius is roughly half the in-charge
population**: with about 10 routes going unmarked every day, enabling
enforcement at full strength removes and bills 23-50 staff inside three
weekdays.

## Requirements

1. Two warnings before any punitive action; removal and billing on the third
   consecutive missed travel day.
2. On removal, revoke the in-charge role so the staffer can no longer mark
   attendance, and generate the transport fee bill automatically.
3. Warnings visible in both the admin portal and the boarding staff portal.
4. Run as unattended automation, in the manner of the existing automatic bill
   generation sweep.

## Decisions

Four questions were settled before design:

- **Attribution is route-level** (unchanged). Any one in-charge marking clears
  the day for every in-charge on that route. Accepted trade-off: a staffer whose
  colleagues always cover the route is never struck.
- **Travel days are Monday to Friday, IST.** Saturdays and Sundays are never
  enforced. This is a policy decision, supported by but not derived from the
  zero-Saturday-marks data. `tms_service_calendar` is too sparse to be an
  authority.
- **Removal is blocked when no bill can be raised.** Nobody loses their role
  without the bill that justifies it.
- **Ships in shadow mode.** Real evaluation and real strike persistence, no
  notifications and no punitive action, until an admin arms it.

## Design

### 1. Enforcement ladder

`REMOVAL_THRESHOLD` changes from 2 to 3 in `lib/boarding/incharge-attendance.ts`.

| Consecutive missed travel days | Outcome |
|---|---|
| 1 | `warn` |
| 2 | `warn` (final warning) |
| 3 | `remove` - revoke assignment and role, generate bill |

Any travel day on which the route is marked resets the counter to zero, as
today. `warningCopy()` takes the miss count so the second warning reads as a
final warning rather than repeating the first verbatim.

No schema change: `consecutive_misses` already distinguishes warning 1 from
warning 2, and `missed_dates` carries the dates.

### 2. Travel-day gate

`evaluateDay` gains `facts.isServiceWeekday`. When false it returns
`{ action: 'skip', reason: 'not_a_service_day' }` - no strike, and deliberately
no reset, matching the existing `no_travel_day` semantics. Weekends therefore
neither punish nor forgive.

The check runs before the roster load in the cron route, so a weekend run costs
no per-assignment queries.

A pure helper `isServiceWeekday(date: string): boolean` evaluates the IST day of
week from a `YYYY-MM-DD` string.

### 3. Billing precondition

`lib/fees/staff-bill.ts` grows a shared resolver:

```
resolveStaffBillPlan(svc, { staffId, transportYearId })
  -> { billable: true, feeStructureId, terms } | { billable: false, reason }
```

`generateStaffBill` calls it to write. The cron calls it to **probe before
acting**, so the write path and the probe can never disagree.

A new outcome, `remove_blocked`, applies when the probe reports not billable:

- the assignment stays active and the `transport_boarding` role is retained
- the strike persists at 3 or more with `billing_status = 'no_structure'`
- the staffer receives **no** notification, because no removal occurred
- the row surfaces on the admin dashboard as "Pending removal - no fee structure"
- the next nightly run retries, so configuring terms completes the removal

`remove_blocked` is a cron-route decision, not an `evaluateDay` one: the pure
function has no access to billing facts. `evaluateDay` still returns `remove`,
and the route downgrades it.

### 4. Mode switch

`inchargeEnforcementMode: 'off' | 'shadow' | 'enforce'` joins the existing
`scheduling` settings blob, parsed and defaulted by `parseSchedulingConfig`
(default `'shadow'`), and surfaced on Settings -> Scheduling beside the existing
`autoGenerateBills` control.

| Mode | Evaluates | Persists strikes | Notifies staff | Removes and bills |
|---|---|---|---|---|
| `off` | no | - | - | - |
| `shadow` | yes | yes | no | no |
| `enforce` | yes | yes | yes | yes |

Shadow is deliberately distinct from the existing `dryRun` query parameter.
`dryRun` writes nothing and exists for manual inspection; shadow persists real
strike state so the admin dashboard accumulates real data. Both modes share one
code path, so `enforce` is never a first execution of untested logic.

### 5. Admin visibility

- `GET /api/admin/incharge-attendance-strikes` - `withAuth` plus `requirePerm`,
  service-role read, joining strike to staff name and route number, returning a
  computed `billable` flag and a derived status per row.
- `app/(admin)/staff-route-assignments/enforcement/page.tsx` - stat tiles (OK,
  warned, final warning, pending removal, removed), a banner reporting the
  current mode, and a `DataTable` driven by a `columns.tsx` factory: staff,
  route, consecutive misses, missed dates, status badge, billing status, last
  evaluated.

Derived status, computed server-side so the UI holds no policy:

| Condition | Status |
|---|---|
| `removed_at` set | `removed` |
| `consecutive_misses >= 3` and not removed | `pending_removal` |
| `consecutive_misses = 2` | `final_warning` |
| `consecutive_misses = 1` | `warned` |
| otherwise | `ok` |

### 6. Staff portal

`/api/boarding/incharge-strike` and the `/boarding/attendance` banner already
exist. Two changes: the response distinguishes warning 1 from the final warning
so the banner copy can escalate, and the endpoint returns `null` when the mode
is `shadow` or `off`, so a dry run alarms nobody.

### 7. Waking the job

- `proxy.ts`: add the **exact** path `/api/cron/incharge-attendance` to
  `PUBLIC_PATHS`. The `/api/cron/` prefix form must remain absent;
  `proxy.test.ts` already asserts this and gains a matching exact-path
  assertion.
- Migration scheduling pg_cron job `tms-incharge-attendance` at `30 15 * * *`
  (21:00 IST, after both legs close), copying the `net.http_get` plus vault
  command of the live `tms-auto-generate-bills` job. `tms_app_url` and
  `tms_cron_secret` already exist in vault.
- The inert `vercel.json` cron entry is left untouched.

## Error handling

Existing guarantees are preserved and extended:

- A failed strike load or attendance count throws for that staffer rather than
  reading as "nobody marked attendance". Striking, and eventually billing,
  somebody for an infrastructure failure is the worst available outcome.
- `performRemoval` keeps its revoke-then-bill order, so a billing failure cannot
  undo a revoke.
- One staffer's failure never aborts the run for the others; failures are
  collected with the staff email and reason.
- A staffer with no reachable `profiles` row is never removed or billed.

## Testing

Pure logic carries the weight, extending `lib/boarding/incharge-attendance.test.ts`:

- warn on miss 1, warn on miss 2, remove on miss 3
- a marked day at miss 2 resets to zero
- weekend returns `skip: 'not_a_service_day'` and does not reset a streak
- same-day re-run is idempotent
- `REMOVAL_THRESHOLD` is 3

New unit tests:

- `isServiceWeekday` across a full week in IST
- `parseSchedulingConfig` defaults `inchargeEnforcementMode` to `shadow` and
  rejects unknown values
- `resolveStaffBillPlan` reports not billable for a structure with zero terms
- the derived admin status mapping
- `proxy.test.ts` exact-path allowlist assertions

Test files live under `lib/` so vitest collects them.

## Rollout

1. Merge with mode `shadow`. The job begins writing real strikes nightly;
   nothing is visible to staff.
2. Configure terms on the staff fee structure via `/fees/[id]/edit`.
3. Review the admin dashboard for about a week and chase the roughly 10 routes
   that never mark.
4. Flip to `enforce`. Because every strike resets on a marked day, routes fixed
   during shadow start clean.

## Out of scope

- Repairing `/api/cron/booking-reminders`, which shares the dormancy but is an
  unrelated feature.
- Any change to how attendance is marked.
- Backfilling strikes for days already past.
