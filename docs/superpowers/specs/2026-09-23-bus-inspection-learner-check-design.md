# Bus Inspection → Learner Check with Automatic Fines — Design

**Date:** 2026-09-23 · **Status:** Approved in chat (2026-09-23) · **Supersedes:**
`2026-09-21-bus-inspection-design.md` (vehicle checklist) · **Extends:**
`2026-09-21-route-checkers-design.md`

## Purpose

The Transport Head assigns inspectors (any staff member, any number per route) to routes. An
inspector opens **Bus Inspection** in the staff app, picks an assigned route (or scans the bus's
QR sticker), picks Morning/Evening, and scans learners' ID QR / barcode. Every scanned person gets
two marks — **Fee ✓/✗** and **Booking ✓/✗**. When the inspector submits, the system raises
automatic **Transport Fee** fines for learners who broke a rule, under the safe rules below.

The old 25-item vehicle safety checklist is removed.

## Decisions (from the user, 2026-09-23)

| Topic | Decision |
|---|---|
| Old checklist | **Replace.** Delete checklist screens, APIs, libs, tables, photo bucket, `tms.inspection.*`. Keep the printed `/i/<REG>` sticker: it now opens that bus's learner check. |
| Inspectors per route | **No fixed limit.** |
| Access | From the **assignment** (existing `tms_route_checker_route_ids`), not a role — role grants skip never-logged-in staff. |
| Fine amount | **Fixed amounts in Settings** (unpaid ₹, no-booking ₹), not the ₹13,200–₹30,250 stop fine sheet. |
| Fine timing / rules | **Safe rules** (below), raised on **submit**. |
| Booked another bus | Amber "Booked other bus" mark, **no fine**. |
| Staff riders | Marks only, **never fined** (fine ledger is learner-only). |
| Default | Fine switch **OFF** until the Transport Head turns it on. Unreadable setting = OFF. |

## Marks (what the inspector sees per person)

- **Fee:** green `Paid` = Term 1 paid by `term1PaidLearnerIds()` (instalment-aware — the SAME rule
  as the 48h timer and the portal gate); green `Override` = learner has a `tms_fee_override`;
  red `Unpaid` = otherwise with a bill; grey `No bill` / `Unknown` (read failed).
  Replaces today's looser `rosterFeeBadge` rule for checks (it counted not-yet-due instalments).
- **Booking:** green `Booked` = `tms_booking` row for **this route** on the check date; amber
  `Booked other bus` = booking on another route that day; red `No booking` = no row that day.
  (`tms_booking` has one row per learner per day covering both legs.)
- Staff keep today's staff fee state (exempt / paid / unpaid / none); no booking mark.

## Fine rules (evaluated again server-side at submit — never trusted from the scan)

A fine is raised only if the switch is ON **and** every condition in its column holds.

| | Unpaid maintenance fee | No booking |
|---|---|---|
| Person | Learner (not staff, not unknown card, not manual) | same |
| Condition | Fee mark is `Unpaid` | Booking mark is `No booking` (not amber) |
| Deadline | Learner's Term-1 bill `due_date` < check date (IST) **and** no *running* 48h payment notice whose `expires_at` is still in the future | Check date is a service day (not Sunday, not a fleet holiday / route no-service day) |
| Exclusions | Fee override; `Unknown` fee state | — |
| Limit | **One per learner per transport year**, shared with the 48h timer | **One per learner per day** |
| Idempotency key (stored as `<key>:<personId>`) | `maintenance-unpaid:<transportYearId>` | `no-booking:<YYYY-MM-DD>` |
| Amount | `unpaidAmount` from Settings | `noBookingAmount` from Settings |
| Due date | check date + `fineDueDays` | same |

**Shared key with the 48h timer.** The payment-notice sweep switches its key from
`payment-notice:<noticeId>` to `maintenance-unpaid:<transportYearId>`. The unique
`tms_fee_fine.idempotency_key` makes a second maintenance fine impossible whichever path runs
first; `createFines` already counts `23505` as `duplicates`, and the sweep already reads the fine
back by key and marks its notice `fined` — so a learner fined by an inspection has their notice
closed against that same fine. 0 notice fines exist today (switch never turned on), so no data
migrates. The two paths fine different amounts (sweep: stop sheet; inspection: Settings) —
whichever fires first wins for that year.

## Fine engine change (`lib/fines/create.ts`)

- New optional input `fixedAmount?: number` — set only by server code from the stored setting,
  never from a request body (keeps the "amounts are server-resolved" invariant in
  `lib/fines/fields.ts`). With it, the stop sheet is not consulted and `no_stop` / `no_stop_rate`
  skips do not apply; stop/route snapshots are filled when known, else null.
- New optional input `kind?: 'maintenance_unpaid' | 'no_booking' | 'manual'` choosing the push
  text. Today's text always says "maintenance fee was not paid", wrong for a no-booking fine.
- Money row first, ledger second, compensating delete — unchanged.

## Data (one migration)

```
tms_route_check_person
  + fee_fine_id      uuid null → tms_fee_fine (on delete set null)
  + booking_fine_id  uuid null → tms_fee_fine (on delete set null)
  + fine_note        text null   -- e.g. 'off', 'within 48h window', 'not a service day', 'already fined this year'
  + booking_state    text null   -- this_route | other_route | none  (the amber case needs it)
admin_settings row setting_type='route_check_fines'
  { enabled:false, unpaidAmount, noBookingAmount, fineDueDays:7, enabledAt }
```
Validation: amounts are whole rupees 1–100000; `fineDueDays` 0–60.

## Submit flow (`POST /api/boarding/route-check/[checkId]/submit`)

1. Existing guarded draft→submitted update (409 if already submitted). Fines run only after it
   succeeds, so a double-tap cannot fine twice (and the keys would dedupe anyway).
2. Load config (fail OFF). If OFF → stamp `fine_note='fines off'` on eligible rows, done.
3. For the check's learner rows: recompute Term-1 paid set, overrides, running notices, Term-1
   due dates, bookings, service day — in bulk (`.in()` chunks ≤150, error-checked).
4. Call `createFines` per rule group with the rule's key, `fixedAmount`, `kind`, `notify:true`,
   `actorId = inspector`. Write `fee_fine_id` / `booking_fine_id` / `fine_note` back.
5. Activity log `fees/generate` per fine (entity `tms_fee_fine`, metadata check id + rule), plus
   the existing `route-checks/submit`.
6. Response gains `fines: { raised, alreadyFined, skipped: [{personId, reason}] }` — shown on the
   submit confirmation.

Failures in fine creation never un-submit the check; they are reported and logged.

## Screens

**Admin — sidebar "Bus Inspection" (`/inspections`, permission `tms.route_check.manage`)**
- Tab **Inspectors**: table (inspector, login email / "no login yet" flag, route, assigned at,
  notes, Unassign); **Assign** dialog (search staff ≥3 chars via existing
  `/api/admin/route-checkers/people`, multi-route pick, notes) → existing
  `POST /api/admin/route-checkers`.
- Tab **Checks**: list via existing `GET /api/admin/route-checks` (date range, route, status) +
  fines-raised count; row → `/inspections/checks/[id]` report: counts, every person with both
  marks, fine chips linking to the fine, **Waive** (existing `/api/admin/fines/[id]/cancel`,
  reason required, `tms.fees.edit`).
- **Printable stickers** page kept (moved to `/inspections/stickers`, same URL shape).
- `/route-checkers` → redirect to `/inspections`. Old nav line for Route Checkers removed.

**Settings → "Bus Inspection Fines"** card next to Fee Notice: switch, two amounts, due days,
and a **dry-run** count ("if a check ran today on every route: N unpaid-eligible, M already
fined this year").

**Staff app — nav "Bus Inspection"** (was "Route Check"; paths unchanged `/boarding/route-check`)
- Route list; **Scan bus sticker** button; Morning/Evening; learners by stop with both marks;
  scan dialog shows the two marks large (green/red/amber); filter chips gain `Fee ✗` / `No booking`.
- Submit confirmation shows fines raised / skipped with reasons.

**Sticker `/i/<REG>`** — moved out of the admin route group; resolves bus → active route; if the
user may check that route → `/boarding/route-check?route=<id>` (leg picker); else a plain
"You are not assigned to this bus" page. Proxy: `/i/*` admitted for signed-in users who are
assigned checkers or hold `tms.route_check.manage`.

## Removal

- **Move first** (Route Check depends on them): `requirePerm` → `lib/auth/require-perm.ts`
  (6 importers); `components/inspections/bus-scanner.tsx` → `components/scanner/bus-scanner.tsx`;
  `lib/inspections/sticker-code.ts` (+test) → `lib/vehicles/sticker-code.ts`; `routeForVehicle`
  → `lib/route-check/`.
- **Delete:** `app/(admin)/inspections/**` (except the rebuilt pages), `app/(admin)/i/**`,
  `app/api/admin/inspections/**`, rest of `lib/inspections/**` + 7 tests,
  `components/inspections/**`, `INSPECTION_*` permission constants, old nav line.
- **Keep:** activity-log `'inspections'` module label (history renders), `tms_set_updated_at()`.
- **DB teardown migration:** copy `tms_inspection` + items + learner checks into
  `tms_inspection_backup_20260923` (jsonb rows; 1 submitted test inspection exists), drop the 5
  `tms_inspection*` tables, delete bucket `tms-inspection-photos` (0 objects), remove
  `tms.inspection.*` from `custom_roles.permissions`, delete `admin_settings` `inspection` row.

## Testing

- Pure `lib/route-check/fine-rules.ts` (eligibility per rule, amber case, service day, 48h window,
  override, unknown) — vitest, table-driven.
- `createFines` with `fixedAmount` / `kind` (no stop needed; push text by kind).
- Sweep: key switched; duplicate from an inspection fine marks the notice `fined`.
- Build + full vitest; live dry-run SQL of eligible counts before the switch is turned on;
  `has_function_privilege` re-check on any new/changed SQL function; phone test by the user.

## Out of scope

Staff fines; changing attendance from a check; offline checks; manual entries / headcount
(still deferred from the Route Checkers plan); vehicle safety checklist (removed).
