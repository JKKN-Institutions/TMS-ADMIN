# Daily Bus Booking + Pass Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make learners book their bus the day before (by 6 PM IST the prior day); a confirmed booking is what unlocks the QR pass, permits the boarding scan, and puts the learner on the attendance roster — with a staff walk-up path when seats remain.

**Architecture:** A new `tms_booking` table holds one whole-day booking row per learner per date. A pure, unit-tested `lib/booking/window.ts` owns all IST cutoff/horizon math; a server-only `lib/booking/repo.ts` owns the booking/capacity queries. The same "does a `booked` row exist for this learner today?" check is enforced at three layers — the pass endpoint (UX), the scan endpoint (real enforcement), and the roster (the visible list). Existing endpoints are modified in place; everything follows the project's `withAuth` + `createServiceRoleClient` + copy-pasted `requirePerm` pattern.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Supabase (`@supabase/supabase-js` service-role client), React 19 + TanStack Query + react-hot-toast, `qrcode.react` / `html5-qrcode`, Vitest (added in Task 1 for the pure logic only).

## Global Constraints

- **Timezone:** all travel-date and cutoff math is **IST (UTC+05:30, no DST)**. Never use `new Date().toISOString().slice(0,10)` for a travel date — use `istToday()` from `lib/booking/window.ts`.
- **Cutoff:** booking/cancellation for a travel date closes at **18:00 IST on the day before**.
- **Horizon:** bookable dates are **tomorrow … tomorrow+6** (7 days), each still bound by its own cutoff.
- **Granularity:** one booking per learner per date (`UNIQUE(learner_id, travel_date)`); it authorizes **both** onward and return.
- **Identity:** student endpoints derive the learner from the session via `getLearnerRowForUser(auth)` — **never** trust a learner id from the request body.
- **Permissions:** student self endpoints check `TMS_PERMISSIONS.BOOKINGS_SELF` (`tms.bookings.self`); scan/walk-up uses `ATTENDANCE_SCAN`; roster uses `ATTENDANCE_SCAN`; admin summary/reminders use `BOOKINGS_VIEW` / `BOOKINGS_MANAGE`. Super admins bypass via `auth.isSuperAdmin`.
- **Table prefix `tms_`**, audit columns `created_at/updated_at/created_by/updated_by`, and a `trg_<table>_updated_at` trigger calling `public.tms_set_updated_at()`.
- **API JSON shapes (match existing):** student/admin routes return `{ success: true, data }` / `{ error }`; the boarding scan route returns `{ ok: true, ... }` / `{ ok: false, error }`.
- **Migrations** live in `supabase/migrations/` AND are applied to the live DB via `mcp__supabase__apply_migration` (the project Supabase MCP targets the real app DB `kvizhngldtiuufknvehv`).
- **Verification reality:** there is no pre-existing test runner; ESLint is broken. Pure logic is verified with **Vitest** (Task 1); everything else is verified with **`npm run type-check`** (tsc) + **dev-server curl probes** (auth-gated routes return 401/403/redirect unauthenticated, which proves they compile and route correctly) + **manual UI checks in the user's authenticated browser** (the agent's browser is unauthenticated, so it cannot drive the gated UI).
- **Commits:** commit by explicit path at the end of each task. Do NOT `git add -A` / `git add .` — parallel sessions commit to `main`; verify `git rev-parse --short HEAD` hasn't moved unexpectedly and stage only this feature's files. End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

### Task 1: IST booking-window logic (`lib/booking/window.ts`) + Vitest

**Files:**
- Create: `lib/booking/window.ts`
- Create: `lib/booking/window.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` scripts + `vitest` devDependency)

**Interfaces:**
- Produces:
  - `type DayStatus = 'not_booked' | 'booked' | 'locked' | 'closed'`
  - `istToday(now?: Date): string` — `YYYY-MM-DD` for the instant in IST.
  - `addDays(dateStr: string, days: number): string`
  - `cutoffFor(travelDate: string): Date` — the 18:00-IST-prior-day instant.
  - `bookableDates(now?: Date): string[]` — 7 ascending `YYYY-MM-DD` (tomorrow…+6).
  - `isBookingOpen(travelDate: string, now?: Date): boolean`
  - `isCancelable(travelDate: string, now?: Date): boolean`
  - `dayStatus(hasBooking: boolean, travelDate: string, now?: Date): DayStatus`

- [ ] **Step 1: Add Vitest as a dev dependency**

Run: `npm install -D vitest`
Expected: `vitest` appears under `devDependencies` in `package.json`; exit code 0.

- [ ] **Step 2: Add test scripts to `package.json`**

In `package.json`, add these two lines to the `"scripts"` object (after `"type-check": "tsc --noEmit",`):

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

// Scoped to pure logic only — the rest of the app is verified via type-check +
// dev-server probes (see the plan's Global Constraints).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `lib/booking/window.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  istToday,
  addDays,
  cutoffFor,
  bookableDates,
  isBookingOpen,
  isCancelable,
  dayStatus,
} from './window';

describe('istToday', () => {
  it('rolls to the next IST day late in UTC evening', () => {
    // 2026-06-20T20:00Z == 2026-06-21T01:30 IST
    expect(istToday(new Date('2026-06-20T20:00:00Z'))).toBe('2026-06-21');
  });
  it('stays on the same IST day mid-morning UTC', () => {
    expect(istToday(new Date('2026-06-20T06:00:00Z'))).toBe('2026-06-20');
  });
});

describe('addDays', () => {
  it('rolls over a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
  });
  it('adds within a month', () => {
    expect(addDays('2026-06-20', 7)).toBe('2026-06-27');
  });
});

describe('cutoffFor', () => {
  it('is 18:00 IST on the prior day (== 12:30 UTC)', () => {
    expect(cutoffFor('2026-06-22').toISOString()).toBe('2026-06-21T12:30:00.000Z');
  });
});

describe('bookableDates', () => {
  it('returns tomorrow..+6 in IST', () => {
    // istToday == 2026-06-20
    const dates = bookableDates(new Date('2026-06-20T06:00:00Z'));
    expect(dates).toEqual([
      '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24',
      '2026-06-25', '2026-06-26', '2026-06-27',
    ]);
  });
});

describe('isBookingOpen', () => {
  it('is open just before the cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T12:29:00Z'))).toBe(true);
  });
  it('is closed just after the cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T12:31:00Z'))).toBe(false);
  });
  it('rejects a date beyond the 7-day horizon', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-20T06:00:00Z'))).toBe(false);
  });
  it('rejects today and past dates', () => {
    expect(isBookingOpen('2026-06-20', new Date('2026-06-20T06:00:00Z'))).toBe(false);
  });
});

describe('isCancelable', () => {
  it('mirrors isBookingOpen', () => {
    expect(isCancelable('2026-06-22', new Date('2026-06-21T12:29:00Z'))).toBe(true);
    expect(isCancelable('2026-06-22', new Date('2026-06-21T12:31:00Z'))).toBe(false);
  });
});

describe('dayStatus', () => {
  const before = new Date('2026-06-21T12:29:00Z'); // before 2026-06-22 cutoff
  const after = new Date('2026-06-21T12:31:00Z');  // after  2026-06-22 cutoff
  it('booked + open => booked', () => expect(dayStatus(true, '2026-06-22', before)).toBe('booked'));
  it('booked + closed => locked', () => expect(dayStatus(true, '2026-06-22', after)).toBe('locked'));
  it('no booking + open => not_booked', () => expect(dayStatus(false, '2026-06-22', before)).toBe('not_booked'));
  it('no booking + closed => closed', () => expect(dayStatus(false, '2026-06-22', after)).toBe('closed'));
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./window"` / module not found.

- [ ] **Step 6: Implement `lib/booking/window.ts`**

```ts
/**
 * Pure IST booking-window logic. India has no DST, so IST is a fixed +5:30
 * offset and all math is deterministic integer arithmetic on UTC ms — no
 * timezone library, fully unit-testable. All `travelDate` values are 'YYYY-MM-DD'.
 */
const IST_OFFSET_MIN = 5 * 60 + 30; // +05:30
const CUTOFF_HOUR_IST = 18; // 18:00 IST on the prior day
const HORIZON_DAYS = 7; // bookable: tomorrow .. tomorrow+6

export type DayStatus = 'not_booked' | 'booked' | 'locked' | 'closed';

/** 'YYYY-MM-DD' for the given instant rendered in IST. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Calendar-safe add of whole days to a 'YYYY-MM-DD' string. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The booking cutoff instant for a travel date = 18:00 IST on the prior day.
 * travelDate 00:00 IST in UTC = Date.UTC(...) - 5:30h; minus 6h => prior 18:00 IST.
 */
export function cutoffFor(travelDate: string): Date {
  const [y, m, d] = travelDate.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) - (IST_OFFSET_MIN + (24 - CUTOFF_HOUR_IST) * 60) * 60_000;
  return new Date(ms);
}

/** The 7 ascending bookable dates (tomorrow..+6) relative to IST today. */
export function bookableDates(now: Date = new Date()): string[] {
  const today = istToday(now);
  return Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i + 1));
}

export function isBookingOpen(travelDate: string, now: Date = new Date()): boolean {
  if (!bookableDates(now).includes(travelDate)) return false;
  return now.getTime() < cutoffFor(travelDate).getTime();
}

/** Cancellation is allowed under the same condition as booking (free until cutoff). */
export function isCancelable(travelDate: string, now: Date = new Date()): boolean {
  return isBookingOpen(travelDate, now);
}

export function dayStatus(hasBooking: boolean, travelDate: string, now: Date = new Date()): DayStatus {
  const open = isBookingOpen(travelDate, now);
  if (hasBooking) return open ? 'booked' : 'locked';
  return open ? 'not_booked' : 'closed';
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors introduced by the new files.

- [ ] **Step 9: Commit**

```bash
git add lib/booking/window.ts lib/booking/window.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(booking): IST booking-window logic + vitest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Schema migration + permission constant

**Files:**
- Create: `supabase/migrations/20260620100000_create_tms_booking.sql`
- Modify: `lib/constants/tms-permissions.ts` (add `BOOKINGS_SELF`)

**Interfaces:**
- Produces: table `public.tms_booking`; column `public.tms_attendance.is_walk_up boolean`; permission key `tms.bookings.self` on the `student` role; constant `TMS_PERMISSIONS.BOOKINGS_SELF`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260620100000_create_tms_booking.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- tms_booking: per-learner, per-day whole-day travel booking.
--
-- One booking row (UNIQUE per learner+date) authorizes BOTH the onward and return
-- scans for that date. A learner with no 'booked' row for today cannot pull a
-- boarding pass or be scanned (enforced in app code). Walk-ups (unbooked learners
-- boarded by staff when seats remain) are recorded on tms_attendance via the new
-- is_walk_up flag, NOT here.
--
-- Target: shared MyJKKN Supabase project (ref: kvizhngldtiuufknvehv). Additive only.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_booking (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners_profiles(id) on delete cascade,
  route_id uuid not null references public.tms_route(id),       -- snapshot of assignment at booking time
  stop_id uuid references public.tms_route_stop(id),            -- snapshot
  travel_date date not null,
  status text not null default 'booked' check (status in ('booked','cancelled')),
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (learner_id, travel_date)
);

create index if not exists idx_tms_booking_date_route on public.tms_booking(travel_date, route_id, status);
create index if not exists idx_tms_booking_learner_date on public.tms_booking(learner_id, travel_date);

drop trigger if exists trg_tms_booking_updated_at on public.tms_booking;
create trigger trg_tms_booking_updated_at
  before update on public.tms_booking
  for each row execute function public.tms_set_updated_at();

alter table public.tms_booking enable row level security;
-- Writes go through the service-role client (RLS bypassed); learners may read their own.
drop policy if exists tms_booking_learner_select on public.tms_booking;
create policy tms_booking_learner_select on public.tms_booking
  for select using (
    learner_id in (select lp.id from public.learners_profiles lp where lp.profile_id = auth.uid())
  );

-- Walk-up flag on attendance (booked-and-present vs walk-up reporting).
alter table public.tms_attendance
  add column if not exists is_walk_up boolean not null default false;

-- Grant the learner self-booking permission to the existing student role.
update public.custom_roles
set permissions = permissions || '{"tms.bookings.self": true}'::jsonb,
    updated_at = now()
where role_key = 'student'
  and not (permissions ? 'tms.bookings.self');
```

- [ ] **Step 2: Apply the migration to the live DB**

Use the `mcp__supabase__apply_migration` tool with name `create_tms_booking` and the exact SQL from Step 1.
Expected: success, no error.

- [ ] **Step 3: Verify the schema landed**

Use `mcp__supabase__execute_sql` with:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'tms_booking' order by ordinal_position;
select column_name from information_schema.columns
where table_name = 'tms_attendance' and column_name = 'is_walk_up';
```

Expected: the `tms_booking` columns listed; `is_walk_up` present on `tms_attendance`.

- [ ] **Step 4: Add the permission constant**

In `lib/constants/tms-permissions.ts`, inside the `BOOKINGS_*` group (after line `BOOKINGS_MANAGE: 'tms.bookings.manage',`), add:

```ts
  BOOKINGS_SELF: 'tms.bookings.self',
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260620100000_create_tms_booking.sql lib/constants/tms-permissions.ts
git commit -m "feat(booking): tms_booking table + is_walk_up + bookings.self perm

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Booking repository helpers (`lib/booking/repo.ts`)

**Files:**
- Create: `lib/booking/repo.ts`

**Interfaces:**
- Consumes: `tms_booking`, `tms_route`, `tms_vehicle`, `tms_attendance` (Task 2).
- Produces (all take a service-role `SupabaseClient` as the first arg):
  - `hasBookingForDate(svc, learnerId: string, date: string): Promise<boolean>`
  - `bookedCount(svc, routeId: string, date: string): Promise<number>`
  - `walkUpCount(svc, routeId: string, date: string): Promise<number>`
  - `routeCapacity(svc, routeId: string): Promise<number>`
  - `seatsRemaining(svc, routeId: string, date: string): Promise<number>`

- [ ] **Step 1: Implement `lib/booking/repo.ts`**

```ts
/**
 * Server-only booking + capacity queries. Pass in the caller's service-role
 * client (createServiceRoleClient). These power the three enforcement layers
 * (pass, scan, roster) and the admin counts. The 42P01 guard lets these return
 * a safe default if the table is somehow absent (un-migrated env => passes stay
 * locked rather than throwing).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01';
}

/** True if the learner has an active ('booked') booking for the given date. */
export async function hasBookingForDate(
  svc: SupabaseClient,
  learnerId: string,
  date: string
): Promise<boolean> {
  const { data, error } = await svc
    .from('tms_booking')
    .select('id')
    .eq('learner_id', learnerId)
    .eq('travel_date', date)
    .eq('status', 'booked')
    .maybeSingle();
  if (error && !isMissingTable(error)) throw error;
  return !!data;
}

/** Count of active bookings for a route on a date. */
export async function bookedCount(svc: SupabaseClient, routeId: string, date: string): Promise<number> {
  const { count, error } = await svc
    .from('tms_booking')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', routeId)
    .eq('travel_date', date)
    .eq('status', 'booked');
  if (error && !isMissingTable(error)) throw error;
  return count ?? 0;
}

/** Count of onward walk-up attendance rows for a route on a date (seat accounting). */
export async function walkUpCount(svc: SupabaseClient, routeId: string, date: string): Promise<number> {
  const { count, error } = await svc
    .from('tms_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', routeId)
    .eq('trip_date', date)
    .eq('is_walk_up', true)
    .eq('direction', 'onward');
  if (error && !isMissingTable(error)) throw error;
  return count ?? 0;
}

/** Seat capacity: the assigned vehicle's capacity, falling back to the route's. */
export async function routeCapacity(svc: SupabaseClient, routeId: string): Promise<number> {
  const { data: route } = await svc
    .from('tms_route')
    .select('total_capacity, vehicle_id')
    .eq('id', routeId)
    .maybeSingle();
  if (!route) return 0;
  if (route.vehicle_id) {
    const { data: v } = await svc
      .from('tms_vehicle')
      .select('capacity')
      .eq('id', route.vehicle_id)
      .maybeSingle();
    if (v && typeof v.capacity === 'number' && v.capacity > 0) return v.capacity;
  }
  return typeof route.total_capacity === 'number' ? route.total_capacity : 0;
}

/** Remaining seats = capacity − active bookings − onward walk-ups already added. */
export async function seatsRemaining(svc: SupabaseClient, routeId: string, date: string): Promise<number> {
  const [capacity, booked, walkUps] = await Promise.all([
    routeCapacity(svc, routeId),
    bookedCount(svc, routeId, date),
    walkUpCount(svc, routeId, date),
  ]);
  return capacity - booked - walkUps;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/booking/repo.ts
git commit -m "feat(booking): server-only booking + capacity repo helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Student bookings API (`GET` board + `POST` book/cancel)

**Files:**
- Create: `app/api/student/bookings/route.ts`

**Interfaces:**
- Consumes: `withAuth`, `AuthContext`, `createServiceRoleClient`, `getLearnerRowForUser`, `loadPassengerRefs`, `TMS_PERMISSIONS.BOOKINGS_SELF`, and from `lib/booking/window`: `bookableDates`, `cutoffFor`, `dayStatus`, `isBookingOpen`, `isCancelable`.
- Produces:
  - `GET /api/student/bookings` → `{ success, data: { routeLabel, stopLabel, assigned, days: Array<{ date: string; status: DayStatus; cutoff: string }> } }`
  - `POST /api/student/bookings` body `{ travel_date: string; action: 'book' | 'cancel' }` → `{ success: true, data: { travel_date, status } }` or `{ error }` with 4xx.

- [ ] **Step 1: Implement `app/api/student/bookings/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookableDates, cutoffFor, dayStatus, isBookingOpen, isCancelable } from '@/lib/booking/window';

/**
 * Self-scoped daily booking board + book/cancel. The learner (and their route/stop)
 * are ALWAYS derived from the session — the body only carries the date + action.
 * Whole-day: one booking per learner per date authorizes both directions.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getBoard(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_SELF))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const learner = await getLearnerRowForUser(auth);
    if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });

    const dates = bookableDates();
    const svc = createServiceRoleClient();

    let routeLabel: string | null = null;
    let stopLabel: string | null = null;
    if (learner.transport_route_id) {
      const refs = await loadPassengerRefs(svc, {
        institutionIds: [],
        departmentIds: [],
        routeIds: [learner.transport_route_id],
        stopIds: [learner.transport_stop_id],
      });
      const r = refs.routes.get(learner.transport_route_id);
      routeLabel = r ? `${r.routeNumber} · ${r.routeName}` : null;
      stopLabel = learner.transport_stop_id ? refs.stops.get(learner.transport_stop_id) ?? null : null;
    }

    // Which of the horizon dates already have an active booking?
    const booked = new Set<string>();
    const res = await svc
      .from('tms_booking')
      .select('travel_date')
      .eq('learner_id', learner.id)
      .eq('status', 'booked')
      .in('travel_date', dates);
    if (!res.error) {
      for (const row of (res.data ?? []) as { travel_date: string }[]) booked.add(row.travel_date);
    }

    const days = dates.map((date) => ({
      date,
      status: dayStatus(booked.has(date), date),
      cutoff: cutoffFor(date).toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: { routeLabel, stopLabel, assigned: !!learner.transport_route_id, days },
    });
  } catch (e) {
    console.error('student/bookings GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function mutate(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_SELF))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const learner = await getLearnerRowForUser(auth);
    if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });
    if (!learner.transport_route_id) {
      return NextResponse.json({ error: 'No transport route is allocated to you yet' }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as { travel_date?: string; action?: string };
    const travelDate = String(body.travel_date ?? '');
    const action = body.action === 'cancel' ? 'cancel' : 'book';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
      return NextResponse.json({ error: 'A valid travel_date (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    if (action === 'book') {
      if (!isBookingOpen(travelDate)) {
        return NextResponse.json({ error: 'Booking is closed for that date' }, { status: 409 });
      }
      const up = await svc
        .from('tms_booking')
        .upsert(
          {
            learner_id: learner.id,
            route_id: learner.transport_route_id,
            stop_id: learner.transport_stop_id,
            travel_date: travelDate,
            status: 'booked',
            booked_at: new Date().toISOString(),
            cancelled_at: null,
            created_by: auth.userId,
            updated_by: auth.userId,
          },
          { onConflict: 'learner_id,travel_date' }
        )
        .select('id')
        .maybeSingle();
      if (up.error) {
        console.error('student/bookings book error:', up.error);
        return NextResponse.json({ error: 'Failed to book' }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: { travel_date: travelDate, status: 'booked' } });
    }

    // cancel
    if (!isCancelable(travelDate)) {
      return NextResponse.json({ error: 'Cancellation is closed for that date' }, { status: 409 });
    }
    const upd = await svc
      .from('tms_booking')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_by: auth.userId })
      .eq('learner_id', learner.id)
      .eq('travel_date', travelDate);
    if (upd.error) {
      console.error('student/bookings cancel error:', upd.error);
      return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { travel_date: travelDate, status: 'cancelled' } });
  } catch (e) {
    console.error('student/bookings POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getBoard(request, auth));
export const POST = withAuth((request, auth) => mutate(request, auth));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Probe the route compiles + is auth-gated**

Start the dev server (`npm run dev`) in a separate terminal, then run:

`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/student/bookings`
Expected: `401` (Unauthorized) — proves the route is wired and gated. (Full behavior is verified manually in Task 5 via the authenticated browser.)

- [ ] **Step 4: Commit**

```bash
git add app/api/student/bookings/route.ts
git commit -m "feat(booking): student bookings API (7-day board + book/cancel)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Student bookings page + navigation entry

**Files:**
- Create: `app/student/bookings/page.tsx`
- Modify: `lib/student/navigation.ts`

**Interfaces:**
- Consumes: `GET`/`POST /api/student/bookings` (Task 4), `DayStatus` (re-declared locally to avoid a server import), `@tanstack/react-query`, `react-hot-toast`, `@/components/ui/card`, `@/components/ui/button`.

- [ ] **Step 1: Add the nav entry**

In `lib/student/navigation.ts`:

(a) Add `CalendarCheck` to the lucide import line:

```ts
import {
  LayoutDashboard, Route, QrCode, ClipboardCheck, Receipt,
  MessageCircle, Bell, MapPin, User, Settings, CalendarCheck,
} from 'lucide-react';
```

(b) Insert a new item immediately BEFORE the `Boarding Pass` entry in `studentNavigation`:

```ts
  { name: 'Book Bus', shortName: 'Book', href: '/student/bookings', icon: CalendarCheck },
```

- [ ] **Step 2: Implement `app/student/bookings/page.tsx`**

```tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type DayStatus = 'not_booked' | 'booked' | 'locked' | 'closed';

interface Day { date: string; status: DayStatus; cutoff: string }
interface Board { routeLabel: string | null; stopLabel: string | null; assigned: boolean; days: Day[] }

async function fetchBoard(): Promise<Board> {
  const res = await fetch('/api/student/bookings', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load bookings');
  return (await res.json()).data as Board;
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

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtCutoff = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const STATUS_LABEL: Record<DayStatus, string> = {
  not_booked: 'Not booked',
  booked: 'Booked',
  locked: 'Confirmed',
  closed: 'Closed',
};
const STATUS_CLASS: Record<DayStatus, string> = {
  not_booked: 'text-muted-foreground',
  booked: 'text-green-700 dark:text-green-300',
  locked: 'text-blue-700 dark:text-blue-300',
  closed: 'text-muted-foreground',
};

export default function StudentBookingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['student-bookings'], queryFn: fetchBoard });

  const mut = useMutation({
    mutationFn: mutateBooking,
    onSuccess: (d) => {
      toast.success(d.status === 'booked' ? 'Bus booked' : 'Booking cancelled');
      qc.invalidateQueries({ queryKey: ['student-bookings'] });
      qc.invalidateQueries({ queryKey: ['student-pass'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Action failed'),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-destructive">Could not load your bookings.</div>;
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
        <h1 className="text-xl font-semibold">Book Bus</h1>
        <p className="text-sm text-muted-foreground">{data.routeLabel ?? '—'} · Stop: {data.stopLabel ?? '—'}</p>
        <p className="text-xs text-muted-foreground mt-1">Book before 6 PM the day before. One booking covers both trips.</p>
      </div>

      <div className="space-y-2">
        {data.days.map((d) => {
          const canBook = d.status === 'not_booked';
          const canCancel = d.status === 'booked';
          return (
            <Card key={d.date}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{fmtDate(d.date)}</p>
                  <p className={`text-xs ${STATUS_CLASS[d.status]}`}>{STATUS_LABEL[d.status]}</p>
                  {(canBook || canCancel) && (
                    <p className="text-[11px] text-muted-foreground">Closes {fmtCutoff(d.cutoff)}</p>
                  )}
                </div>
                {canBook && (
                  <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate({ travel_date: d.date, action: 'book' })}>
                    Book
                  </Button>
                )}
                {canCancel && (
                  <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate({ travel_date: d.date, action: 'cancel' })}>
                    Cancel
                  </Button>
                )}
                {(d.status === 'locked' || d.status === 'closed') && (
                  <span className="text-xs text-muted-foreground">{d.status === 'locked' ? 'Locked' : '—'}</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `@/components/ui/button` size prop differs, match the prop used elsewhere — confirm against `components/ui/button.tsx`.)

- [ ] **Step 4: Manual verification (user's authenticated browser)**

Ask the user to: open `/student/bookings`, confirm 7 day-cards appear with their route/stop; book tomorrow → toast "Bus booked", card flips to **Booked** with a Cancel button; cancel → flips back to **Not booked**. (The agent's browser is unauthenticated and cannot drive this — see Global Constraints.)

- [ ] **Step 5: Commit**

```bash
git add app/student/bookings/page.tsx lib/student/navigation.ts
git commit -m "feat(booking): student Book Bus page + nav entry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Gate the boarding pass on today's booking

**Files:**
- Modify: `app/api/student/boarding-pass/route.ts`

**Interfaces:**
- Consumes: `hasBookingForDate` (Task 3), `istToday` (Task 1).
- Produces: the existing `{ success, data: { hasPass, token?, ... } }` shape gains a `reason` field when locked: `{ hasPass: false, reason: 'not_booked' | 'no_route' }`.

- [ ] **Step 1: Add imports**

In `app/api/student/boarding-pass/route.ts`, add to the import block:

```ts
import { hasBookingForDate } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';
```

- [ ] **Step 2: Tag the no-route branch with a reason**

Replace:

```ts
    if (!learner.transport_route_id) {
      return NextResponse.json({ success: true, data: { hasPass: false } });
    }
```

with:

```ts
    if (!learner.transport_route_id) {
      return NextResponse.json({ success: true, data: { hasPass: false, reason: 'no_route' } });
    }
```

- [ ] **Step 3: Add the booking gate before issuing the token**

Immediately after the `if (!learner.transport_route_id) {...}` block and BEFORE `const svc = createServiceRoleClient();`, insert:

```ts
    const svcGate = createServiceRoleClient();
    const booked = await hasBookingForDate(svcGate, learner.id, istToday());
    if (!booked) {
      return NextResponse.json({ success: true, data: { hasPass: false, reason: 'not_booked' } });
    }
```

(The existing `const svc = createServiceRoleClient();` line below stays; it's fine to create the client twice, but to keep it tidy you may rename the later use to reuse `svcGate` — either is acceptable.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Update the pass page copy for the not-booked reason**

In `app/student/pass/page.tsx`, extend the `Pass` interface and the `!p.hasPass` branch so a not-booked learner is told to book. Replace the `Pass` interface:

```ts
interface Pass {
  hasPass: boolean;
  reason?: 'no_route' | 'not_booked';
  token?: string;
  name?: string;
  rollNumber?: string | null;
  routeLabel?: string | null;
  stopLabel?: string | null;
}
```

Replace the `if (!p.hasPass) { ... }` block body's `<CardContent>` text with a reason-aware message:

```tsx
  if (!p.hasPass) {
    const notBooked = p.reason === 'not_booked';
    return (
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader>
          <CardTitle>{notBooked ? 'No booking for today' : 'No boarding pass yet'}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <p>
            {notBooked
              ? 'Your boarding pass unlocks only on days you have booked a bus.'
              : 'Your boarding pass appears here once you have a transport route allocated.'}
          </p>
          {notBooked && (
            <a href="/student/bookings" className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Book a seat
            </a>
          )}
        </CardContent>
      </Card>
    );
  }
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification (user's browser)**

Ask the user to open `/student/pass` on a day with **no** booking → sees "No booking for today" + "Book a seat" link; then book today's... (note: today can't be booked — verify instead by booking *tomorrow*, then on that day the pass shows the QR). For an immediate check, temporarily book the nearest open date and confirm the pass unlocks once that date is "today" — or rely on Task 7's scan test which exercises the same gate server-side.

- [ ] **Step 8: Commit**

```bash
git add app/api/student/boarding-pass/route.ts app/student/pass/page.tsx
git commit -m "feat(booking): gate boarding pass on today's booking

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Enforce booking at scan + IST date + walk-up path

**Files:**
- Modify: `app/api/boarding/scan/route.ts`

**Interfaces:**
- Consumes: `hasBookingForDate`, `seatsRemaining` (Task 3), `istToday` (Task 1).
- Produces: the scan response gains failure reasons and a seats hint:
  - no booking & no walk-up → `{ ok: false, reason: 'not_booked', seatsRemaining: number, learner: { name, rollNumber } }` (HTTP 200, so the UI can offer walk-up)
  - walk-up requested but full → `{ ok: false, reason: 'bus_full' }` (HTTP 409)
  - success → `{ ok: true, learner, direction, walkUp: boolean }`

- [ ] **Step 1: Add imports**

In `app/api/boarding/scan/route.ts`, add to the import block:

```ts
import { hasBookingForDate, seatsRemaining } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';
```

- [ ] **Step 2: Read the walkUp flag from the body**

Replace:

```ts
    const body = (await request.json().catch(() => ({}))) as { token?: string; direction?: string };
```

with:

```ts
    const body = (await request.json().catch(() => ({}))) as { token?: string; direction?: string; walkUp?: boolean };
```

- [ ] **Step 3: Switch the trip date to IST and add the booking gate**

Replace:

```ts
    const today = new Date().toISOString().slice(0, 10);
    const up = await svc
      .from('tms_attendance')
      .upsert(
        {
          learner_id: learner.id,
          route_id: learner.transport_route_id,
          stop_id: learner.transport_stop_id,
          trip_date: today,
          direction,
          status: 'present',
          method: 'qr_scan',
          scanned_by: auth.userId,
          scanned_at: new Date().toISOString(),
        },
        { onConflict: 'learner_id,trip_date,direction' }
      )
      .select('id')
      .maybeSingle();
```

with:

```ts
    const today = istToday();
    const name = `${learner.first_name ?? ''} ${learner.last_name ?? ''}`.trim() || 'Learner';

    // Booking gate: a learner must have booked today, unless staff explicitly add
    // them as a walk-up (seats permitting).
    const booked = await hasBookingForDate(svc, learner.id, today);
    let isWalkUp = false;
    if (!booked) {
      if (!body.walkUp) {
        const seats = await seatsRemaining(svc, learner.transport_route_id, today);
        return NextResponse.json({
          ok: false,
          reason: 'not_booked',
          seatsRemaining: seats,
          learner: { name, rollNumber: learner.roll_number },
        });
      }
      const seats = await seatsRemaining(svc, learner.transport_route_id, today);
      if (seats <= 0) {
        return NextResponse.json({ ok: false, reason: 'bus_full', error: 'Bus is full' }, { status: 409 });
      }
      isWalkUp = true;
    }

    const up = await svc
      .from('tms_attendance')
      .upsert(
        {
          learner_id: learner.id,
          route_id: learner.transport_route_id,
          stop_id: learner.transport_stop_id,
          trip_date: today,
          direction,
          status: 'present',
          method: 'qr_scan',
          is_walk_up: isWalkUp,
          scanned_by: auth.userId,
          scanned_at: new Date().toISOString(),
        },
        { onConflict: 'learner_id,trip_date,direction' }
      )
      .select('id')
      .maybeSingle();
```

- [ ] **Step 4: Remove the now-duplicate `name` and return `walkUp`**

Further down, DELETE the line that re-declares `name` (it now lives above the upsert):

```ts
    const name = `${learner.first_name ?? ''} ${learner.last_name ?? ''}`.trim() || 'Learner';
```

Then change the success response to include `walkUp` and tweak the activity description:

```ts
    await logActivity(auth, request, {
      module: 'boarding',
      action: 'scan',
      entityType: 'tms_attendance',
      entityId: learner.id,
      entityLabel: learner.roll_number ?? name,
      description: `Scanned boarding pass for ${name} (${direction})${isWalkUp ? ' [walk-up]' : ''}`,
      metadata: { learnerId: learner.id, direction, rollNumber: learner.roll_number, walkUp: isWalkUp },
    });
    return NextResponse.json({
      ok: true,
      learner: { name, rollNumber: learner.roll_number },
      direction,
      walkUp: isWalkUp,
    });
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Probe the route compiles + is auth-gated**

With the dev server running:
`curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/boarding/scan -H "Content-Type: application/json" -d '{"token":"x"}'`
Expected: `401` (Unauthorized) — proves the route is wired/gated.

- [ ] **Step 7: Commit**

```bash
git add app/api/boarding/scan/route.ts
git commit -m "feat(booking): enforce booking at scan (IST) + walk-up path

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Scanner UI — offer walk-up when not booked

**Files:**
- Modify: `app/boarding/scan/page.tsx`

**Interfaces:**
- Consumes: `POST /api/boarding/scan` (Task 7) and its new `reason` / `seatsRemaining` / `walkUp` fields.

- [ ] **Step 1: Extend the result type and submit signature**

Replace the `ScanResult` type:

```ts
type ScanResult = {
  ok: boolean;
  learner?: { name: string; rollNumber: string | null };
  direction?: string;
  walkUp?: boolean;
  reason?: 'not_booked' | 'bus_full';
  seatsRemaining?: number;
  error?: string;
};
```

- [ ] **Step 2: Track the last token and pass walkUp through submit**

Add a ref next to the other refs (after `const busyRef = useRef(false);`):

```ts
  const lastTokenRef = useRef<string>('');
```

Replace the whole `submit` function with:

```ts
  async function submit(token: string, walkUp = false) {
    if (busyRef.current || !token) return;
    busyRef.current = true;
    lastTokenRef.current = token;
    try {
      const res = await fetch('/api/boarding/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, direction: directionRef.current, walkUp }),
      });
      const json = await res.json();
      setResult(json.ok ? json : { ok: false, ...json, error: json.error || json.reason || 'Scan failed' });
    } catch {
      setResult({ ok: false, error: 'Network error' });
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 1500);
    }
  }
```

- [ ] **Step 3: Render a walk-up action on the not_booked result**

Replace the result `<Card>` block (the one starting `{result && (`) with:

```tsx
      {result && (
        <Card className={result.ok ? 'border-green-400' : 'border-red-400'}>
          <CardContent className="py-4 text-sm space-y-2">
            {result.ok ? (
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">
                  ✓ Marked present ({result.direction}){result.walkUp ? ' · walk-up' : ''}
                </p>
                <p>
                  {result.learner?.name}
                  {result.learner?.rollNumber ? ` · ${result.learner.rollNumber}` : ''}
                </p>
              </div>
            ) : result.reason === 'not_booked' ? (
              <div className="space-y-2">
                <p className="text-amber-700 dark:text-amber-300">
                  ⚠ {result.learner?.name ?? 'Learner'} has no booking for today.
                </p>
                <p className="text-xs text-muted-foreground">
                  Seats remaining: {result.seatsRemaining ?? 0}
                </p>
                <Button
                  className="w-full"
                  disabled={(result.seatsRemaining ?? 0) <= 0}
                  onClick={() => submit(lastTokenRef.current, true)}
                >
                  {(result.seatsRemaining ?? 0) > 0 ? 'Add as walk-up' : 'Bus full'}
                </Button>
              </div>
            ) : (
              <p className="text-red-700 dark:text-red-300">✗ {result.error}</p>
            )}
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification (user's browser)**

Ask the user (a boarding-scan staff/super-admin) to: scan/enter the pass code of a learner with **no** booking today → result shows "no booking for today" + "Add as walk-up" with the seat count; click it (seats > 0) → flips to "✓ Marked present · walk-up". Then scan a booked learner → straight to "✓ Marked present".

- [ ] **Step 6: Commit**

```bash
git add app/boarding/scan/page.tsx
git commit -m "feat(booking): scanner offers walk-up when learner not booked

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Roster shows only booked learners (∪ walk-ups) + booked/capacity counts

**Files:**
- Modify: `app/api/boarding/routes/[routeId]/roster/route.ts`
- Modify: `app/boarding/routes/[routeId]/page.tsx` (summary chips only)

**Interfaces:**
- Consumes: `bookedCount`, `routeCapacity` (Task 3), `istToday` (Task 1).
- Produces: roster `counts` gains `booked: number` and `capacity: number`; the `students` array now contains only learners who booked today OR have an attendance row today (walk-ups), instead of every allocated learner.

- [ ] **Step 1: Add imports to the roster route**

In `app/api/boarding/routes/[routeId]/roster/route.ts`, add:

```ts
import { bookedCount, routeCapacity } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';
```

- [ ] **Step 2: Replace the student-fetch + attendance block with a booked∪attended union**

Replace this section:

```ts
    const { data: studs } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .eq('transport_route_id', routeId);
    const students = (studs ?? []) as LearnerLite[];

    // Today's attendance for this route, keyed by learner + direction.
    const today = new Date().toISOString().slice(0, 10);
    const byLearner: Record<string, { onward: string | null; return: string | null; last: string | null }> = {};
    const { data: att, error } = await svc
      .from('tms_attendance')
      .select('learner_id, direction, status, scanned_at')
      .eq('trip_date', today)
      .eq('route_id', routeId);
    if (!error && att) {
      for (const a of att as AttRow[]) {
        const e = (byLearner[a.learner_id] ??= { onward: null, return: null, last: null });
        if (a.direction === 'return') e.return = a.status; else e.onward = a.status;
        if (a.scanned_at && (!e.last || a.scanned_at > e.last)) e.last = a.scanned_at;
      }
    }
```

with:

```ts
    const today = istToday();

    // Roster = learners who BOOKED today ∪ learners with attendance today (walk-ups).
    const { data: bookings } = await svc
      .from('tms_booking')
      .select('learner_id')
      .eq('route_id', routeId)
      .eq('travel_date', today)
      .eq('status', 'booked');
    const rosterIds = new Set<string>(((bookings ?? []) as { learner_id: string }[]).map((b) => b.learner_id));

    // Today's attendance for this route, keyed by learner + direction.
    const byLearner: Record<string, { onward: string | null; return: string | null; last: string | null }> = {};
    const { data: att, error } = await svc
      .from('tms_attendance')
      .select('learner_id, direction, status, scanned_at')
      .eq('trip_date', today)
      .eq('route_id', routeId);
    if (!error && att) {
      for (const a of att as AttRow[]) {
        rosterIds.add(a.learner_id); // include walk-ups (attended but not booked)
        const e = (byLearner[a.learner_id] ??= { onward: null, return: null, last: null });
        if (a.direction === 'return') e.return = a.status; else e.onward = a.status;
        if (a.scanned_at && (!e.last || a.scanned_at > e.last)) e.last = a.scanned_at;
      }
    }

    const idList = Array.from(rosterIds);
    const { data: studs } = idList.length
      ? await svc
          .from('learners_profiles')
          .select('id, first_name, last_name, roll_number')
          .in('id', idList)
      : { data: [] as LearnerLite[] };
    const students = (studs ?? []) as LearnerLite[];
```

- [ ] **Step 3: Add booked + capacity to the response counts**

Replace the `return NextResponse.json({ ... })` block at the end of `getRoster` with:

```ts
    const [booked, capacity] = await Promise.all([
      bookedCount(svc, routeId, today),
      routeCapacity(svc, routeId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
        counts: {
          total: students.length,
          booked,
          capacity,
          present_onward: presentOnward,
          present_return: presentReturn,
        },
        students: rows,
      },
    });
```

- [ ] **Step 4: Type-check the route**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Surface booked/capacity on the roster page**

In `app/boarding/routes/[routeId]/page.tsx`, add state for the API counts. After `const [saving, setSaving] = useState(false);` add:

```tsx
  const [meta, setMeta] = useState<{ booked: number; capacity: number }>({ booked: 0, capacity: 0 });
```

In `load`, after `setStudents(json.data.students as RosterStudent[]);` add:

```tsx
      setMeta({ booked: json.data.counts?.booked ?? 0, capacity: json.data.counts?.capacity ?? 0 });
```

In the Summary section, add a chip before the `{counts.total} students` chip:

```tsx
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-blue-700 dark:text-blue-300">
          <Users className="h-4 w-4" /> {meta.booked} booked / {meta.capacity} seats
        </span>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification (user's browser)**

Ask the user (boarding staff) to open `/boarding/routes/<a route with bookings today>` → the list now contains only today's booked learners (+ any walk-ups already scanned), and the summary shows "N booked / M seats".

- [ ] **Step 8: Commit**

```bash
git add app/api/boarding/routes/[routeId]/roster/route.ts app/boarding/routes/[routeId]/page.tsx
git commit -m "feat(booking): roster lists booked learners + walk-ups, shows load

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Admin booking-load summary API

**Files:**
- Create: `app/api/admin/bookings/summary/route.ts`

**Interfaces:**
- Consumes: `withAuth`, `createServiceRoleClient`, `TMS_PERMISSIONS.BOOKINGS_VIEW`, `bookedCount`, `routeCapacity` (Task 3), `bookableDates`, `istToday` (Task 1).
- Produces: `GET /api/admin/bookings/summary?date=YYYY-MM-DD` → `{ success, data: { date, routes: Array<{ id, label, booked, capacity }> } }`. Defaults `date` to tomorrow when omitted/invalid.

- [ ] **Step 1: Implement `app/api/admin/bookings/summary/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookedCount, routeCapacity } from '@/lib/booking/repo';
import { bookableDates } from '@/lib/booking/window';

/**
 * Per-route booked-vs-capacity load for a date (default: tomorrow). Read-only
 * planning view — the "passive counts" optimization signal.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface RouteRow { id: string; route_number: string | null; route_name: string | null }

async function getSummary(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const qp = new URL(request.url).searchParams.get('date') ?? '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(qp) ? qp : bookableDates()[0]; // default tomorrow

    const svc = createServiceRoleClient();
    const { data: routes, error } = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .eq('status', 'active')
      .order('route_number', { ascending: true });
    if (error) {
      if ((error as { code?: string }).code === '42P01') {
        return NextResponse.json({ success: true, data: { date, routes: [] } });
      }
      console.error('admin/bookings/summary error:', error);
      return NextResponse.json({ error: 'Failed to load routes' }, { status: 500 });
    }

    const rows = await Promise.all(
      ((routes ?? []) as RouteRow[]).map(async (r) => ({
        id: r.id,
        label: `${r.route_number ?? '—'} · ${r.route_name ?? ''}`.trim(),
        booked: await bookedCount(svc, r.id, date),
        capacity: await routeCapacity(svc, r.id),
      }))
    );

    return NextResponse.json({ success: true, data: { date, routes: rows } });
  } catch (e) {
    console.error('admin/bookings/summary error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getSummary(request, auth));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Probe**

With the dev server running:
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/bookings/summary`
Expected: `401`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/bookings/summary/route.ts
git commit -m "feat(booking): admin booking-load summary API

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Reminder endpoint — notify learners with no booking for tomorrow

**Files:**
- Create: `app/api/admin/bookings/send-reminders/route.ts`

**Interfaces:**
- Consumes: `withAuth`, `createServiceRoleClient`, `TMS_PERMISSIONS.BOOKINGS_MANAGE`, `bookableDates` (Task 1). Inserts into the existing `notifications` table (columns observed: `title, body, category, priority, url, targeting jsonb, created_at, expires_at`).
- Produces: `POST /api/admin/bookings/send-reminders` → `{ success, data: { date, reminded: number } }`. Idempotent-ish: skips learners who already have a reminder for that date (matched by `targeting->>user_id` + `category` + a per-date marker in `url`).

- [ ] **Step 1: Implement `app/api/admin/bookings/send-reminders/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookableDates } from '@/lib/booking/window';

/**
 * Insert an in-app reminder for every transport learner who has NO booking for
 * tomorrow yet. Callable manually now; wire to a scheduler / pg_cron later so it
 * fires before the 18:00 IST cutoff. Idempotent per (learner, date) via the url
 * marker so re-running the same day doesn't duplicate.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface LearnerRow { id: string; profile_id: string | null }

async function sendReminders(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const date = bookableDates()[0]; // tomorrow
    const urlMarker = `/student/bookings?d=${date}`;
    const svc = createServiceRoleClient();

    // Transport learners with a route + a login profile.
    const { data: learners } = await svc
      .from('learners_profiles')
      .select('id, profile_id')
      .eq('bus_required', true)
      .not('transport_route_id', 'is', null)
      .not('profile_id', 'is', null);
    const all = (learners ?? []) as LearnerRow[];
    if (all.length === 0) return NextResponse.json({ success: true, data: { date, reminded: 0 } });

    // Who already booked tomorrow.
    const { data: booked } = await svc
      .from('tms_booking')
      .select('learner_id')
      .eq('travel_date', date)
      .eq('status', 'booked');
    const bookedIds = new Set<string>(((booked ?? []) as { learner_id: string }[]).map((b) => b.learner_id));

    // Who already got tomorrow's reminder (avoid dupes).
    const { data: existing } = await svc
      .from('notifications')
      .select('targeting')
      .eq('category', 'transport_booking')
      .eq('url', urlMarker);
    const notifiedProfiles = new Set<string>(
      ((existing ?? []) as { targeting: { user_id?: string } | null }[])
        .map((n) => n.targeting?.user_id)
        .filter((v): v is string => !!v)
    );

    const toInsert = all
      .filter((l) => !bookedIds.has(l.id) && l.profile_id && !notifiedProfiles.has(l.profile_id))
      .map((l) => ({
        title: 'Book tomorrow’s bus',
        body: `Booking for ${date} closes at 6 PM today. Tap to reserve your seat.`,
        category: 'transport_booking',
        priority: 'normal',
        url: urlMarker,
        targeting: { type: 'user', user_id: l.profile_id },
      }));

    if (toInsert.length === 0) return NextResponse.json({ success: true, data: { date, reminded: 0 } });

    const ins = await svc.from('notifications').insert(toInsert);
    if (ins.error) {
      console.error('admin/bookings/send-reminders insert error:', ins.error);
      return NextResponse.json({ error: 'Failed to insert reminders' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { date, reminded: toInsert.length } });
  } catch (e) {
    console.error('admin/bookings/send-reminders error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => sendReminders(request, auth));
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Probe**

With the dev server running:
`curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/admin/bookings/send-reminders`
Expected: `401`.

- [ ] **Step 4: Manual verification (user, optional)**

Ask the user (super admin) to POST the endpoint once → response `{ reminded: N }`; confirm the targeted learners see the reminder in `/student/notifications`; POST again same day → `{ reminded: 0 }` (no duplicates).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/bookings/send-reminders/route.ts
git commit -m "feat(booking): reminder endpoint for un-booked learners (tomorrow)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Deferred (explicitly out of this plan)

These are in the spec's scope notes but intentionally NOT built here, to keep v1 tight and every task's code exact:

- **Dashboard "Tomorrow: Booked ✓ / Book now" tile** — a nice-to-have surfacing; the dedicated `/student/bookings` page fully delivers the function. Add later by reading `app/student/dashboard/page.tsx` and reusing the `GET /api/student/bookings` board.
- **Walk-up visual badge on the roster** — walk-ups appear in the roster and are distinguishable in data (`tms_attendance.is_walk_up`), but no per-row badge is rendered (would require editing `app/boarding/routes/[routeId]/columns.tsx`). Counts (booked vs present) already imply walk-ins.
- **Scheduling the reminder** (pg_cron / external scheduler hitting Task 11's endpoint) — the endpoint is built and callable; wiring the trigger is an ops step.
- **Admin summary UI page** — the `GET /api/admin/bookings/summary` API exists; a dedicated admin page consuming it is a follow-up.
- All v1 non-goals from the spec: seat selection, waitlist/auto-cap, holiday calendar, staff bookings, WhatsApp reminders, per-direction bookings, automatic vehicle reassignment, separate driver-scanning UI.

## Self-Review notes

- **Spec coverage:** booking table (T2) ✓; whole-day + cutoff/horizon (T1) ✓; cancellation free-before-cutoff (T1/T4) ✓; pass gate (T6) ✓; scan enforcement + IST (T7) ✓; walk-up when seats remain + hard-block when full (T7/T8) ✓; roster = booked ∪ walk-ups (T9) ✓; passive counts (T9 roster + T10 admin API) ✓; reminders (T11) ✓; learners-only ✓; permissions `tms.bookings.self` (T2) ✓. Dashboard tile + summary UI consciously deferred (above).
- **Type consistency:** `DayStatus` defined in `lib/booking/window.ts` (T1), re-declared structurally in the client page (T5, to avoid a server import) — values identical. Repo function names (`hasBookingForDate`, `bookedCount`, `walkUpCount`, `routeCapacity`, `seatsRemaining`) are used verbatim in T6/T7/T9/T10. Scan response field `walkUp` (boolean) consistent between T7 (server) and T8 (client).
- **No placeholders:** every code step contains complete code; every run step has an exact command + expected output.
