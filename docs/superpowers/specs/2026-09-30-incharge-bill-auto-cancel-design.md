# In-charge bill auto-cancel — design

Date: 2026-09-30 · Status: approved in chat (rule, period, approval mode), spec awaiting review

## 1. Goal

A bus in-charge who holds an outstanding staff transport bill has that bill
**cancelled automatically** once their route's attendance marking for a calendar
month is "perfect" — no manual step. Someone who does not do the duty keeps
the bill.

Today 37 in-charges hold `staff_deferred` bills (Rs 4,88,400, term 1, due
2026-08-31). They were raised by the in-charge enforcement run of 2026-08-14..17,
which was removed on 2026-08-27 (PR #23). Nothing in the app can cancel a staff
bill now: `lib/fees/cancel-staff-bill.ts` `cancelStaffBills()` has zero callers.

## 2. Decisions (made by the owner, 2026-09-30)

| Question | Decision |
|---|---|
| What is "perfect"? | **Route + personal share**: the route was scanned every required day AND the person marked on >= 75% of required days |
| Over what period? | **Each calendar month**; one passing month cancels the bill for the year; a failing month leaves the bill and the next month is another chance |
| Who applies it? | **Preview first, then automatic**: a mode switch Off / Preview / Auto, starting at Preview |

## 3. The rule

Evaluated for month `M` (IST calendar month) and each **candidate**: a staff
member who

- holds an **active** `tms_staff_route_assignment` whose `assigned_at` (IST date)
  is on or before the last day of `M`, and
- has at least one **outstanding** staff bill for the current transport year:
  `person_type='staff'`, `status in ('staff_deferred','generated')`,
  `paid_at is null`.

Definitions:

1. **Service day** — a date in `M` that is Monday–Saturday and is NOT:
   - a `tms_service_calendar` row (`holiday`/`no_service`) for all routes
     (`route_id is null`) — route-specific rows remove the day for that route only;
   - a **fleet-dark day**: no human attendance mark (`method <> 'auto'`) on any
     route that day. Catches holidays nobody entered (e.g. 2026-09-26);
   - an **excused day** in `tms_incharge_excused_day` (admin-entered, e.g.
     2026-09-23 outage).
   - a date after "today" (IST) — a month in progress only counts days so far,
     and a month that has not ended is ALWAYS evaluated as preview, even in
     Auto mode (a half month never cancels a bill).
2. **Required days** for a person on a route = service days of that route from
   `max(first of M, assignment start)` to `min(last of M, yesterday IST)`.
3. **Not enough days** — fewer than `minRequiredDays` (default **10**) required
   days → outcome `not_enough_days`; nothing happens; next month is evaluated.
4. **Route day** — a required day on which the route's **onward (morning)** trip
   has >= 1 row with `status='present'` and `method <> 'auto'`.
5. **Personal day** — a required day on which the person made >= 1 human mark
   (`scanned_by` = any of their profile ids, `method <> 'auto'`, any direction,
   any route, any status).
6. **PASS** = every required day is a route day, on every route they are
   assigned to, AND `personal_days / required_days >= minPersonalPct/100`
   (default **75**). Otherwise **FAIL**, with the missed route dates recorded.

Deliberately NOT used:
- **Absence declarations** (`tms_incharge_absence`). The 25% allowance covers
  days off. Using them re-opens the old hole where declaring every day absent
  empties the duty.
- **Evening route coverage** — dashboards count the morning trip only; an
  evening-only miss must not fail anyone. Evening marks DO count as personal days.
- **Shares** (`tms_incharge_roster_allocation`) — shares are stale when
  assignments change outside the Staff Assignments screen (no reconcile cron).

### Identity

A person is known by up to three emails (`staff.email`,
`staff.institution_email`, `profiles.email`). Assignment ↔ staff matching
lower-cases and trims all three. Their **profile ids** (for `scanned_by`) are
`staff.profile_id` plus any `profiles.id` whose lower(email) equals one of the
three emails.

## 4. Modes and effects

Stored in its OWN `admin_settings` row, `setting_type='incharge_bill_cancel'`,
`settings_data = { mode, min_personal_pct, min_required_days }`. Never in the
`scheduling` blob — `toBlobShape()` in the settings API drops unknown keys on
every save.

| Mode | Effect |
|---|---|
| `off` (also: row missing / unreadable) | run returns `skipped: 'off'`, writes nothing |
| `preview` (initial) | writes/refreshes review rows (`applied=false`); no bill changes |
| `auto` | as preview, and for each PASS: `cancelStaffBills()` for the current transport year; row set `applied=true`, `bill_action='cancelled'`, `bill_ids`, `cancelled_amount`; staff notified; activity logged |

- A row with `applied=true` is **final** and never rewritten.
- A person whose bills are all cancelled is no longer a candidate, so later
  months skip them naturally.
- Cancelling is permanent for the transport year: `tms_fee_bill_idem_unique`
  excludes status, so the term cannot be billed again. This matches "one
  perfect month cancels the year".
- Paid bills are never touched (`paid_at is null` guard in `cancelStaffBills`).

## 5. Components

| Unit | Kind | Responsibility |
|---|---|---|
| `lib/fees/incharge-bill-review.ts` | pure, no I/O | `serviceDays()`, `evaluatePerson()`, `parseReviewConfig()`, month helpers |
| `lib/fees/incharge-bill-review-repo.ts` | I/O | load candidates + inputs, write review rows, apply cancels, notify, log |
| `public.tms_incharge_review_marks(p_from, p_to)` | SQL, SECURITY DEFINER, service_role only | returns jsonb `{ route_days:[{route_id,d}], person_days:[{profile_id,d}], fleet_days:[d] }` — small aggregates instead of ~90k attendance rows per month |
| `tms_incharge_bill_review` | table | one row per (person_id, month): counts, missed dates, outcome, mode, applied, bill ids |
| `tms_incharge_excused_day` | table | admin-excused dates with reason |
| `GET /api/cron/incharge-bill-review` | route | CRON_SECRET; reviews the previous IST month (or `?month=`); `?dryRun=1` forces preview |
| pg_cron `tms-incharge-bill-review` | schedule | daily 21:30 UTC (03:00 IST) via pg_net + vault secrets, like `tms-fee-payment-notices` |
| `/api/admin/incharge-bill-review` (+ `/settings`, `/excused-days`, `/run`) | admin routes | read rows; change mode; add/remove excused days; run now |
| `app/(admin)/staff-route-assignments/bill-review/page.tsx` | page | month picker, table, mode switch, excused days, Run now |

Why a new table instead of reusing `tms_incharge_month_verdict`: its CHECK
constraints encode the removed system (`mode in (shadow, enforce)`,
`bill_action in (cancelled, generated, none)` where `generated` meant "bill on
failure"). It stays as the untouched audit trail of that system.

Permissions: read = `tms.fees.view`; change mode / excused days / run =
`tms.fees.edit`; super admin always.

## 6. Data flow (one run)

1. Load config → `off` ⇒ stop.
2. Resolve month `M`; `from = first of M`, `to = min(last of M, yesterday IST)`.
3. Load current transport year; outstanding staff bills → candidate person ids.
4. Load those staff (3 emails, profile_id), active assignments, profiles by email
   (all `.in()` via `selectByIds`, chunks of 150, throw on error).
5. Load calendar rows, excused days, `tms_incharge_review_marks(from, to)`.
6. For each candidate with an assignment: `evaluatePerson()`.
7. Upsert review rows (skip rows already `applied`).
8. `auto` only: per PASS → `cancelStaffBills` → mark row applied → notify →
   log. One person's failure is recorded (`error` on the row) and does not stop
   the others.
9. Return a summary `{ month, mode, candidates, passed, failed, notEnoughDays, cancelled, cancelledAmount, errors }`.

Any read error aborts the whole run (never "no marks" by accident).

## 7. Notification (auto only)

`notifyProfile`, category `payment` (the allowed list in
`lib/notifications/fields.ts` has no `fees`), url `/boarding/fees`:
"Transport fee cancelled — Your 2026-2027 staff transport fee (Rs X) has been
cancelled because your bus attendance for September 2026 was complete. Thank you."
Sent once: only when `cancelStaffBills` returned `cancelled > 0`.

## 8. Testing

- Unit (vitest, pure module): weekday/Sunday, calendar all-routes vs
  route-specific, fleet-dark, excused, future days; mid-month start; not enough
  days boundary (9 vs 10); personal exactly 75% passes, just under fails;
  multi-route requires all; missed dates listed; config parse defaults/clamps/fail-off.
- `proxy.test.ts`: the new cron path is allowlisted exactly.
- SQL: execute the new function inside a rolled-back `do $$ … raise exception`
  block before any code depends on it.
- Live preview for 2026-09 with 2026-09-23 excused: expect ≈ 20 PASS / 17 not
  (hand count 2026-09-30); every difference explained.
- `next build`, scoped `tsc` on touched files; browser check of the page (owner).

## 9. Rollout

1. Merge + deploy (mode row absent ⇒ off).
2. Apply migrations (tables, function, settings row = `preview`), then the
   schedule migration.
3. Add 2026-09-23 as an excused day; run preview for September; owner reviews.
4. Owner switches to **Auto**; next nightly run cancels September passes.

Off switch: set mode `off`, or `select cron.unschedule('tms-incharge-bill-review')`.
