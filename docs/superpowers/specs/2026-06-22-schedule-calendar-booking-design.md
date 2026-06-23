# Schedule (Calendar) Booking — Design Spec

**Date:** 2026-06-22
**Status:** Approved design (pending spec review) → implementation plan to follow
**Author:** Sangeetha V (with Claude)

## 1. Summary

Turn the learner bus-booking experience from a 7-day **list** into a **month calendar**, gate
bookable dates by an **admin-managed service calendar** (holidays / no-service days), relabel the
feature from "Book Bus" to **"Schedule"**, make each booking **visible across the admin, driver and
boarding (staff) portals**, and add **booking-aware route optimization** (skip empty stops now;
fleet consolidation later).

The booking *engine* already exists and is **not** being rebuilt. This spec adds a gate, one table,
a new UI, three read views, and one optimization helper on top of it.

## 2. Confirmed decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Admin calendar model | **New `tms_service_calendar`** — exceptions to a "every day bookable" default (holiday / no-service, optionally per route). |
| 2 | Rename scope | **Relabel only.** Nav `Book Bus → Schedule`, page title `→ My Schedule`. Route/API/reminder URLs stay `/student/bookings`. |
| 3 | Route optimization | **Both, phased.** Phase A = skip empty stops (build now). Phase B = fleet consolidation (documented, deferred). |
| 4 | Same-day booking | **No.** Keep the existing day-before 6 PM IST cutoff. |
| 5 | Bookable horizon | **7 days** (unchanged), promoted to a named constant. |

## 3. Goals / Non-goals

**Goals**
- Learner sees a month calendar; holidays/no-service days are visually blocked; bookable days are tappable to Book/Cancel.
- Admin manages holiday / no-service exceptions, and sees live per-route booking load + the booked learner list for any date.
- Driver sees today's (and a chosen date's) booked passengers for their route; boarding keeps its existing roster.
- Driver/boarding rosters show only stops that actually have booked learners (skip empty stops).

**Non-goals (this spec)**
- Same-day booking; changing the cutoff rule.
- Real-time/websocket roster updates (rosters are final at 6 PM day-before; query-by-date + refetch is sufficient).
- Online payment, seat selection, fleet consolidation engine (Phase B is described but not built here).
- Renaming the `/student/bookings` route or API paths.

## 4. Assumptions

- **"Staff portal" = the existing boarding staff portal.** There is no separate staff app. So cross-portal work = rebuild the admin bookings view, **build** a driver roster, **reuse** the existing boarding roster (`/boarding/routes/[routeId]`).
- Because same-day booking stays disabled, a date's roster is **final at 6 PM the day before**; portals read `tms_booking` **by date** and reflect current values on load / React-Query refetch / manual refresh.

## 5. Existing building blocks (reused, not rebuilt)

- `tms_booking` table — `(learner_id, route_id, stop_id, travel_date, status booked|cancelled)`, unique `(learner_id, travel_date)`. (`supabase/migrations/20260620100000_create_tms_booking.sql`)
- `lib/booking/window.ts` — IST cutoff (6 PM day-before), 7-day horizon, `dayStatus()`.
- `lib/booking/repo.ts` — `hasBookingForDate`, `bookedCount`, `walkUpCount`, `routeCapacity`, `seatsRemaining` (all guard 42P01).
- `app/api/student/bookings/route.ts` — GET board + POST book/cancel.
- `app/api/admin/bookings/summary/route.ts` — per-route booked/capacity for a date.
- `app/api/admin/bookings/send-reminders/route.ts` — un-booked reminders.
- `app/boarding/routes/[routeId]/page.tsx` + `app/api/boarding/routes/[routeId]/roster/route.ts` — existing booked + walk-up roster.
- `app/boarding/scan` — booking gate + walk-up.

## 6. Data model — `tms_service_calendar`

A table of **exceptions** to the default ("every day is bookable"). One row = one blocked date, optionally route-scoped.

| column | type | notes |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `exception_date` | date NOT NULL | the blocked day |
| `route_id` | uuid NULL FK→tms_route.id ON DELETE CASCADE | **NULL = all routes**; set = that route only |
| `kind` | text NOT NULL | CHECK (`holiday`, `no_service`) — both block booking; differ only in label |
| `note` | text NULL | e.g. "Pongal" |
| `created_at` | timestamptz NOT NULL default now() | |
| `updated_at` | timestamptz NOT NULL default now() | + updated_at trigger |
| `created_by` | uuid NULL | |
| `updated_by` | uuid NULL | |

**Uniqueness (avoid the NULL-distinct duplicate trap):**
- `CREATE UNIQUE INDEX ... ON tms_service_calendar (exception_date) WHERE route_id IS NULL;`
- `CREATE UNIQUE INDEX ... ON tms_service_calendar (exception_date, route_id) WHERE route_id IS NOT NULL;`

**Index for the gate:** `(exception_date, route_id)`.

**Gate rule:** date `D` is blocked for a learner on route `R` when a row exists with
`exception_date = D AND (route_id IS NULL OR route_id = R)`.

**RLS:** service-role only for writes (admin API). Learners never read this table directly — blocked
dates reach them through the student board API.

## 7. Window + calendar builder

New `lib/booking/calendar.ts` (pure/unit-testable):
- `loadExceptions(svc, routeId, from, to) → Map<dateStr, {kind, note}>` — one query, all-routes ∪ route-specific.
- `buildMonth(routeId, monthStr, bookings, exceptions) → DayCell[]` where
  `DayCell = { date, status }` and
  `status ∈ booked | open | locked | closed | holiday | no_service | out_of_horizon`.
- Precedence: `holiday/no_service` (calendar) → `booked` → cutoff/horizon (`open|locked|closed`) → `out_of_horizon`.

`lib/booking/window.ts` stays authoritative for cutoff + horizon; `HORIZON_DAYS = 7` becomes a named constant.

## 8. API changes

- **Student** `GET /api/student/bookings?month=YYYY-MM` (optional param) → returns the month's `DayCell[]` + route/stop labels. **No param = current 7-day board behavior** (back-compat). POST book/cancel unchanged; it must also re-validate the service-calendar gate server-side (defense-in-depth) so a blocked date can't be booked via direct POST.
- **Admin service calendar** `GET/POST/DELETE /api/admin/service-calendar` — list/add/remove exceptions. `requirePerm('tms.bookings.manage')`. Field whitelist in `lib/service-calendar/fields.ts`.
- **Admin booking list** `GET /api/admin/bookings/list?route=&date=` → booked learners (name, roll, stop) for a route+date. `requirePerm('tms.bookings.view')`.
- **Driver roster** `GET /api/driver/roster?date=` → for the driver's assigned route(s): booked learners + booked-stop list. Permission: driver self-scope (assigned route via existing helper) — mirror boarding roster's auth.

All new routes follow the MODERN `withAuth` + `createServiceRoleClient` + `requirePerm` pattern and the 42P01 empty-table guard.

## 9. UI changes

### 9.1 Student — calendar + relabel
- `components/student/month-calendar.tsx` — presentational grid (given `DayCell[]` + `onSelect`), legend, prev/next month, mobile-first.
- `app/student/bookings/page.tsx` — render the grid; tapping a day opens a **bottom sheet** (mobile) / popover (desktop) with date, status, cutoff, and Book/Cancel (existing POST). Blocked days greyed with label; out-of-horizon days inert-but-visible (upcoming holidays visible for context).
- Relabel: `lib/student/navigation.ts` `Book Bus → Schedule`; page H1 `→ My Schedule`.

### 9.2 Admin
- Rebuild `app/(admin)/bookings/page.tsx` (currently a broken stub pointed at a non-TMS table): date picker → per-route booked/capacity (summary API) → drill into route+date learner list. Add an **admin nav** entry (`lib/navigation.ts`).
- **Calendar manager** (page or panel): add/remove exceptions (date + optional route + kind + note) via the service-calendar API.

### 9.3 Driver
- `app/driver/*` roster page: today's passengers for the driver's route + date switcher; consumes `/api/driver/roster`. Shows booked learners + booked-stop list (Phase A).

### 9.4 Boarding
- Existing roster unchanged except it gains the booked-stop summary (Phase A).

## 10. Route optimization

- **Phase A (build now):** `lib/booking/optimize.ts → bookedStopsForRouteDate(svc, routeId, date)` groups `tms_booking.stop_id` for that date → returns **only stops with ≥1 booking**, in `sequence_order`, with counts. Surfaced in driver + boarding rosters as an "optimized stops" list (empty stops hidden; toggle to show all).
- **Phase B (deferred, documented):** extend `app/(admin)/route-optimization*` to read `tms_booking` and flag under-booked routes per date with merge/cancel suggestions. Not built in this spec's plan.

## 11. Permissions

Reuse existing `tms.bookings.view` (admin read) and `tms.bookings.manage` (admin calendar writes + reminders). Driver roster uses driver self-scope (assigned-route check), mirroring the boarding roster. No new permission keys unless the existing set lacks a driver-scoped read — decided during implementation.

## 12. Testing & verification

- Unit tests: calendar **gate** (all-routes vs per-route exception; exception × cutoff × horizon precedence) and `bookedStopsForRouteDate`.
- New APIs: `tsc` (filtered to changed files; project ESLint is broken) + curl route-probes (expect 307/401 unauth).
- Migration applied via Supabase MCP and committed under `supabase/migrations/`.
- Visual confirmation of the authed `/student`, `/driver`, admin pages is done by the user in their logged-in browser (agent browser is OAuth-gated/unauthenticated).

## 13. Build order

1. `tms_service_calendar` migration (+ uniqueness indexes, trigger) + permission wiring.
2. `lib/booking/calendar.ts` (gate + month builder) + `lib/booking/optimize.ts` + unit tests.
3. Student: `?month=` API extension → `MonthCalendar` UI → relabel.
4. Admin: service-calendar API + manager UI + rebuilt bookings view + nav.
5. Driver: roster API + page.
6. Boarding + driver booked-stop list (Phase A surfacing).

## 14. Risks / notes

- A month grid with only a 7-day actionable window can look "empty"; mitigated by showing booked + holiday context across the whole month. Horizon is a one-line constant if you later want 14.
- The external `schedules` / `booking_availability` tables (passenger-app merge) are intentionally **not** used; this spec keeps the clean `tms_` path to avoid coupling to half-integrated tables.
- Per-route vs all-routes holiday uniqueness must use the two partial indexes above, or duplicate holidays slip in.
