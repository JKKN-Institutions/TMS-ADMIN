# Book Bus — Monthly Calendar + Optimized Booking Table — Design

**Date:** 2026-06-23
**Status:** Approved (design); pending implementation plan
**Author:** Pairing session (Sangeetha V)

## 1. Problem & Goal

The student portal needs a **full-page monthly calendar** for booking the bus. Today
`app/student/bookings/page.tsx` renders a narrow 7-day vertical list and never uses the
month-grid API that already exists. We want:

1. A full-page month calendar (one month at a time, prev/next navigation) in the student
   "Book Bus" module, showing **every date of the month**.
2. **Admin-fixed availability:** days are **open by default**; when an admin marks a date as
   leave (holiday / no-service), that date renders **red** on the student calendar and is not
   bookable. The change is reflected automatically (no redeploy, no manual student refresh
   beyond a normal page load / window-focus refetch).
3. Booking is allowed for **any open day in the visible month** (the current hard cap of 7
   days ahead is lifted), still gated by the same-day **6 PM-day-before cutoff**.
4. The bookings are visible to **drivers and boarding staff**, defaulting to the **current
   date**, showing **booked passengers with details + overall statistic counts**.
5. A **date-wise, storage-optimized** booking table (separate from the passenger table),
   because bookings will be the highest-row-count data in the system.

## 2. Current State (verified)

The recent `feat/daily-bus-booking` merge already built most of the backend:

- `tms_booking` — date-wise booking table (currently **3 test rows** only).
- `tms_service_calendar` — `holiday` / `no_service` exceptions, all-routes or per-route
  (currently **0 rows**). This is where admin "leave" is recorded — already wired via the
  admin `/schedules` → **Service Calendar** tab.
- `tms_booking_window` — per route+date overrides: `booking_enabled`, `deadline`,
  `capacity_override` (currently **0 rows**).
- `/api/student/bookings` — already returns a **full month grid** via `?month=YYYY-MM` with
  statuses `open|booked|locked|closed|holiday|no_service|out_of_horizon`.
- `lib/booking/calendar.ts` — `buildMonthCells()` merges bookings + holidays + windows into
  day cells (pure + unit-tested).
- `lib/booking/window.ts` — IST cutoff logic + `HORIZON_DAYS = 7` cap.
- `/api/boarding/routes/[routeId]/roster` — per-route roster (booked ∪ walk-ups), **today only**.
- `/api/driver/passengers` — lists **all** assigned learners, **not** booking/date-aware.

**Implication:** this is mostly a frontend + policy change plus two small backend extensions;
the heavy lifting (capacity math, holiday precedence, cutoff logic) already exists and is tested.

## 3. Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Availability model | **Opt-out**: open by default; admin marks leave to close |
| 2 | Leave display | Leave dates render **red**; auto-updated on next load/focus |
| 3 | Horizon | **Any open day in the visible month**; same-day 6 PM cutoff still applies |
| 4 | Calendar scope | **One institution-wide** calendar (all routes share leave dates) |
| 5 | Driver/boarding view | Default **current date**; booked passengers + details + stat counts |
| 6 | Storage | New **optimized date-wise** `tms_booking` (separate from passenger table) |

## 4. Optimized Booking Table

Bookings stay out of `learners_profiles`. The existing `tms_booking` is redesigned (drop &
recreate — only 3 throwaway rows exist) into a lean, date-wise table.

```sql
create table tms_booking (
  learner_id  uuid not null references learners_profiles(id) on delete cascade,
  travel_date date not null,
  route_id    uuid not null references tms_route(id),       -- snapshot; powers roster query
  stop_id     uuid          references tms_route_stop(id),  -- snapshot; boarding stop
  booked_at   timestamptz not null default now(),
  booked_by   uuid,                                         -- learner user id (or admin if on-behalf)
  primary key (learner_id, travel_date)                     -- one booking per learner per day
);

create index idx_booking_route_date
  on tms_booking (route_id, travel_date) include (learner_id, stop_id);
```

**Optimization rationale**

- **Composite PK `(learner_id, travel_date)`** removes the 16-byte surrogate UUID `id` and the
  redundant unique index. The PK index doubles as the "my bookings this month" lookup and the
  book/cancel target — one identity, one index instead of two.
- **Presence = booked; cancel = DELETE the row.** No `status` / `cancelled_at` columns; the
  table never accumulates dead cancelled rows, and every query drops its `status='booked'`
  filter. The "Booked vs Locked" UI distinction is **computed from the cutoff**, not stored.
- **Covering index** `(route_id, travel_date) INCLUDE (learner_id, stop_id)` makes the
  driver/boarding/admin roster + capacity-count query index-only (no heap fetch).
- Rows shrink ~160 → ~84 bytes (~half); 3 indexes → 2.
- **Partition-ready:** `travel_date` is in the PK, so a later `PARTITION BY RANGE (travel_date)`
  (monthly) needs no schema redesign. **Not** partitioned now (YAGNI at <1M rows).

**Trade-off accepted:** delete-on-cancel keeps no in-table cancellation history. Mitigation:
log `book` / `cancel` events to the existing `tms_activity_log` so the audit trail lives there.

**RLS:** unchanged approach — learner may `SELECT` own rows; all writes via service-role.

## 5. Build Areas

### A. Student full-page month calendar
Replace the 7-day list in `app/student/bookings/page.tsx` with a full-page 7-column month grid.

- Prev/next month navigation; weekday header row; leading/trailing blanks for alignment.
- Color legend. Cell colors: **green** = booked, **blue** = locked (cutoff passed),
  **grey** = closed/past, **red** = leave (holiday/no-service), white = open.
- Tap an **open** day → book; tap your **booked** (still-cancelable) day → cancel.
- Monthly stat (e.g. "12 days booked this month").
- Data: existing `GET /api/student/bookings?month=YYYY-MM`; book/cancel via existing `POST`.
- Component extraction: `components/booking/booking-calendar.tsx` (presentational grid) +
  page wiring; keep mobile-first responsiveness (grid scales down on small screens).

### B. Driver "Bookings" view (new)
- `GET /api/driver/bookings?date=YYYY-MM-DD` (default today): for the driver's route(s),
  return booked learners (join `learners_profiles` for name, roll/register no., stop), ordered
  by stop sequence, plus counts `{ booked, capacity, percentFull }` per route.
- `app/driver/bookings/page.tsx`: date picker (default current date), per-route sections,
  passenger list + stat header.
- Nav entry in `components/driver-bottom-nav.tsx`.
- Permission: reuse `tms.driver.self_view`.

### C. Boarding staff date picker
- Extend `GET /api/boarding/routes/[routeId]/roster` with optional `?date=YYYY-MM-DD`
  (default `istToday()`); keep authority check (staff assigned to route).
- Add a date selector to the boarding roster UI.

### D. Booking-logic update
- Lift `HORIZON_DAYS = 7` to a configurable `MAX_BOOKING_HORIZON_DAYS = 92` (covers the current
  month plus ~2 ahead) so the whole visible month is bookable, still cutoff-gated. Update
  `isBookingOpen` / `bookableDates` / `cellStatus` so in-month future dates are `open`, not
  `out_of_horizon`.
- Switch `lib/booking/repo.ts` (`bookedCount`, `hasBookingForDate`), the boarding roster, and
  the admin manifest to delete-on-cancel semantics (row presence; no `status` filter).
- Update student book/cancel route: insert `ON CONFLICT (learner_id, travel_date) DO NOTHING`
  for book; `DELETE` for cancel; log to `tms_activity_log`.
- Update unit tests in `lib/booking/*.test.ts` (TDD: adjust expectations, then code).

## 6. Data Flow

```
Admin marks leave ─► tms_service_calendar (holiday/no_service, route_id = NULL)
                          │
Student opens calendar ─► GET /api/student/bookings?month=YYYY-MM
                          │   loadExceptions() + loadWindows() + buildMonthCells()
                          ▼
                     month cells (red for holiday/no_service) ─► full-page grid
Student taps open day ─► POST /api/student/bookings {book} ─► INSERT tms_booking
Student taps booked  ─► POST {cancel} ─► DELETE tms_booking
                          │
Driver/boarding open ─► GET .../bookings?date=D ─► tms_booking (route_id,travel_date)
                          │   index-only ─► join learners_profiles ─► list + counts
```

## 7. Error Handling

- Booking a leave date → 409 "holiday / no-service day" (server re-checks; UI also disables).
- Booking past cutoff / past date → 409 "Booking is closed for that date".
- Capacity full → 409 "fully booked" (capacity = window override ?? vehicle/route capacity,
  minus active bookings minus walk-ups).
- No route allocated → friendly empty state (student) / empty roster (driver).
- Missing table (`42P01`) guards retained where present.

## 8. Testing & Verification

- Unit: `lib/booking/window.test.ts`, `lib/booking/calendar.test.ts` updated for the new
  horizon + delete-on-cancel statuses.
- Type: `tsc --noEmit` filtered to changed files (project ESLint is broken — do not rely on it).
- Route probes: curl the new/changed endpoints for 200/401/409 shapes (agent Chrome is
  unauthenticated; **live calendar render confirmed in the user's authenticated browser**).
- DB: migration applied via Supabase MCP **and** committed as a file under
  `supabase/migrations/`.

## 9. Out of Scope (explicitly deferred)

- Table **partitioning** (design is partition-ready; revisit only if volume explodes).
- **Supabase Realtime** push updates (auto-update is via no-store fetch + focus refetch).
- **Per-route** leave calendars (decision: institution-wide only for now).
- Onward/return split, contact numbers in the driver list (can add later if needed).
```
