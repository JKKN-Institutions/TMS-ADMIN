# Book Bus — Monthly Calendar + Optimized Booking Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a full-page monthly calendar to book the bus (open by default, admin-marked leaves render red and block booking), backed by a lean date-wise booking table, and surface the day's bookings to drivers and boarding staff.

**Architecture:** Reuse the existing booking backend (`tms_booking`, `tms_service_calendar`, `tms_booking_window`, `lib/booking/*`). Redesign `tms_booking` to a composite-PK, delete-on-cancel table; lift the 7-day booking horizon to the whole month; rewrite the student page as a month grid against the already-existing `?month=` API; add a date-aware driver "Bookings" view and a date picker to the boarding roster.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + service-role), React Query, Tailwind v4, vitest. DDL via the Supabase MCP.

## Global Constraints

- MODERN route pattern only: `withAuth` + `createServiceRoleClient` + `requirePerm(auth, TMS_PERMISSIONS.*)`; success shape `{ success: true, data }`, errors `{ error }` with proper HTTP status. (Verbatim from spec §5/§7.)
- Reference permission keys via `TMS_PERMISSIONS` constants — never raw strings. Relevant: `BOOKINGS_SELF = 'tms.bookings.self'`, `DRIVER_SELF_VIEW = 'tms.driver.self.view'`, `ATTENDANCE_SCAN = 'tms.attendance.scan'`, `SCHEDULES_VIEW = 'tms.schedules.view'`, `BOOKINGS_MANAGE = 'tms.bookings.manage'`.
- Keep the `42P01` (missing-table) guard pattern where it already exists.
- All DDL: apply via Supabase MCP **and** commit the migration file under `supabase/migrations/`.
- Dark mode: every solid colored tint needs explicit `dark:` variants.
- ESLint is broken in this repo — **do not** run `npm run lint`. Verify with `npx tsc --noEmit` (check the changed files have no new errors) and `npx vitest run`.
- Commits: stage **only** the specific files for each task (never `git add -A` / `git add .`); the working tree carries unrelated in-progress work. End commit messages with the Co-Authored-By trailer.
- Times are IST (+05:30, no DST). Reuse `istToday()` / `cutoffFor()` from `lib/booking/window.ts`; never hand-roll timezone math in routes.
- Agent's browser is unauthenticated (proxy gates all routes) — route probes return 307/401/403; final visual verification happens in the user's authenticated browser.

---

### Task 1: Optimized `tms_booking` table + delete-on-cancel backend cutover

Redesign the booking table (composite PK, no `status`, no surrogate `id`) and update **every** query that filtered `status='booked'` so the booking backend works on the new schema. These must land together: the migration drops the `status` column, so any query still filtering it breaks until updated.

**Files:**
- Create: `supabase/migrations/20260623130000_optimize_tms_booking.sql`
- Modify: `lib/booking/repo.ts`
- Modify: `app/api/student/bookings/route.ts`
- Modify: `app/api/boarding/routes/[routeId]/roster/route.ts`
- Modify: `app/api/admin/schedules/manifest/route.ts`
- Modify: `app/api/admin/bookings/send-reminders/route.ts`

**Interfaces:**
- Produces: table `tms_booking(learner_id uuid, travel_date date, route_id uuid, stop_id uuid null, booked_at timestamptz, booked_by uuid null)`, PK `(learner_id, travel_date)`, index `idx_booking_route_date (route_id, travel_date) INCLUDE (learner_id, stop_id)`. Row present = booked; no row = not booked.
- Produces (unchanged signatures): `hasBookingForDate(svc, learnerId, date): Promise<boolean>`, `bookedCount(svc, routeId, date): Promise<number>` (now status-free).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260623130000_optimize_tms_booking.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Redesign tms_booking: lean, date-wise, delete-on-cancel.
--   * Composite PK (learner_id, travel_date) — drops the surrogate uuid id and the
--     redundant unique index (one identity, one index).
--   * Presence = booked. Cancel = DELETE the row. No status/cancelled_at columns,
--     so the table never accumulates dead rows and every read drops its status filter.
--   * Covering index makes the route+date roster/capacity query index-only.
--   * travel_date is in the PK => the table is partition-ready (RANGE) for later.
-- Only 3 throwaway test rows exist, so we drop & recreate. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
drop table if exists public.tms_booking cascade;

create table public.tms_booking (
  learner_id  uuid not null references public.learners_profiles(id) on delete cascade,
  travel_date date not null,
  route_id    uuid not null references public.tms_route(id),       -- snapshot of route at booking time
  stop_id     uuid references public.tms_route_stop(id),           -- snapshot of boarding stop
  booked_at   timestamptz not null default now(),
  booked_by   uuid,                                                -- learner user id (or admin if on-behalf)
  primary key (learner_id, travel_date)
);

create index idx_booking_route_date
  on public.tms_booking (route_id, travel_date) include (learner_id, stop_id);

alter table public.tms_booking enable row level security;
-- Writes go through the service-role client (RLS bypassed); learners may read their own.
drop policy if exists tms_booking_learner_select on public.tms_booking;
create policy tms_booking_learner_select on public.tms_booking
  for select using (
    learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid())
  );
```

- [ ] **Step 2: Apply the migration via the Supabase MCP**

Use the `mcp__supabase__apply_migration` tool (load its schema first with ToolSearch `select:mcp__supabase__apply_migration` if needed):
- `name`: `optimize_tms_booking`
- `query`: the full SQL from Step 1.

- [ ] **Step 3: Verify the new schema in the DB**

Run with `mcp__supabase__execute_sql`:

```sql
select column_name, data_type, is_nullable
from information_schema.columns where table_name = 'tms_booking' order by ordinal_position;
select indexname, indexdef from pg_indexes where tablename = 'tms_booking';
```

Expected: columns exactly `learner_id, travel_date, route_id, stop_id, booked_at, booked_by` (no `id`, no `status`); a PK index on `(learner_id, travel_date)` and `idx_booking_route_date`.

- [ ] **Step 4: Update `lib/booking/repo.ts` — drop status filters**

Replace `hasBookingForDate` (lines 15–29) and `bookedCount` (lines 32–41) with:

```ts
/** True if the learner holds a booking for the given date (presence = booked). */
export async function hasBookingForDate(
  svc: SupabaseClient,
  learnerId: string,
  date: string
): Promise<boolean> {
  const { data, error } = await svc
    .from('tms_booking')
    .select('learner_id')
    .eq('learner_id', learnerId)
    .eq('travel_date', date)
    .maybeSingle();
  if (error && !isMissingTable(error)) throw error;
  return !!data;
}

/** Count of bookings for a route on a date. */
export async function bookedCount(svc: SupabaseClient, routeId: string, date: string): Promise<number> {
  const { count, error } = await svc
    .from('tms_booking')
    .select('learner_id', { count: 'exact', head: true })
    .eq('route_id', routeId)
    .eq('travel_date', date);
  if (error && !isMissingTable(error)) throw error;
  return count ?? 0;
}
```

(`walkUpCount`, `routeCapacity`, `seatsRemaining` are unchanged.)

- [ ] **Step 5: Update `app/api/student/bookings/route.ts` — month/horizon selects**

Remove the `.eq('status', 'booked')` from the **month** query (it sits after `.eq('learner_id', learner.id)` in the `if (monthParam)` block) and from the **horizon** query (the one using `.in('travel_date', dates)`). Each becomes:

```ts
      .from('tms_booking')
      .select('travel_date')
      .eq('learner_id', learner.id)
      // (status filter removed — presence = booked)
```

Keep the surrounding `.gte/.lte` (month) and `.in('travel_date', dates)` (horizon) exactly as-is.

- [ ] **Step 6: Update `app/api/student/bookings/route.ts` — book = upsert, cancel = delete**

Replace the booking write block (from `const existing = await svc` through the end of the `if (action === 'book')` branch, i.e. the `existing`/`nowIso`/`writeErr` logic) with an upsert:

```ts
      const upErr = (await svc
        .from('tms_booking')
        .upsert(
          {
            learner_id: learner.id,
            route_id: learner.transport_route_id,
            stop_id: learner.transport_stop_id,
            travel_date: travelDate,
            booked_at: new Date().toISOString(),
            booked_by: auth.userId,
          },
          { onConflict: 'learner_id,travel_date' }
        )).error;
      if (upErr) {
        console.error('student/bookings book error:', upErr);
        return NextResponse.json({ error: 'Failed to book' }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: { travel_date: travelDate, status: 'booked' } });
```

Replace the cancel write (the `const upd = await svc...update({ status: 'cancelled', ... })...` block) with a delete:

```ts
    const del = await svc
      .from('tms_booking')
      .delete()
      .eq('learner_id', learner.id)
      .eq('travel_date', travelDate);
    if (del.error) {
      console.error('student/bookings cancel error:', del.error);
      return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { travel_date: travelDate, status: 'cancelled' } });
```

(The capacity/exception/`effectiveOpen`/`isCancelable` checks above these writes stay unchanged.)

- [ ] **Step 7: Update `app/api/boarding/routes/[routeId]/roster/route.ts` — drop status filter**

In the bookings query, remove `.eq('status', 'booked')` so it reads:

```ts
    const { data: bookings } = await svc
      .from('tms_booking')
      .select('learner_id')
      .eq('route_id', routeId)
      .eq('travel_date', today);
```

- [ ] **Step 8: Update `app/api/admin/schedules/manifest/route.ts` — drop status filter**

In the `bk` query, remove `.eq('status', 'booked')`:

```ts
  const bk = await svc
    .from('tms_booking')
    .select('learner_id, stop_id')
    .eq('route_id', routeId).eq('travel_date', date);
```

- [ ] **Step 9: Update `app/api/admin/bookings/send-reminders/route.ts` — drop status filter**

In the `booked` query, remove `.eq('status', 'booked')`:

```ts
    const { data: booked } = await svc
      .from('tms_booking')
      .select('learner_id')
      .eq('travel_date', date);
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in the five edited files (`lib/booking/repo.ts`, the four routes). Pre-existing unrelated errors elsewhere are out of scope.

- [ ] **Step 11: Smoke-test book→cancel against the live table**

Use `mcp__supabase__execute_sql` to confirm the new shape accepts the app's write pattern and the unique key holds (use a real learner/route or any existing UUIDs):

```sql
-- pick a learner + their route/stop
select id as learner_id, transport_route_id, transport_stop_id
from learners_profiles where transport_route_id is not null limit 1;
```

Then (substituting the ids) verify upsert idempotency and delete:

```sql
insert into tms_booking (learner_id, travel_date, route_id, stop_id)
values ('<learner>', current_date + 1, '<route>', '<stop>')
on conflict (learner_id, travel_date) do update set booked_at = now();
select count(*) from tms_booking where learner_id='<learner>' and travel_date=current_date+1; -- expect 1
delete from tms_booking where learner_id='<learner>' and travel_date=current_date+1;
select count(*) from tms_booking where learner_id='<learner>' and travel_date=current_date+1; -- expect 0
```

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/20260623130000_optimize_tms_booking.sql lib/booking/repo.ts app/api/student/bookings/route.ts app/api/boarding/routes/\[routeId\]/roster/route.ts app/api/admin/schedules/manifest/route.ts app/api/admin/bookings/send-reminders/route.ts
git commit -m "feat(booking): redesign tms_booking as composite-PK delete-on-cancel table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Lift the booking horizon to the whole month

Replace the hard 7-day cap with a configurable `MAX_BOOKING_HORIZON_DAYS = 92` so any open day in the visible month is bookable, still gated by the 6 PM-day-before cutoff. TDD: update the unit tests first.

**Files:**
- Modify: `lib/booking/window.ts`
- Modify: `lib/booking/window.test.ts`
- Modify: `lib/booking/calendar.test.ts`

**Interfaces:**
- Produces: `MAX_BOOKING_HORIZON_DAYS: number` (replaces `HORIZON_DAYS`); `bookableDates(now)` returns the next `MAX_BOOKING_HORIZON_DAYS` dates (tomorrow..+92); `isBookingOpen(date, now)` true when `date` is in that window and `now < cutoffFor(date)`. `cellStatus`/`buildMonthCells` unchanged in code (behavior widens via `bookableDates`).

- [ ] **Step 1: Update the failing tests in `lib/booking/window.test.ts`**

Replace the `bookableDates` and `isBookingOpen` describe blocks (lines 37–61) with:

```ts
describe('bookableDates', () => {
  it('returns the next 92 dates starting tomorrow (IST)', () => {
    const dates = bookableDates(new Date('2026-06-20T06:00:00Z')); // istToday == 2026-06-20
    expect(dates).toHaveLength(92);
    expect(dates[0]).toBe('2026-06-21');
    expect(dates[91]).toBe(addDays('2026-06-20', 92));
  });
});

describe('isBookingOpen', () => {
  it('is open just before the cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T12:29:00Z'))).toBe(true);
  });
  it('is closed just after the cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T12:31:00Z'))).toBe(false);
  });
  it('allows a date later this month (no longer capped at 7 days)', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-20T06:00:00Z'))).toBe(true);
  });
  it('rejects a date beyond the 92-day horizon', () => {
    expect(isBookingOpen(addDays('2026-06-20', 100), new Date('2026-06-20T06:00:00Z'))).toBe(false);
  });
  it('rejects today and past dates', () => {
    expect(isBookingOpen('2026-06-20', new Date('2026-06-20T06:00:00Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Update `lib/booking/calendar.test.ts`**

In the `cellStatus` block, replace the "out-of-horizon future" test (the one asserting `'2026-06-30'` is `out_of_horizon`) with:

```ts
  it('in-month future is open now (horizon widened); far future is out_of_horizon', () => {
    expect(cellStatus('2026-06-30', { hasBooking: false, now: NOW })).toBe('open');
    expect(cellStatus('2026-12-01', { hasBooking: false, now: NOW })).toBe('out_of_horizon');
    expect(cellStatus('2026-06-10', { hasBooking: true, now: NOW })).toBe('locked'); // past booking
  });
```

(The `buildMonthCells` test's `by('2026-06-22').status === 'out_of_horizon'` assertion for *today* stays valid — today is never in `bookableDates`.)

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run lib/booking/window.test.ts lib/booking/calendar.test.ts`
Expected: FAIL — `bookableDates` still returns 7; `isBookingOpen('2026-06-28', …)` still false.

- [ ] **Step 4: Update `lib/booking/window.ts`**

Replace the `HORIZON_DAYS` constant (line 8) and `bookableDates` (lines 33–37) with:

```ts
export const MAX_BOOKING_HORIZON_DAYS = 92; // tomorrow .. +92 (current month + ~2 ahead)
```

```ts
/** The ascending bookable dates (tomorrow .. +MAX_BOOKING_HORIZON_DAYS) relative to IST today. */
export function bookableDates(now: Date = new Date()): string[] {
  const today = istToday(now);
  return Array.from({ length: MAX_BOOKING_HORIZON_DAYS }, (_, i) => addDays(today, i + 1));
}
```

(`isBookingOpen`, `isCancelable`, `dayStatus`, `cutoffFor`, `istToday`, `addDays` are unchanged — they already derive from `bookableDates` + `cutoffFor`.)

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run lib/booking/window.test.ts lib/booking/calendar.test.ts`
Expected: PASS (all green).

- [ ] **Step 6: Typecheck (no lingering `HORIZON_DAYS` references)**

Run: `npx tsc --noEmit`
Expected: no error about a missing `HORIZON_DAYS` export. (`send-reminders` and `summary` import only `bookableDates`, so they're unaffected.)

- [ ] **Step 7: Commit**

```bash
git add lib/booking/window.ts lib/booking/window.test.ts lib/booking/calendar.test.ts
git commit -m "feat(booking): lift booking horizon from 7 days to the whole month (92d)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Student full-page month calendar

Replace the 7-day list with a full-page month grid driven by the existing `?month=` API. A pure `monthGrid` helper (unit-tested) lays out the weeks; a presentational `BookingCalendar` renders them; the page owns data + month navigation + book/cancel.

**Files:**
- Create: `lib/booking/month.ts`
- Create: `lib/booking/month.test.ts`
- Create: `components/booking/booking-calendar.tsx`
- Modify (rewrite): `app/student/bookings/page.tsx`

**Interfaces:**
- Consumes: `GET /api/student/bookings?month=YYYY-MM` → `{ data: { routeLabel, stopLabel, assigned, month, cells: { date, status, note, cutoff }[] } }` (already exists); `POST /api/student/bookings { travel_date, action }` (Task 1).
- Produces: `monthGrid(monthStr): (string|null)[][]`, `addMonth(monthStr, delta): string`, `istMonth(now?): string`; `BookingCalendar` component; `DayCell` / `CellStatus` types exported from `components/booking/booking-calendar.tsx`.

- [ ] **Step 1: Write the failing test `lib/booking/month.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { monthGrid, addMonth, istMonth } from './month';
import { monthDays } from './calendar';

describe('monthGrid', () => {
  it('lays a month into whole weeks of 7, in order', () => {
    const weeks = monthGrid('2026-06');
    for (const w of weeks) expect(w).toHaveLength(7);
    expect(weeks.flat().filter(Boolean)).toEqual(monthDays('2026-06'));
  });
  it('pads only with nulls before day 1', () => {
    const weeks = monthGrid('2026-06');
    const flat = weeks.flat();
    const firstIdx = flat.indexOf('2026-06-01');
    expect(flat.slice(0, firstIdx).every((c) => c === null)).toBe(true);
  });
});

describe('addMonth', () => {
  it('rolls forward over a year boundary', () => expect(addMonth('2026-12', 1)).toBe('2027-01'));
  it('rolls backward over a year boundary', () => expect(addMonth('2026-01', -1)).toBe('2025-12'));
});

describe('istMonth', () => {
  it('uses the IST calendar month', () => {
    // 2026-06-30T20:00Z == 2026-07-01T01:30 IST
    expect(istMonth(new Date('2026-06-30T20:00:00Z'))).toBe('2026-07');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/booking/month.test.ts`
Expected: FAIL with "Failed to resolve import './month'".

- [ ] **Step 3: Implement `lib/booking/month.ts`**

```ts
/**
 * Pure month-grid layout for the booking calendar. Lays out a 'YYYY-MM' as
 * Sunday-first weeks, padding leading/trailing slots with null so the grid is
 * always whole 7-cell rows. UTC integer math only (no timezone drift).
 */
export function monthGrid(monthStr: string): (string | null)[][] {
  const [y, m] = monthStr.split('-').map(Number);
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun..6=Sat
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(`${monthStr}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 'YYYY-MM' shifted by ±delta months. */
export function addMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Current month 'YYYY-MM' in IST (+05:30). */
export function istMonth(now: Date = new Date()): string {
  return new Date(now.getTime() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 7);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/booking/month.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `components/booking/booking-calendar.tsx`**

```tsx
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthGrid } from '@/lib/booking/month';

export type CellStatus =
  | 'open' | 'booked' | 'locked' | 'closed'
  | 'holiday' | 'no_service' | 'out_of_horizon';

export interface DayCell {
  date: string;
  status: CellStatus;
  note?: string | null;
  cutoff?: string | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthLabel = (monthStr: string) =>
  new Date(monthStr + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// status → visual + whether the cell is actionable
const STYLE: Record<CellStatus, { cls: string; label: string; action: 'book' | 'cancel' | null }> = {
  open: { cls: 'bg-white text-gray-900 border-gray-200 hover:border-green-500 hover:bg-green-50 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-green-950/40', label: 'Open', action: 'book' },
  booked: { cls: 'bg-green-600 text-white border-green-600', label: 'Booked', action: 'cancel' },
  locked: { cls: 'bg-blue-600 text-white border-blue-600', label: 'Confirmed', action: null },
  closed: { cls: 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700', label: 'Closed', action: null },
  holiday: { cls: 'bg-red-600 text-white border-red-600', label: 'Leave', action: null },
  no_service: { cls: 'bg-red-500 text-white border-red-500', label: 'No service', action: null },
  out_of_horizon: { cls: 'bg-gray-50 text-gray-300 border-gray-100 dark:bg-gray-900 dark:text-gray-600 dark:border-gray-800', label: '—', action: null },
};

export function BookingCalendar({
  month, cells, onPrev, onNext, onBook, onCancel, pendingDate,
}: {
  month: string;
  cells: Map<string, DayCell>;
  onPrev: () => void;
  onNext: () => void;
  onBook: (date: string) => void;
  onCancel: (date: string) => void;
  pendingDate: string | null;
}) {
  const weeks = monthGrid(month);
  const dayNum = (d: string) => Number(d.slice(8, 10));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onPrev} aria-label="Previous month"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{monthLabel(month)}</h2>
        <button type="button" onClick={onNext} aria-label="Next month"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>

      <div className="mt-1 space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date, di) => {
              if (!date) return <div key={di} className="aspect-square" />;
              const cell = cells.get(date) ?? { date, status: 'out_of_horizon' as CellStatus };
              const s = STYLE[cell.status];
              const isPending = pendingDate === date;
              const clickable = s.action !== null;
              return (
                <button
                  key={di}
                  type="button"
                  disabled={!clickable || isPending}
                  title={cell.note ?? s.label}
                  onClick={() => {
                    if (s.action === 'book') onBook(date);
                    else if (s.action === 'cancel') onCancel(date);
                  }}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors disabled:cursor-default ${s.cls} ${isPending ? 'opacity-60' : ''}`}
                >
                  <span className="font-semibold tabular-nums">{dayNum(date)}</span>
                  {(cell.status === 'holiday' || cell.status === 'no_service') && cell.note && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0.5 truncate px-1 text-[8px] leading-tight opacity-90">
                      {cell.note}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        <Legend swatch="border border-gray-300 bg-white dark:bg-gray-900" label="Open" />
        <Legend swatch="bg-green-600" label="Booked" />
        <Legend swatch="bg-blue-600" label="Confirmed" />
        <Legend swatch="bg-red-600" label="Leave" />
        <Legend swatch="bg-gray-200 dark:bg-gray-700" label="Closed" />
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${swatch}`} />
      {label}
    </span>
  );
}
```

- [ ] **Step 6: Rewrite `app/student/bookings/page.tsx`**

Replace the entire file with:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookingCalendar, type DayCell } from '@/components/booking/booking-calendar';
import { addMonth, istMonth } from '@/lib/booking/month';

interface MonthResp {
  routeLabel: string | null;
  stopLabel: string | null;
  assigned: boolean;
  month: string;
  cells: DayCell[];
}

async function fetchMonth(month: string): Promise<MonthResp> {
  const res = await fetch(`/api/student/bookings?month=${month}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load bookings');
  return (await res.json()).data as MonthResp;
}

async function mutateBooking(input: { travel_date: string; action: 'book' | 'cancel' }) {
  const res = await fetch('/api/student/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Action failed');
  return json.data as { travel_date: string; status: string };
}

export default function StudentBookingsPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>(() => istMonth());
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-bookings', month],
    queryFn: () => fetchMonth(month),
  });

  const mut = useMutation({
    mutationFn: mutateBooking,
    onMutate: (v) => setPendingDate(v.travel_date),
    onSuccess: (d) => {
      toast.success(d.status === 'booked' ? 'Bus booked' : 'Booking cancelled');
      qc.invalidateQueries({ queryKey: ['student-bookings'] });
      qc.invalidateQueries({ queryKey: ['student-pass'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Action failed'),
    onSettled: () => setPendingDate(null),
  });

  const cells = useMemo(() => {
    const m = new Map<string, DayCell>();
    for (const c of data?.cells ?? []) m.set(c.date, c);
    return m;
  }, [data]);

  const bookedThisMonth = useMemo(
    () => (data?.cells ?? []).filter((c) => c.status === 'booked' || c.status === 'locked').length,
    [data]
  );

  if (error) return <div className="text-destructive">Could not load your bookings.</div>;

  if (data && !data.assigned) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader><CardTitle>No route allocated</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You need a transport route allocated before you can book a bus. Please contact the transport office.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Book Bus</h1>
        <p className="text-sm text-muted-foreground">{data?.routeLabel ?? '—'} · Stop: {data?.stopLabel ?? '—'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tap an open day to book — one booking covers both trips. Booking closes 6 PM the day before.
          {bookedThisMonth > 0 && ` · ${bookedThisMonth} day${bookedThisMonth === 1 ? '' : 's'} booked this month.`}
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <BookingCalendar
          month={month}
          cells={cells}
          onPrev={() => setMonth((m) => addMonth(m, -1))}
          onNext={() => setMonth((m) => addMonth(m, 1))}
          onBook={(date) => mut.mutate({ travel_date: date, action: 'book' })}
          onCancel={(date) => mut.mutate({ travel_date: date, action: 'cancel' })}
          pendingDate={pendingDate}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `lib/booking/month.ts`, `components/booking/booking-calendar.tsx`, `app/student/bookings/page.tsx`.

- [ ] **Step 8: Route probe (unauth is expected)**

Run (dev server on :3000): `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/student/bookings?month=2026-06"`
Expected: `401` or `307` (proxy gate) — confirms the route compiles and is reachable. Authenticated month-grid render is verified by the user in their browser.

- [ ] **Step 9: Commit**

```bash
git add lib/booking/month.ts lib/booking/month.test.ts components/booking/booking-calendar.tsx app/student/bookings/page.tsx
git commit -m "feat(student): full-page month calendar for Book Bus (red leaves, tap to book)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Driver "Bookings" date-aware view

Add a driver portal page (default today, date picker) listing the students who booked that day, reusing the Passenger module's loader and the driver Passengers table columns.

**Files:**
- Create: `app/api/driver/bookings/route.ts`
- Create: `app/driver/bookings/page.tsx`
- Modify: `lib/driver/navigation.ts`
- Modify: `components/driver-bottom-nav.tsx`

**Interfaces:**
- Consumes: `getDriverForUser(auth)`, `getDriverRoutes(staffId, assignedRouteId)`, `loadPassengerRefs(svc, {...})`, `LEARNER_SELECT`/`mapLearner`/`LearnerRow` from `@/lib/passengers/types`, `routeCapacity` (Task 1), `istToday`, `getPassengerColumns`/`PassengerRow` from `../passengers/columns`.
- Produces: `GET /api/driver/bookings?date=YYYY-MM-DD` → `{ data: { date, totalBooked, routes: { id, label, booked, capacity, percentFull, passengers: PassengerRow[] }[] } }`.

- [ ] **Step 1: Create `app/api/driver/bookings/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { LEARNER_SELECT, mapLearner, type LearnerRow } from '@/lib/passengers/types';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { routeCapacity } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * GET /api/driver/bookings?date=YYYY-MM-DD — students who BOOKED a seat on the driver's
 * route(s) for the date (default IST today), grouped per route + ordered by stop, with
 * per-route booked/capacity counts. Reuses the Passenger loader so rows match the admin
 * Learners + driver Passengers definitions exactly.
 */
async function getBookings(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const qp = new URL(request.url).searchParams.get('date') ?? '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(qp) ? qp : istToday();

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);
    const routeIds = routes.map((r) => r.id);
    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, data: { date, totalBooked: 0, routes: [] } });
    }

    const svc = createServiceRoleClient();

    const bk = await svc
      .from('tms_booking')
      .select('learner_id, route_id, stop_id')
      .in('route_id', routeIds)
      .eq('travel_date', date);
    if (bk.error && (bk.error as { code?: string }).code !== '42P01') {
      console.error('driver/bookings query error:', bk.error);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }
    const bookingRows = (bk.data ?? []) as { learner_id: string; route_id: string; stop_id: string | null }[];
    const learnerIds = [...new Set(bookingRows.map((b) => b.learner_id))];

    const learnerById = new Map<string, LearnerRow>();
    if (learnerIds.length) {
      const lr = await svc.from('learners_profiles').select(LEARNER_SELECT).in('id', learnerIds);
      for (const row of (lr.data ?? []) as unknown as LearnerRow[]) learnerById.set(row.id, row);
    }
    const rows = [...learnerById.values()];

    const refs = await loadPassengerRefs(svc, {
      institutionIds: rows.map((r) => r.institution_id),
      departmentIds: rows.map((r) => r.department_id),
      routeIds,
      stopIds: bookingRows.map((b) => b.stop_id),
      programIds: rows.map((r) => r.program_id),
      semesterIds: rows.map((r) => r.semester_id),
    });

    // stopId → sequence order (booking carries the stop snapshot)
    const stopOrder = new Map<string, number | null>();
    for (const rt of routes) for (const s of rt.stops) stopOrder.set(s.id, s.order);

    const result = await Promise.all(
      routes.map(async (rt) => {
        const passengers = bookingRows
          .filter((b) => b.route_id === rt.id)
          .map((b) => {
            const lr = learnerById.get(b.learner_id);
            if (!lr) return null;
            const base = mapLearner(lr, refs);
            return {
              id: base.id,
              name: base.name,
              rollNumber: base.rollNumber,
              registerNumber: base.registerNumber,
              email: base.email,
              mobile: base.mobile,
              routeLabel: rt.label,
              stopLabel: b.stop_id ? refs.stops.get(b.stop_id) ?? base.stopLabel : base.stopLabel,
              stopOrder: b.stop_id ? stopOrder.get(b.stop_id) ?? null : null,
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => {
            const ao = a.stopOrder ?? 9999, bo = b.stopOrder ?? 9999;
            if (ao !== bo) return ao - bo;
            return a.name.localeCompare(b.name);
          });
        const capacity = await routeCapacity(svc, rt.id);
        return {
          id: rt.id,
          label: rt.label,
          booked: passengers.length,
          capacity,
          percentFull: capacity > 0 ? Math.round((passengers.length / capacity) * 100) : 0,
          passengers,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: { date, totalBooked: bookingRows.length, routes: result },
    });
  } catch (e) {
    console.error('driver/bookings error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getBookings(request, auth));
```

- [ ] **Step 2: Create `app/driver/bookings/page.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Users, AlertTriangle } from 'lucide-react';
import { NoticeCard, PageHeader, Stat } from '@/components/driver/ui';
import { DataTable, type DataTableFilter } from '@/components/ui/data-table';
import { getPassengerColumns, type PassengerRow } from '../passengers/columns';

interface RouteGroup {
  id: string;
  label: string;
  booked: number;
  capacity: number;
  percentFull: number;
  passengers: PassengerRow[];
}
interface Resp { date: string; totalBooked: number; routes: RouteGroup[] }

const istToday = () => new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);

async function fetchBookings(date: string): Promise<{ data?: Resp; notFound?: boolean }> {
  const res = await fetch(`/api/driver/bookings?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load bookings');
  return { data: (await res.json()).data as Resp };
}

function optionsOf(values: (string | null)[]) {
  return [...new Set(values.filter((v): v is string => !!v))]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ label: v, value: v }));
}

export default function DriverBookingsPage() {
  const [date, setDate] = useState<string>(() => istToday());
  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-bookings', date],
    queryFn: () => fetchBookings(date),
  });

  // Reuse the driver Passengers columns, minus the row-select checkbox column.
  const columns = useMemo(() => getPassengerColumns().filter((c) => c.id !== 'select'), []);
  const routes = data?.data?.routes ?? [];
  const passengers = useMemo(() => routes.flatMap((rt) => rt.passengers), [routes]);
  const totalCapacity = routes.reduce((s, r) => s + r.capacity, 0);
  const totalBooked = data?.data?.totalBooked ?? passengers.length;

  const filters = useMemo<DataTableFilter[]>(() => {
    const f: DataTableFilter[] = [];
    const routeOpts = optionsOf(passengers.map((p) => p.routeLabel));
    const stopOpts = optionsOf(passengers.map((p) => p.stopLabel));
    if (routeOpts.length > 1) f.push({ columnId: 'route', title: 'Route', options: routeOpts });
    if (stopOpts.length > 1) f.push({ columnId: 'stop', title: 'Stop', options: stopOpts });
    return f;
  }, [passengers]);

  if (error) {
    return <NoticeCard tone="red" icon={AlertTriangle} title="Couldn't load bookings" body="Something went wrong loading the day's bookings. Please refresh or try again shortly." />;
  }
  if (data?.notFound) {
    return <NoticeCard tone="amber" icon={AlertTriangle} title="Driver profile not found" body="We couldn't find a driver record linked to your account. Please contact the transport office." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" subtitle="Students who reserved a seat for the selected day." />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-600 dark:text-gray-400">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || istToday())}
            className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <Stat icon={Users} label="Booked" value={String(totalBooked)} tone="green" />
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <Stat icon={Users} label="Capacity" value={String(totalCapacity)} tone="blue" />
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <Stat icon={CalendarCheck} label="Routes" value={String(routes.length)} tone="purple" />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={passengers}
        entityName="bookings"
        isLoading={isLoading}
        getRowId={(p) => p.id}
        searchPlaceholder="Search name, roll no, stop…"
        filters={filters}
        pageSize={20}
      />
    </div>
  );
}
```

- [ ] **Step 3: Add the nav entry in `lib/driver/navigation.ts`**

Add `CalendarCheck` to the lucide import (line 1) and insert a Bookings item after Passengers:

```ts
import { LayoutDashboard, Route, Users, MapPin, User, CalendarCheck } from 'lucide-react';
```

```ts
export const driverNavigation: DriverNavItem[] = [
  { name: 'Dashboard', href: '/driver/dashboard', icon: LayoutDashboard },
  { name: 'My Routes', shortName: 'Routes', href: '/driver/routes', icon: Route },
  { name: 'Passengers', shortName: 'Riders', href: '/driver/passengers', icon: Users },
  { name: 'Bookings', shortName: 'Bookings', href: '/driver/bookings', icon: CalendarCheck },
  { name: 'Live Location', shortName: 'Live', href: '/driver/location', icon: MapPin },
  { name: 'Profile', href: '/driver/profile', icon: User },
];
```

- [ ] **Step 4: Surface Bookings in the mobile bar — `components/driver-bottom-nav.tsx`**

Replace the `PRIMARY_HREFS` array (lines 12–17) so Bookings occupies a bar slot (Live Location moves to the "More" sheet):

```ts
const PRIMARY_HREFS = [
  '/driver/dashboard',
  '/driver/routes',
  '/driver/passengers',
  '/driver/bookings',
];
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in the new route, the new page, `lib/driver/navigation.ts`, `components/driver-bottom-nav.tsx`.

- [ ] **Step 6: Route probe**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/driver/bookings?date=2026-06-24"`
Expected: `401`/`307` (gated) — confirms it compiles. Authenticated render verified by the user.

- [ ] **Step 7: Commit**

```bash
git add app/api/driver/bookings/route.ts app/driver/bookings/page.tsx lib/driver/navigation.ts components/driver-bottom-nav.tsx
git commit -m "feat(driver): date-aware Bookings view (who reserved a seat today)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Boarding staff date picker

Let boarding staff view the roster for any date (currently hardcoded to today), reusing the existing roster API + UI.

**Files:**
- Modify: `app/api/boarding/routes/[routeId]/roster/route.ts`
- Modify: `app/boarding/routes/[routeId]/page.tsx`

**Interfaces:**
- Produces: `GET /api/boarding/routes/[routeId]/roster?date=YYYY-MM-DD` (default IST today) → existing shape plus `data.date`.

- [ ] **Step 1: Accept `?date=` in the roster route**

In `app/api/boarding/routes/[routeId]/roster/route.ts`, change the handler signature and the `today` derivation. Update `getRoster` to take a date param:

```ts
async function getRoster(auth: AuthContext, routeId: string, dateParam: string | null) {
```

Replace `const today = istToday();` with:

```ts
    const today = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : istToday();
```

Add `date: today` to the returned `data` object (alongside `route`, `counts`, `students`):

```ts
      data: {
        route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
        date: today,
        counts: {
```

Update the `GET` export to read the query param and pass it:

```ts
export const GET = withAuth((req: NextRequest, auth) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const routeId = decodeURIComponent(parts[parts.indexOf('routes') + 1] ?? '');
  return getRoster(auth, routeId, url.searchParams.get('date'));
});
```

- [ ] **Step 2: Add a date selector to the boarding roster page**

In `app/boarding/routes/[routeId]/page.tsx`:

(a) Add a `date` state below the existing state (after the `meta` state line):

```ts
  const istToday = () => new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(istToday);
```

(b) Pass the date to the fetch — change the `load` fetch URL to:

```ts
      const res = await fetch(`/api/boarding/routes/${routeId}/roster?date=${date}`, { cache: 'no-store', credentials: 'same-origin' });
```

(c) Re-run `load` when the date changes — update the effect dependency array from `[routeId]` to `[routeId, date]`:

```ts
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, date]);
```

(d) Add the date input to the header — inside the header `div` (the `flex ... justify-between` block), add a date picker before the "Scan Boarding Pass" link:

```tsx
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || istToday())}
              className="ml-2 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <Link href="/boarding/scan" className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
            <QrCode className="h-4 w-4" /> Scan Boarding Pass
          </Link>
        </div>
```

(Replace the standalone `<Link href="/boarding/scan" …>` element with this wrapped version so the date sits beside it.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in the roster route or the boarding page.

- [ ] **Step 4: Route probe**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/boarding/routes/00000000-0000-0000-0000-000000000000/roster?date=2026-06-24"`
Expected: `401`/`307` (gated) — confirms it compiles and parses the param.

- [ ] **Step 5: Commit**

```bash
git add app/api/boarding/routes/\[routeId\]/roster/route.ts app/boarding/routes/\[routeId\]/page.tsx
git commit -m "feat(boarding): date picker on the route roster (default today)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification (after all tasks)

- [ ] `npx vitest run lib/booking` → all booking unit tests pass (window, calendar, month).
- [ ] `npx tsc --noEmit` → no new type errors in any file this plan created/modified.
- [ ] User confirms in their authenticated browser:
  - Student `/student/bookings` shows a full month grid; tapping an open day books it (turns green); admin-marked leave (added via `/schedules` → Service Calendar) shows **red** and is not tappable; prev/next month works.
  - Driver `/driver/bookings` shows the day's booked riders with a working date picker + counts.
  - Boarding `/boarding/routes/[id]` roster respects the new date picker.

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Full-page month calendar (student) | Task 3 |
| Open by default; admin leave → red, auto-updated | Tasks 1–3 (service-calendar already wired; month API renders red) |
| Book any open day in the month (horizon lifted) | Task 2 |
| One institution-wide calendar | Existing `tms_service_calendar` (all-routes rows); no change needed |
| Driver/boarding: current-date booked passengers + counts | Tasks 4 & 5 |
| Optimized date-wise booking table (composite PK, delete-on-cancel) | Task 1 |
| No book/cancel audit flooding the activity log | Task 1 (delete-on-cancel, no activity-log writes) |
