# Bookings & Attendance Analytics — Design

**Date:** 2026-07-25
**Module:** Bookings (admin portal)
**Status:** Approved for planning

## Problem

The admin Bookings module has a read-only list (`/bookings`) and a per-route
capacity summary endpoint, but no analytical view. Three questions the transport
office cannot currently answer:

1. How far ahead do learners actually book, and which days/routes run heavy?
2. How many booked seats are never used (booked but never boarded)?
3. Which cohorts (institution / department / program) drive demand and waste?

The org-wide `/analytics` page carries a single `bookingsInRange` count and a
`bookingsTrend` series. That is not enough to plan routes.

## Ground truth (verified against the live DB, 2026-07-25)

### `tms_booking`

The live table does **not** match its original creating migration.
`20260623130000_optimize_tms_booking.sql` dropped and recreated it as a lean
6-column table:

| column | type | note |
| --- | --- | --- |
| `learner_id` | uuid | part of composite PK |
| `travel_date` | date | part of composite PK |
| `route_id` | uuid NOT NULL | snapshot of route at booking time |
| `stop_id` | uuid NULL | snapshot of boarding stop |
| `booked_at` | timestamptz | when the row was written |
| `booked_by` | uuid NULL | learner profile id (Self) or admin profile id |

There is **no surrogate `id`** and **no `status` column** — cancel is a hard
DELETE, so presence == booked. Queries MUST NOT filter on `status` and MUST NOT
select `id`.

Index available: `idx_booking_route_date on (route_id, travel_date) include (learner_id, stop_id)`.

### `tms_attendance`

| column | type | note |
| --- | --- | --- |
| `id` | uuid | surrogate PK |
| `learner_id` | uuid NOT NULL | |
| `route_id` | uuid NULL | |
| `stop_id` | uuid NULL | |
| `trip_date` | date NOT NULL | note: **`trip_date`**, not `travel_date` |
| `direction` | text | `onward` \| `return` |
| `status` | text | `present` \| `absent` |
| `method` | text | `qr_scan` \| `manual` |
| `is_walk_up` | boolean NOT NULL default false | |
| `scanned_by` | uuid NULL | |
| `scanned_at` | timestamptz | |

Unique on `(learner_id, trip_date, direction)`. **No FK to `tms_booking`** — the
two tables are joined in application code on `learner_id + date`.

### Data volumes

| table | rows | distinct days | learners | routes |
| --- | --- | --- | --- | --- |
| `tms_booking` | 2,387 | 83 | 854 | 24 |
| `tms_attendance` | 181 | 9 | 70 | 3 |

Attendance composition: 178 present / 3 absent · 181 onward / **0 return** ·
92 qr_scan / 89 manual · **0 walk-ups**.

Booked-vs-boarded on the days attendance exists (every attendance row matched a
booking, i.e. zero walk-ups in practice):

| date | booked | boarded | show-up |
| --- | --- | --- | --- |
| 2026-07-09 | 60 | 48 | 80% |
| 2026-07-10 | 78 | 43 | 55% |
| 2026-07-13 | 79 | 54 | 68% |
| 2026-07-14 | 94 | 29 | 31% |
| 2026-07-25 | 123 | 1 | 1% |

**Design consequence:** attendance covers 3 of 24 routes and 9 of 83 booked days.
The Attendance tab MUST disclose this coverage rather than render 3-route data as
if it were fleet-wide.

### Academic dimensions

`learners_profiles` carries `institution_id`, `department_id`, `program_id`
(also `degree_id`, `semester_id`, `section_id`, `gender`). Coverage is complete:
6,963/6,963 learners have `institution_id`. Among learners who have booked:
8 institutions, 27 departments, 45 programs.

Name resolution reuses the existing server-side batch loader
`lib/passengers/refs.ts :: loadPassengerRefs`, which maps
`institutions.name`, `departments.department_name`, `programs.program_name`,
`tms_route.route_number/route_name`, `tms_route_stop.stop_name`.

## Scope

**In scope:** a new read-only analytics page under the Bookings module with two
tabs (Bookings, Attendance) sharing one advanced filter bar, backed by one new
API endpoint and one new pure-aggregation library module.

**Out of scope:** any write path; changes to `tms_booking`/`tms_attendance`
schema; changes to the existing `/bookings` list beyond adding a link; changes to
the org-wide `/analytics` page; scheduled reports or email export.

## Architecture

### Placement

New route `app/(admin)/bookings/analytics/page.tsx`, reached from an **Analytics**
button in the header of the existing `/bookings` list page. No new sidebar entry
— it is a sub-page of the Bookings module.

**Permission:** the whole page and endpoint are gated on
`TMS_PERMISSIONS.BOOKINGS_VIEW` (`tms.bookings.view`), matching the module's
existing nav gate. The Attendance tab is NOT separately gated on
`tms.attendance.view` — decided for simplicity; attendance aggregate counts are
not more sensitive than the booking counts already on the page.

### Layout

```
Bookings & Attendance Analytics                        [Refresh]
┌─────────────────────────────────────────────────────────────┐
│ [Last 30 days ▾] [From][To]  [Routes ▾] [Stops ▾]           │
│ [Institution ▾] [Department ▾] [Program ▾] [Booked by ▾]    │
│ (Attendance tab only:) [Direction ▾] [Status ▾] [Method ▾]  │
│ chips:  Route 12 ✕   CSE ✕   Self-booked ✕        Clear all │
└─────────────────────────────────────────────────────────────┘
   Bookings │ Attendance
   ─────────┴───────────────────────────────────────────────
   … tab content …
```

The filter bar sits **above** the tabs and scopes both. Switching tabs preserves
the filter set. Direction/Status/Method controls are attendance-only and render
only when the Attendance tab is active.

### Filter state and URL sync

Filter state is serialized to the page's query string
(`?from=&to=&route_id=&department_id=&…`, multi-values comma-separated) via
`useRouter().replace(..., { scroll: false })`, so a filtered view is bookmarkable
and shareable. On mount, state initializes from `useSearchParams()`.

### Facet options come from the data, not from `/api/admin/masters`

The existing `/api/admin/masters` endpoint is gated on `FEES_VIEW`, which a
bookings-analytics user may not hold. Reusing it would 403 the filter dropdowns.

Instead the analytics endpoint returns a `facets` block listing only the routes,
stops, institutions, departments and programs **actually present in the
date-range-scoped booking + attendance data**. This both sidesteps the permission
mismatch and prevents filter options that would yield an empty result.

Facets are computed from the date-range scope only (before the other filters are
applied), so selecting a department does not erase the other departments from the
dropdown.

### Query strategy

The endpoint runs, in order:

1. `tms_booking` scoped by `travel_date >= from AND <= to`. **The date range is the
   only server-side filter.**
2. `tms_attendance` scoped by `trip_date >= from AND <= to`.
3. Distinct `learner_id`s from both result sets → **chunked `.in()` at 150 ids per
   call** against `learners_profiles`, selecting
   `id, first_name, last_name, roll_number, profile_id, institution_id, department_id, program_id`.
4. `loadPassengerRefs` for route/stop/institution/department/program label Maps.
5. Facets computed from this date-range-scoped set — before any other filter runs.
6. Route, stop, academic, booked-by, direction, status and method filters applied
   **in JS** over the fetched rows.
7. Pure aggregation functions in `lib/booking/analytics.ts` produce the response.

**Why every non-date filter is applied in memory:** two reasons, and they compound.

First, `tms_booking` carries no academic columns. Pushing an academic filter into
SQL would mean resolving matching learner ids first and then `.in()`-ing up to
854 UUIDs against bookings — the PostgREST gateway returns HTTP 400 above roughly
500 ids, and with an unchecked `{ data }` destructure that 400 silently becomes an
empty result set.

Second, facets must be computed over the date-range scope *before* the other
filters (step 5), so that selecting one department does not erase the remaining
departments from the dropdown. Filtering route/stop in SQL while filtering
academics in JS would make the facet set depend on which filters happened to run
server-side — inconsistent and hard to reason about. Applying the date range in
SQL and everything else in JS keeps one clear boundary.

The cost is bounded: the whole table is 2,387 rows, so a maximally wide range
fetches ~2.4k booking rows and ~181 attendance rows. If `tms_booking` later grows
past roughly 50k rows in a typical range, revisit by pushing `route_id` into SQL
and computing route facets from a separate lightweight `distinct route_id` query.

**Chunking rule:** every `.in()` call chunks at 150 ids and checks its `error`
before using `data`. No unchecked destructures.

### API contract

`GET /api/admin/bookings/analytics`

Query parameters (all optional; multi-value params are comma-separated):

| param | values | applies to |
| --- | --- | --- |
| `from`, `to` | `YYYY-MM-DD` | both tabs; default `to = istToday()`, `from = addDays(to, -29)` |
| `route_id` | uuid list | both |
| `stop_id` | uuid list | both |
| `institution_id` | uuid list | both |
| `department_id` | uuid list | both |
| `program_id` | uuid list | both |
| `booked_by` | `self` \| `admin` | bookings only |
| `direction` | `onward` \| `return` | attendance only |
| `att_status` | `present` \| `absent` | attendance only |
| `method` | `qr_scan` \| `manual` | attendance only |

Invalid dates fall back to the defaults (mirrors the existing `isDate` guard in
`app/api/admin/bookings/route.ts`). Unrecognized enum values are ignored.

Response `200`:

```jsonc
{
  "success": true,
  "data": {
    "range": { "from": "2026-06-26", "to": "2026-07-25" },
    "facets": {
      "routes":       [{ "id": "…", "label": "12 · Salem Town" }],
      "stops":        [{ "id": "…", "label": "Ammapet", "routeId": "…" }],
      "institutions": [{ "id": "…", "label": "JKKN College of Engineering" }],
      "departments":  [{ "id": "…", "label": "Computer Science" }],
      "programs":     [{ "id": "…", "label": "B.E. CSE" }]
    },
    "bookings": {
      "kpis": {
        "total": 2387, "learners": 854, "routes": 24, "days": 83,
        "avgPerDay": 28.8, "selfPct": 91.4,
        "peakDay": { "date": "2026-07-25", "count": 123 }
      },
      "perDay":       [{ "date": "2026-07-09", "count": 60 }],
      "byRoute":      [{ "id": "…", "label": "12 · Salem Town", "count": 210 }],
      "leadTime":     [{ "bucket": "same_day", "count": 40 }],
      "byWeekday":    [{ "weekday": 0, "count": 300 }],
      "bookedBy":     { "self": 2183, "admin": 190, "unknown": 14 },
      "byInstitution":[{ "id": "…", "label": "…", "count": 900 }],
      "byDepartment": [{ "id": "…", "label": "…", "count": 300 }],
      "topStops":     [{ "id": "…", "label": "Ammapet", "count": 88 }]
    },
    "attendance": {
      "unavailable": false,
      "coverage": {
        "routesWithAttendance": 3, "routesInRange": 24,
        "daysWithAttendance": 9,  "daysInRange": 83
      },
      "kpis": {
        "records": 181, "present": 178, "absent": 3, "walkUps": 0,
        "bookedOnScannedDays": 500, "boarded": 178,
        "showUpRate": 35.6, "noShows": 322
      },
      "perDay":        [{ "date": "2026-07-09", "booked": 60, "boarded": 48, "noShows": 12 }],
      "noShowByRoute": [{ "id": "…", "label": "…", "booked": 60, "boarded": 48, "noShows": 12, "rate": 20.0 }],
      "byDirection":   { "onward": 181, "return": 0 },
      "byMethod":      { "qr_scan": 92, "manual": 89 },
      "byStatus":      { "present": 178, "absent": 3 },
      "byDepartment":  [{ "id": "…", "label": "…", "booked": 60, "boarded": 48, "noShows": 12, "rate": 20.0 }]
    }
  }
}
```

Errors: `403 { "error": "Forbidden" }` without `tms.bookings.view`;
`500 { "error": "Internal server error" }` on unexpected failure.

## Metric definitions

These are the definitions the implementation must follow exactly.

**Booking lead time** — whole days between the IST calendar date of `booked_at`
and `travel_date`. Computed as
`daysBetween(istToday(new Date(booked_at)), travel_date)`. Buckets:

| bucket | days | label |
| --- | --- | --- |
| `same_day` | ≤ 0 | Same day |
| `d1` | 1 | 1 day ahead |
| `d2_3` | 2–3 | 2–3 days |
| `d4_7` | 4–7 | 4–7 days |
| `d8_plus` | ≥ 8 | 8+ days |

Negative values (booked after the travel date — shouldn't occur, but is not
constrained by the schema) clamp into `same_day`.

**Weekday** — `0 = Monday … 6 = Sunday`, derived with the same UTC integer trick
`lib/booking/window.ts :: isSunday` uses, so it stays pure and DST-free.

**Booked-by label** — reuses the existing rule from
`lib/booking/admin-list.ts :: toBookingRow`: `Self` when
`booked_by === learner.profile_id`, `Admin` when `booked_by` is set but differs,
`unknown` when `booked_by` is null.

**Boarded** — an attendance row with `status = 'present'`. `absent` rows are
explicit absence markings, not boardings, and are counted separately.

**No-show** — a `(learner_id, date)` pair that has a booking row but **no
`present` attendance row** for that date, in either direction. Because a booking
authorizes both legs, one `present` row in either direction counts as boarded.

**Show-up rate** — `boarded / bookedOnScannedDays * 100`, where
`bookedOnScannedDays` counts bookings **only on dates that have at least one
attendance row**. Dividing by all bookings in range would report a near-zero rate
purely because scanning has not been rolled out to most days, which would be
misleading. The denominator is stated in the UI subtitle.

**Coverage** — `routesWithAttendance` = distinct `route_id` on attendance rows in
range; `routesInRange` = distinct `route_id` on booking rows in range;
`daysWithAttendance` = distinct `trip_date`; `daysInRange` = distinct
`travel_date`.

**Walk-up** — attendance row with `is_walk_up = true`, or (defensively) a
`present` row with no matching booking. Currently zero in the data; reported as a
KPI so it stays visible if scanning practice changes.

## Tab content

### Tab A — Bookings

1. **KPI row** — four `StatTile`s: bookings in range · distinct learners ·
   average per booked day · self-service share.
2. **Bookings per day** — column chart, the headline trend. Adaptive: renders only
   with ≥ 2 distinct days, otherwise the `ChartCard` empty state.
3. **Bookings by route** — horizontal bar, single accent hue, top 20, with the
   full list in the table twin and CSV export.
4. **Booking lead time** — column chart over the five buckets, ordered
   same-day → 8+.
5. **Day-of-week pattern** — column chart Mon–Sun. Sunday is a compulsory weekly
   holiday (`isSunday`), so a non-zero Sunday bar is itself a data-quality signal
   and the subtitle notes it.
6. **Self vs Admin** — single part-to-whole stacked bar.
7. **By department / institution** — horizontal bar + table twin, top 15.

### Tab B — Attendance

1. **Coverage callout** — a bordered note, not a chart, rendered first:
   *"Attendance recorded on 3 of 24 routes across 9 of 83 booked days in this
   range. Figures below cover scanned routes and days only."* Uses the `--viz-warning`
   accent when coverage is below 50% of routes.
2. **KPI row** — three `StatTile`s (attendance records · present · absent) plus a
   `Meter` for show-up rate, its caption naming the denominator.
3. **Booked vs Boarded per day** — grouped column chart, the headline. Two series
   using `--viz-context` (booked) and `--viz-good` (boarded).
4. **No-show by route** — horizontal bar of no-show counts, `--viz-serious`, with
   booked/boarded/rate in the table twin and CSV export. The seat-waste signal.
5. **Composition panel** — compact stat grid: Present/Absent, Onward/Return,
   QR/Manual, Walk-ups. QR-vs-manual is a data-quality signal (currently ~50/50);
   the panel notes that a high manual share weakens the other figures.
6. **By department** — horizontal bar of no-shows + table twin with rates.

## Visual layer

Built on the existing validated kit `app/(admin)/_viz/kit.tsx`: `ChartCard`
(which already ships the chart↔table toggle and CSV download), `StatTile`,
`Meter`, `Legend`, `VizTable`, `VizTooltip`, `EmptyState`, plus `VIZ_CSS`,
`gridProps`, `axisTick`, `axisLine`. The page root carries `className="viz-scope"`
and injects `VIZ_CSS`, matching `analytics-view.tsx`.

Palette rules inherited from the kit and dataviz method:

- One accent hue (`--viz-accent`) for nominal-category magnitude bars — never a
  value ramp across categories.
- The reserved `--viz-good` → `--viz-warning` → `--viz-serious` → `--viz-critical`
  scale only for status meaning.
- `--viz-context` for the reference/baseline series (booked, in booked-vs-boarded).
- Stacked segments get `stroke="var(--viz-surface)" strokeWidth={2}` surface gaps.
- Every chart ships its table twin; charts with a full list longer than the
  rendered top-N also ship CSV.

The `/ui-ux-pro-max` skill is invoked during implementation for the surfaces the
kit does not cover: the advanced filter bar, the active-filter chip row, the tab
shell, and the coverage callout. Dark mode must be handled per
`docs`-recorded project convention — the kit's CSS variables already flip on
`.dark`, but any new solid colored tints need explicit `dark:` variants.

Responsiveness: the filter bar wraps (`flex-wrap`, `min-w-0` on children); chart
grids collapse `xl:grid-cols-2` → single column; table twins scroll inside their
own `overflow-x-auto` container so the page body never scrolls horizontally.

## Error handling

- **Missing table (`42P01`)** — returns an empty payload for that block rather
  than a 500, matching the convention in `app/api/admin/bookings/route.ts` and
  `app/api/admin/analytics/route.ts`.
- **Attendance query failure** — degrades the attendance block to zeros and sets
  `attendance.unavailable = true`; the Bookings tab still renders. When
  `unavailable` is true the Attendance tab replaces its whole body with a single
  error state ("Attendance data is temporarily unavailable") rather than showing
  zeroed KPIs, which would read as "nobody boarded". A failure in the booking
  query is fatal for the request (500), since both tabs depend on it.
- **Every chunked `.in()`** checks `error` before reading `data` and throws on a
  real error, so a gateway 400 can never masquerade as an empty result.
- **Empty range** — each `ChartCard` renders its `EmptyState` via the existing
  `hasData` prop; the page does not blank out.
- **Client fetch failure** — `react-hot-toast` error toast, matching
  `analytics-view.tsx`; the previous render is retained at reduced opacity during
  refetch rather than flashing a skeleton.

## Testing

All aggregation lives in `lib/booking/analytics.ts` as pure functions taking
plain row arrays and label Maps — no Supabase client, no `Date` construction
inside the aggregators (any "now" is passed in). This mirrors the module's
existing pure-core convention (`admin-list.ts`, `capacity.ts`, `window.ts`,
`roster.ts`).

`lib/booking/analytics.test.ts` (vitest, `npm test`) covers:

1. `leadTimeBucket` — boundaries at 0, 1, 2, 3, 4, 7, 8 and a negative value.
2. `weekdayOf` — a known Monday and a known Sunday.
3. `bookedByLabel` — self / admin / unknown, including a null `profile_id`.
4. `aggregateBookings` — per-day, per-route and per-department rollups; the
   `avgPerDay` divisor uses booked days, not calendar days.
5. `joinBookedBoarded` — a learner present onward only still counts as boarded;
   an `absent` row does not count as boarded; a booking with no attendance row on
   a scanned day counts as a no-show; a booking on an unscanned day counts in
   neither numerator nor denominator.
6. `coverageOf` — route and day coverage against a fixture with 3 of 24 routes.
7. `applyLearnerFilters` — institution/department/program predicates, including
   multi-select and the empty-filter pass-through.
8. Empty inputs — every aggregator returns empty arrays and zeroed KPIs rather
   than throwing or producing `NaN` (notably `showUpRate` with a zero
   denominator).

Manual verification (the project's typecheck is chronically red and not a
regression gate; `npm run lint` is broken): `npm test` green, `npm run build`
succeeds, and a route probe of `/api/admin/bookings/analytics` returning 307/401
unauthenticated. Authenticated UI verification requires the user's browser.

## Files

| file | change |
| --- | --- |
| `lib/booking/analytics.ts` | new — types + pure aggregation |
| `lib/booking/analytics.test.ts` | new — vitest |
| `app/api/admin/bookings/analytics/route.ts` | new — `withAuth` GET |
| `app/(admin)/bookings/analytics/page.tsx` | new — shell: filter bar + tabs |
| `app/(admin)/bookings/analytics/filter-bar.tsx` | new — advanced filters + chips |
| `app/(admin)/bookings/analytics/bookings-tab.tsx` | new — Tab A charts |
| `app/(admin)/bookings/analytics/attendance-tab.tsx` | new — Tab B charts |
| `app/(admin)/bookings/page.tsx` | edit — add Analytics link in the header |

No migration, no permission seeding, no navigation change.

## Decisions and rejected alternatives

**Sub-page vs tabs on `/analytics`** — chosen: a sub-page under Bookings. The
org-wide Analytics page already carries three tabs and mixes financial and
operational concerns; adding two dense tabs there would make one page own too
much. A module sub-page keeps the unit small and independently testable.

**Facets from data vs `/api/admin/masters`** — chosen: facets from data. The
masters endpoint is gated on `FEES_VIEW`, so reusing it would 403 the dropdowns
for a bookings-only user.

**Academic filtering in SQL vs in JS** — chosen: JS, after fetching bookings by
date/route. An id-list `.in()` would exceed the gateway's practical limit.

**Show-up denominator** — chosen: bookings on scanned days only. Using all
bookings in range would report a near-zero rate caused by incomplete scanner
rollout rather than by learner behaviour.

**Separate `tms.attendance.view` gate** — rejected. Aggregate attendance counts
are no more sensitive than the booking counts on the same page; a second gate
would add a partially-rendered page state for no security gain.
