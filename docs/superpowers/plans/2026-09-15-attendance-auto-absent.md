# Attendance Auto-Absent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a trip's attendance window closes, every rider nobody marked becomes Absent automatically — skipping routes nobody marked at all.

**Architecture:** A `SECURITY DEFINER` Postgres function `tms_auto_close_attendance(p_now)` run by pg_cron every 10 minutes inserts `status='absent', method='auto', scanned_by=NULL` rows for the unmarked roster of each route that has at least one human mark, claiming each (date, trip, route) in a ledger table so it closes exactly once. App code only learns to *read* the new `'auto'` method (labels, analytics, and excluding it from "marked by staff" progress).

**Tech Stack:** Supabase Postgres (plpgsql, pg_cron), Next.js 16 route handlers, React/TanStack Table, vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-attendance-auto-absent-design.md`

## Global Constraints

- Work only in worktree `.worktrees/attendance-auto-absent` (branch `feat/attendance-auto-absent`). Never commit from the shared checkout.
- Roster lifecycle list in SQL MUST equal `ACTIVE_LIFECYCLE_STATUSES` = `['active','admitted','account']` (`lib/passengers/types.ts:46`).
- Auto rows: `status='absent'`, `method='auto'`, `scanned_by NULL`, `is_walk_up false`, `scanned_at = p_now`.
- IST = `Asia/Kolkata`. Skip Sunday and any `tms_service_calendar` all-routes row; skip a route with a route-specific row.
- Never touch past days. Never re-insert for a ledgered (date, direction, route).
- `tms_mark_attendance` is NOT modified.
- New SQL function: revoke EXECUTE from `public, anon, authenticated` (new functions here inherit a PUBLIC grant).
- Execute every new SQL function once on the live DB inside a rolled-back `do $$ … raise exception 'TESTRESULT: %' $$` block before trusting it.
- The cron schedule migration is applied LAST, after the app code is deployed, and **before 07:00 IST or during the morning window** (its first run closes today's already-ended trips).
- `npm run lint` is broken; verify with vitest + `npm run build` + tsc filtered to touched files.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Shared "auto mark" helper + lifecycle drift test

**Files:**
- Create: `lib/boarding/auto-mark.ts`
- Test: `lib/boarding/auto-mark.test.ts`

**Interfaces:**
- Produces: `AUTO_METHOD: 'auto'`, `isAutoMark(method: string | null | undefined): boolean`, `AUTO_MARK_TITLE: string`, `AUTO_ABSENT_MIGRATION: string` (relative path of the Task 2 migration).

- [ ] **Step 1: Write the failing test**

```ts
// lib/boarding/auto-mark.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO_METHOD, isAutoMark, AUTO_ABSENT_MIGRATION } from './auto-mark';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';

describe('isAutoMark', () => {
  it('is true only for the auto method', () => {
    expect(isAutoMark(AUTO_METHOD)).toBe(true);
    expect(isAutoMark('manual')).toBe(false);
    expect(isAutoMark('id_card')).toBe(false);
    expect(isAutoMark(null)).toBe(false);
    expect(isAutoMark(undefined)).toBe(false);
  });
});

describe('auto-absent SQL roster', () => {
  it('uses exactly ACTIVE_LIFECYCLE_STATUSES, so it lists the same riders as the Attendance screen', () => {
    const sql = readFileSync(join(process.cwd(), AUTO_ABSENT_MIGRATION), 'utf8');
    const m = sql.match(/lifecycle_status::text in \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const inSql = m![1].split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    expect(inSql).toEqual([...ACTIVE_LIFECYCLE_STATUSES].sort());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/boarding/auto-mark.test.ts`
Expected: FAIL — cannot resolve `./auto-mark`.

- [ ] **Step 3: Implement**

```ts
// lib/boarding/auto-mark.ts
/**
 * Attendance rows written by the database when a trip's window closes
 * (public.tms_auto_close_attendance, run by pg_cron). They record "nobody
 * marked this rider before attendance closed", so they are real absences for
 * turnout, but they are NOT staff work: never count them as "marked" when
 * judging an in-charge's progress.
 */
export const AUTO_METHOD = 'auto' as const;

export const AUTO_MARK_TITLE = 'Marked absent automatically — not marked before attendance closed';

/** The migration that defines the job; a test pins its roster to the app's. */
export const AUTO_ABSENT_MIGRATION = 'supabase/migrations/20260915120000_tms_attendance_auto_absent.sql';

export function isAutoMark(method: string | null | undefined): boolean {
  return method === AUTO_METHOD;
}
```

- [ ] **Step 4: Run** `npx vitest run lib/boarding/auto-mark.test.ts` — the `isAutoMark` test PASSES; the SQL test still FAILS (file missing) until Task 2. Do not commit yet; continue to Task 2 and commit both together.

---

### Task 2: Migration — method, ledger, function (no schedule)

**Files:**
- Create: `supabase/migrations/20260915120000_tms_attendance_auto_absent.sql`

**Interfaces:**
- Produces: table `public.tms_attendance_auto_close`; function `public.tms_auto_close_attendance(p_now timestamptz default now()) returns table(out_direction text, out_route_id uuid, out_outcome text, out_absent_count integer)`; outcomes `'closed' | 'skipped_no_marks'`.

- [ ] **Step 1: Write the migration**

```sql
-- Auto-absent when an attendance window closes.
-- Spec: docs/superpowers/specs/2026-09-15-attendance-auto-absent-design.md
-- The pg_cron schedule is a SEPARATE migration applied after the app deploys.

-- 1. A method for rows the database writes.
alter table public.tms_attendance drop constraint tms_attendance_method_check;
alter table public.tms_attendance add constraint tms_attendance_method_check
  check (method = any (array['qr_scan'::text, 'manual'::text, 'id_card'::text, 'auto'::text]));

-- 2. Ledger: one row per (day, trip, route) the job has closed. This is what
--    stops the job re-marking a rider a person has since cleared.
create table if not exists public.tms_attendance_auto_close (
  trip_date    date        not null,
  direction    text        not null check (direction in ('onward', 'return')),
  route_id     uuid        not null references public.tms_route(id) on delete cascade,
  closed_at    timestamptz not null default now(),
  absent_count integer     not null default 0,
  primary key (trip_date, direction, route_id)
);
alter table public.tms_attendance_auto_close enable row level security;
-- No policies: service role / the SECURITY DEFINER function only.

-- 3. The job.
create or replace function public.tms_auto_close_attendance(p_now timestamptz default now())
returns table (out_direction text, out_route_id uuid, out_outcome text, out_absent_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date    date      := (p_now at time zone 'Asia/Kolkata')::date;
  v_time    time      := (p_now at time zone 'Asia/Kolkata')::time;
  v_dir     text;
  v_route   uuid;
  v_claimed boolean;
  v_count   integer;
begin
  -- No service: Sunday, or an all-routes calendar exception.
  if extract(isodow from v_date) = 7 then return; end if;
  if exists (select 1 from tms_service_calendar c
             where c.exception_date = v_date and c.route_id is null) then
    return;
  end if;

  -- Trips whose enforced window has ended today. enabled=false means "open all
  -- day", so such a trip never closes. Evening only when switched on.
  for v_dir in
    select aw.direction from tms_attendance_window aw
     where aw.enabled
       and (aw.direction = 'onward' or aw.is_active is true)
       and v_time >= aw.end_time
  loop
    for v_route in
      select rt.id from tms_route rt
       where not exists (select 1 from tms_attendance_auto_close l
                          where l.trip_date = v_date and l.direction = v_dir and l.route_id = rt.id)
         and not exists (select 1 from tms_service_calendar c
                          where c.exception_date = v_date and c.route_id = rt.id)
    loop
      -- No human mark on this route/trip today: the bus may not have run.
      -- Not ledgered, so a later run retries once late (offline) marks land.
      if not exists (select 1 from tms_attendance a
                      where a.route_id = v_route and a.trip_date = v_date
                        and a.direction = v_dir and a.method <> 'auto') then
        out_direction := v_dir; out_route_id := v_route;
        out_outcome := 'skipped_no_marks'; out_absent_count := 0;
        return next;
        continue;
      end if;

      -- Claim. Only the run that inserts the ledger row proceeds.
      v_claimed := null;
      insert into tms_attendance_auto_close (trip_date, direction, route_id)
      values (v_date, v_dir, v_route)
      on conflict do nothing
      returning true into v_claimed;
      if v_claimed is not true then continue; end if;

      -- Same set loadRouteAttendanceRoster shows: allocated riders UNION the
      -- day's bookings on this route. Booking stop wins. Any existing mark,
      -- on any route, wins over the auto-absent (do nothing on conflict).
      with allocated as (
        select lp.id as learner_id, lp.transport_stop_id as stop_id
          from learners_profiles lp
         where lp.transport_route_id = v_route
           and lp.bus_required
           and lp.lifecycle_status::text in ('active', 'admitted', 'account')
      ), booked as (
        select b.learner_id, b.stop_id
          from tms_booking b
         where b.route_id = v_route and b.travel_date = v_date
      ), roster as (
        select coalesce(a.learner_id, b.learner_id) as learner_id,
               coalesce(b.stop_id, a.stop_id)       as stop_id
          from allocated a
          full join booked b on b.learner_id = a.learner_id
      )
      insert into tms_attendance
        (learner_id, route_id, stop_id, trip_date, direction,
         status, method, is_walk_up, scanned_by, scanned_at)
      select ro.learner_id, v_route, ro.stop_id, v_date, v_dir,
             'absent', 'auto', false, null, p_now
        from roster ro
      on conflict (learner_id, trip_date, direction) do nothing;
      get diagnostics v_count = row_count;

      update tms_attendance_auto_close
         set absent_count = v_count
       where trip_date = v_date and direction = v_dir and route_id = v_route;

      out_direction := v_dir; out_route_id := v_route;
      out_outcome := 'closed'; out_absent_count := v_count;
      return next;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.tms_auto_close_attendance(timestamptz) from public, anon, authenticated;
grant execute on function public.tms_auto_close_attendance(timestamptz) to service_role;
```

- [ ] **Step 2: Run** `npx vitest run lib/boarding/auto-mark.test.ts` — Expected: 2 PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/boarding/auto-mark.ts lib/boarding/auto-mark.test.ts supabase/migrations/20260915120000_tms_attendance_auto_absent.sql
git commit -m "feat(attendance): auto-absent job for unmarked riders when a window closes"
```

---

### Task 3: Dry-run the function against live data, then apply

No files. Uses `mcp__supabase__execute_sql` / `apply_migration`.

- [ ] **Step 1: Expected numbers first** (pick the most recent working day `D` with morning marks, e.g. `2026-09-15`):

```sql
with alloc as (select id, transport_route_id rid, transport_stop_id from learners_profiles
  where transport_route_id is not null and bus_required and lifecycle_status::text in ('active','admitted','account')),
roster as (select coalesce(a.id,b.learner_id) lid, coalesce(a.rid,b.route_id) rid
  from alloc a full join (select * from tms_booking where travel_date='D') b on b.learner_id=a.id and b.route_id=a.rid),
marked_routes as (select distinct route_id from tms_attendance where trip_date='D' and direction='onward' and method<>'auto')
select count(*) filter (where r.rid in (select route_id from marked_routes)
         and not exists (select 1 from tms_attendance t where t.learner_id=r.lid and t.trip_date='D' and t.direction='onward')) expected_absent,
       (select count(*) from marked_routes) expected_closed_routes
from roster r;
```

- [ ] **Step 2: Dry run, rolled back** — paste the Task 2 migration body into a transaction that ends in a raise:

```sql
do $$
declare v_msg text; v_closed int; v_abs int; v_again int; v_skip int; v_sun int; v_before int; v_out text;
begin
  -- (entire Task 2 migration body here, sections 1-3, minus revoke/grant)
  select count(*) filter (where out_outcome='closed'), coalesce(sum(out_absent_count),0),
         count(*) filter (where out_outcome='skipped_no_marks')
    into v_closed, v_abs, v_skip
    from tms_auto_close_attendance('D 09:40:00+05:30'::timestamptz) where out_direction='onward';
  select coalesce(sum(out_absent_count),0) into v_again
    from tms_auto_close_attendance('D 09:50:00+05:30'::timestamptz) where out_outcome='closed';
  select count(*) into v_before from tms_auto_close_attendance('D 09:00:00+05:30'::timestamptz);
  select count(*) into v_sun from tms_auto_close_attendance('<nearest Sunday> 20:00:00+05:30'::timestamptz);
  -- A human mark still overrides an auto-absent:
  select t.outcome into v_out from tms_mark_attendance(
    jsonb_build_array(jsonb_build_object('learner_id', (select learner_id from tms_attendance where method='auto' and trip_date='D' limit 1),
      'route_id', (select route_id from tms_attendance where method='auto' and trip_date='D' limit 1), 'status','present')),
    'D'::date, 'onward', (select id from profiles limit 1), 'manual', false) t;
  raise exception 'TESTRESULT: closed=% absent=% skipped=% again=% before_close=% sunday=% human_over_auto=%',
    v_closed, v_abs, v_skip, v_again, v_before, v_sun, v_out;
end $$;
```

Note: section 3's `create function` inside a DO block must be run via `execute $f$ … $f$` — wrap the function DDL in `execute` with a different dollar tag.

Expected: `closed` = expected_closed_routes, `absent` = expected_absent, `again=0`, `before_close=0`, `sunday=0`, `human_over_auto=overridden`. Any mismatch → stop and investigate; do not apply.

- [ ] **Step 3: Apply** the Task 2 migration with `apply_migration` (name `tms_attendance_auto_absent`). Verify:

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname='tms_attendance_method_check';
select has_function_privilege('anon','public.tms_auto_close_attendance(timestamptz)','execute') anon_exec,
       has_function_privilege('service_role','public.tms_auto_close_attendance(timestamptz)','execute') svc_exec;
select count(*) from tms_attendance where method='auto';  -- 0: nothing scheduled yet
```

Expected: constraint lists `auto`; `anon_exec=false`, `svc_exec=true`; count 0.

---

### Task 4: Analytics understands `'auto'`

**Files:**
- Modify: `lib/booking/analytics-types.ts:25`, `:61`, `:219`
- Modify: `lib/booking/analytics-attendance.ts:375-379`
- Modify: `app/api/admin/bookings/analytics/route.ts:185`
- Modify: `app/(admin)/bookings/analytics/filter-bar.tsx:84`, `:101-105`
- Modify: `app/(admin)/bookings/analytics/attendance-tab.tsx:291`
- Test: `lib/booking/analytics-attendance.test.ts`

**Interfaces:**
- Produces: `AttendanceRow.method: 'qr_scan' | 'manual' | 'id_card' | 'auto'`; `byMethod: { qr_scan; manual; id_card; auto }`.

- [ ] **Step 1: Failing test** — update line 136 and 149 expectations and add a case after line 150:

```ts
    expect(out.byMethod).toEqual({ qr_scan: 2, manual: 0, id_card: 0, auto: 0 });
```
```ts
    expect(cardOut.byMethod).toEqual({ qr_scan: 1, manual: 0, id_card: 2, auto: 0 });
  });

  it('counts auto-absent rows as their own method and as absences', () => {
    const autoOut = agg(
      [bk('L1', '2026-07-09'), bk('L2', '2026-07-09')],
      [
        at('L1', '2026-07-09', { method: 'manual' }),
        at('L2', '2026-07-09', { method: 'auto', status: 'absent' }),
      ],
    );
    expect(autoOut.byMethod).toEqual({ qr_scan: 0, manual: 1, id_card: 0, auto: 1 });
    expect(autoOut.byStatus).toEqual({ present: 1, absent: 1 });
```

(also update any other `byMethod` `toEqual` in that file — `grep -n "byMethod" lib/booking/analytics-attendance.test.ts` — to include `auto: 0`.)

- [ ] **Step 2:** `npx vitest run lib/booking/analytics-attendance.test.ts` — Expected: FAIL (type error / missing `auto`).

- [ ] **Step 3: Implement**

`analytics-types.ts`:
```ts
  method: 'qr_scan' | 'manual' | 'id_card' | 'auto';
```
```ts
  method: 'qr_scan' | 'manual' | 'id_card' | 'auto' | null;
```
```ts
  byMethod: { qr_scan: number; manual: number; id_card: number; auto: number };
```

`analytics-attendance.ts` inside `byMethod`:
```ts
      id_card: count(attendanceForComposition, (a) => a.method, 'id_card'),
      auto: count(attendanceForComposition, (a) => a.method, 'auto'),
```

`app/api/admin/bookings/analytics/route.ts:185` and `filter-bar.tsx:84`:
```ts
      method: oneOf(params.get('method'), ['qr_scan', 'manual', 'id_card', 'auto'] as const),
```
(`sp.get` in filter-bar.)

`filter-bar.tsx` METHOD_OPTS:
```ts
  { id: 'manual', label: 'Manual' },
  { id: 'auto', label: 'Auto (window closed)' },
```

`attendance-tab.tsx:291`:
```tsx
              <Cell label="QR / card / manual / auto" value={`${num(data.byMethod.qr_scan)} / ${num(data.byMethod.id_card)} / ${num(data.byMethod.manual)} / ${num(data.byMethod.auto)}`} Icon={QrCode} color="var(--viz-neutral)" />
```

- [ ] **Step 4:** `npx vitest run lib/booking` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/analytics-types.ts lib/booking/analytics-attendance.ts lib/booking/analytics-attendance.test.ts app/api/admin/bookings/analytics/route.ts "app/(admin)/bookings/analytics/filter-bar.tsx" "app/(admin)/bookings/analytics/attendance-tab.tsx"
git commit -m "feat(analytics): count auto-absent attendance as its own method"
```

---

### Task 5: Auto rows never count as staff progress

**Files:**
- Modify: `app/api/admin/incharge-coverage/route.ts:88-89`
- Modify: `app/api/boarding/attendance/roster/route.ts:315-316`

**Interfaces:**
- Consumes: `isAutoMark`, `AUTO_METHOD` from `@/lib/boarding/auto-mark` (Task 1).

- [ ] **Step 1: Coverage board** — the attendance query becomes:

```ts
        svc.from('tms_attendance').select('route_id, learner_id').in('route_id', c)
          .eq('trip_date', date).eq('direction', 'onward')
          // Rows the database wrote when the window closed are not an
          // in-charge's work; counting them would show a share nobody marked as done.
          .neq('method', AUTO_METHOD),
```
and add `import { AUTO_METHOD } from '@/lib/boarding/auto-mark';`.

- [ ] **Step 2: Roster share progress** —

```ts
    const mineRows = rows.filter((r) => r.is_mine && r.booked);
    // An auto-absent answers "was this rider accounted for", not "did I mark them".
    const mineMarked = mineRows.filter((r) => r.status !== 'unmarked' && !isAutoMark(r.method)).length;
```
and add `import { isAutoMark } from '@/lib/boarding/auto-mark';`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "incharge-coverage/route|attendance/roster/route"` → no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/incharge-coverage/route.ts app/api/boarding/attendance/roster/route.ts
git commit -m "fix(attendance): exclude auto-absent rows from in-charge progress"
```

---

### Task 6: Show auto-absent honestly in the three mark views

**Files:**
- Modify: `app/boarding/attendance/columns.tsx:294-301` (Clock already imported, line 4)
- Modify: `app/student/attendance/columns.tsx:4`, `:104-108`
- Modify: `components/booking/booking-calendar.tsx:3`, `:252-255`

**Interfaces:**
- Consumes: `isAutoMark`, `AUTO_MARK_TITLE` (Task 1).

- [ ] **Step 1: Boarding roster cell** (add `import { isAutoMark, AUTO_MARK_TITLE } from '@/lib/boarding/auto-mark';`):

```tsx
            <span className="inline-flex items-center gap-1.5 text-gray-500" title={isAutoMark(row.original.method) ? AUTO_MARK_TITLE : undefined}>
              {isAutoMark(row.original.method)
                ? <Clock className="h-3.5 w-3.5" />
                : row.original.method === 'manual' ? <Pencil className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
              {fmtTime(row.original.scanned_at)}
            </span>
            {isAutoMark(row.original.method) && (
              <div className="text-xs text-gray-400">auto · not marked in time</div>
            )}
            {row.original.marked_by_name && (
              <div className="text-xs text-gray-400">by {row.original.marked_by_name}</div>
            )}
```

- [ ] **Step 2: Student history** — import `Clock` alongside `Pencil, QrCode`, plus the helper:

```tsx
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500"
          title={isAutoMark(row.original.method) ? AUTO_MARK_TITLE : undefined}
        >
          {isAutoMark(row.original.method) ? (
            <Clock className="h-3.5 w-3.5" />
          ) : row.original.method === 'manual' ? (
            <Pencil className="h-3.5 w-3.5" />
          ) : (
            <QrCode className="h-3.5 w-3.5" />
          )}
          {fmtTime(row.original.scannedAt)}
        </span>
```

- [ ] **Step 3: Booking calendar** — import `Clock`, plus the helper:

```tsx
                {m.method && (
                  <span
                    className="ml-auto inline-flex items-center text-gray-400"
                    title={isAutoMark(m.method) ? AUTO_MARK_TITLE : m.method === 'manual' ? 'Marked manually' : 'Scanned (QR)'}
                  >
                    {isAutoMark(m.method)
                      ? <Clock className="h-2.5 w-2.5" />
                      : m.method === 'manual' ? <Pencil className="h-2.5 w-2.5" /> : <QrCode className="h-2.5 w-2.5" />}
                  </span>
                )}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "attendance/columns|booking-calendar"` → no output.

- [ ] **Step 5: Commit**

```bash
git add app/boarding/attendance/columns.tsx app/student/attendance/columns.tsx components/booking/booking-calendar.tsx
git commit -m "feat(attendance): label auto-absent marks in roster, student history and calendar"
```

---

### Task 7: Full verification, merge, schedule

**Files:**
- Create: `supabase/migrations/20260915121000_tms_attendance_auto_absent_schedule.sql`

- [ ] **Step 1:** `npx vitest run` — Expected: all green (report the count).
- [ ] **Step 2:** `npm run build` — Expected: exit 0.
- [ ] **Step 3: Write the schedule migration**

```sql
-- Run the auto-absent job every 10 minutes. Off switch:
--   select cron.unschedule('tms-attendance-auto-absent');
select cron.unschedule(jobid) from cron.job where jobname = 'tms-attendance-auto-absent';
select cron.schedule(
  'tms-attendance-auto-absent',
  '*/10 * * * *',
  $$select public.tms_auto_close_attendance()$$
);
```

- [ ] **Step 4: Commit** the schedule file. **Ask the user before pushing.** Then `git log origin/main..HEAD`, `git merge-base --is-ancestor origin/main HEAD` (rebase if false), and `git push origin HEAD:main`.
- [ ] **Step 5:** After Vercel deploys, apply the schedule migration **before 07:00 IST or before 09:30 IST on a working day**.
- [ ] **Step 6: Next close check** (after 09:40 IST):

```sql
select l.direction, r.route_number, l.absent_count, l.closed_at
  from tms_attendance_auto_close l join tms_route r on r.id = l.route_id
 where l.trip_date = (now() at time zone 'Asia/Kolkata')::date order by 1, 2;
select status, method, count(*) from tms_attendance
 where trip_date = (now() at time zone 'Asia/Kolkata')::date and direction = 'onward' group by 1, 2;
select status, return_message, start_time from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname='tms-attendance-auto-absent')
 order by start_time desc limit 5;
```

Expected: one ledger row per route that had marks; zero unmarked riders left on those routes; cron runs `succeeded`.
- [ ] **Step 7:** Browser smoke test by the user (agent Chrome is unauthenticated): after 09:30 the roster shows unmarked riders as Absent with the clock icon; the in-charge coverage board does not turn green from auto rows.
