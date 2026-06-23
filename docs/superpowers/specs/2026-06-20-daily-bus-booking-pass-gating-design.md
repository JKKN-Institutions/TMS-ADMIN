# Daily Bus Booking + Pass Gating — Design

**Date:** 2026-06-20
**Module:** Student portal — new "Booking" module (`tms_booking`), with gates on the boarding pass, the QR scan, and the boarding roster
**Status:** Approved — pending implementation plan

## Goal

Make every learner **book their bus the day before travel** (by **6 PM IST the prior day**) so that
passenger load is known in advance and buses can be optimized. A booking is the prerequisite for
everything downstream:

1. **No booking → no pass.** The QR boarding pass is locked unless a confirmed booking exists for
   today.
2. **No booking → no scan.** The boarding scanner rejects an unbooked learner server-side (real
   enforcement, not just a hidden button).
3. **Only booked learners appear on the attendance roster.**
4. **Walk-up exception:** a learner who shows up without a booking can still be boarded by staff
   **if seats remain**, recorded distinctly as a walk-up.

## Decisions (confirmed with user)

| Topic | Decision |
|---|---|
| Booking model | **Strict daily opt-in** — each learner books each travel date before the cutoff. No booking = no travel (except staff walk-up). |
| Trip granularity | **Whole-day** — one booking per learner per date authorizes **both** onward (morning) and return (evening) trips. |
| Walk-up policy | **Staff add walk-up if seats remain.** Recorded distinctly (`is_walk_up = true`); learner still marked present. Blocked when the bus is full. |
| Optimization (v1) | **Passive counts.** Show booked-vs-capacity per route/trip to admin + driver; humans decide vehicle swaps. No auto-cap. |
| Booking horizon | **Up to 7 days ahead** — bookable dates are tomorrow … tomorrow+6, each still bound by its own cutoff. |
| Cancellation | **Free before cutoff, frozen after.** Cancel/change allowed while `now < cutoff`; locked once the cutoff passes. |
| Non-travel days | **Allow any future date in v1.** No holiday/working-day calendar modeled; learners simply don't book days off. |
| Reminders | **In-app** reminder (reuse the existing `notifications` table) for learners with no booking for tomorrow. |
| Scope | **Learners only** in v1. Staff bookings deferred (mirrors the fees module's learners-first phasing). |
| Timezone | **IST (UTC+05:30)** for all travel-date and cutoff math. |

## Current state (verified against codebase, 2026-06-20)

- **Student portal** (`app/student/`) — pages: dashboard, routes, **pass**, **attendance**, fees,
  grievances, notifications, profile, settings, live-track (coming soon). Identity resolves
  server-side via `getLearnerRowForUser(auth)` → `learners_profiles`. Each learner has a **fixed**
  route + stop (`transport_route_id`, `transport_stop_id`). Nav lives in `lib/student/navigation.ts`;
  pages follow a `useMe()` + `/api/student/*` + `withAuth()` pattern.
- **QR pass** (`lib/boarding/pass.ts`) — `signPass(learnerId)` = `` `${learnerId}.${hmac32}` ``. The
  token encodes **identity only — no date, no expiry**. Issued by `GET /api/student/boarding-pass`,
  rendered at `app/student/pass/page.tsx`. `verifyPass(token)` returns the `learnerId`.
- **Scanning** (`app/boarding/scan/page.tsx` → `POST /api/boarding/scan`) — boarding staff scan with
  `html5-qrcode`; the server stamps `trip_date = new Date().toISOString().slice(0,10)` (**UTC** —
  a latent bug for IST), `direction` is a **manual toggle**, and it **upserts** into `tms_attendance`
  on `onConflict: 'learner_id,trip_date,direction'`. Requires `tms.attendance.scan` **and** an active
  `tms_staff_route_assignment` row. Manual marking exists at `POST /api/boarding/attendance`
  (`tms.attendance.manage`).
- **`tms_attendance`** — `id, learner_id, route_id, stop_id, trip_date date, direction
  (onward|return), status (present|absent), method (qr_scan|manual), scanned_by, scanned_at`,
  `UNIQUE(learner_id, trip_date, direction)`. Student views via `GET /api/student/attendance`.
- **Driver portal** (`app/driver/`) — only a read-only dashboard exists; **no passenger roster, no
  driver scanning**. `tms_driver` has `assigned_route_id`, `profile_id`, `staff_id`. A driver assigned
  via `tms_staff_route_assignment` already qualifies to use the `/boarding` scanner.
- **Admin boarding** (`app/boarding/routes/[routeId]/page.tsx`) — lists all route-allocated learners +
  today's attendance counts.
- **Data model** — `tms_route` (`total_capacity`, `current_passengers`, `vehicle_id`, `driver_id`,
  `fare`, `status`); `tms_vehicle` (`capacity`); `tms_route_stop` (`stop_time` morning, `evening_time`,
  `sequence_order`); `learners_profiles` (`transport_route_id`, `transport_stop_id`, `bus_required`).
  **No booking/schedule/trip table exists.** Conventions: `tms_` prefix, `created_at/updated_at/
  created_by/updated_by` audit columns, a `trg_<table>_updated_at` trigger calling
  `public.tms_set_updated_at()`, RLS enabled with permission-keyed policies.
- **Permissions** — keys are `tms.<entity>.<action>`. **`tms.bookings.view`, `tms.bookings.create`,
  `tms.bookings.manage` and `tms.schedules.*` are already seeded but unused** (no table yet). Self
  keys have precedent (grievances use a submit-style self key).

## Lifecycle (state machine)

For one learner + one travel date:

```
UNBOOKED ──book (now < cutoff)──▶ BOOKED ──cutoff passes──▶ LOCKED ──scan──▶ PRESENT
   │                                 │                          │
   │                       cancel (now < cutoff)                └─(never scanned)──▶ NO-SHOW
   ▼                                 ▼
(pass locked,                    UNBOOKED
 not on roster)

UNBOOKED + shows up at stop ──staff add (seats remain)──▶ WALK-UP (present, is_walk_up=true)
```

**LOCKED is derived from time, not stored.** A date is locked once `now > cutoffFor(date)`. Stored
`status` is only `booked` / `cancelled`. NO-SHOW and PRESENT are derived by joining bookings to
attendance.

## Data model

### New table `tms_booking`

```sql
id            uuid primary key default gen_random_uuid(),
learner_id    uuid not null references public.learners_profiles(id) on delete cascade,
route_id      uuid not null references public.tms_route(id),        -- snapshot of assignment at booking time
stop_id       uuid references public.tms_route_stop(id),            -- snapshot
travel_date   date not null,
status        text not null default 'booked' check (status in ('booked','cancelled')),
booked_at     timestamptz not null default now(),
cancelled_at  timestamptz,
created_at    timestamptz not null default now(),
updated_at    timestamptz not null default now(),
created_by    uuid,
updated_by    uuid,
unique (learner_id, travel_date)   -- whole-day: one booking per learner per date
```

- Indexes: `(travel_date, route_id, status)` for counts; `(learner_id, travel_date)` for the student
  status board.
- `trg_tms_booking_updated_at` trigger.
- RLS enabled; service-role API enforces permissions in app code (matching the project's modern
  pattern).
- **Why snapshot `route_id`/`stop_id`:** decouples "what bus they booked" from "what bus they're
  currently assigned to," so per-route counts stay exact even if admin re-allocates a learner mid-week.

### Additive change to `tms_attendance`

```sql
alter table public.tms_attendance
  add column if not exists is_walk_up boolean not null default false;
```

Existing rows default to `false`. Lets reports separate booked-and-present vs walk-up. No other
attendance changes.

## Enforcement chain (the heart of the feature)

The same question — *"is there a `booked` row for this learner on this date?"* — is asked at three
layers. Centralize it in `lib/booking/` so all three stay consistent.

1. **Pass page** `/student/pass` (UX gate) — render the QR only if a `booked` row exists for
   **today (IST)**; otherwise show a locked state + "Book a seat" CTA.
2. **Scan endpoint** `POST /api/boarding/scan` (**real enforcement**) — after `verifyPass` →
   before the attendance upsert, check `tms_booking` for `(learner_id, today_IST, status='booked')`.
   No booking → reject with `reason: 'not_booked'`. The scanner UI then offers **"Add as walk-up"**
   when seats remain.
3. **Roster** `/boarding` and driver count (`WHERE` clause) — the roster *is* today's `booked`
   learners (+ walk-ups). Delivers "only booked passengers show in the attendance list."

## Capacity & walk-up math

- `capacity` = assigned vehicle's `tms_vehicle.capacity` (via `tms_route.vehicle_id`), fallback to
  `tms_route.total_capacity`.
- `booked_count(route, date)` = count of `tms_booking` rows where `route_id`, `travel_date`,
  `status='booked'`.
- `walk_ups_today(route)` = count of `tms_attendance` where `route_id`, `trip_date=today`,
  `is_walk_up=true`, `direction='onward'` (counted once per learner-day for seat purposes).
- `seats_remaining` = `capacity − booked_count − walk_ups_today`.
- Walk-up allowed only while `seats_remaining > 0`; otherwise the scanner shows **"Bus full."**
  (v1: hard block when full — no staff override.)

## Cutoff & timezone (correctness-critical)

New helper `lib/booking/window.ts`, **all math in IST**:

- `istToday()` → today's date in IST.
- `cutoffFor(travelDate)` = `travelDate − 1 day @ 18:00 IST`.
- `bookableDates(now)` = tomorrow … tomorrow+6 (7-day horizon) where `now < cutoffFor(date)`.
- `isBookingOpen(travelDate, now)` = `travelDate ∈ bookableDates && now < cutoffFor(travelDate)`.
- `isCancelable(travelDate, now)` = same condition as `isBookingOpen` (free until cutoff).
- The existing `POST /api/boarding/scan` "today" is realigned from UTC to **IST** so scan and booking
  agree on the calendar day.

## Pages & API surface

### Student
- **New page `/student/bookings`** — next-7-days list; each day shows a status, its cutoff time, and
  a Book/Cancel button; shows the learner's fixed route + stop read-only. Empty state if no route is
  allocated (can't book without allocation). Added to `lib/student/navigation.ts` (e.g. icon
  `CalendarCheck`). The per-day status is a clean 2×2 of (booked?) × (before cutoff?):

  | | Before cutoff (`now < cutoffFor(date)`) | After cutoff |
  |---|---|---|
  | **Has `booked` row** | **Booked** (cancelable) | **Locked** (confirmed, frozen) |
  | **No booking** | **Not booked** (Book button) | **Closed** (missed the cutoff — can't book) |
- **Dashboard tile** — "Tomorrow: Booked ✓ / Book now" quick status.
- `GET /api/student/bookings` — the 7-day status board for the session learner (status + cutoff per
  day + assigned route/stop). Permission: `tms.bookings.self`.
- `POST /api/student/bookings` — `{ travel_date, action: 'book' | 'cancel' }`. Derives learner +
  route/stop from session (**never trusts client input**); validates `isBookingOpen` /
  `isCancelable`; rejects if no route allocated or window closed. Permission: `tms.bookings.self`.
- `GET /api/student/boarding-pass` — **modified** to gate the token on today's booking; returns
  `{ hasPass:false, reason:'not_booked' }` when absent.

### Boarding / driver
- `POST /api/boarding/scan` — **modified**: add the booking check, realign date to IST, support a
  walk-up re-submit (`{ token, walkUp?: true }`) that writes `is_walk_up=true` when seats remain.
  Walk-up rides on `tms.attendance.scan`.
- `GET /api/boarding/roster?route_id=&date=` — today's `booked` learners + walk-ups + present/absent +
  counts (`tms.attendance.view` / boarding access). Powers the boarding roster; the driver dashboard
  shows the count.

### Admin
- `GET /api/admin/bookings/summary?date=` — per-route booked-vs-capacity load for planning
  (`tms.bookings.view`).
- `POST /api/admin/bookings/send-reminders` — inserts in-app `notifications` for learners with no
  booking for tomorrow. Callable manually now; wireable to a scheduler / pg_cron later
  (`tms.bookings.manage`).

**Who scans:** the existing `/boarding` portal. A driver assigned via `tms_staff_route_assignment`
already qualifies, so **no separate driver-scanning build is needed in v1.**

## Permissions

- Reuse seeded `tms.bookings.view` / `tms.bookings.create` / `tms.bookings.manage` for admin/staff.
- **Add one self-scoped key `tms.bookings.self`** for learners (mirrors the grievances self key).
- Walk-up uses the existing `tms.attendance.scan`.

## Migration plan

One migration (`supabase/migrations/<ts>_create_tms_booking.sql`):
1. `create table tms_booking …` + indexes + `updated_at` trigger + RLS enable.
2. `alter table tms_attendance add column is_walk_up boolean not null default false`.
3. Seed `tms.bookings.self` (and confirm `tms.bookings.view/create/manage` exist).

Commit the file under `supabase/migrations/`; apply via the project Supabase MCP.

## Non-goals for v1 (explicit YAGNI)

No seat-number selection, no waitlist / automatic capacity cap, no holiday/working-day calendar, no
staff bookings, no WhatsApp reminders, no per-direction bookings, no automatic vehicle reassignment,
no separate driver-scanning UI. The schema accommodates each as a clean fast-follow.

## Testing

- `lib/booking/window.ts` unit tests: IST cutoff boundary (the 18:00 edge), horizon edges
  (tomorrow … +6), `isBookingOpen` / `isCancelable` before vs after cutoff.
- Booking API: book + cancel before cutoff (ok); after cutoff (rejected); no route allocated
  (rejected); duplicate date (idempotent upsert).
- Pass gate: booked → token present; unbooked → `not_booked`.
- Scan: unbooked rejected; booked accepted (present); walk-up when seats remain; blocked when full;
  IST day boundary.
- Counts: booked-vs-capacity and seats_remaining accuracy.

## Open items to confirm during planning

- Whether the **driver** should get a dedicated read-only roster page in v1 (vs. count-only on the
  dashboard + roster living in `/boarding`).
- Whether walk-up-when-full should remain a **hard block** or allow a staff override with a reason.
