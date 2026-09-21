# Admin Attendance Oversight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin portal a routes × dates attendance coverage grid that names which routes were never marked, a per-route-day roster drill-down, and the ability for a super admin to mark attendance for any route on any past date.

**Architecture:** One additive read-only SQL function aggregates coverage into 25 rows (one per route, days as `jsonb`). Two new admin GET endpoints feed a new `/attendance` module. Marking reuses the **existing** `POST /api/boarding/attendance`, which gains an optional `date` — no second write path, because every mark and scan already funnels through the `tms_mark_attendance` RPC and that RPC has always accepted an arbitrary `p_trip_date`.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query v5, Supabase (postgres-js + service-role client), Tailwind v4, lucide-react, react-hot-toast, vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-admin-attendance-oversight-design.md`

## Global Constraints

- **`method='auto'` is never counted as a human mark.** Any "did staff mark this" figure filters it out, or unmarked routes read as done.
- **Chunk every `.in()` at ≤150 ids and check the returned `error`.** An oversized `.in()` returns HTTP 400 with **no rows**, which silently reads as "nobody booked".
- **A failed read renders an error state, never zeroed counts.** On an attendance screen a zero reads as "nobody boarded" — a different and false claim.
- **A missing table (`error.code === '42P01'`) returns empty data, not a 500.**
- **Permissions:** view = `tms.attendance.view`; marking = super admin **or** `tms.attendance.override`. Constants live in `lib/constants/tms-permissions.ts` as `TMS_PERMISSIONS.ATTENDANCE_VIEW` / `ATTENDANCE_OVERRIDE`.
- **API response shape:** success = `{ success: true, data: ... }`, failure = `{ error: 'message' }` with an HTTP status.
- **Vitest only collects `lib/**/*.test.ts`.** Pure logic must live under `lib/` to be tested.
- **ESLint is broken project-wide** (`npm run lint` crashes). Verify with `npm run build`, `npx tsc --noEmit -p tsconfig.json` filtered to touched files, and `npm run test`.
- **Never `git push` without first running `git log origin/main..HEAD --oneline`.**
- **Commit messages end with:** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Domain facts an implementer needs

- `tms_attendance` has a UNIQUE key on `(learner_id, trip_date, direction)` that **excludes `route_id`**. It is load-bearing; never add a staff dimension to it.
- `tms_mark_attendance(p_marks jsonb, p_trip_date date, p_direction text, p_actor uuid, p_method text, p_allow_override boolean)` is the **only** write path. Per-mark keys: `learner_id, route_id, stop_id, status, is_walk_up, allow_override, scanned_at`, plus optional `move_route` and `booked_route_id`.
- `move_route` is what lets the upsert rewrite `route_id`/`stop_id` on an existing row. **A back-dated mark must never set it.**
- The current transport year is `tms_transport_year` where `is_current` — live row: `name='2026-2027'`, `start_date='2026-06-01'`.
- Live data at time of writing: 25 active routes, 28,128 attendance rows over 47 days (2026-06-10 → 2026-09-18). Routes **10 (EADAPPADI, 33 learners)** and **37 (THULASAMPATTI, 98 learners)** have never been marked.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260920100000_tms_attendance_coverage.sql` | The read-only coverage aggregate function |
| `lib/attendance/coverage.ts` | Pure: classify a cell, shape the grid, build the summary |
| `lib/attendance/coverage.test.ts` | Tests for the above |
| `lib/boarding/backdate.ts` | Pure: authorize a requested trip date |
| `lib/boarding/backdate.test.ts` | Tests for the above |
| `app/api/admin/attendance/coverage/route.ts` | GET the grid |
| `app/api/admin/attendance/roster/route.ts` | GET one route+date roster |
| `app/(admin)/attendance/page.tsx` | Coverage grid page |
| `app/(admin)/attendance/coverage-grid.tsx` | The matrix component |
| `app/(admin)/attendance/[routeId]/[date]/page.tsx` | Drill-down roster + marking |

**Modify:**

| File | Change |
|---|---|
| `lib/navigation.ts` | One nav entry |
| `app/api/boarding/attendance/route.ts` | Optional `date` on POST and DELETE |

---

## Task 1: The coverage SQL function

**Files:**
- Create: `supabase/migrations/20260920100000_tms_attendance_coverage.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.tms_attendance_coverage(p_from date, p_to date, p_direction text)` returning `table(route_id uuid, route_number text, route_name text, roster int, days jsonb)`. Each `days` element is `{"d": "YYYY-MM-DD", "h": int, "a": int, "x": bool}`.

- [ ] **Step 1: Write the migration**

```sql
-- Attendance coverage aggregate for the admin grid.
--
-- Returns ONE ROW PER ROUTE with the per-day counts folded into a jsonb array.
-- That shape is deliberate: PostgREST caps result sets at 1,000 rows, and a
-- row-per-route-day result would breach it at ~40 days across 25 routes. One
-- row per route is 25 rows for ANY range, so the grid needs no date cap.
--
-- Read-only. Writes nothing, creates no table, alters no column.
--
-- Day element keys are short because they repeat once per route-day:
--   d = trip_date, h = human marks, a = auto marks, x = holiday
--
-- 'human' EXCLUDES method='auto'. The auto-absent cron writes those rows, and
-- counting them as human marks would make an unstaffed route read as covered --
-- which is exactly the failure this grid exists to surface.
--
-- Sundays are excluded from the day series (buses never run; see
-- lib/booking/window.ts isSunday). Service-calendar exceptions are NOT excluded
-- from the series -- they are FLAGGED via x, so the grid can render them as
-- holiday cells rather than silently shortening the calendar.
create or replace function public.tms_attendance_coverage(
  p_from      date,
  p_to        date,
  p_direction text default 'onward'
)
returns table (
  route_id     uuid,
  route_number text,
  route_name   text,
  roster       int,
  days         jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as trip_date
    from generate_series(p_from, p_to, interval '1 day') d
    where extract(dow from d) <> 0
  ),
  roster as (
    select transport_route_id as route_id, count(*)::int as total
    from learners_profiles
    where bus_required and transport_route_id is not null
    group by 1
  ),
  marks as (
    select a.route_id, a.trip_date,
           count(*) filter (where a.method <> 'auto')::int as human,
           count(*) filter (where a.method =  'auto')::int as auto
    from tms_attendance a
    where a.trip_date between p_from and p_to
      and a.direction = p_direction
    group by 1, 2
  )
  select r.id, r.route_number, r.route_name, coalesce(ro.total, 0),
         jsonb_agg(jsonb_build_object(
           'd', d.trip_date,
           'h', coalesce(m.human, 0),
           'a', coalesce(m.auto, 0),
           -- EXISTS, not a join: the unique indexes allow BOTH an all-routes
           -- row and a per-route row for the same date, and a join would then
           -- emit that route-day twice -- duplicating the day in the array and
           -- doubling its counts.
           'x', exists (
             select 1 from tms_service_calendar h
              where h.exception_date = d.trip_date
                and (h.route_id is null or h.route_id = r.id)
           )
         ) order by d.trip_date)
  from tms_route r
  cross join days d
  left join marks m  on m.route_id = r.id and m.trip_date = d.trip_date
  left join roster ro on ro.route_id = r.id
  where r.status = 'active'
  group by r.id, r.route_number, r.route_name, ro.total
  order by r.route_number;
$$;

revoke all on function public.tms_attendance_coverage(date, date, text) from public, anon, authenticated;
grant execute on function public.tms_attendance_coverage(date, date, text) to service_role;
```

The body has exactly two left joins — `marks m` and `roster ro` — plus the
`cross join` that produces the day series. The holiday flag is an `exists`
subquery, never a join (see the comment in the SQL).

- [ ] **Step 2: Apply the migration to the live database**

Use the Supabase `apply_migration` tool with name `tms_attendance_coverage` and
the SQL above verbatim. Per project practice the migration file is committed
**and** applied.

- [ ] **Step 3: EXECUTE the function once before trusting it**

This step is non-negotiable in this codebase. A `tms_mark_attendance` shipped
once through four commits and a merge while being unable to parse, because a
passing TypeScript parity test proved two implementations agreed without either
one ever running.

Run:

```sql
select route_number, roster, jsonb_array_length(days) as day_count,
       days -> (jsonb_array_length(days) - 1) as last_day
from public.tms_attendance_coverage('2026-09-01', '2026-09-18', 'onward')
order by route_number
limit 5;
```

Expected: 5 rows, `day_count` = 16 on every row (18 days minus two Sundays),
and route `05` showing `roster` 70.

- [ ] **Step 4: Verify the never-marked routes appear with zero counts**

Run:

```sql
select route_number,
       (select count(*) from jsonb_array_elements(days) e
         where (e->>'h')::int > 0) as days_with_human_marks
from public.tms_attendance_coverage('2026-09-01', '2026-09-18', 'onward')
where route_number in ('10', '37', '07');
```

Expected: routes `10` and `37` report **0**; route `07` reports a non-zero count.
If 10 or 37 report anything above zero, stop — the human/auto split is wrong.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260920100000_tms_attendance_coverage.sql
git commit -m "feat(attendance): coverage aggregate function for the admin grid

One row per route with days as jsonb, so any date range stays under the
PostgREST 1000-row cap. Excludes method='auto' from human marks.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure coverage classification

**Files:**
- Create: `lib/attendance/coverage.ts`
- Test: `lib/attendance/coverage.test.ts`

**Interfaces:**
- Consumes: nothing. (Sundays are already excluded by the SQL day series.)
- Produces:
  - `type CoverageState = 'marked' | 'partial' | 'auto_only' | 'not_marked' | 'holiday'`
  - `DEFAULT_COVERAGE_THRESHOLD = 0.6`
  - `classifyCell(input: CoverageCellInput): CoverageState`
  - `interface RawRouteCoverage { route_id: string; route_number: string | null; route_name: string | null; roster: number; days: RawDay[] }`
  - `interface RawDay { d: string; h: number; a: number; x: boolean }`
  - `interface CoverageCell { date: string; state: CoverageState; human: number; auto: number }`
  - `interface CoverageRouteRow { routeId: string; routeNumber: string | null; routeName: string | null; roster: number; cells: CoverageCell[]; humanDays: number; serviceDays: number }`
  - `buildCoverage(rows: RawRouteCoverage[], threshold: number): { routes: CoverageRouteRow[]; dates: string[] }`
  - `summarizeCoverage(routes: CoverageRouteRow[]): CoverageSummary`
  - `interface CoverageSummary { neverMarkedRoutes: CoverageRouteRow[]; neverMarkedLearners: number; unmarkedRouteDays: number; autoOnlyRouteDays: number }`

- [ ] **Step 1: Write the failing tests**

Create `lib/attendance/coverage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  classifyCell,
  buildCoverage,
  summarizeCoverage,
  DEFAULT_COVERAGE_THRESHOLD,
  type RawRouteCoverage,
} from './coverage';

describe('classifyCell', () => {
  const base = { roster: 100, threshold: 0.6, isHoliday: false };

  it('a holiday wins over every count', () => {
    expect(classifyCell({ ...base, human: 90, auto: 0, isHoliday: true })).toBe('holiday');
    expect(classifyCell({ ...base, human: 0, auto: 0, isHoliday: true })).toBe('holiday');
  });

  it('no marks at all is not_marked', () => {
    expect(classifyCell({ ...base, human: 0, auto: 0 })).toBe('not_marked');
  });

  it('auto marks with no human mark is auto_only, never marked', () => {
    expect(classifyCell({ ...base, human: 0, auto: 80 })).toBe('auto_only');
  });

  it('at exactly the threshold the cell is marked', () => {
    expect(classifyCell({ ...base, human: 60, auto: 0 })).toBe('marked');
  });

  it('one below the threshold is partial', () => {
    expect(classifyCell({ ...base, human: 59, auto: 0 })).toBe('partial');
  });

  it('a route with no allocated learners can never be partial', () => {
    expect(classifyCell({ ...base, roster: 0, human: 1, auto: 0 })).toBe('marked');
    expect(classifyCell({ ...base, roster: 0, human: 0, auto: 0 })).toBe('not_marked');
  });

  it('auto marks never rescue a partial cell into marked', () => {
    expect(classifyCell({ ...base, human: 10, auto: 90 })).toBe('partial');
  });
});

const raw = (over: Partial<RawRouteCoverage> = {}): RawRouteCoverage => ({
  route_id: 'r1',
  route_number: '07',
  route_name: 'POOLAMPATTI',
  roster: 10,
  days: [
    { d: '2026-09-01', h: 10, a: 0, x: false },
    { d: '2026-09-02', h: 0, a: 0, x: false },
  ],
  ...over,
});

describe('buildCoverage', () => {
  it('produces the column dates from the first route, in order', () => {
    const { dates } = buildCoverage([raw()], DEFAULT_COVERAGE_THRESHOLD);
    expect(dates).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('counts humanDays and serviceDays, excluding holidays from serviceDays', () => {
    const rows = [
      raw({
        days: [
          { d: '2026-09-01', h: 10, a: 0, x: false },
          { d: '2026-09-02', h: 0, a: 0, x: false },
          { d: '2026-09-03', h: 0, a: 0, x: true },
        ],
      }),
    ];
    const { routes } = buildCoverage(rows, DEFAULT_COVERAGE_THRESHOLD);
    expect(routes[0].humanDays).toBe(1);
    expect(routes[0].serviceDays).toBe(2);
  });

  it('returns empty dates for an empty result rather than throwing', () => {
    expect(buildCoverage([], DEFAULT_COVERAGE_THRESHOLD)).toEqual({ routes: [], dates: [] });
  });
});

describe('summarizeCoverage', () => {
  it('names routes with zero human marks and totals their learners', () => {
    const rows = [
      raw({ route_id: 'a', route_number: '10', roster: 33, days: [{ d: '2026-09-01', h: 0, a: 0, x: false }] }),
      raw({ route_id: 'b', route_number: '37', roster: 98, days: [{ d: '2026-09-01', h: 0, a: 0, x: false }] }),
      raw({ route_id: 'c', route_number: '07', roster: 70, days: [{ d: '2026-09-01', h: 70, a: 0, x: false }] }),
    ];
    const { routes } = buildCoverage(rows, DEFAULT_COVERAGE_THRESHOLD);
    const s = summarizeCoverage(routes);
    expect(s.neverMarkedRoutes.map((r) => r.routeNumber)).toEqual(['10', '37']);
    expect(s.neverMarkedLearners).toBe(131);
    expect(s.unmarkedRouteDays).toBe(2);
  });

  it('does not count holiday cells as unmarked route-days', () => {
    const rows = [raw({ roster: 5, days: [{ d: '2026-09-01', h: 0, a: 0, x: true }] })];
    const { routes } = buildCoverage(rows, DEFAULT_COVERAGE_THRESHOLD);
    expect(summarizeCoverage(routes).unmarkedRouteDays).toBe(0);
  });

  it('counts auto-only route-days separately from unmarked ones', () => {
    const rows = [raw({ roster: 5, days: [{ d: '2026-09-01', h: 0, a: 5, x: false }] })];
    const { routes } = buildCoverage(rows, DEFAULT_COVERAGE_THRESHOLD);
    const s = summarizeCoverage(routes);
    expect(s.autoOnlyRouteDays).toBe(1);
    expect(s.unmarkedRouteDays).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/attendance/coverage.test.ts`
Expected: FAIL — `Failed to resolve import "./coverage"`.

- [ ] **Step 3: Write the implementation**

Create `lib/attendance/coverage.ts`:

```ts
/**
 * Pure attendance-coverage logic for the admin grid.
 *
 * The SQL function tms_attendance_coverage returns one row per route with its
 * days folded into a jsonb array; everything here turns that into cells a grid
 * can paint, and nothing here touches the database.
 *
 * The governing rule: a mark counts only when a PERSON made it. The auto-absent
 * cron (method='auto') closes trips nobody marked, so counting its rows as
 * coverage would make an unstaffed route read as fully covered -- which is the
 * precise failure this grid was built to surface.
 */

export type CoverageState = 'marked' | 'partial' | 'auto_only' | 'not_marked' | 'holiday';

/**
 * Share of the allocated roster that must carry a human mark before a route-day
 * reads 'marked'.
 *
 * 0.6, chosen from live data rather than taste. Staff mark 120-180% of BOOKINGS
 * (they also mark allocated riders who never booked), so bookings are the wrong
 * denominator and produce rates above 100%. Against the allocated roster,
 * route-days cluster in the 60-100% band. At 0.9 the September grid painted 252
 * of 400 cells 'partial' and communicated nothing; at 0.6 it reads 236 marked /
 * 49 partial / 40 not marked. The grid exposes this as a control, so it is a
 * default rather than a law.
 */
export const DEFAULT_COVERAGE_THRESHOLD = 0.6;

export interface CoverageCellInput {
  human: number;
  auto: number;
  roster: number;
  isHoliday: boolean;
  threshold: number;
}

/** One day of one route, as the SQL function emits it. */
export interface RawDay {
  /** trip_date, YYYY-MM-DD */
  d: string;
  /** human marks (method <> 'auto') */
  h: number;
  /** auto marks */
  a: number;
  /** service-calendar exception applies */
  x: boolean;
}

export interface RawRouteCoverage {
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  roster: number;
  days: RawDay[];
}

export interface CoverageCell {
  date: string;
  state: CoverageState;
  human: number;
  auto: number;
}

export interface CoverageRouteRow {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  /** Allocated bus_required learners. 0 means the row renders muted, not red. */
  roster: number;
  cells: CoverageCell[];
  /** Service days carrying at least one human mark. */
  humanDays: number;
  /** Service days in range, holidays excluded -- the denominator for humanDays. */
  serviceDays: number;
}

export interface CoverageSummary {
  /** Routes with zero human marks across the whole range. */
  neverMarkedRoutes: CoverageRouteRow[];
  /** Learners allocated to those routes -- the human cost of the gap. */
  neverMarkedLearners: number;
  unmarkedRouteDays: number;
  autoOnlyRouteDays: number;
}

/**
 * Which state one route-day is in. Order matters and is not arbitrary:
 *
 *  1. A holiday is a holiday whatever the counts say -- a mark made on a
 *     declared no-service day is odd, but it is never a coverage failure.
 *  2. Nothing at all outranks everything below it.
 *  3. auto_only is checked BEFORE the threshold, so a fully auto-closed trip can
 *     never reach 'marked' no matter how many rows it has.
 *  4. A zero roster cannot be divided by. Any human mark on such a route counts
 *     as marked; the grid mutes the whole row so an empty bus is not read as a
 *     staffing failure.
 */
export function classifyCell(input: CoverageCellInput): CoverageState {
  if (input.isHoliday) return 'holiday';
  if (input.human === 0 && input.auto === 0) return 'not_marked';
  if (input.human === 0) return 'auto_only';
  if (input.roster <= 0) return 'marked';
  return input.human >= input.roster * input.threshold ? 'marked' : 'partial';
}

/**
 * Shape the SQL rows into grid rows plus the shared column dates.
 *
 * Every route carries the same day series (the function cross-joins the series
 * against routes), so the columns are read from the first row. An empty result
 * yields empty columns rather than throwing.
 */
export function buildCoverage(
  rows: RawRouteCoverage[],
  threshold: number,
): { routes: CoverageRouteRow[]; dates: string[] } {
  if (rows.length === 0) return { routes: [], dates: [] };

  const dates = (rows[0].days ?? []).map((d) => d.d);

  const routes = rows.map((r) => {
    const cells: CoverageCell[] = (r.days ?? []).map((d) => ({
      date: d.d,
      state: classifyCell({
        human: d.h,
        auto: d.a,
        roster: r.roster,
        isHoliday: d.x,
        threshold,
      }),
      human: d.h,
      auto: d.a,
    }));
    return {
      routeId: r.route_id,
      routeNumber: r.route_number,
      routeName: r.route_name,
      roster: r.roster,
      cells,
      humanDays: cells.filter((c) => c.human > 0).length,
      serviceDays: cells.filter((c) => c.state !== 'holiday').length,
    };
  });

  return { routes, dates };
}

/**
 * The headline failures, for the strip above the grid.
 *
 * `neverMarkedLearners` is the number that makes the gap concrete: "2 routes
 * never marked" is a statistic, "131 learners have no attendance record at all"
 * is the problem.
 */
export function summarizeCoverage(routes: CoverageRouteRow[]): CoverageSummary {
  const neverMarkedRoutes = routes.filter((r) => r.humanDays === 0 && r.serviceDays > 0);
  let unmarkedRouteDays = 0;
  let autoOnlyRouteDays = 0;
  for (const r of routes) {
    for (const c of r.cells) {
      if (c.state === 'not_marked') unmarkedRouteDays += 1;
      else if (c.state === 'auto_only') autoOnlyRouteDays += 1;
    }
  }
  return {
    neverMarkedRoutes,
    neverMarkedLearners: neverMarkedRoutes.reduce((n, r) => n + r.roster, 0),
    unmarkedRouteDays,
    autoOnlyRouteDays,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/attendance/coverage.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/attendance/coverage.ts lib/attendance/coverage.test.ts
git commit -m "feat(attendance): pure coverage classification for the admin grid

Human marks only; auto-closed trips get their own state so an unstaffed
route cannot read as covered.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The coverage endpoint

**Files:**
- Create: `app/api/admin/attendance/coverage/route.ts`

**Interfaces:**
- Consumes: `buildCoverage`, `summarizeCoverage`, `DEFAULT_COVERAGE_THRESHOLD`, `RawRouteCoverage` from `@/lib/attendance/coverage`; `tms_attendance_coverage` from Task 1.
- Produces: `GET /api/admin/attendance/coverage?from=&to=&direction=&threshold=` →
  `{ success: true, data: { from, to, direction, threshold, dates: string[], routes: CoverageRouteRow[], summary: CoverageSummary } }`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import {
  buildCoverage, summarizeCoverage, DEFAULT_COVERAGE_THRESHOLD, type RawRouteCoverage,
} from '@/lib/attendance/coverage';
import { istToday } from '@/lib/booking/window';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `days` back from `date`, as YYYY-MM-DD. Integer UTC math; no timezone lib. */
function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * GET /api/admin/attendance/coverage — the routes x service-days grid.
 *
 * One RPC call. The function returns one row per route with its days folded
 * into jsonb, so the payload is 25 rows for any range and the PostgREST
 * 1,000-row cap is unreachable. Defaults to the last 30 days ending today.
 */
async function getCoverage(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const to = url.searchParams.get('to') || istToday();
    const from = url.searchParams.get('from') || minusDays(to, 29);
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: 'from must not be after to' }, { status: 400 });
    }
    const direction = url.searchParams.get('direction') === 'return' ? 'return' : 'onward';

    const rawThreshold = Number(url.searchParams.get('threshold'));
    const threshold =
      Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 1
        ? rawThreshold
        : DEFAULT_COVERAGE_THRESHOLD;

    const svc = createServiceRoleClient();
    const { data, error } = await svc.rpc('tms_attendance_coverage', {
      p_from: from, p_to: to, p_direction: direction,
    });

    if (error) {
      // A missing function or table is an empty grid, not a 500. Anything else
      // is reported as an error -- an empty grid would read as "no route was
      // ever marked", which is a different and far more alarming claim.
      if (error.code === '42P01' || error.code === '42883') {
        return NextResponse.json({
          success: true,
          data: { from, to, direction, threshold, dates: [], routes: [], summary: summarizeCoverage([]) },
        });
      }
      console.error('admin attendance coverage error:', error);
      return NextResponse.json({ error: 'Failed to load attendance coverage' }, { status: 500 });
    }

    const { routes, dates } = buildCoverage((data ?? []) as RawRouteCoverage[], threshold);
    return NextResponse.json({
      success: true,
      data: { from, to, direction, threshold, dates, routes, summary: summarizeCoverage(routes) },
    });
  } catch (e) {
    console.error('admin attendance coverage error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getCoverage(request, auth));
```

- [ ] **Step 2: Type-check the new file**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/api/admin/attendance|lib/attendance"`
Expected: no output. (The project has ~540 pre-existing errors elsewhere; only touched files must be clean.)

- [ ] **Step 3: Probe the endpoint against the running app**

Start the dev server if it is not running (`npm run dev`), then confirm which
port serves the admin app — ports 3000 and 3001 swap between apps, so identify
it by the page `<title>`, and use `127.0.0.1`, not `localhost`.

Run: `curl -s "http://127.0.0.1:3000/api/admin/attendance/coverage?from=2026-09-01&to=2026-09-18" | head -c 400`
Expected: either the JSON payload, or a 401/redirect if the shell is
unauthenticated — an unauthenticated response is acceptable here and means the
route is wired; it does **not** verify the body.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/attendance/coverage/route.ts
git commit -m "feat(attendance): GET /api/admin/attendance/coverage

Gated on tms.attendance.view. Defaults to the last 30 days; a missing
function returns an empty grid rather than a 500.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The coverage grid page and nav entry

**Files:**
- Create: `app/(admin)/attendance/coverage-grid.tsx`
- Create: `app/(admin)/attendance/page.tsx`
- Modify: `lib/navigation.ts`

**Interfaces:**
- Consumes: the Task 3 endpoint; `CoverageRouteRow`, `CoverageSummary`, `CoverageState`, `DEFAULT_COVERAGE_THRESHOLD` from `@/lib/attendance/coverage`.
- Produces: the route `/attendance`, and links to `/attendance/<routeId>/<date>?direction=<dir>` consumed by Task 6.

- [ ] **Step 1: Add the nav entry**

In `lib/navigation.ts`, add `ClipboardList` to the existing `lucide-react` import
block, then insert this entry immediately after the `Bookings` line:

```ts
  { name: 'Attendance', href: '/attendance', icon: ClipboardList, permission: TMS_PERMISSIONS.ATTENDANCE_VIEW, group: 'transport' },
```

- [ ] **Step 2: Write the grid component**

Create `app/(admin)/attendance/coverage-grid.tsx`:

```tsx
'use client';

import React from 'react';
import Link from 'next/link';
import type { CoverageRouteRow, CoverageState } from '@/lib/attendance/coverage';

/**
 * Cell colours. Deliberately NOT a red/green pair: 'auto_only' must read as a
 * warning rather than a success, because an auto-closed trip means nobody was
 * marking. Every colour has a dark-mode counterpart -- Tailwind v4 in this
 * project does not derive tints for coloured backgrounds automatically.
 */
const CELL_CLASS: Record<CoverageState, string> = {
  marked: 'bg-emerald-500/80 dark:bg-emerald-500/70',
  partial: 'bg-amber-400/80 dark:bg-amber-400/70',
  auto_only: 'bg-sky-400/70 dark:bg-sky-500/60',
  not_marked: 'bg-red-500/80 dark:bg-red-500/70',
  holiday: 'bg-muted',
};

const CELL_LABEL: Record<CoverageState, string> = {
  marked: 'Marked',
  partial: 'Partly marked',
  auto_only: 'Auto-closed, nobody marked',
  not_marked: 'Not marked',
  holiday: 'No service',
};

/** 'YYYY-MM-DD' -> '18' for the column header. */
const dayOf = (d: string) => d.slice(8, 10);

export function CoverageGrid({
  routes,
  dates,
  direction,
}: {
  routes: CoverageRouteRow[];
  dates: string[];
  direction: 'onward' | 'return';
}) {
  if (routes.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">No routes to show for this range.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-medium">Route</th>
            {dates.map((d) => (
              <th key={d} className="px-0.5 py-1 text-center font-normal text-muted-foreground">
                {dayOf(d)}
              </th>
            ))}
            <th className="px-2 py-1 text-right font-medium">Days</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.routeId} className={r.roster === 0 ? 'opacity-40' : undefined}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[13rem] truncate bg-background px-2 py-1 text-left font-normal"
                title={`${r.routeNumber ?? ''} ${r.routeName ?? ''}`.trim()}
              >
                <span className="font-medium">{r.routeNumber ?? '—'}</span>{' '}
                <span className="text-muted-foreground">{r.routeName ?? ''}</span>
                {r.roster === 0 && (
                  <span className="ml-1 text-muted-foreground">(no learners allocated)</span>
                )}
              </th>
              {r.cells.map((c) => (
                <td key={c.date} className="p-0">
                  <Link
                    href={`/attendance/${r.routeId}/${c.date}?direction=${direction}`}
                    title={`${r.routeNumber ?? ''} · ${c.date} · ${CELL_LABEL[c.state]} · ${c.human} marked${c.auto > 0 ? ` (+${c.auto} auto)` : ''}`}
                    className={`block h-6 w-6 rounded-sm ${CELL_CLASS[c.state]}`}
                  >
                    <span className="sr-only">
                      {r.routeNumber} {c.date} {CELL_LABEL[c.state]}
                    </span>
                  </Link>
                </td>
              ))}
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-muted-foreground">
                {r.humanDays}/{r.serviceDays}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(CELL_CLASS) as CoverageState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${CELL_CLASS[s]}`} aria-hidden="true" />
            {CELL_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

Create `app/(admin)/attendance/page.tsx`:

```tsx
'use client';

/**
 * Attendance coverage — which routes were marked, and which were not.
 *
 * The admin portal previously had no attendance module at all: the only
 * admin-side attendance was an aggregate tab under /bookings → Analytics, which
 * could not say that two routes had never been marked once.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock } from 'lucide-react';
import { CoverageGrid } from './coverage-grid';
import {
  DEFAULT_COVERAGE_THRESHOLD,
  type CoverageRouteRow,
  type CoverageSummary,
} from '@/lib/attendance/coverage';

interface CoverageResponse {
  from: string;
  to: string;
  direction: 'onward' | 'return';
  threshold: number;
  dates: string[];
  routes: CoverageRouteRow[];
  summary: CoverageSummary;
}

function todayStr(): string {
  // IST, matching the date attendance is filed under.
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

async function fetchCoverage(q: {
  from: string; to: string; direction: string; threshold: number;
}): Promise<CoverageResponse> {
  const params = new URLSearchParams({
    from: q.from, to: q.to, direction: q.direction, threshold: String(q.threshold),
  });
  const res = await fetch(`/api/admin/attendance/coverage?${params}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load coverage');
  return result.data as CoverageResponse;
}

export default function AttendanceCoveragePage() {
  const [to, setTo] = useState(todayStr());
  const [from, setFrom] = useState(minusDays(todayStr(), 29));
  const [direction, setDirection] = useState<'onward' | 'return'>('onward');
  const [threshold, setThreshold] = useState(DEFAULT_COVERAGE_THRESHOLD);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['attendance-coverage', from, to, direction, threshold],
    queryFn: () => fetchCoverage({ from, to, direction, threshold }),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground">Attendance coverage</h1>
        <p className="text-sm text-muted-foreground">
          Every route, every service day. Only marks made by a person count — trips closed by the
          auto-absent job are shown separately.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="input mt-1 block" />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)}
            className="input mt-1 block" />
        </label>
        <label className="text-xs text-muted-foreground">
          Trip
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'onward' | 'return')}
            className="input mt-1 block">
            <option value="onward">Morning</option>
            <option value="return">Evening</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Counts as marked at
          <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
            className="input mt-1 block">
            <option value={0.3}>30% of the bus</option>
            <option value={0.5}>50% of the bus</option>
            <option value={0.6}>60% of the bus</option>
            <option value={0.8}>80% of the bus</option>
          </select>
        </label>
      </div>

      {data && data.summary.neverMarkedRoutes.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
          <p className="min-w-0 text-foreground">
            <strong>
              {data.summary.neverMarkedRoutes.length} route
              {data.summary.neverMarkedRoutes.length === 1 ? '' : 's'} never marked
            </strong>{' '}
            in this range — {data.summary.neverMarkedLearners} learners have no attendance record:{' '}
            {data.summary.neverMarkedRoutes
              .map((r) => `${r.routeNumber ?? '—'} ${r.routeName ?? ''}`.trim())
              .join(', ')}
            . {data.summary.unmarkedRouteDays} route-days unmarked in total.
          </p>
        </div>
      )}

      {data && data.summary.autoOnlyRouteDays > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
          <p className="min-w-0 text-foreground">
            {data.summary.autoOnlyRouteDays} route-days were closed by the auto-absent job with no
            mark from any staff member. Those learners are recorded absent, but nobody was marking
            the bus.
          </p>
        </div>
      )}

      {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading coverage…</p>}

      {/* An error must NOT fall through to an empty grid: a blank grid reads as
          "no route was ever marked", which is a different and false claim. */}
      {isError && (
        <p className="rounded-lg border border-border p-6 text-sm text-foreground">
          Could not load attendance coverage
          {error instanceof Error ? `: ${error.message}` : ''}. Figures are not shown rather than
          shown as zero.
        </p>
      )}

      {data && !isError && (
        <CoverageGrid routes={data.routes} dates={data.dates} direction={data.direction} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build and type-check**

Run: `npm run build`
Expected: compiles. If it fails with "could not find bin metadata file", run
`bun install --force` first — that is a stale `bun.lock` / `.bin/next.exe`, not
a code error.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/\(admin\)/attendance|lib/navigation"`
Expected: no output.

- [ ] **Step 5: Look at the page in a browser**

Open `http://127.0.0.1:3000/attendance` (confirm the port by `<title>`; 3000 and
3001 swap between apps). Confirm by eye: **routes 10 and 37 are solid red across
every column**, and the red banner names them with 131 learners. If they are not
red, the human/auto split is wrong — stop and fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add lib/navigation.ts app/\(admin\)/attendance/page.tsx app/\(admin\)/attendance/coverage-grid.tsx
git commit -m "feat(attendance): admin coverage grid

Routes x service days, colour-coded, with a banner naming routes that were
never marked. Auto-closed trips read as a staffing gap, not a success.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: The admin roster endpoint

**Files:**
- Create: `app/api/admin/attendance/roster/route.ts`

**Interfaces:**
- Consumes: `loadRouteAttendanceRoster`, `buildRosterRows`, `type RosterRow`, `type RosterAttendance`, `type OrderedStop` from `@/lib/booking/roster`; `loadMarkerNames` from `@/lib/boarding/identity`.
- Produces: `GET /api/admin/attendance/roster?routeId=&date=&direction=` →
  `{ success: true, data: { date, direction, route: { id, route_number, route_name }, rows: RosterRow[], counts: { total, present, absent, unmarked, auto } } }`

**Why this exists rather than reusing the boarding roster:** the boarding
endpoint has no `routeId` filter and widens to every route for a super admin, so
one page load would pull ~1,825 riders. This one is scoped to a single route.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadMarkerNames } from '@/lib/boarding/identity';
import {
  loadRouteAttendanceRoster, buildRosterRows,
  type OrderedStop, type RosterRow, type RosterAttendance,
} from '@/lib/booking/roster';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface StopRow {
  id: string; route_id: string; stop_name: string;
  stop_time: string | null; evening_time: string | null; sequence_order: number | null;
}
interface AttRow {
  learner_id: string; status: string | null; method: string | null;
  scanned_at: string | null; scanned_by: string | null; is_walk_up: boolean | null;
  previous_status: string | null; previous_scanned_by: string | null; previous_scanned_at: string | null;
}

/**
 * GET /api/admin/attendance/roster — one route, one date, one leg.
 *
 * Reuses the SAME pure helpers the boarding staff screen uses
 * (loadRouteAttendanceRoster + buildRosterRows), so present/absent/unmarked,
 * walk-up badges and ownership read identically on both screens. Any date is
 * allowed: viewing history is not marking it.
 */
async function getAdminRoster(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const routeId = url.searchParams.get('routeId') ?? '';
    const date = url.searchParams.get('date') ?? '';
    const direction: 'onward' | 'return' =
      url.searchParams.get('direction') === 'return' ? 'return' : 'onward';

    if (!UUID.test(routeId)) {
      return NextResponse.json({ error: 'routeId must be a UUID' }, { status: 400 });
    }
    if (!ISO_DATE.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    const { data: routeData, error: routeError } = await svc
      .from('tms_route').select('id, route_number, route_name').eq('id', routeId).maybeSingle();
    if (routeError) {
      console.error('admin attendance roster: failed to load route:', routeError);
      return NextResponse.json({ error: 'Failed to load route' }, { status: 500 });
    }
    if (!routeData) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    const route = routeData as { id: string; route_number: string | null; route_name: string | null };

    const { data: stopData, error: stopError } = await svc
      .from('tms_route_stop')
      .select('id, route_id, stop_name, stop_time, evening_time, sequence_order')
      .eq('route_id', routeId).eq('is_active', true)
      .order('sequence_order', { ascending: true });
    if (stopError) {
      console.error('admin attendance roster: failed to load stops:', stopError);
      return NextResponse.json({ error: 'Failed to load route stops' }, { status: 500 });
    }
    const orderedStops: OrderedStop[] = ((stopData ?? []) as StopRow[]).map((s) => ({
      id: s.id,
      name: s.stop_name,
      time: direction === 'return' ? s.evening_time : s.stop_time,
      order: s.sequence_order,
    }));

    // A failed attendance read must NOT render as "nobody is marked" — on this
    // screen that invites an admin to re-mark a bus that was already done.
    const { data: attData, error: attError } = await svc
      .from('tms_attendance')
      .select(
        'learner_id, status, method, scanned_at, scanned_by, is_walk_up, previous_status, previous_scanned_by, previous_scanned_at',
      )
      .eq('route_id', routeId).eq('trip_date', date).eq('direction', direction);
    if (attError) {
      console.error('admin attendance roster: failed to load attendance:', attError);
      return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
    }
    const attRows = (attData ?? []) as AttRow[];

    const markerNames = await loadMarkerNames(svc, [
      ...attRows.map((a) => a.scanned_by),
      ...attRows.map((a) => a.previous_scanned_by),
    ]);

    const attByLearner = new Map<string, RosterAttendance>();
    for (const a of attRows) {
      if (!a.status) continue;
      attByLearner.set(a.learner_id, {
        status: a.status,
        method: a.method,
        scanned_at: a.scanned_at,
        scanned_by: a.scanned_by,
        marked_by_name: a.scanned_by ? markerNames.get(a.scanned_by) ?? null : null,
        is_walk_up: a.is_walk_up === true,
        previous_status: a.previous_status,
        previous_by_name: a.previous_scanned_by ? markerNames.get(a.previous_scanned_by) ?? null : null,
        previous_at: a.previous_scanned_at,
      });
    }

    const riders = await loadRouteAttendanceRoster(svc, routeId, date);

    // An admin on this screen is the correction path by definition: they hold
    // tms.attendance.view, and the write route re-decides every gate server-side
    // anyway, so an over-permissive can_edit hint cannot grant anything.
    const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);
    const rows: RosterRow[] = buildRosterRows(
      riders,
      { id: route.id, route_number: route.route_number },
      orderedStops,
      attByLearner,
      { actorId: auth.userId, isOverrideHolder, isSuperAdmin: auth.isSuperAdmin },
    );

    let present = 0, absent = 0, unmarked = 0, auto = 0;
    for (const r of rows) {
      if (r.status === 'present') present += 1;
      else if (r.status === 'absent') absent += 1;
      else unmarked += 1;
      if (r.method === 'auto') auto += 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        date, direction,
        route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
        rows,
        counts: { total: rows.length, present, absent, unmarked, auto },
      },
    });
  } catch (e) {
    console.error('admin attendance roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAdminRoster(request, auth));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "app/api/admin/attendance/roster"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/attendance/roster/route.ts
git commit -m "feat(attendance): GET /api/admin/attendance/roster

Single-route, single-date roster reusing the boarding screen's pure
helpers. The boarding endpoint has no routeId filter and would load the
whole fleet for a super admin.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The drill-down page (read-only)

**Files:**
- Create: `app/(admin)/attendance/[routeId]/[date]/page.tsx`

**Interfaces:**
- Consumes: the Task 5 endpoint; `type RosterRow` from `@/lib/booking/roster`.
- Produces: the route `/attendance/[routeId]/[date]`. Task 9 adds marking controls to this same file.

- [ ] **Step 1: Write the page**

```tsx
'use client';

/**
 * One route, one date, one leg — the drill-down from a coverage cell.
 *
 * Read-only in this task; Task 9 adds the marking controls for super admins and
 * tms.attendance.override holders.
 */

import React, { use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock } from 'lucide-react';
import type { RosterRow } from '@/lib/booking/roster';

interface AdminRosterResponse {
  date: string;
  direction: 'onward' | 'return';
  route: { id: string; route_number: string | null; route_name: string | null };
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number; auto: number };
}

async function fetchRoster(routeId: string, date: string, direction: string): Promise<AdminRosterResponse> {
  const params = new URLSearchParams({ routeId, date, direction });
  const res = await fetch(`/api/admin/attendance/roster?${params}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load roster');
  return result.data as AdminRosterResponse;
}

const STATUS_CLASS: Record<RosterRow['status'], string> = {
  present: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  absent: 'bg-red-500/15 text-red-700 dark:text-red-400',
  unmarked: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<RosterRow['status'], string> = {
  present: 'Present',
  absent: 'Absent',
  unmarked: 'Unmarked',
};

export default function AttendanceDayPage({
  params,
}: {
  params: Promise<{ routeId: string; date: string }>;
}) {
  const { routeId, date } = use(params);
  const search = useSearchParams();
  const direction = search.get('direction') === 'return' ? 'return' : 'onward';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-attendance-roster', routeId, date, direction],
    queryFn: () => fetchRoster(routeId, date, direction),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Link href="/attendance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Attendance coverage
      </Link>

      <header className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-foreground">
          {data ? `${data.route.route_number ?? '—'} ${data.route.route_name ?? ''}` : 'Route'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {date} · {direction === 'return' ? 'Evening' : 'Morning'} trip
        </p>
      </header>

      {data && data.counts.auto > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
          <p className="min-w-0 text-foreground">
            {data.counts.auto} of these were recorded by the auto-absent job, not by a person.
          </p>
        </div>
      )}

      {data && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span>Total <strong className="tabular-nums">{data.counts.total}</strong></span>
          <span>Present <strong className="tabular-nums">{data.counts.present}</strong></span>
          <span>Absent <strong className="tabular-nums">{data.counts.absent}</strong></span>
          <span>Unmarked <strong className="tabular-nums">{data.counts.unmarked}</strong></span>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading roster…</p>}

      {isError && (
        <p className="rounded-lg border border-border p-6 text-sm text-foreground">
          Could not load this roster{error instanceof Error ? `: ${error.message}` : ''}. Nothing is
          shown rather than shown as empty.
        </p>
      )}

      {data && !isError && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Learner</th>
                <th className="px-3 py-2">Roll</th>
                <th className="px-3 py-2">Stop</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Marked by</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.learner_id} className="border-t border-border">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.roll ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.stop_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.is_walk_up ? 'Rode without ticket' : r.booked ? 'Booked' : 'No ticket'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.method === 'auto' ? 'Auto-absent job' : r.marked_by_name ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build and type-check**

Run: `npm run build`
Expected: compiles.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "app/\(admin\)/attendance"`
Expected: no output.

- [ ] **Step 3: Click a cell in the browser**

From `/attendance`, click any green cell on route 07 for a recent date. Confirm
the roster lists learners with statuses. Then click a red cell on route 37 and
confirm the roster lists its 98 allocated learners all as **Unmarked** — that is
the proof the roster loads from allocation rather than from attendance rows.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/attendance/\[routeId\]/\[date\]/page.tsx
git commit -m "feat(attendance): route+date drill-down from the coverage grid

Read-only roster reusing the boarding screen's row shape.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Phase 1 ends here.** At this point the admin portal answers "which routes are
not marked" and nothing in any write path has been touched. This is a safe point
to merge and stop if you want the read-only value first.

---

## Task 7: Pure back-date authorization

**Files:**
- Create: `lib/boarding/backdate.ts`
- Test: `lib/boarding/backdate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type BackdateDecision = { ok: true; date: string; isBackdated: boolean } | { ok: false; status: 400 | 403; error: string; reason: 'bad_date' | 'future_date' | 'before_floor' | 'not_permitted' }`
  - `decideTripDate(input: DecideTripDateInput): BackdateDecision`
  - `interface DecideTripDateInput { requested?: string | null; today: string; floor: string | null; isSuperAdmin: boolean; isOverrideHolder: boolean }`
  - `FALLBACK_FLOOR_DAYS = 365`
  - `resolveFloor(yearStart: string | null, today: string): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/boarding/backdate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideTripDate, resolveFloor, FALLBACK_FLOOR_DAYS } from './backdate';

const TODAY = '2026-09-20';
const FLOOR = '2026-06-01';
const admin = { today: TODAY, floor: FLOOR, isSuperAdmin: true, isOverrideHolder: false };
const staff = { today: TODAY, floor: FLOOR, isSuperAdmin: false, isOverrideHolder: false };
const head = { today: TODAY, floor: FLOOR, isSuperAdmin: false, isOverrideHolder: true };

describe('decideTripDate', () => {
  it('an absent date is today, for everyone, and is not back-dated', () => {
    expect(decideTripDate({ ...staff })).toEqual({ ok: true, date: TODAY, isBackdated: false });
    expect(decideTripDate({ ...staff, requested: null })).toEqual({ ok: true, date: TODAY, isBackdated: false });
    expect(decideTripDate({ ...staff, requested: '' })).toEqual({ ok: true, date: TODAY, isBackdated: false });
  });

  it("today's date named explicitly is allowed for ordinary staff", () => {
    expect(decideTripDate({ ...staff, requested: TODAY })).toEqual({ ok: true, date: TODAY, isBackdated: false });
  });

  it('a past date is refused for ordinary staff', () => {
    const d = decideTripDate({ ...staff, requested: '2026-09-01' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d).toMatchObject({ status: 403, reason: 'not_permitted' });
  });

  it('a past date is allowed for a super admin and flagged back-dated', () => {
    expect(decideTripDate({ ...admin, requested: '2026-09-01' }))
      .toEqual({ ok: true, date: '2026-09-01', isBackdated: true });
  });

  it('a past date is allowed for an override holder', () => {
    expect(decideTripDate({ ...head, requested: '2026-09-01' }))
      .toEqual({ ok: true, date: '2026-09-01', isBackdated: true });
  });

  it('a future date is refused even for a super admin', () => {
    const d = decideTripDate({ ...admin, requested: '2026-09-21' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d).toMatchObject({ status: 400, reason: 'future_date' });
  });

  it('a date before the floor is refused even for a super admin', () => {
    const d = decideTripDate({ ...admin, requested: '2026-05-31' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d).toMatchObject({ status: 400, reason: 'before_floor' });
  });

  it('the floor date itself is allowed', () => {
    expect(decideTripDate({ ...admin, requested: FLOOR }))
      .toEqual({ ok: true, date: FLOOR, isBackdated: true });
  });

  it('a malformed date is refused before any authority is considered', () => {
    const d = decideTripDate({ ...admin, requested: '20-09-2026' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d).toMatchObject({ status: 400, reason: 'bad_date' });
  });
});

describe('resolveFloor', () => {
  it('uses the transport year start when there is one', () => {
    expect(resolveFloor('2026-06-01', TODAY)).toBe('2026-06-01');
  });

  it('falls back to a year before today when no transport year is current', () => {
    // A missing is_current row is a state this project has hit before. Returning
    // null here would make `date < floor` evaluate false and fail OPEN.
    expect(resolveFloor(null, TODAY)).toBe('2025-09-20');
    expect(FALLBACK_FLOOR_DAYS).toBe(365);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/boarding/backdate.test.ts`
Expected: FAIL — `Failed to resolve import "./backdate"`.

- [ ] **Step 3: Write the implementation**

Create `lib/boarding/backdate.ts`:

```ts
/**
 * Which trip date a mark is written under, and whether this caller may name it.
 *
 * The attendance write path had no date dimension at all: it computed "today"
 * itself and the request body carried no date. A super admin was already exempt
 * from the route-assignment gate, the time window, the marking-method gate, the
 * in-charge share gate and mark ownership -- date was the one axis with no
 * exemption, which made the designated correction path unreachable.
 *
 * Pure, so every branch is testable without a database or a clock.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How far back marking may reach when no transport year is marked current.
 *
 * A missing is_current row is a real state in this database. Returning null for
 * the floor would be worse than any fixed number: `date < null` is false in
 * JavaScript, so the guard would fail OPEN and permit marking any date back to
 * 1970.
 */
export const FALLBACK_FLOOR_DAYS = 365;

export interface DecideTripDateInput {
  /** The date the client named. Absent/empty ⇒ today, the legacy contract. */
  requested?: string | null;
  /** Today in IST, YYYY-MM-DD. */
  today: string;
  /** Earliest markable date, or null when unknown (see resolveFloor). */
  floor: string | null;
  isSuperAdmin: boolean;
  isOverrideHolder: boolean;
}

export type BackdateDecision =
  | { ok: true; date: string; isBackdated: boolean }
  | {
      ok: false;
      status: 400 | 403;
      error: string;
      reason: 'bad_date' | 'future_date' | 'before_floor' | 'not_permitted';
    };

/** `days` back from `date`, as YYYY-MM-DD. Integer UTC math, no timezone lib. */
function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The earliest date attendance may be marked for: the current transport year's
 * start, or a year back when no year is current. Never null -- see
 * FALLBACK_FLOOR_DAYS for why a null floor is a security hole rather than a
 * missing value.
 */
export function resolveFloor(yearStart: string | null, today: string): string {
  return yearStart && ISO_DATE.test(yearStart) ? yearStart : minusDays(today, FALLBACK_FLOOR_DAYS);
}

/**
 * Decide the trip date for this request.
 *
 * Checks run in this order deliberately: shape, then direction in time, then
 * authority. A malformed date is a client bug whatever the caller's rank, and
 * answering 403 to it would send an admin hunting for a permission problem.
 *
 * ISO dates compare correctly as strings (YYYY-MM-DD is lexicographically
 * ordered), so no Date objects are constructed for the comparisons.
 */
export function decideTripDate(input: DecideTripDateInput): BackdateDecision {
  const requested = (input.requested ?? '').trim();
  if (!requested) return { ok: true, date: input.today, isBackdated: false };

  if (!ISO_DATE.test(requested)) {
    return { ok: false, status: 400, reason: 'bad_date', error: 'date must be YYYY-MM-DD' };
  }
  if (requested === input.today) return { ok: true, date: input.today, isBackdated: false };

  if (requested > input.today) {
    return {
      ok: false, status: 400, reason: 'future_date',
      error: 'Attendance cannot be marked for a future date.',
    };
  }

  const floor = resolveFloor(input.floor, input.today);
  if (requested < floor) {
    return {
      ok: false, status: 400, reason: 'before_floor',
      error: `Attendance cannot be marked before ${floor}.`,
    };
  }

  if (!input.isSuperAdmin && !input.isOverrideHolder) {
    return {
      ok: false, status: 403, reason: 'not_permitted',
      error: 'Only the transport office can mark attendance for a past date.',
    };
  }

  return { ok: true, date: requested, isBackdated: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/boarding/backdate.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/backdate.ts lib/boarding/backdate.test.ts
git commit -m "feat(attendance): pure trip-date authorization for back-dated marks

Absent date keeps the legacy today-only contract. Past dates need super
admin or tms.attendance.override; future dates are refused outright.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire the date into the write path

**Files:**
- Modify: `app/api/boarding/attendance/route.ts`

**Interfaces:**
- Consumes: `decideTripDate` from `@/lib/boarding/backdate`.
- Produces: `POST`/`DELETE /api/boarding/attendance` accepting an optional `date` in the JSON body.

**Read the file before editing.** It is ~718 lines and another session has
touched it; the line numbers below are a guide, not a guarantee. The three
functions are `mark()`, `getHistory()` and `clearMarks()`.

- [ ] **Step 1: Add the import and a floor loader**

Add to the imports at the top:

```ts
import { decideTripDate } from '@/lib/boarding/backdate';
```

Add this helper next to the existing `chunk` helper:

```ts
/**
 * The current transport year's start, or null when no year is marked current.
 * `resolveFloor` turns a null into a safe fallback -- see backdate.ts for why a
 * null floor must never reach a comparison.
 */
async function loadTransportYearStart(svc: SupabaseClient): Promise<string | null> {
  const { data } = await svc
    .from('tms_transport_year').select('start_date').eq('is_current', true).maybeSingle();
  return (data as { start_date: string } | null)?.start_date ?? null;
}
```

- [ ] **Step 2: Accept `date` in the POST body type**

Change the body cast inside `mark()` from:

```ts
    const body = (await request.json().catch(() => ({}))) as {
      routeId?: string; direction?: string; marks?: MarkInput[];
    };
```

to:

```ts
    const body = (await request.json().catch(() => ({}))) as {
      routeId?: string; direction?: string; marks?: MarkInput[]; date?: string;
    };
```

- [ ] **Step 3: Decide the trip date before the window is judged**

In `mark()`, immediately after `const svc = createServiceRoleClient();`, insert:

```ts
    // ── The date dimension ──
    // An absent `date` keeps the legacy contract byte for byte: the server
    // decides today and the phone is unaffected. A named PAST date is the
    // transport office's correction path, and it is the one gate this endpoint
    // never had -- every other exemption for these callers already existed.
    const dated = decideTripDate({
      requested: body.date,
      today: istToday(),
      floor: await loadTransportYearStart(svc),
      isSuperAdmin: auth.isSuperAdmin,
      isOverrideHolder,
    });
    if (!dated.ok) {
      return NextResponse.json({ error: dated.error, reason: dated.reason }, { status: dated.status });
    }
    const backdated = dated.isBackdated;
```

- [ ] **Step 4: Feed the decision into the trip date**

Find the two lines that currently compute the dates:

```ts
    const authDate = legacy ? istToday() : tap.tripDate;
    const today = legacy ? new Date().toISOString().slice(0, 10) : tap.tripDate;
```

Replace them with:

```ts
    // A back-dated request overrides both: a mark for 2026-09-01 is authorized
    // against that day's cover and stored under that day, whatever the clock
    // says. Same-day behaviour is untouched -- when `date` is absent these fall
    // back to exactly the previous expressions.
    const authDate = backdated ? dated.date : legacy ? istToday() : tap.tripDate;
    const today = backdated ? dated.date : legacy ? new Date().toISOString().slice(0, 10) : tap.tripDate;
```

- [ ] **Step 5: Suppress walk-up notifications on back-dated marks**

Find the notification block, which begins:

```ts
    if (notified.length > 0) {
```

Change that line to:

```ts
    // A back-fill must not accuse anyone. Marking a month of history would tell
    // hundreds of learners "you travelled without a booking" about trips three
    // weeks gone, and the message reads as an accusation even when it is right.
    if (notified.length > 0 && !backdated) {
```

- [ ] **Step 6: Record the back-date in the activity log**

In the `logActivity` call inside `mark()`, change the `metadata` object from:

```ts
      metadata: {
        routeId, direction, count: written, skipped, overrides,
        locked: locked.length, dropped: summary.dropped, walkUps: notified.length,
      },
```

to:

```ts
      metadata: {
        routeId, direction, count: written, skipped, overrides,
        locked: locked.length, dropped: summary.dropped, walkUps: notified.length,
        backdated, tripDate: today,
      },
```

and change the `description` string so a back-fill is visible in the log without
opening the metadata — replace:

```ts
        `Manually marked attendance for ${written} learner(s) on route ${routeId} (${direction})` +
```

with:

```ts
        `Manually marked attendance for ${written} learner(s) on route ${routeId} (${direction})` +
        (backdated ? ` — BACK-DATED to ${today}` : '') +
```

- [ ] **Step 7: Do the same for DELETE**

In `clearMarks()`, change the body cast:

```ts
interface ClearInput { routeId?: string; direction?: string; learnerIds?: string[] }
```

to:

```ts
interface ClearInput { routeId?: string; direction?: string; learnerIds?: string[]; date?: string }
```

Then, in `clearMarks()`, find:

```ts
    const today = new Date().toISOString().slice(0, 10);
    const authDate = istToday();
```

and replace with:

```ts
    // Undo needs the same date dimension as the mark, or a back-dated mistake
    // is permanent. isOverrideHolder is resolved further down in this function
    // today; hoist that lookup above this block so the decision can use it.
    const dated = decideTripDate({
      requested: body.date,
      today: istToday(),
      floor: await loadTransportYearStart(svc),
      isSuperAdmin: auth.isSuperAdmin,
      isOverrideHolder,
    });
    if (!dated.ok) {
      return NextResponse.json({ error: dated.error, reason: dated.reason }, { status: dated.status });
    }
    const today = dated.date;
    const authDate = dated.date;
```

**This requires moving one existing line.** `clearMarks()` currently computes
`const isOverrideHolder = await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);`
*after* the block above. Move that line to just before `const dated = ...`, and
delete it from its old position.

- [ ] **Step 8: Make `move_route` same-day only**

Since this plan was written, the wrong-bus feature (commit `7d543c2`) made every
manual mark send `move_route: true`, so a mark pulls that day's row onto the bus
it was marked on. That is right for a mark made on the bus today. For a
BACK-DATED mark it is the exact hazard Safety Rule 2 forbids: the upsert's
conflict key excludes `route_id`, so marking route 37 for 2026-09-01 would
rewrite that day's record onto route 37 and the learner's CURRENT stop, even if
they rode a different bus that day.

In the `rows` mapping inside `mark()`, find:

```ts
      // Marked on this bus's list, so the row belongs to this bus even when
      // an earlier write (the auto-absent job on the booked bus) put it elsewhere.
      move_route: true,
```

and replace it with:

```ts
      // Marked on this bus's list, so the row belongs to this bus even when
      // an earlier write (the auto-absent job on the booked bus) put it elsewhere.
      // Same-day only: a BACK-DATED mark records whether the learner travelled,
      // never where. The upsert's conflict key excludes route_id, so moving a
      // past row would rewrite that day's bus and stop from today's allocation.
      move_route: !backdated,
```

Leave `booked_route_id` as it is: `bookedElsewhere` is built from `tms_booking`
filtered on `today`, which Step 4 now feeds with the requested date, so it
already describes the day being marked.

Then verify there is exactly one `move_route`, and that it is the conditional:

Run: `grep -n "move_route" app/api/boarding/attendance/route.ts`
Expected: exactly one line, containing `move_route: !backdated,`.

- [ ] **Step 9: Verify the whole suite and the build**

Run: `npm run test`
Expected: PASS. Note the pre-existing total and confirm no test regressed.

Run: `npm run build`
Expected: compiles.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/api/boarding/attendance/route|lib/boarding/backdate"`
Expected: no output.

- [ ] **Step 10: Prove the RPC writes a back-dated row, then roll it back**

The parity lesson in this codebase is that TypeScript tests prove agreement, not
execution. Run this against the live database. The `raise exception` rolls the
whole transaction back, so **nothing is left behind**:

```sql
do $$
declare
  v_learner uuid;
  v_route   uuid;
  v_actor   uuid;
  v_out     text := '';
  r         record;
begin
  select id into v_route from tms_route where route_number = '37' limit 1;
  select id into v_learner from learners_profiles
   where transport_route_id = v_route and bus_required limit 1;
  select id into v_actor from profiles where is_super_admin limit 1;

  for r in
    select * from tms_mark_attendance(
      jsonb_build_array(jsonb_build_object(
        'learner_id', v_learner, 'route_id', v_route,
        'status', 'present', 'is_walk_up', false
      )),
      '2026-09-01'::date, 'onward', v_actor, 'manual', true
    )
  loop
    v_out := v_out || format('outcome=%s ', r.outcome);
  end loop;

  select v_out || format('stored_date=%s ',
         (select trip_date from tms_attendance
           where learner_id = v_learner and trip_date = '2026-09-01' and direction = 'onward'))
    into v_out;

  raise exception 'TESTRESULT: %', v_out;
end $$;
```

Expected: an error reading roughly
`TESTRESULT: outcome=inserted stored_date=2026-09-01`.
If `stored_date` is empty or shows today's date, **stop** — the trip date is not
reaching the row.

- [ ] **Step 11: Commit**

```bash
git add app/api/boarding/attendance/route.ts
git commit -m "feat(attendance): accept an optional date on mark and undo

Super admins and tms.attendance.override holders may mark a past date;
everyone else is unchanged. Back-dated marks never notify learners and
never set move_route, so historical boarding stops are preserved.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Marking controls on the drill-down

**Files:**
- Modify: `app/(admin)/attendance/[routeId]/[date]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/boarding/attendance` with `{ routeId, direction, date, marks: [{ learnerId, status }] }`; `usePermissions` from `@/hooks/use-permissions`; `TMS_PERMISSIONS` from `@/lib/constants/tms-permissions`.
- Produces: nothing downstream.

- [ ] **Step 1: Add the imports**

Add to the existing imports in the drill-down page:

```tsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
```

(`useState` joins the existing `import React, { use } from 'react';` — make it
`import React, { use, useState } from 'react';` rather than a second import.)

- [ ] **Step 2: Add the marking state and mutation**

Inside `AttendanceDayPage`, after the `useQuery` call, add:

```tsx
  const queryClient = useQueryClient();
  const { isSuperAdmin, can } = usePermissions();
  const canMark = isSuperAdmin || can(TMS_PERMISSIONS.ATTENDANCE_OVERRIDE);
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * Mark one learner. `date` is sent explicitly — that is the whole point of
   * this screen, and the server re-decides whether this caller may name it.
   */
  async function mark(learnerId: string, status: 'present' | 'absent') {
    setBusyId(learnerId);
    try {
      const res = await fetch('/api/boarding/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          routeId, direction, date,
          marks: [{ learnerId, status }],
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to save');
      if (result.locked?.length > 0) {
        // A partially locked batch must never render as a clean sweep.
        toast(result.locked[0].markedByName
          ? `Already marked by ${result.locked[0].markedByName}`
          : 'Some marks were already taken', { icon: '⚠️' });
      } else {
        toast.success(status === 'present' ? 'Marked present' : 'Marked absent');
      }
      await queryClient.invalidateQueries({
        queryKey: ['admin-attendance-roster', routeId, date, direction],
      });
      // The coverage grid counts these rows; leaving it stale would show the
      // cell still red after the day was filled in.
      await queryClient.invalidateQueries({ queryKey: ['attendance-coverage'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save attendance');
    } finally {
      setBusyId(null);
    }
  }
```

Note: `toast.warning` does **not** exist in react-hot-toast. The project
convention for a warning is `toast(msg, { icon: '⚠️' })`, as used above.

- [ ] **Step 3: Add the actions column**

In the `<thead>` row, add a final header cell:

```tsx
                {canMark && <th className="px-3 py-2">Mark</th>}
```

In the `<tbody>` row, add a final data cell:

```tsx
                  {canMark && (
                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        type="button"
                        disabled={busyId === r.learner_id}
                        onClick={() => mark(r.learner_id, 'present')}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                      >
                        Present
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.learner_id}
                        onClick={() => mark(r.learner_id, 'absent')}
                        className="ml-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                      >
                        Absent
                      </button>
                    </td>
                  )}
```

- [ ] **Step 4: Add the back-dating notice**

Directly above the table, add:

```tsx
      {canMark && data && date !== new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10) && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          You are marking a past date. These marks are recorded against {date}, learners are not
          notified, and the auto-absent job will not fill in the rest of this day — it closes each
          route-day once, on the day itself.
        </p>
      )}
```

- [ ] **Step 5: Build and type-check**

Run: `npm run build`
Expected: compiles.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "app/\(admin\)/attendance"`
Expected: no output.

- [ ] **Step 6: Mark a past date in the browser and verify in the database**

As a super admin, open a red cell on route 37 for a recent past date and mark one
learner Present. Then confirm the row landed on the right day:

```sql
select learner_id, trip_date, direction, status, method, is_walk_up, scanned_by
from tms_attendance
where route_id = (select id from tms_route where route_number = '37')
order by created_at desc
limit 5;
```

Expected: one row whose `trip_date` is the date you clicked, **not** today.

Then confirm no notification was sent:

```sql
select count(*) from tms_notification
where title = 'Travelled without a booking'
  and created_at > now() - interval '5 minutes';
```

Expected: `0`.

- [ ] **Step 7: Commit**

```bash
git add app/\(admin\)/attendance/\[routeId\]/\[date\]/page.tsx
git commit -m "feat(attendance): super-admin marking on any route and date

Present/Absent per row, gated on super admin or tms.attendance.override,
with an explicit notice when the date being marked is not today.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Final verification and merge

**Files:** none changed.

- [ ] **Step 1: Run the full suite**

Run: `npm run test`
Expected: PASS, with the 24 new tests from Tasks 2 and 7 included and no
pre-existing test regressed.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 3: Confirm the commit set before pushing**

Run: `git log origin/main..HEAD --oneline`
Expected: the commits from Tasks 1–9 and nothing else. Never trust a remembered
count — read the actual output.

Run: `git status --short`
Expected: no stray files. This working tree is shared between sessions and the
user commits broadly, so an untracked scratch file will end up in someone's
commit.

- [ ] **Step 4: Push**

```bash
git push origin HEAD:main
```

The checkout is shared between sessions, so push the current HEAD to main
directly rather than checking main out and merging, which would rewrite a
working tree another session may be using. If the push is rejected for
authentication, run `gh auth switch --user sangeethav-byte` and retry.

- [ ] **Step 5: Confirm the coverage grid reflects the back-fill**

Reload `/attendance` and confirm the cell you marked in Task 9 is no longer red.
Route 37 should now show one non-red column while the rest of its row stays red —
that is the correct picture, not a bug.

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task: the coverage function
(Task 1), cell classification and the 60% threshold (Task 2), the grid endpoint
(Task 3), the grid page, nav entry, summary strip and leg toggle (Task 4), the
roster endpoint (Task 5), the drill-down (Task 6), the date table and floor
fallback (Task 7), the write path with all six safety rules (Task 8), the
marking UI (Task 9), verification (Task 10).

**Deferred from the spec, deliberately:** Phase 3 (per-learner history tab and
CSV export) is not planned here. It depends on nothing in Phase 1 or 2 and would
roughly double this plan's length for value the user ranked third. It should get
its own plan once the grid is in use and its shape is informed by real use.

**Safety rules, traced to steps:** no notification on back-fill → Task 8 Step 5
and verified in Task 9 Step 6; never move a back-dated row (`move_route: !backdated`) → Task 8 Step 8; walk-up
derivation follows the date → Task 8 Step 4 (`today` feeds the existing booking
lookup); `.in()` chunking → unchanged, existing `chunk()` helpers retained;
activity log flag → Task 8 Step 6; auto-close not retriggered → surfaced to the
user in Task 9 Step 4; `method='auto'` excluded → Task 1 SQL and Task 2 tests.
