# Schedule Calendar — Foundation + Student Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the learner 7-day booking *list* with an admin-gated **month calendar**, backed by a new `tms_service_calendar` (holiday / no-service exceptions), and relabel "Book Bus" → "Schedule".

**Architecture:** Keep the existing booking engine (`tms_booking`, `lib/booking/window.ts`, book/cancel API). Add (1) a `tms_service_calendar` table, (2) a pure `lib/booking/calendar.ts` month-builder + gate layered on the pure window logic, (3) a pure `lib/booking/optimize.ts` booked-stop grouper (used by Plan 2), (4) a `?month=` branch on the student API plus a server-side gate, and (5) a `MonthCalendar` UI. Pure logic is TDD'd with vitest; API/UI are verified by type-check + dev-server probes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Supabase (service-role), TanStack Query v5, react-hot-toast, Tailwind v4, vitest 4, date math is hand-rolled IST (no tz lib).

## Global Constraints

- **API routes** use the MODERN pattern: `withAuth(...)` + `createServiceRoleClient()` + an inline `requirePerm(auth, KEY)` that returns `true` for `auth.isSuperAdmin` else `auth.supabase.rpc('user_has_permission', { permission_name })`. Responses are `{ success: true, data }` or `{ error }` with proper HTTP status. Every `tms_booking`/`tms_service_calendar` read guards Postgres error code `42P01` (missing table) and returns a safe default.
- **Permissions are reused, none added:** `TMS_PERMISSIONS.BOOKINGS_SELF` (learner), `BOOKINGS_VIEW` (admin read), `BOOKINGS_MANAGE` (admin write). Import from `@/lib/constants/tms-permissions`.
- **Dates** are IST `'YYYY-MM-DD'` strings; reuse `lib/booking/window.ts` helpers (`addDays`, `bookableDates`, `dayStatus`, `cutoffFor`, `istToday`). India has no DST.
- **Verification (ESLint is broken in this repo):** type-check with `npm run type-check` and grep for the changed file; run pure-logic tests with `npx vitest run <file>`; probe routes with `curl` expecting `307`/`401` when unauthenticated (the agent browser is OAuth-gated — the user confirms authed visuals).
- **Migrations:** apply via the Supabase MCP (`apply_migration`) against project `kvizhngldtiuufknvehv`, AND commit the SQL file under `supabase/migrations/`.
- **Git:** work on branch `feat/daily-bus-booking`; one commit per task; never `git add -A` (other parallel work is uncommitted) — add explicit paths. End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Mobile-first + dark mode:** neutral grays/translucency are globally remapped; any solid colored tint needs an explicit `dark:` variant.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260622000000_create_tms_service_calendar.sql` | New table + partial unique indexes + updated_at trigger |
| `lib/booking/window.ts` (modify) | Export `HORIZON_DAYS` (currently private) |
| `lib/booking/calendar.ts` (create) | Pure month-cell builder + gate; DB exception loader |
| `lib/booking/calendar.test.ts` (create) | Vitest for the pure builder/gate |
| `lib/booking/optimize.ts` (create) | Pure `groupBookedStops` + DB `bookedStopsForRouteDate` (consumed in Plan 2) |
| `lib/booking/optimize.test.ts` (create) | Vitest for `groupBookedStops` |
| `app/api/student/bookings/route.ts` (modify) | `?month=` board branch + server-side gate on book |
| `components/student/month-calendar.tsx` (create) | Presentational month grid + legend |
| `app/student/bookings/page.tsx` (modify) | Calendar page + day bottom-sheet + relabel title |
| `lib/student/navigation.ts` (modify) | Nav label `Book Bus` → `Schedule` |

---

### Task 1: `tms_service_calendar` migration

**Files:**
- Create: `supabase/migrations/20260622000000_create_tms_service_calendar.sql`

**Interfaces:**
- Produces: table `tms_service_calendar(id, exception_date date, route_id uuid?, kind text, note text?, created_at, updated_at, created_by?, updated_by?)`. Gate query: row matches a date+route when `exception_date = D AND (route_id IS NULL OR route_id = R)`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- tms_service_calendar: admin-managed EXCEPTIONS to the default "every day is
-- bookable". One row = one blocked date, optionally scoped to a single route
-- (route_id NULL = applies to ALL routes). 'holiday' vs 'no_service' both block
-- booking; they differ only in the label shown to learners.
create table if not exists public.tms_service_calendar (
  id             uuid primary key default gen_random_uuid(),
  exception_date date not null,
  route_id       uuid references public.tms_route(id) on delete cascade,
  kind           text not null check (kind in ('holiday', 'no_service')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid
);

-- One all-routes exception per date, and one per (date, route). Two PARTIAL
-- unique indexes because Postgres treats NULLs as distinct in a normal unique
-- constraint (which would let duplicate all-routes holidays slip in).
create unique index if not exists uq_service_calendar_allroutes
  on public.tms_service_calendar (exception_date)
  where route_id is null;
create unique index if not exists uq_service_calendar_perroute
  on public.tms_service_calendar (exception_date, route_id)
  where route_id is not null;

-- Gate lookup index (date-range scan, route filter).
create index if not exists idx_service_calendar_date_route
  on public.tms_service_calendar (exception_date, route_id);

-- Reuse the project's shared updated_at trigger fn (same one tms_booking uses).
drop trigger if exists trg_tms_service_calendar_updated_at on public.tms_service_calendar;
create trigger trg_tms_service_calendar_updated_at
  before update on public.tms_service_calendar
  for each row execute function public.set_updated_at();

alter table public.tms_service_calendar enable row level security;
-- No learner-facing RLS policy: writes/reads happen via the service-role admin
-- API only; learners receive blocked dates through the student board API.
```

- [ ] **Step 2: Confirm the trigger function name**

Run: `grep -rn "function public.set_updated_at\|set_updated_at()" supabase/migrations/20260620100000_create_tms_booking.sql`
Expected: the booking migration references the same `set_updated_at` trigger fn. If the project's shared fn has a different name (e.g. `public.handle_updated_at`), substitute it in Step 1's trigger.

- [ ] **Step 3: Apply via Supabase MCP**

Apply the SQL with the `apply_migration` MCP tool, name `create_tms_service_calendar`.
Then verify:

Run (MCP `execute_sql`):
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'tms_service_calendar' order by ordinal_position;
```
Expected: 10 rows incl. `exception_date date NO`, `route_id uuid YES`, `kind text NO`.

- [ ] **Step 4: Smoke-test the gate semantics + uniqueness**

Run (MCP `execute_sql`):
```sql
insert into public.tms_service_calendar (exception_date, kind, note) values ('2026-07-04','holiday','test all-routes');
-- duplicate all-routes for same date must fail:
insert into public.tms_service_calendar (exception_date, kind) values ('2026-07-04','no_service');
```
Expected: first insert OK, second raises `duplicate key value violates unique constraint "uq_service_calendar_allroutes"`. Then clean up:
```sql
delete from public.tms_service_calendar where note = 'test all-routes';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260622000000_create_tms_service_calendar.sql
git commit -m "feat(booking): add tms_service_calendar (holiday/no-service exceptions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Calendar month-builder + gate (`lib/booking/calendar.ts`, TDD)

**Files:**
- Modify: `lib/booking/window.ts:8` (export `HORIZON_DAYS`)
- Create: `lib/booking/calendar.ts`
- Test: `lib/booking/calendar.test.ts`

**Interfaces:**
- Consumes: `addDays`, `bookableDates`, `dayStatus` from `./window`.
- Produces:
  - `type CalendarStatus = 'open'|'booked'|'locked'|'closed'|'holiday'|'no_service'|'out_of_horizon'`
  - `interface DayCell { date: string; status: CalendarStatus; note?: string | null }`
  - `interface CalendarException { kind: 'holiday'|'no_service'; note: string | null }`
  - `monthDays(monthStr: string): string[]`
  - `cellStatus(date: string, opts: { hasBooking: boolean; exception?: CalendarException; now?: Date }): CalendarStatus`
  - `buildMonthCells(monthStr: string, opts: { bookedDates: Set<string>; exceptions: Map<string, CalendarException>; now?: Date }): DayCell[]`
  - `loadExceptions(svc, routeId: string | null, from: string, to: string): Promise<Map<string, CalendarException>>`

- [ ] **Step 1: Export the horizon constant**

Modify `lib/booking/window.ts` line 8:
```ts
export const HORIZON_DAYS = 7; // bookable: tomorrow .. tomorrow+6
```

- [ ] **Step 2: Write the failing test**

Create `lib/booking/calendar.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { monthDays, cellStatus, buildMonthCells } from './calendar';

// Frozen clock: now + 5:30 IST => IST today = 2026-06-22, so bookable = 06-23..06-29.
const NOW = new Date('2026-06-22T03:00:00Z');

describe('monthDays', () => {
  it('lists every day of a 30-day month', () => {
    const d = monthDays('2026-06');
    expect(d).toHaveLength(30);
    expect(d[0]).toBe('2026-06-01');
    expect(d[29]).toBe('2026-06-30');
  });
  it('handles February (non-leap 2026)', () => {
    expect(monthDays('2026-02')).toHaveLength(28);
  });
});

describe('cellStatus', () => {
  it('an exception wins over everything (even a booking)', () => {
    expect(cellStatus('2026-06-24', { hasBooking: true, exception: { kind: 'no_service', note: 'strike' }, now: NOW })).toBe('no_service');
    expect(cellStatus('2026-06-25', { hasBooking: false, exception: { kind: 'holiday', note: null }, now: NOW })).toBe('holiday');
  });
  it('in-horizon, no booking => open; booked => booked', () => {
    expect(cellStatus('2026-06-23', { hasBooking: false, now: NOW })).toBe('open');
    expect(cellStatus('2026-06-23', { hasBooking: true, now: NOW })).toBe('booked');
  });
  it('out-of-horizon future => out_of_horizon; past booking => locked', () => {
    expect(cellStatus('2026-06-30', { hasBooking: false, now: NOW })).toBe('out_of_horizon');
    expect(cellStatus('2026-06-10', { hasBooking: true, now: NOW })).toBe('locked');
  });
});

describe('buildMonthCells', () => {
  it('merges bookings + exceptions across the month', () => {
    const cells = buildMonthCells('2026-06', {
      bookedDates: new Set(['2026-06-24']),
      exceptions: new Map([['2026-06-25', { kind: 'holiday', note: 'Test' }]]),
      now: NOW,
    });
    const by = (d: string) => cells.find((c) => c.date === d)!;
    expect(by('2026-06-23').status).toBe('open');
    expect(by('2026-06-24').status).toBe('booked');
    expect(by('2026-06-25').status).toBe('holiday');
    expect(by('2026-06-25').note).toBe('Test');
    expect(by('2026-06-22').status).toBe('out_of_horizon'); // today
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/booking/calendar.test.ts`
Expected: FAIL — `Failed to resolve import './calendar'`.

- [ ] **Step 4: Write the implementation**

Create `lib/booking/calendar.ts`:
```ts
/**
 * Month-grid view model for the learner Schedule page, layered on the pure
 * window logic. Adds the admin service-calendar gate (holiday / no-service).
 * The builder is pure + unit-tested; loadExceptions wraps the DB for the API.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { bookableDates, dayStatus } from './window';

export type CalendarStatus =
  | 'open' | 'booked' | 'locked' | 'closed'
  | 'holiday' | 'no_service' | 'out_of_horizon';

export interface DayCell {
  date: string; // 'YYYY-MM-DD'
  status: CalendarStatus;
  note?: string | null;
}

export interface CalendarException {
  kind: 'holiday' | 'no_service';
  note: string | null;
}

/** Every 'YYYY-MM-DD' in a 'YYYY-MM' month, ascending. */
export function monthDays(monthStr: string): string[] {
  const [y, m] = monthStr.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${monthStr}-${String(d).padStart(2, '0')}`);
  return out;
}

/** Status for ONE date. A service-calendar exception wins over everything. */
export function cellStatus(
  date: string,
  opts: { hasBooking: boolean; exception?: CalendarException; now?: Date }
): CalendarStatus {
  if (opts.exception) return opts.exception.kind; // 'holiday' | 'no_service'
  const now = opts.now ?? new Date();
  if (!bookableDates(now).includes(date)) return opts.hasBooking ? 'locked' : 'out_of_horizon';
  const s = dayStatus(opts.hasBooking, date, now); // 'not_booked'|'booked'|'locked'|'closed'
  return s === 'not_booked' ? 'open' : s;
}

/** Build all cells for a month from the learner's bookings + the gate. */
export function buildMonthCells(
  monthStr: string,
  opts: { bookedDates: Set<string>; exceptions: Map<string, CalendarException>; now?: Date }
): DayCell[] {
  return monthDays(monthStr).map((date) => {
    const exception = opts.exceptions.get(date);
    return {
      date,
      status: cellStatus(date, { hasBooking: opts.bookedDates.has(date), exception, now: opts.now }),
      note: exception?.note ?? null,
    };
  });
}

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01';
}

/** Load service-calendar exceptions for [from,to] affecting a route (or all). */
export async function loadExceptions(
  svc: SupabaseClient,
  routeId: string | null,
  from: string,
  to: string
): Promise<Map<string, CalendarException>> {
  const map = new Map<string, CalendarException>();
  let q = svc
    .from('tms_service_calendar')
    .select('exception_date, route_id, kind, note')
    .gte('exception_date', from)
    .lte('exception_date', to);
  q = routeId ? q.or(`route_id.is.null,route_id.eq.${routeId}`) : q.is('route_id', null);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return map;
    throw error;
  }
  type Row = { exception_date: string; route_id: string | null; kind: 'holiday' | 'no_service'; note: string | null };
  for (const row of (data ?? []) as Row[]) {
    const existing = map.get(row.exception_date);
    // a route-specific row wins over an all-routes row for the same date
    if (!existing || row.route_id) map.set(row.exception_date, { kind: row.kind, note: row.note });
  }
  return map;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/booking/calendar.test.ts`
Expected: PASS (3 suites, 7 assertions green).

- [ ] **Step 6: Type-check**

Run: `npm run type-check 2>&1 | grep -E "lib/booking/(calendar|window)" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 7: Commit**

```bash
git add lib/booking/window.ts lib/booking/calendar.ts lib/booking/calendar.test.ts
git commit -m "feat(booking): month-calendar builder + service-calendar gate (pure, tested)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Booked-stop grouper (`lib/booking/optimize.ts`, TDD)

**Files:**
- Create: `lib/booking/optimize.ts`
- Test: `lib/booking/optimize.test.ts`

**Interfaces:**
- Produces:
  - `interface BookedStop { stopId: string; name: string; sequenceOrder: number | null; booked: number }`
  - `groupBookedStops(bookings: { stop_id: string | null }[], stops: { id: string; stop_name: string; sequence_order: number | null }[]): BookedStop[]`
  - `bookedStopsForRouteDate(svc, routeId: string, date: string): Promise<BookedStop[]>` (consumed by Plan 2's driver/boarding rosters)

- [ ] **Step 1: Write the failing test**

Create `lib/booking/optimize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { groupBookedStops } from './optimize';

const STOPS = [
  { id: 'a', stop_name: 'Alpha', sequence_order: 1 },
  { id: 'b', stop_name: 'Bravo', sequence_order: 2 },
  { id: 'c', stop_name: 'Charlie', sequence_order: 3 },
];

describe('groupBookedStops', () => {
  it('keeps only stops with >=1 booking, ordered by sequence, with counts', () => {
    const out = groupBookedStops(
      [{ stop_id: 'c' }, { stop_id: 'a' }, { stop_id: 'a' }],
      STOPS
    );
    expect(out.map((s) => s.name)).toEqual(['Alpha', 'Charlie']); // Bravo dropped (empty)
    expect(out[0].booked).toBe(2);
    expect(out[1].booked).toBe(1);
  });
  it('ignores bookings with a null stop_id', () => {
    const out = groupBookedStops([{ stop_id: null }, { stop_id: 'b' }], STOPS);
    expect(out.map((s) => s.name)).toEqual(['Bravo']);
  });
  it('returns empty when there are no bookings', () => {
    expect(groupBookedStops([], STOPS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/booking/optimize.test.ts`
Expected: FAIL — `Failed to resolve import './optimize'`.

- [ ] **Step 3: Write the implementation**

Create `lib/booking/optimize.ts`:
```ts
/**
 * Booking-aware route optimization, Phase A: collapse a route+date's bookings
 * to the ordered list of stops that actually have passengers (empty stops are
 * dropped). Pure grouper is unit-tested; the DB wrapper feeds the driver +
 * boarding rosters (Plan 2).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BookedStop {
  stopId: string;
  name: string;
  sequenceOrder: number | null;
  booked: number;
}

/** Pure: stops with >=1 booking, in sequence order, with per-stop counts. */
export function groupBookedStops(
  bookings: { stop_id: string | null }[],
  stops: { id: string; stop_name: string; sequence_order: number | null }[]
): BookedStop[] {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    if (!b.stop_id) continue;
    counts.set(b.stop_id, (counts.get(b.stop_id) ?? 0) + 1);
  }
  return stops
    .filter((s) => counts.has(s.id))
    .map((s) => ({ stopId: s.id, name: s.stop_name, sequenceOrder: s.sequence_order, booked: counts.get(s.id)! }))
    .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
}

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01';
}

/** DB wrapper: a route's stops that have >=1 booking on a date, ordered. */
export async function bookedStopsForRouteDate(
  svc: SupabaseClient,
  routeId: string,
  date: string
): Promise<BookedStop[]> {
  const bk = await svc
    .from('tms_booking')
    .select('stop_id')
    .eq('route_id', routeId)
    .eq('travel_date', date)
    .eq('status', 'booked');
  if (bk.error) {
    if (isMissingTable(bk.error)) return [];
    throw bk.error;
  }
  const st = await svc
    .from('tms_route_stop')
    .select('id, stop_name, sequence_order')
    .eq('route_id', routeId);
  if (st.error) throw st.error;
  return groupBookedStops(
    (bk.data ?? []) as { stop_id: string | null }[],
    (st.data ?? []) as { id: string; stop_name: string; sequence_order: number | null }[]
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/booking/optimize.test.ts`
Expected: PASS (3 assertions green).

- [ ] **Step 5: Commit**

```bash
git add lib/booking/optimize.ts lib/booking/optimize.test.ts
git commit -m "feat(booking): booked-stop grouper for route optimization phase A (pure, tested)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Student API — `?month=` board + server-side gate

**Files:**
- Modify: `app/api/student/bookings/route.ts` (add a `?month=` branch to GET; gate the book path)

**Interfaces:**
- Consumes: `buildMonthCells`, `loadExceptions` from `@/lib/booking/calendar`; existing `cutoffFor`, `bookableDates`.
- Produces: `GET /api/student/bookings?month=YYYY-MM` →
  `{ success, data: { routeLabel, stopLabel, assigned, month, cells: Array<{date,status,note,cutoff:string|null}> } }`.
  No-param GET keeps its existing 7-day `{ days }` shape (back-compat).

- [ ] **Step 1: Add imports**

In `app/api/student/bookings/route.ts`, extend the booking imports (line 7) and add the calendar import:
```ts
import { bookableDates, cutoffFor, dayStatus, isBookingOpen, isCancelable } from '@/lib/booking/window';
import { buildMonthCells, loadExceptions, type CalendarException } from '@/lib/booking/calendar';
```

- [ ] **Step 2: Branch GET on `?month=`**

Replace the body of `getBoard` from the `const dates = bookableDates();` line down to the existing `return NextResponse.json({ success: true, data: { routeLabel, stopLabel, assigned: ..., days } });` with a month-aware version. Insert this block right after `routeLabel`/`stopLabel` are resolved (keep that resolution code unchanged):

```ts
    const svc2 = svc; // svc already created above
    const monthParam = new URL(_request.url).searchParams.get('month');

    if (monthParam) {
      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
      }
      const from = `${monthParam}-01`;
      const to = `${monthParam}-${String(new Date(Date.UTC(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;

      const bookedDates = new Set<string>();
      const mres = await svc2
        .from('tms_booking')
        .select('travel_date')
        .eq('learner_id', learner.id)
        .eq('status', 'booked')
        .gte('travel_date', from)
        .lte('travel_date', to);
      if (mres.error && (mres.error as { code?: string }).code !== '42P01') {
        console.error('student/bookings GET month error:', mres.error);
        return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
      }
      for (const row of (mres.data ?? []) as { travel_date: string }[]) bookedDates.add(row.travel_date);

      const exceptions: Map<string, CalendarException> = await loadExceptions(
        svc2, learner.transport_route_id ?? null, from, to
      );
      const cells = buildMonthCells(monthParam, { bookedDates, exceptions }).map((c) => ({
        ...c,
        cutoff: c.status === 'open' || c.status === 'booked' ? cutoffFor(c.date).toISOString() : null,
      }));

      return NextResponse.json({
        success: true,
        data: { routeLabel, stopLabel, assigned: !!learner.transport_route_id, month: monthParam, cells },
      });
    }
```

Leave the existing 7-day `dates`/`days` code below it intact as the no-param fallback. (`_request` is already a parameter; if it is named `_request`, read `new URL(_request.url)` as written.)

- [ ] **Step 3: Gate the book path on the service calendar**

In `mutate`, inside the `if (action === 'book')` block, immediately after the `if (!isBookingOpen(travelDate)) {...}` guard, add a server-side exception check (defense-in-depth so a blocked date can't be booked by a direct POST):

```ts
      const blocking = await loadExceptions(svc, learner.transport_route_id, travelDate, travelDate);
      if (blocking.has(travelDate)) {
        return NextResponse.json({ error: 'That date is a holiday / no-service day' }, { status: 409 });
      }
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check 2>&1 | grep -E "api/student/bookings" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 5: Probe the route (unauth → redirect/401)**

Run (dev server running): `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/student/bookings?month=2026-06"`
Expected: `307` (redirect to login) or `401` — NOT `500`. (Authed behavior the user verifies in-browser.)

- [ ] **Step 6: Commit**

```bash
git add app/api/student/bookings/route.ts
git commit -m "feat(booking): student board ?month= calendar branch + service-calendar gate on book

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `MonthCalendar` presentational component

**Files:**
- Create: `components/student/month-calendar.tsx`

**Interfaces:**
- Consumes: `DayCell`, `CalendarStatus` from `@/lib/booking/calendar`.
- Produces: default export `MonthCalendar` with props
  `{ month: string; cells: DayCell[]; onPrev(): void; onNext(): void; onSelect(cell: DayCell): void; busy?: boolean }`.

- [ ] **Step 1: Write the component**

Create `components/student/month-calendar.tsx`:
```tsx
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DayCell, CalendarStatus } from '@/lib/booking/calendar';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Tailwind classes per status (mobile-first; explicit dark: for colored tints).
const CELL: Record<CalendarStatus, string> = {
  open: 'bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50',
  booked: 'bg-green-600 text-white dark:bg-green-600',
  locked: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/50',
  closed: 'bg-gray-50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500',
  holiday: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50',
  no_service: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50',
  out_of_horizon: 'bg-transparent text-gray-300 dark:text-gray-600',
};

const ACTIONABLE: CalendarStatus[] = ['open', 'booked'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function MonthCalendar({
  month, cells, onPrev, onNext, onSelect, busy,
}: {
  month: string;
  cells: DayCell[];
  onPrev: () => void;
  onNext: () => void;
  onSelect: (cell: DayCell) => void;
  busy?: boolean;
}) {
  // Leading blanks so day 1 lands under its weekday column.
  const firstDow = cells.length ? new Date(cells[0].date + 'T00:00:00Z').getUTCDay() : 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onPrev} aria-label="Previous month"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{monthLabel(month)}</h2>
        <button type="button" onClick={onNext} aria-label="Next month"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-gray-400 dark:text-gray-500">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`blank-${i}`} />)}
        {cells.map((cell) => {
          const day = Number(cell.date.slice(8));
          const actionable = ACTIONABLE.includes(cell.status) && !busy;
          return (
            <button
              key={cell.date}
              type="button"
              disabled={!actionable}
              onClick={() => onSelect(cell)}
              className={cn(
                'aspect-square rounded-lg text-sm font-medium transition-colors',
                CELL[cell.status],
                actionable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        <Legend className="bg-green-600" label="Booked" />
        <Legend className="bg-green-200 dark:bg-green-900" label="Open" />
        <Legend className="bg-blue-200 dark:bg-blue-900" label="Confirmed" />
        <Legend className="bg-amber-200 dark:bg-amber-900" label="Holiday" />
        <Legend className="bg-red-200 dark:bg-red-900" label="No service" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-full', className)} />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check 2>&1 | grep -E "components/student/month-calendar" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 3: Commit**

```bash
git add components/student/month-calendar.tsx
git commit -m "feat(student): MonthCalendar grid component (statuses + legend, mobile-first)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Student page → calendar + day sheet + relabel

**Files:**
- Modify: `app/student/bookings/page.tsx` (full rewrite of the page body)
- Modify: `lib/student/navigation.ts:22-23` (nav label)

**Interfaces:**
- Consumes: `MonthCalendar` (Task 5), `GET ?month=` (Task 4), existing `POST /api/student/bookings`.

- [ ] **Step 1: Relabel the nav item**

In `lib/student/navigation.ts`, change the Book Bus entry:
```ts
  { name: 'Schedule', href: '/student/bookings', icon: CalendarCheck },
```
(Keep the `href` as `/student/bookings` per the confirmed relabel-only decision; the `Route` import line already imports `CalendarCheck`.)

- [ ] **Step 2: Rewrite the page to render the calendar**

Replace the entire contents of `app/student/bookings/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import MonthCalendar from '@/components/student/month-calendar';
import type { DayCell } from '@/lib/booking/calendar';

interface MonthBoard {
  routeLabel: string | null;
  stopLabel: string | null;
  assigned: boolean;
  month: string;
  cells: (DayCell & { cutoff: string | null })[];
}

// Current month in IST ('YYYY-MM').
function istMonth(): string {
  return new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 7);
}
function addMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const fmtCutoff = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function fetchMonth(month: string): Promise<MonthBoard> {
  const res = await fetch(`/api/student/bookings?month=${month}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load schedule');
  return (await res.json()).data as MonthBoard;
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

export default function StudentSchedulePage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(istMonth());
  const [selected, setSelected] = useState<(DayCell & { cutoff: string | null }) | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-schedule', month],
    queryFn: () => fetchMonth(month),
  });

  const mut = useMutation({
    mutationFn: mutateBooking,
    onSuccess: (d) => {
      toast.success(d.status === 'booked' ? 'Bus booked' : 'Booking cancelled');
      qc.invalidateQueries({ queryKey: ['student-schedule'] });
      qc.invalidateQueries({ queryKey: ['student-pass'] });
      setSelected(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Action failed'),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load your schedule.</div>;
  if (!data) return null;

  if (!data.assigned) {
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
    <div className="mx-auto w-full max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My Schedule</h1>
        <p className="text-sm text-muted-foreground">{data.routeLabel ?? '—'} · Stop: {data.stopLabel ?? '—'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Book before 6 PM the day before. One booking covers both trips.</p>
      </div>

      <MonthCalendar
        month={data.month}
        cells={data.cells}
        onPrev={() => setMonth((m) => addMonth(m, -1))}
        onNext={() => setMonth((m) => addMonth(m, 1))}
        onSelect={(c) => setSelected(c as DayCell & { cutoff: string | null })}
        busy={mut.isPending}
      />

      {selected && (
        <DaySheet
          cell={selected}
          pending={mut.isPending}
          onClose={() => setSelected(null)}
          onBook={() => mut.mutate({ travel_date: selected.date, action: 'book' })}
          onCancel={() => mut.mutate({ travel_date: selected.date, action: 'cancel' })}
        />
      )}
    </div>
  );
}

function DaySheet({
  cell, pending, onClose, onBook, onCancel,
}: {
  cell: DayCell & { cutoff: string | null };
  pending: boolean;
  onClose: () => void;
  onBook: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl dark:bg-gray-900 sm:rounded-2xl">
        <p className="text-base font-semibold text-gray-900 dark:text-white">{fmtDate(cell.date)}</p>
        {cell.cutoff && <p className="mt-1 text-xs text-muted-foreground">Closes {fmtCutoff(cell.cutoff)}</p>}
        {(cell.status === 'holiday' || cell.status === 'no_service') && (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            {cell.status === 'holiday' ? 'Holiday' : 'No service'}{cell.note ? ` — ${cell.note}` : ''}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          {cell.status === 'open' && (
            <Button className="flex-1" disabled={pending} onClick={onBook}>Book this day</Button>
          )}
          {cell.status === 'booked' && (
            <Button className="flex-1" variant="outline" disabled={pending} onClick={onCancel}>Cancel booking</Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check 2>&1 | grep -E "student/bookings/page|student/navigation" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 4: Probe + ask the user to verify visuals**

Run (dev server running): `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/student/bookings`
Expected: `307`/`401` unauth. Then the user logs in and confirms: calendar renders; a seeded holiday (insert via MCP `insert into tms_service_calendar(exception_date,kind,note) values ('<an in-horizon date>','holiday','Test')`) shows amber and is not tappable; tapping an open day books it; nav reads "Schedule"; title reads "My Schedule".

- [ ] **Step 5: Commit**

```bash
git add app/student/bookings/page.tsx lib/student/navigation.ts
git commit -m "feat(student): month-calendar Schedule page + day sheet; relabel Book Bus -> Schedule

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage (Plan 1 scope):** §6 table → Task 1; §7 window/builder → Task 2; §10 Phase A grouper → Task 3; §8 student `?month=` + book gate → Task 4; §9.1 calendar UI + relabel → Tasks 5–6. Admin manager (§9.2), driver/boarding (§9.3–9.4), admin bookings rebuild, and Phase B remain for **Plan 2**.
- **Placeholders:** none — every code step is complete.
- **Type consistency:** `DayCell`/`CalendarStatus`/`CalendarException` defined in Task 2 and consumed unchanged in Tasks 4–6; `BookedStop`/`groupBookedStops` defined in Task 3 for Plan 2; the API attaches `cutoff` as an extra field (typed inline as `DayCell & { cutoff: string|null }`), not on `DayCell` itself.

## Deferred to Plan 2 (cross-portal + management)

1. Admin service-calendar API (`/api/admin/service-calendar`) + `lib/service-calendar/fields.ts` + manager page + admin nav.
2. Admin bookings view rebuild (`/admin/bookings` → `tms_booking` via `/api/admin/bookings/list`) + nav.
3. Driver roster API + page (consumes `bookedStopsForRouteDate`).
4. Boarding roster: surface the booked-stop list.
5. Route-optimization Phase B (fleet consolidation) — documented in the spec, built later.
