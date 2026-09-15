# Auto-absent when the attendance window closes — design

Date: 2026-09-15 · Branch: `feat/attendance-auto-absent` · Status: awaiting approval

## Problem

On `/boarding/attendance` staff mark each rider Present/Absent inside the trip's
window (morning 07:00–09:30, evening 16:00–19:00, both switched on). When the
window closes the controls disappear and **nothing else happens** — every rider
nobody marked stays "unmarked" forever. Staff currently mark absences by hand
(~415 manual absents per morning).

Measured on the live DB, morning trip:

| Day | Allocated | Marked | Unmarked | Unmarked + booked | Routes with 0 marks |
|---|---|---|---|---|---|
| 2026-09-15 | 1,819 | 1,249 | 570 | 171 | 4 (307 riders) |
| 2026-09-11 | 1,819 | 1,401 | 418 | 90 | 1 (90) |
| 2026-09-10 | 1,819 | 1,389 | 430 | 124 | 2 (209) |

Zero-mark routes: 37 (every day, no in-charge), 10 (no in-charge), 23 and 24
(in-charges assigned, did not mark that day).

## Decisions (confirmed by the user)

1. **Who:** every unmarked rider on the attendance roster — booked or not.
2. **Empty routes:** a route with **no human mark** for that trip/day is
   **skipped** (bus may not have run / in-charge did not use the app).
3. **Trips:** morning and evening; each closes at its own window end, only when
   the trip is switched on and its window is enforced.
4. **Correction:** an auto-absent is correctable — a later offline sync, an ID
   card scan, or the transport head may turn it Present. The job never re-marks
   a row a person removed.

## Approach

Chosen: **a Postgres function run by pg_cron every 10 minutes**
(`tms_auto_close_attendance`). Set-based SQL, one INSERT per route/trip; no
HTTP hop, no CRON_SECRET, keeps working if the web app is down.

Rejected:
- *pg_cron → `/api/cron/...` Next route* reusing `loadRouteAttendanceRoster`:
  testable in vitest, but ~25 sequential route loads, depends on the vault URL
  and Vercel being up (job 23 pattern), and the roster query is simple SQL.
- *Close lazily when the roster is read:* a route nobody opens never closes.

## Design

### Data

- `tms_attendance.method` CHECK gains `'auto'`. An auto row: `status='absent'`,
  `method='auto'`, `scanned_by NULL`, `is_walk_up false`, `scanned_at now()`.
- New ledger `tms_attendance_auto_close (trip_date, direction, route_id, closed_at,
  absent_count)`, PK `(trip_date, direction, route_id)`. RLS on, no policies
  (service role only). The ledger is what makes closing **once per route per
  trip per day**: a person clearing an auto-absent is never overwritten.

### The job — `tms_auto_close_attendance(p_now timestamptz default now())`

`SECURITY DEFINER`, `search_path = public`, EXECUTE revoked from
public/anon/authenticated (new functions here inherit a PUBLIC grant).

1. `v_date`/`v_time` = `p_now` in `Asia/Kolkata`. Stop on Sunday, or when
   `tms_service_calendar` has an all-routes row for `v_date`.
2. For each window row where `enabled` and (`direction='onward'` or `is_active`)
   and `v_time >= end_time` (a non-enforced window is open all day → never closes):
3. For each route that is **not** in the ledger for (date, trip), has **no**
   route-specific calendar exception, and has **≥1 non-auto** attendance row
   for (route, date, trip):
   - claim it: `insert into ledger … on conflict do nothing returning` — only the
     run that inserted proceeds (overlapping runs are safe);
   - insert absent rows for the roster minus anyone already marked:
     roster = learners with `transport_route_id = route`, `bus_required`,
     `lifecycle_status in ('active','admitted','account')` (must equal
     `ACTIVE_LIFECYCLE_STATUSES`) **union** learners with a `tms_booking` on
     (route, date) — the same set `loadRouteAttendanceRoster` shows. Stop = the
     booking's stop, else the profile stop. `on conflict (learner_id, trip_date,
     direction) do nothing` so any existing mark (on any route) wins;
   - write the inserted count to the ledger row.
4. Skipped zero-mark routes are **not** ledgered, so they are retried every run
   until IST midnight. A route whose marks arrive late (offline sync at 11:00)
   closes on the next run after they land. Past days are never touched.

Schedule: `cron.schedule('tms-attendance-auto-absent', '*/10 * * * *', …)`.
Off switch: `select cron.unschedule('tms-attendance-auto-absent')`.

### Interaction with existing writes (no change needed — verified in prosrc)

`tms_mark_attendance`'s upsert allows an update when `t.scanned_by is null`, so
manual marks, offline syncs and ID-card scans overwrite an auto-absent; its
`previous_status` columns record that the row was an auto-absent. `decideMark`
already treats `scannedBy null` as unowned. Races: a human mark and the job
both target the unique key; the job does nothing on conflict, the human upsert
wins either way.

### Readers that must change

- `lib/booking/analytics-types.ts`, `analytics-attendance.ts`, admin analytics
  route + filter bar: method union gains `'auto'`; `byMethod.auto`; the
  composition cell and filter show "Auto (window closed)". Per-staff table
  already skips `scanned_by null`.
- **In-charge coverage board** (`app/api/admin/incharge-coverage/route.ts`) and
  **roster share progress** (`app/api/boarding/attendance/roster/route.ts`):
  exclude `method='auto'` from "marked", or an in-charge who marked nobody
  reads as done.
- UI labels — `app/boarding/attendance/columns.tsx`, `app/student/attendance/columns.tsx`,
  `components/booking/booking-calendar.tsx`: currently `manual ? Pencil : QrCode`;
  auto rows get a clock icon and "Auto-marked absent — not marked before the
  window closed" instead of a QR icon / "by …".
- Dashboards that count absences (boarding dashboard, admin dashboard,
  `lib/routes/board.ts`) keep counting auto rows as absences — they ARE
  absences. Route-level "had attendance" sets are unchanged because auto rows
  only ever exist on routes that already had a human mark.

### Error handling

The function raises nothing on data it does not understand; a failure rolls back
only that cron run and is visible in `cron.job_run_details`. Retry is implicit
(next run, until midnight).

### Testing

- SQL: dry-run the migration's function inside
  `do $$ … raise exception 'TESTRESULT: %' $$` against live data (rolled back),
  with a fixed `p_now` (e.g. today 09:40 IST): counts per route equal the
  "unmarked on routes with marks" query; a second call inserts 0; Sunday /
  holiday / before-close return nothing; a zero-mark route is skipped; a
  subsequent `tms_mark_attendance` present on an auto row returns `overridden`.
- vitest (under `lib/`): analytics `byMethod.auto`; a `isAutoMark` helper; a
  drift test asserting the migration's lifecycle list equals
  `ACTIVE_LIFECYCLE_STATUSES`.
- `next build` + scoped tsc on touched files.

### Known limits (out of scope)

- After the window closes the UI shows no controls to anyone, including the
  transport head (pre-existing gap); server-side correction by override holders
  already works.
- Legacy manual marks store the UTC date; inside both windows UTC and IST are
  the same day, so the job's IST date matches.
- No Settings toggle; the cron job is the switch.
