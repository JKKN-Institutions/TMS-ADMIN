# Admin attendance oversight + any-date marking — design

Date: 2026-09-20 · Branch: `feat/admin-attendance-oversight` · Status: awaiting approval

## Problem

There is **no attendance module in the admin portal**. `lib/navigation.ts` has no
entry for it. The only admin-side attendance surface is a read-only aggregate
tab under `/bookings` → Analytics (KPIs, booked-vs-boarded per day, no-show by
route, walk-up cards). It shows no per-learner records, no route-by-date
coverage, and offers no way to mark.

Consequently the transport office cannot answer three questions:

1. Which routes have attendance marked, and which do not?
2. What was actually recorded on route X on date Y?
3. How do we fix a day nobody marked?

Measured on the live DB (2026-09-20):

| | |
|---|---|
| `tms_attendance` rows | 28,128 across **47 days** (2026-06-10 → 2026-09-18) |
| Routes with any attendance | **23 of 25 active** |
| Present / absent | 19,487 / 8,641 |
| Rows written by the auto-absent cron | 4,290 |
| Evening-leg rows | 4,995 (the return trip is barely used) |

**Routes never marked, not once:**

| Route | Name | Allocated learners |
|---|---|---|
| 10 | EADAPPADI | 33 |
| 37 | THULASAMPATTI | 98 |

Route 23 (ELAMPILLAI, 120 learners) has been dark since 2026-09-11. The
best-covered route (07 POOLAMPATTI) has 36 of 47 days, so **every route has
holes**. Over 2026-09-01 → 2026-09-18, morning leg, 25 routes × 16 service days
= 400 cells: **40 not marked, 49 partial, 236 marked, 75 holiday** — and zero
`auto_only`, because the cron skips exactly the routes that would produce it.

There is a causal loop behind routes 10 and 37: `tms_auto_close_attendance`
deliberately **skips routes with zero human marks** (to avoid ~300 false
absences). A route with no in-charge gets no human marks, therefore no auto
marks, therefore never appears in any attendance figure at all.

### The write path is date-locked, and the correction path is unreachable

`POST /api/boarding/attendance` computes `today` itself and the request body has
**no `date` field**. DELETE is the same. A super admin is already exempt from
the route-assignment gate, the time-window gate, the marking-method gate, the
in-charge share gate, and mark ownership (`p_allow_override`) — **date is the
one axis with no exemption**.

The SQL primitive is already capable:
`tms_mark_attendance(p_marks, p_trip_date, p_direction, p_actor, p_method,
p_allow_override)` takes an arbitrary `p_trip_date`. Nothing in the database
restricts a mark to today.

The UI is the hard blocker: `app/boarding/attendance/page.tsx:148` sets
`canMark = isToday && openLeg === direction` and the client never sends a date.
So the designated correction path — built, permissioned, with two live
`transport_head` holders — has no screen that can reach it. This is a
long-standing documented follow-up, not a new discovery.

`GET /api/boarding/attendance/roster?date=&direction=` already accepts any date,
and for a super admin silently widens to all 25 routes. It has **no `routeId`
filter**, so a super admin loading it pulls ~1,825 riders in one request.

`/api/admin/incharge-coverage` exists, is documented as "where attendance
coverage is broken, as one board", and has **zero UI consumers** — orphaned when
the in-charge enforcement UI was removed. It is single-day and in-charge-share
oriented, so it does not answer question 1 and is not reused here.

## Decisions (confirmed by the user)

1. **Admin view leads with a coverage grid** — routes × service days,
   colour-coded — with a click-through to that route+day's roster. Per-learner
   history is a later tab, not the landing screen.
2. **Marking lives on a new admin page**, not by unlocking the boarding phone
   screen. The staff tool stays same-day-only so a staffer cannot back-date by
   accident.
3. **Any past date is allowed**, with no future dates and a floor at the current
   transport year's start. The UI defaults to the last 30 days but lets the user
   reach further back. Every back-dated mark is flagged in the activity log.
4. **Only human marks count as "marked".** `method='auto'` rows get their own
   state, so a route running on the cron alone reads as a staffing gap rather
   than a success.

## Approach

### Chosen: extend the existing write path, add a read-only admin module

The coverage grid is one aggregate SQL query. Marking reuses
`POST /api/boarding/attendance` with an added optional `date`.

### Rejected: a separate admin write endpoint

Every manual mark and every scan already funnels through `tms_mark_attendance`.
A third write path is exactly the divergence that produced the
`is_walk_up`-was-0-for-21-days bug, where the manual POST silently failed to set
a flag the scanner did set. One write path, one set of rules.

### Rejected: a materialised coverage table

Unnecessary. The aggregate runs in **19 ms** for a 25-route × 16-day grid on the
existing `idx_tms_attendance_trip (route_id, trip_date)` index, verified with
`explain analyze` against production. No migration, no new index, nothing to
keep in sync.

## Architecture

```
app/(admin)/attendance/page.tsx               Coverage grid (landing)
app/(admin)/attendance/coverage-grid.tsx      The routes × dates matrix
app/(admin)/attendance/[routeId]/[date]/      Drill-down: roster + marking
app/api/admin/attendance/coverage/route.ts    GET the grid
app/api/admin/attendance/roster/route.ts      GET one route+date roster
lib/attendance/coverage.ts                    Pure cell classification (+ tests)
lib/boarding/backdate.ts                      Pure back-date authorization (+ tests)
```

Modified:

- `lib/navigation.ts` — one nav entry, `transport` group, `tms.attendance.view`.
- `app/api/boarding/attendance/route.ts` — the optional `date` on POST and DELETE.

### The coverage grid

Rows are active routes. Columns are **service days**: Sundays and
`tms_service_calendar` holiday / no_service rows are excluded, with a
route-specific exception beating an all-routes one — the same precedence
`lib/booking/calendar.ts` `loadExceptions` already implements.

Each cell is one of five states:

| State | Rule |
|---|---|
| `not_marked` | 0 human marks, 0 auto |
| `auto_only` | 0 human marks, ≥1 auto |
| `partial` | human marks < threshold × roster |
| `marked` | human marks ≥ threshold × roster |
| `holiday` | Sunday or a service-calendar exception |

States are evaluated in that order. A route with **no allocated learners**
(roster = 0) can never be `partial` — with a zero denominator any human mark
counts as `marked`, and no marks reads `not_marked`; the grid labels such a
route "no learners allocated" so an empty bus is not mistaken for a staffing
failure.

**The denominator is the allocated roster** (`learners_profiles` where
`bus_required` and `transport_route_id = route`), **not bookings**. Verified on
live data: staff mark 120–180% of bookings, because they also mark allocated
riders who never booked. Bookings as a denominator produce rates above 100%.

**The threshold is 60% and adjustable on the page.** At 90% the grid painted 252
of 400 cells amber and communicated nothing; against the roster, cells cluster
in the 60–100% band. 60% yields 236 marked / 49 partial / 40 not marked, which
is readable. Exposing the control avoids baking a guess into the code.

A leg toggle (Morning / Evening) sits above the grid. The evening leg has 4,995
rows fleet-wide and will render mostly empty — that is the true picture, not a
bug.

A summary strip above the grid names the headline failures — *"2 routes never
marked (131 learners) · 40 route-days unmarked in range · route 23 dark for 7
days"* — computed from the same payload, no extra query.

### The drill-down

`/attendance/<routeId>/<date>` reuses `loadRouteAttendanceRoster` and
`buildRosterRows` from `lib/booking/roster.ts` — the same functions the boarding
screen uses — so present / absent / unmarked, walk-up badges, fee state and
ownership behave identically to the staff view. A new admin roster endpoint is
needed only because the boarding one has no `routeId` filter and would load the
whole fleet.

Marking controls render for super admins and `tms.attendance.override` holders:
per-row present/absent, plus select-all bulk marking for the "nobody ever marked
this route" case.

### The date dimension

`POST /api/boarding/attendance` and `DELETE` gain an optional `date`:

| Request | Behaviour |
|---|---|
| `date` absent | Today. Byte-for-byte current behaviour. The phone is untouched. |
| `date` === today | Current behaviour. |
| `date` < today | Requires super admin **or** `tms.attendance.override`. |
| `date` > today | 400. Always. A future mark is not data. |
| `date` < floor | 400. Floor = the current transport year's `start_date` (live: **2026-06-01**, before the first attendance row on 2026-06-10). |

If no `tms_transport_year` row has `is_current` — a state this project has hit
before — the floor falls back to **365 days before today** rather than failing
open to all of history or failing closed to nothing.

The window, route-assignment and marking-mode gates already exempt these
callers, so no new exemption logic is introduced — only the date is authorized.
`p_trip_date` passes straight through to the RPC, which has always accepted it.

DELETE gets the same dimension; without it a back-dated mistake is permanent.

**No migration.** The RPC, the table and the index are all already capable.

## Safety rules

Each of these is a bug this codebase has already paid for once.

1. **No learner notifications on back-dated marks.** Back-filling September
   would tell hundreds of learners "you travelled without a booking" about trips
   three weeks gone. The `notifyLearner` loop is gated on `date === today`.
2. **Never set `move_route` on a back-dated mark.** The upsert's conflict target
   is `(learner_id, trip_date, direction)` and excludes `route_id`/`stop_id`;
   leaving `move_route` false preserves the historical boarding stop. A
   back-dated mark records *whether* someone travelled, never rewrites *where*.
3. **`is_walk_up` derives from bookings on the target date.** It already keys off
   the same `today` variable, so it follows the date correctly once that
   variable is fed from the request.
4. **Chunk every `.in()` at ≤150 and check the error.** An oversized `.in()`
   returns HTTP 400 with no rows, which reads as "nobody booked" and would flag
   a whole batch as travelling without a ticket.
5. **The activity log records `backdated: true` and the target date**, so
   back-fills are distinguishable from same-day work. The record itself already
   shows the correction through the existing `previous_status` trail.
6. **Auto-close is not retriggered.** Back-filling an old zero-mark day will not
   retroactively auto-absent the rest of that route — `tms_attendance_auto_close`
   claims each route-day once and only retries until IST midnight. The
   drill-down states this rather than implying the day is now complete.
7. **`method='auto'` is excluded from every "human marked" count**, the standing
   project rule that stops the cron from making unstaffed routes read as done.

## Error handling

- A failed attendance read renders an explicit error state, never zeroed counts.
  On this screen a zero reads as "nobody boarded", which is a different and
  false claim — the same rule the analytics Attendance tab already follows.
- A missing table (`42P01`) returns an empty grid, not a 500.
- A back-dated mark refused for authorization returns 403 with a reason the UI
  can name; refused for a bad date returns 400.
- Partial success on a bulk mark reports what did **not** happen (`locked`,
  `dropped`), reusing `summarizeMarkBatch` — a partially locked batch must never
  render as a clean sweep.

## Testing

- Pure vitest units for `lib/attendance/coverage.ts`: cell classification at each
  boundary, service-day exclusion, Sunday exclusion, per-route holiday
  precedence over all-routes.
- Pure vitest units for `lib/boarding/backdate.ts`: every row of the date table
  above, both permitted principals, and the floor.
- The marking path is **executed once against the live DB** inside a
  self-rolling-back `do $$ … raise exception 'TESTRESULT: %' … end $$;` block.
  This is non-negotiable here: a passing TypeScript parity test once proved two
  implementations agreed while neither one parsed, and four commits plus a merge
  shipped on top of a function that could not run.
- `npm run build` and the full vitest suite green before merge. ESLint is broken
  project-wide (`npm run lint` crashes); verification is build + scoped `tsc` on
  touched files + vitest.

## Phasing

| Phase | Ships | Risk |
|---|---|---|
| 1 | Coverage grid + drill-down, read-only | None — no write path touched |
| 2 | The `date` dimension + admin marking UI | Contained; phone behaviour unchanged when `date` is absent |
| 3 | Per-learner history tab, CSV export | None |

Phase 1 alone answers "which routes are not marked": on merge it would show that
routes 10 and 37 have never been marked and route 23 has been dark since
2026-09-11.

## Out of scope

- Retiring or rebuilding `/api/admin/incharge-coverage`. It stays orphaned.
- Changing the auto-absent cron, its ledger, or its zero-mark skip rule.
- Any change to the QR scan path.
- Changing which date a same-day mark lands on. The existing UTC/IST split on
  `trip_date` is pre-existing, shared with the scanner, and out of scope.
