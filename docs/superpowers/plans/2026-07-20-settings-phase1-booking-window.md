# Settings Phase 1 — Booking Cutoff + Configurable Horizon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin-configured booking **cutoff hour** and **bookable horizon length** ("booking days available") actually govern student booking, and harden the settings API.

**Architecture:** Keep the pure, unit-tested booking libraries (`lib/booking/window.ts`, `lib/booking/calendar.ts`) pure by adding optional config parameters (default = today's behavior). A new server-only loader `lib/settings/scheduling.ts` reads the config from the `admin_settings` table and the enforcement routes inject it into the pure functions at the edge. No DB access is added inside the pure libraries.

**Tech Stack:** Next.js 15 (App Router, route handlers), TypeScript, Supabase (service-role client), Vitest, React Query (admin UI).

## Global Constraints

- **Default `daysAhead` = 6** everywhere (pure-function fallback, loader default, UI seed). Chosen at rollout to stay close to the current ~one-week feel; admin-adjustable 1..14.
- **Default `cutoffHour` = 20** (20:00 IST) — preserves today's behavior when unset.
- All `travelDate` / date values are `'YYYY-MM-DD'` strings; IST is a fixed +5:30 offset (no timezone lib).
- Verify with **`npx vitest run <path>`** and **`npm run build`** — do NOT rely on `tsc` (chronically red on this repo, not build-gated).
- Modern API pattern for any route touched: `withAuth` + `requirePerm(...)` + `createServiceRoleClient()` + `logActivity(...)`, returning `{ success, data }` / `{ error }`.
- Permissions already exist in `lib/constants/tms-permissions.ts`: `TMS_PERMISSIONS.SETTINGS_VIEW = 'tms.settings.view'`, `TMS_PERMISSIONS.SETTINGS_MANAGE = 'tms.settings.manage'`.
- Commit after every task. Branch: `feat/settings-module-overhaul` (already checked out).

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `lib/booking/window.ts` | Pure IST window math | Modify — configurable cutoff + horizon; delete `bookingWeekEnd` |
| `lib/booking/window.test.ts` | Window unit tests | Modify — rewrite horizon tests, add config tests |
| `lib/booking/calendar.ts` | Month-grid + `effectiveOpen` | Modify — thread `cutoffHour` + `daysAhead` |
| `lib/booking/calendar.test.ts` | Calendar unit tests | Modify — pass/adjust config |
| `lib/settings/scheduling.ts` | Server loader for scheduling config | Create |
| `lib/settings/scheduling.test.ts` | Pure parser tests | Create |
| `app/api/admin/settings/route.ts` | Admin settings read/write API | Modify — harden + `bookingDaysAhead` validation |
| `app/api/student/bookings/route.ts` | Student board + book/cancel | Modify — inject config into the gate |
| `app/student/bookings/page.tsx` | Student calendar (client) | Modify — derive `maxMonth` from server response |
| `lib/scheduling-config.ts` | Form/blob types + defaults | Modify — new blob shape; drop dead fields |
| `app/(admin)/settings/page.tsx` | Settings UI (Scheduling tab) | Modify — new field, remove decorative fields, live policy text |

---

### Task 1: Configurable window math (`lib/booking/window.ts`)

**Files:**
- Modify: `lib/booking/window.ts`
- Test: `lib/booking/window.test.ts`

**Interfaces:**
- Produces:
  - `cutoffFor(travelDate: string, cutoffHour?: number): Date` (default 20)
  - `bookableDates(now?: Date, daysAhead?: number): string[]` (default 6)
  - `type WindowOpts = { cutoffHour?: number; daysAhead?: number }`
  - `isBookingOpen(travelDate: string, now?: Date, opts?: WindowOpts): boolean`
  - `isCancelable(travelDate: string, now?: Date, opts?: WindowOpts): boolean`
  - `dayStatus(hasBooking: boolean, travelDate: string, now?: Date, opts?: WindowOpts): DayStatus`
  - `bookingWeekEnd` is **removed**.

- [ ] **Step 1: Rewrite the horizon + config tests first**

Replace the `cutoffFor`, `bookableDates`, `isBookingOpen`, `isCancelable`, `dayStatus` describe-blocks in `lib/booking/window.test.ts` with the versions below (keep `istToday`, `addDays`, `isSunday` blocks unchanged). Also remove `bookingWeekEnd` from any import.

```typescript
describe('cutoffFor', () => {
  it('defaults to 20:00 IST on the prior day (== 14:30 UTC)', () => {
    expect(cutoffFor('2026-06-22').toISOString()).toBe('2026-06-21T14:30:00.000Z');
  });
  it('honors a configured cutoff hour (19:00 IST == 13:30 UTC prior day)', () => {
    expect(cutoffFor('2026-06-22', 19).toISOString()).toBe('2026-06-21T13:30:00.000Z');
  });
});

describe('bookableDates', () => {
  it('defaults to the next 6 days ahead (tomorrow inclusive)', () => {
    // 2026-06-22 is a Monday (IST)
    const dates = bookableDates(new Date('2026-06-22T03:00:00Z'));
    expect(dates).toEqual([
      '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28',
    ]);
  });
  it('honors a shorter horizon (daysAhead = 1 => tomorrow only)', () => {
    const dates = bookableDates(new Date('2026-06-22T03:00:00Z'), 1);
    expect(dates).toEqual(['2026-06-23']);
  });
  it('keeps a Sunday in the list (booking gate blocks it separately)', () => {
    const dates = bookableDates(new Date('2026-06-22T03:00:00Z'), 6);
    expect(dates).toContain('2026-06-28'); // Sunday, present but non-bookable
  });
});

describe('isBookingOpen', () => {
  it('is open just before the default cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T14:29:00Z'))).toBe(true);
  });
  it('is closed just after the default cutoff', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T14:31:00Z'))).toBe(false);
  });
  it('respects a configured earlier cutoff (19:00 IST)', () => {
    // 13:29 UTC prior day = 18:59 IST => open; 13:31 UTC = 19:01 IST => closed
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T13:29:00Z'), { cutoffHour: 19 })).toBe(true);
    expect(isBookingOpen('2026-06-22', new Date('2026-06-21T13:31:00Z'), { cutoffHour: 19 })).toBe(false);
  });
  it('respects a configured horizon (date beyond daysAhead is closed)', () => {
    // From Monday 2026-06-22, daysAhead=1 makes only 2026-06-23 open
    expect(isBookingOpen('2026-06-24', new Date('2026-06-22T03:00:00Z'), { daysAhead: 1 })).toBe(false);
    expect(isBookingOpen('2026-06-23', new Date('2026-06-22T03:00:00Z'), { daysAhead: 1 })).toBe(true);
  });
  it('rejects today and past dates', () => {
    expect(isBookingOpen('2026-06-22', new Date('2026-06-22T06:00:00Z'))).toBe(false);
  });
  it('rejects a Sunday inside the window', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-27T06:00:00Z'))).toBe(false);
  });
});

describe('isCancelable', () => {
  it('mirrors the booking window on weekdays', () => {
    expect(isCancelable('2026-06-22', new Date('2026-06-21T14:29:00Z'))).toBe(true);
    expect(isCancelable('2026-06-22', new Date('2026-06-21T14:31:00Z'))).toBe(false);
  });
  it('still allows cancelling a Sunday within the window', () => {
    expect(isBookingOpen('2026-06-28', new Date('2026-06-27T06:00:00Z'))).toBe(false);
    expect(isCancelable('2026-06-28', new Date('2026-06-27T06:00:00Z'))).toBe(true);
  });
});

describe('dayStatus', () => {
  const before = new Date('2026-06-21T14:29:00Z');
  const after = new Date('2026-06-21T14:31:00Z');
  it('booked + open => booked', () => expect(dayStatus(true, '2026-06-22', before)).toBe('booked'));
  it('booked + closed => locked', () => expect(dayStatus(true, '2026-06-22', after)).toBe('locked'));
  it('no booking + open => not_booked', () => expect(dayStatus(false, '2026-06-22', before)).toBe('not_booked'));
  it('no booking + closed => closed', () => expect(dayStatus(false, '2026-06-22', after)).toBe('closed'));
});
```

- [ ] **Step 2: Run the tests and confirm they FAIL**

Run: `npx vitest run lib/booking/window.test.ts`
Expected: FAIL — the new `bookableDates` default returns the old weekly window, and the config args are not yet honored (compile/type errors on `{ cutoffHour }` / `{ daysAhead }` are also acceptable failures).

- [ ] **Step 3: Rewrite `lib/booking/window.ts`**

Replace the file body from the `CUTOFF_HOUR_IST` constant through `dayStatus` with the following (keep the file header comment, `IST_OFFSET_MIN`, `DayStatus`, `istToday`, `addDays`, `isSunday` intact). Delete `bookingWeekEnd` entirely.

```typescript
const IST_OFFSET_MIN = 5 * 60 + 30; // +05:30
const DEFAULT_CUTOFF_HOUR_IST = 20; // 20:00 IST on the prior day
const DEFAULT_DAYS_AHEAD = 6;       // rolling horizon length (admin-configurable)

export type DayStatus = 'not_booked' | 'booked' | 'locked' | 'closed';

/** Optional per-call configuration threaded from admin settings at the route edge. */
export interface WindowOpts {
  cutoffHour?: number; // 0..23 IST; defaults to 20
  daysAhead?: number;  // 1..14; defaults to 6
}

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
 * The booking cutoff instant for a travel date = `cutoffHour`:00 IST on the prior day.
 * Default 20:00 IST. travelDate 00:00 IST in UTC = Date.UTC(...) - 5:30h; then back up
 * to the prior day's cutoff hour.
 */
export function cutoffFor(travelDate: string, cutoffHour: number = DEFAULT_CUTOFF_HOUR_IST): Date {
  const [y, m, d] = travelDate.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) - (IST_OFFSET_MIN + (24 - cutoffHour) * 60) * 60_000;
  return new Date(ms);
}

/**
 * The ascending bookable dates for the configurable rolling horizon:
 * tomorrow through today+`daysAhead`, inclusive. A Sunday inside the range stays in the
 * list but remains non-bookable via `isSunday` — callers already gate on it.
 */
export function bookableDates(now: Date = new Date(), daysAhead: number = DEFAULT_DAYS_AHEAD): string[] {
  const today = istToday(now);
  const out: string[] = [];
  for (let i = 1; i <= daysAhead; i++) out.push(addDays(today, i));
  return out;
}

/**
 * Sunday is a compulsory weekly holiday — buses never run, so a Sunday can never be
 * booked. Single source of truth for the rule. 0 = Sunday via UTC integer math.
 */
export function isSunday(travelDate: string): boolean {
  const [y, m, d] = travelDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

/** Within the rolling horizon AND before the cutoff (ignores the weekly-off rule). */
function withinBookingWindow(travelDate: string, now: Date, opts: WindowOpts = {}): boolean {
  if (!bookableDates(now, opts.daysAhead).includes(travelDate)) return false;
  return now.getTime() < cutoffFor(travelDate, opts.cutoffHour).getTime();
}

export function isBookingOpen(travelDate: string, now: Date = new Date(), opts: WindowOpts = {}): boolean {
  if (isSunday(travelDate)) return false; // weekly holiday — never bookable
  return withinBookingWindow(travelDate, now, opts);
}

/**
 * Cancellation follows the same horizon/cutoff window as booking, but is NOT blocked on
 * Sundays: a pre-existing Sunday booking must still be cancelable until its cutoff.
 */
export function isCancelable(travelDate: string, now: Date = new Date(), opts: WindowOpts = {}): boolean {
  return withinBookingWindow(travelDate, now, opts);
}

export function dayStatus(
  hasBooking: boolean,
  travelDate: string,
  now: Date = new Date(),
  opts: WindowOpts = {},
): DayStatus {
  const open = isBookingOpen(travelDate, now, opts);
  if (hasBooking) return open ? 'booked' : 'locked';
  return open ? 'not_booked' : 'closed';
}
```

- [ ] **Step 4: Run the tests and confirm they PASS**

Run: `npx vitest run lib/booking/window.test.ts`
Expected: PASS (all describe-blocks green).

- [ ] **Step 5: Commit**

```bash
git add lib/booking/window.ts lib/booking/window.test.ts
git commit -m "feat(booking): configurable cutoff hour + rolling N-day horizon in window.ts"
```

---

### Task 2: Thread config through the calendar (`lib/booking/calendar.ts`)

**Files:**
- Modify: `lib/booking/calendar.ts`
- Test: `lib/booking/calendar.test.ts`

**Interfaces:**
- Consumes (Task 1): `bookableDates(now, daysAhead)`, `cutoffFor(date, cutoffHour)`, `dayStatus(hasBooking, date, now, opts)`, `WindowOpts`.
- Produces:
  - `effectiveOpen(date: string, opts: { window?: WindowOverride; now?: Date; cutoffHour?: number; daysAhead?: number }): boolean`
  - `cellStatus(date, opts: { hasBooking; exception?; window?; now?; cutoffHour?; daysAhead? }): CalendarStatus`
  - `buildMonthCells(monthStr, opts: { bookedDates; exceptions; windows?; now?; cutoffHour?; daysAhead? }): DayCell[]`

- [ ] **Step 1: Add a failing calendar test for a configured horizon**

Append to `lib/booking/calendar.test.ts` (inside the existing top-level `describe` or as a new one — match the file's existing structure; import `effectiveOpen` if not already imported):

```typescript
describe('effectiveOpen with injected config', () => {
  it('closes a date that is outside the configured daysAhead horizon', () => {
    // Monday 2026-06-22; daysAhead=1 => only 2026-06-23 is in the horizon
    const now = new Date('2026-06-22T03:00:00Z');
    expect(effectiveOpen('2026-06-23', { now, daysAhead: 1 })).toBe(true);
    expect(effectiveOpen('2026-06-24', { now, daysAhead: 1 })).toBe(false);
  });
  it('applies a configured cutoff hour to the fallback deadline', () => {
    // 19:00 IST cutoff: 13:29 UTC prior day open, 13:31 closed
    expect(effectiveOpen('2026-06-23', { now: new Date('2026-06-22T13:29:00Z'), cutoffHour: 19 })).toBe(true);
    expect(effectiveOpen('2026-06-23', { now: new Date('2026-06-22T13:31:00Z'), cutoffHour: 19 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the calendar test and confirm it FAILS**

Run: `npx vitest run lib/booking/calendar.test.ts`
Expected: FAIL — `effectiveOpen` ignores `cutoffHour` / `daysAhead` (or type error on the extra opts keys).

- [ ] **Step 3: Update `lib/booking/calendar.ts`**

Replace `effectiveOpen`, `cellStatus`, and `buildMonthCells` with the versions below (leave `monthDays`, `loadExceptions`, `loadWindows`, and the interfaces unchanged; the import line already imports `bookableDates, cutoffFor, dayStatus, isSunday`).

```typescript
/** Is booking open for a date, honoring an optional window override + injected config? */
export function effectiveOpen(
  date: string,
  opts: { window?: WindowOverride; now?: Date; cutoffHour?: number; daysAhead?: number }
): boolean {
  const now = opts.now ?? new Date();
  if (isSunday(date)) return false; // weekly holiday — never bookable
  if (opts.window && !opts.window.enabled) return false;
  if (!bookableDates(now, opts.daysAhead).includes(date)) return false;
  const deadlineMs = opts.window?.deadline
    ? new Date(opts.window.deadline).getTime()
    : cutoffFor(date, opts.cutoffHour).getTime();
  return now.getTime() < deadlineMs;
}

/** Status for ONE date. A service-calendar exception wins over everything. */
export function cellStatus(
  date: string,
  opts: {
    hasBooking: boolean;
    exception?: CalendarException;
    window?: WindowOverride;
    now?: Date;
    cutoffHour?: number;
    daysAhead?: number;
  }
): CalendarStatus {
  if (opts.exception) return opts.exception.kind; // 'holiday' | 'no_service'
  if (isSunday(date)) return opts.hasBooking ? 'locked' : 'weekly_off';
  const now = opts.now ?? new Date();
  if (!bookableDates(now, opts.daysAhead).includes(date)) return opts.hasBooking ? 'locked' : 'out_of_horizon';
  if (opts.window) {
    const open = effectiveOpen(date, { window: opts.window, now, cutoffHour: opts.cutoffHour, daysAhead: opts.daysAhead });
    if (opts.hasBooking) return open ? 'booked' : 'locked';
    return open ? 'open' : 'closed';
  }
  const s = dayStatus(opts.hasBooking, date, now, { cutoffHour: opts.cutoffHour, daysAhead: opts.daysAhead });
  return s === 'not_booked' ? 'open' : s;
}

/** Build all cells for a month from the learner's bookings + the gate. */
export function buildMonthCells(
  monthStr: string,
  opts: {
    bookedDates: Set<string>;
    exceptions: Map<string, CalendarException>;
    windows?: Map<string, WindowOverride>;
    now?: Date;
    cutoffHour?: number;
    daysAhead?: number;
  }
): DayCell[] {
  return monthDays(monthStr).map((date) => {
    const exception = opts.exceptions.get(date);
    return {
      date,
      status: cellStatus(date, {
        hasBooking: opts.bookedDates.has(date),
        exception,
        window: opts.windows?.get(date),
        now: opts.now,
        cutoffHour: opts.cutoffHour,
        daysAhead: opts.daysAhead,
      }),
      note: exception?.note ?? null,
    };
  });
}
```

- [ ] **Step 4: Run the calendar tests and confirm they PASS**

Run: `npx vitest run lib/booking/calendar.test.ts`
Expected: PASS (existing calendar tests still green — they pass no config, so defaults apply).

- [ ] **Step 5: Commit**

```bash
git add lib/booking/calendar.ts lib/booking/calendar.test.ts
git commit -m "feat(booking): thread cutoffHour + daysAhead through calendar effectiveOpen/cellStatus"
```

---

### Task 3: Scheduling config loader (`lib/settings/scheduling.ts`)

**Files:**
- Create: `lib/settings/scheduling.ts`
- Test: `lib/settings/scheduling.test.ts`

**Interfaces:**
- Produces:
  - `interface SchedulingConfig { enableBookingTimeWindow: boolean; cutoffHour: number; daysAhead: number; autoNotifyPassengers: boolean }`
  - `DEFAULT_SCHEDULING_CONFIG: SchedulingConfig` = `{ enableBookingTimeWindow: true, cutoffHour: 20, daysAhead: 6, autoNotifyPassengers: true }`
  - `parseSchedulingConfig(raw: unknown): SchedulingConfig` (pure; clamps + defaults; maps blob keys `bookingWindowEndHour`→`cutoffHour`, `bookingDaysAhead`→`daysAhead`)
  - `loadSchedulingConfig(svc: SupabaseClient): Promise<SchedulingConfig>` (reads `admin_settings`, then `parseSchedulingConfig`)

- [ ] **Step 1: Write the failing parser test**

Create `lib/settings/scheduling.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSchedulingConfig, DEFAULT_SCHEDULING_CONFIG } from './scheduling';

describe('parseSchedulingConfig', () => {
  it('returns defaults for null / non-object input', () => {
    expect(parseSchedulingConfig(null)).toEqual(DEFAULT_SCHEDULING_CONFIG);
    expect(parseSchedulingConfig('nope')).toEqual(DEFAULT_SCHEDULING_CONFIG);
  });

  it('maps stored blob keys to config fields', () => {
    const cfg = parseSchedulingConfig({
      enableBookingTimeWindow: false,
      bookingWindowEndHour: 19,
      bookingDaysAhead: 3,
      autoNotifyPassengers: false,
    });
    expect(cfg).toEqual({
      enableBookingTimeWindow: false,
      cutoffHour: 19,
      daysAhead: 3,
      autoNotifyPassengers: false,
    });
  });

  it('clamps cutoffHour to 0..23 and daysAhead to 1..14', () => {
    expect(parseSchedulingConfig({ bookingWindowEndHour: 99 }).cutoffHour).toBe(23);
    expect(parseSchedulingConfig({ bookingWindowEndHour: -5 }).cutoffHour).toBe(0);
    expect(parseSchedulingConfig({ bookingDaysAhead: 99 }).daysAhead).toBe(14);
    expect(parseSchedulingConfig({ bookingDaysAhead: 0 }).daysAhead).toBe(1);
  });

  it('falls back to defaults for missing / non-numeric fields', () => {
    const cfg = parseSchedulingConfig({ enableBookingTimeWindow: true });
    expect(cfg.cutoffHour).toBe(20);
    expect(cfg.daysAhead).toBe(6);
    expect(cfg.autoNotifyPassengers).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm it FAILS**

Run: `npx vitest run lib/settings/scheduling.test.ts`
Expected: FAIL — module `./scheduling` not found.

- [ ] **Step 3: Create `lib/settings/scheduling.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

/** Effective, normalized scheduling config consumed by the booking gate + reminders. */
export interface SchedulingConfig {
  enableBookingTimeWindow: boolean;
  cutoffHour: number;         // 0..23 IST (from stored bookingWindowEndHour)
  daysAhead: number;          // 1..14 (from stored bookingDaysAhead)
  autoNotifyPassengers: boolean;
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  enableBookingTimeWindow: true,
  cutoffHour: 20,
  daysAhead: 6,
  autoNotifyPassengers: true,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Pure: normalize a stored settings_data blob into a SchedulingConfig (defaults + clamps). */
export function parseSchedulingConfig(raw: unknown): SchedulingConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCHEDULING_CONFIG };
  const b = raw as Record<string, unknown>;
  return {
    enableBookingTimeWindow: boolOr(b.enableBookingTimeWindow, DEFAULT_SCHEDULING_CONFIG.enableBookingTimeWindow),
    cutoffHour: clampInt(b.bookingWindowEndHour, 0, 23, DEFAULT_SCHEDULING_CONFIG.cutoffHour),
    daysAhead: clampInt(b.bookingDaysAhead, 1, 14, DEFAULT_SCHEDULING_CONFIG.daysAhead),
    autoNotifyPassengers: boolOr(b.autoNotifyPassengers, DEFAULT_SCHEDULING_CONFIG.autoNotifyPassengers),
  };
}

/**
 * Load the effective scheduling config from admin_settings (setting_type='scheduling').
 * Service-role only; falls back to defaults if the row/table is missing or malformed.
 */
export async function loadSchedulingConfig(svc: SupabaseClient): Promise<SchedulingConfig> {
  try {
    const { data, error } = await svc
      .from('admin_settings')
      .select('settings_data')
      .eq('setting_type', 'scheduling')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return { ...DEFAULT_SCHEDULING_CONFIG };
    return parseSchedulingConfig((data[0] as { settings_data: unknown }).settings_data);
  } catch {
    return { ...DEFAULT_SCHEDULING_CONFIG };
  }
}
```

- [ ] **Step 4: Run the test and confirm it PASSES**

Run: `npx vitest run lib/settings/scheduling.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/scheduling.ts lib/settings/scheduling.test.ts
git commit -m "feat(settings): loadSchedulingConfig + pure parser for booking config"
```

---

### Task 4: Harden the settings API (`app/api/admin/settings/route.ts`)

**Files:**
- Modify: `app/api/admin/settings/route.ts`

**Interfaces:**
- Consumes: `withAuth`, `AuthContext` from `@/lib/api/with-auth`; `createServiceRoleClient` from `@/lib/supabase/server`; `logActivity` from `@/lib/activity/log`; `TMS_PERMISSIONS` from `@/lib/constants/tms-permissions`.
- Produces: authenticated `GET` (requires `SETTINGS_VIEW`) + `POST`/`PUT` (require `SETTINGS_MANAGE`), validating `bookingWindowEndHour` 0..23 and `bookingDaysAhead` 1..14.

> Pattern reference: mirror `app/api/admin/attendance-windows/route.ts` (already in repo) for `requirePerm` + `withAuth` + `logActivity`.

- [ ] **Step 1: Replace the route file**

Replace the entire contents of `app/api/admin/settings/route.ts` with:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

interface SchedulingSettingsData {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;
  bookingDaysAhead: number;
  autoNotifyPassengers: boolean;
}

const DEFAULT_SETTINGS: SchedulingSettingsData = {
  enableBookingTimeWindow: true,
  bookingWindowEndHour: 20,
  bookingDaysAhead: 6,
  autoNotifyPassengers: true,
};

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

function validate(settings: Record<string, unknown>): string | null {
  const hour = settings.bookingWindowEndHour;
  if (typeof hour !== 'number' || hour < 0 || hour > 23) {
    return 'Booking cutoff hour must be between 0 and 23';
  }
  const days = settings.bookingDaysAhead;
  if (typeof days !== 'number' || days < 1 || days > 14) {
    return 'Booking days available must be between 1 and 14';
  }
  return null;
}

async function getSettings(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('admin_settings')
      .select('settings_data, updated_at')
      .eq('setting_type', 'scheduling')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) {
      console.error('admin/settings GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
    if (data && data.length > 0) {
      return NextResponse.json({ settings: data[0].settings_data, lastUpdated: data[0].updated_at });
    }
    return NextResponse.json({ settings: DEFAULT_SETTINGS, lastUpdated: null });
  } catch (e) {
    console.error('admin/settings GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function saveSettings(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { settings?: Record<string, unknown> };
    const settings = body.settings;
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Settings data is required' }, { status: 400 });
    }
    const invalid = validate(settings);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('admin_settings')
      .upsert(
        {
          setting_type: 'scheduling',
          settings_data: settings,
          updated_at: new Date().toISOString(),
          updated_by: auth.userId,
        },
        { onConflict: 'setting_type' }
      )
      .select();
    if (error) {
      console.error('admin/settings POST error:', error);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'settings',
      action: 'update',
      entityType: 'admin_settings',
      description: `Updated scheduling settings — cutoff ${settings.bookingWindowEndHour}:00, days ahead ${settings.bookingDaysAhead}`,
      metadata: settings,
    });

    return NextResponse.json({
      message: 'Settings saved successfully',
      settings: data[0].settings_data,
      lastUpdated: data[0].updated_at,
    });
  } catch (e) {
    console.error('admin/settings POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getSettings(auth));
export const POST = withAuth((req, auth) => saveSettings(req, auth));
export const PUT = withAuth((req, auth) => saveSettings(req, auth));
```

- [ ] **Step 2: Confirm `logActivity` accepts `module: 'settings'`**

Run: `npx vitest run 2>/dev/null; grep -n "settings" lib/activity/log.ts`
Expected: the module union in `lib/activity/log.ts` already includes `'settings'` (the attendance-windows route logs `module: 'settings'`). If it does NOT, add `'settings'` to the module union type in `lib/activity/log.ts` (per memory: the activity-log module/action unions are CLOSED — extend them or routes won't compile).

- [ ] **Step 3: Build to verify types + route compile**

Run: `npm run build`
Expected: build succeeds (no type error from the settings route). If build flags an unused import or a missing `AuthContext.userId`/`isSuperAdmin`, reconcile against the exact `AuthContext` shape used in `app/api/admin/attendance-windows/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/settings/route.ts lib/activity/log.ts
git commit -m "feat(settings): harden settings API (withAuth + requirePerm + activity log) and validate bookingDaysAhead"
```

---

### Task 5: Inject config into the student booking gate (`app/api/student/bookings/route.ts`)

**Files:**
- Modify: `app/api/student/bookings/route.ts`

**Interfaces:**
- Consumes: `loadSchedulingConfig` (Task 3); `bookableDates(now, daysAhead)`, `cutoffFor(date, cutoffHour)`, `dayStatus(..., opts)` (Task 1); `effectiveOpen(date, { window, cutoffHour, daysAhead })`, `buildMonthCells(monthStr, { ..., cutoffHour, daysAhead })` (Task 2).
- Produces: board GET response additionally includes `maxBookableDate: string` (the furthest horizon date) for the client's calendar bound.

- [ ] **Step 1: Add the config load + thread it through GET**

In `app/api/student/bookings/route.ts`, add the import and load config near the top of `getBoard` (after `const svc = createServiceRoleClient();`). Add to the import from `@/lib/settings/scheduling`:

```typescript
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
```

In `getBoard`, replace `const dates = bookableDates();` and the `svc` creation ordering so config loads first:

```typescript
    const svc = createServiceRoleClient();
    const cfg = await loadSchedulingConfig(svc);
    const winOpts = cfg.enableBookingTimeWindow ? { cutoffHour: cfg.cutoffHour, daysAhead: cfg.daysAhead } : { cutoffHour: 24, daysAhead: cfg.daysAhead };
    const dates = bookableDates(new Date(), cfg.daysAhead);
```

> Note: when `enableBookingTimeWindow` is false the daily time-cutoff must be bypassed. `cutoffHour: 24` makes `cutoffFor` land at 24:00 IST of the prior day = 00:00 IST of the travel day, i.e. the cutoff is the start of the travel day itself, so booking stays open through the entire prior day. The horizon + Sunday gates still apply.

- [ ] **Step 2: Thread config into the month view + list view**

In the `monthParam` branch, update the `buildMonthCells` call:

```typescript
      const cells = buildMonthCells(monthParam, { bookedDates, exceptions, windows, cutoffHour: winOpts.cutoffHour, daysAhead: winOpts.daysAhead }).map((c) => ({
        ...c,
        cutoff: c.status === 'open' || c.status === 'booked'
          ? (windows.get(c.date)?.deadline ?? cutoffFor(c.date, winOpts.cutoffHour).toISOString())
          : null,
        attendance: attendance.get(c.date),
      }));
```

In the default (list) branch, update the `days` mapping and add `maxBookableDate`:

```typescript
    const days = dates.map((date) => ({
      date,
      status: dayStatus(booked.has(date), date, new Date(), winOpts),
      cutoff: cutoffFor(date, winOpts.cutoffHour).toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        routeLabel,
        stopLabel,
        assigned: !!learner.transport_route_id,
        days,
        maxBookableDate: dates[dates.length - 1] ?? null,
      },
    });
```

- [ ] **Step 3: Thread config into the `book` action**

In `mutate`, after `const svc = createServiceRoleClient();` in the `book` path, load config and pass it to `effectiveOpen`:

```typescript
      const cfg = await loadSchedulingConfig(svc);
      const winMap = await loadWindows(svc, learner.transport_route_id, travelDate, travelDate);
      const openOpts = cfg.enableBookingTimeWindow
        ? { window: winMap.get(travelDate), cutoffHour: cfg.cutoffHour, daysAhead: cfg.daysAhead }
        : { window: winMap.get(travelDate), cutoffHour: 24, daysAhead: cfg.daysAhead };
      if (!effectiveOpen(travelDate, openOpts)) {
        return NextResponse.json({ error: 'Booking is closed for that date' }, { status: 409 });
      }
```

> The `cancel` path keeps using `isCancelable(travelDate)` with defaults (cancellation is intentionally lenient and not tied to the admin cutoff tightening); leave it unchanged.

- [ ] **Step 4: Build to verify the route compiles + behaves**

Run: `npm run build`
Expected: build succeeds. Then a route probe (unauthenticated) should still 401/307, proving the route is mounted:
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/student/bookings` (only if a dev server is running on :3001 — see memory: port 3000 is the sibling app).
Expected: `401` or `307` (auth gate), NOT `500`.

- [ ] **Step 5: Commit**

```bash
git add app/api/student/bookings/route.ts
git commit -m "feat(booking): student gate reads admin cutoff + horizon via loadSchedulingConfig"
```

---

### Task 6: Client calendar uses the authoritative horizon (`app/student/bookings/page.tsx`)

**Files:**
- Modify: `app/student/bookings/page.tsx:78-83`

**Interfaces:**
- Consumes: board GET `data.maxBookableDate` (Task 5).

- [ ] **Step 1: Derive `maxMonth` from the server response**

Replace the `maxMonth` `useMemo` (currently calling `bookableDates()` locally) with one that prefers the server's authoritative furthest date and falls back to the local default:

```typescript
  // Booking is limited to the configured horizon; the calendar's Next arrow stops once
  // the furthest bookable month (from the server) is in view.
  const maxMonth = useMemo(() => {
    const serverMax = (data as { maxBookableDate?: string } | undefined)?.maxBookableDate;
    if (serverMax) return serverMax.slice(0, 7);
    const ds = bookableDates();
    return (ds.length ? ds[ds.length - 1] : istMonth()).slice(0, 7);
  }, [data]);
```

> Keep the `bookableDates` import — it remains the fallback before data loads.

- [ ] **Step 2: Build to verify the client compiles**

Run: `npm run build`
Expected: build succeeds; no TypeScript error on `data.maxBookableDate`.

- [ ] **Step 3: Commit**

```bash
git add app/student/bookings/page.tsx
git commit -m "feat(booking): student calendar bound follows the configured horizon from the server"
```

---

### Task 7: Scheduling tab UI — real "Booking days available" + honest policy text

**Files:**
- Modify: `lib/scheduling-config.ts` (blob type + defaults)
- Modify: `app/(admin)/settings/page.tsx` (Scheduling tab render + save payload)

**Interfaces:**
- Consumes: `POST /api/admin/settings` (Task 4) — payload `{ settings: { enableBookingTimeWindow, bookingWindowEndHour, bookingDaysAhead, autoNotifyPassengers } }`.

- [ ] **Step 1: Update the form/blob type + defaults in `lib/scheduling-config.ts`**

Replace the `SchedulingSettings` interface and `defaultSchedulingSettings` at the top of `lib/scheduling-config.ts` with the new blob shape (drop the dead `bookingWindowStartHour`, `bookingWindowDaysBefore`, `sendReminderHours`):

```typescript
export interface SchedulingSettings {
  enableBookingTimeWindow: boolean;
  bookingWindowEndHour: number;  // 0..23 IST cutoff
  bookingDaysAhead: number;      // 1..14 rolling horizon
  autoNotifyPassengers: boolean;
}

export const defaultSchedulingSettings: SchedulingSettings = {
  enableBookingTimeWindow: true,
  bookingWindowEndHour: 20,  // 8 PM cutoff
  bookingDaysAhead: 6,       // ~one week ahead
  autoNotifyPassengers: true,
};
```

> The `SchedulingConfigManager` class below in that file (localStorage) is legacy and unused by the enforcement path. Leave the class as-is for now (removing it is out of scope for Phase 1); only the exported `SchedulingSettings` type + `defaultSchedulingSettings` are consumed by the settings page. If the class references the removed fields and breaks the build, delete the class body (it is dead code) — verify with `npm run build`.

- [ ] **Step 2: Replace the Scheduling tab render in `app/(admin)/settings/page.tsx`**

In `renderSchedulingSettings`, replace the grid's four fields + the "Reminder Hours" block with these three controls (Enable, Booking Cutoff Time, Booking days available) and drop the Reminder Hours section entirely. The relevant JSX inside the `grid grid-cols-1 md:grid-cols-2 gap-6` becomes:

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enable Booking Time Window
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="enableBookingTimeWindow"
                    checked={schedulingSettings.enableBookingTimeWindow}
                    onChange={(e) => setSchedulingSettings({ ...schedulingSettings, enableBookingTimeWindow: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enableBookingTimeWindow" className="ml-2 text-sm text-gray-600">
                    Enforce a daily booking cutoff time
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Booking Cutoff Time
                </label>
                <select
                  value={schedulingSettings.bookingWindowEndHour}
                  onChange={(e) => setSchedulingSettings({ ...schedulingSettings, bookingWindowEndHour: parseInt(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-600 mt-1">
                  Students cannot book after this time on the day before the trip
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Booking days available (days ahead)
                </label>
                <input
                  type="number"
                  value={schedulingSettings.bookingDaysAhead}
                  onChange={(e) => setSchedulingSettings({ ...schedulingSettings, bookingDaysAhead: parseInt(e.target.value) })}
                  min="1"
                  max="14"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-600 mt-1">
                  How many days ahead learners can book (Sunday is always a holiday)
                </p>
              </div>
```

Then update the "Current Booking Policy" info box list so it renders the configured horizon (replace the static "No booking allowed on the same day" bullet set); keep the existing cutoff bullet that already reads `schedulingSettings.bookingWindowEndHour`, and add:

```tsx
                    <li>• Booking opens for the next {schedulingSettings.bookingDaysAhead} day(s); Sundays remain closed</li>
```

- [ ] **Step 3: Remove references to deleted fields**

Search the file for the removed keys and delete their JSX/handlers:

Run: `grep -n "sendReminderHours\|bookingWindowDaysBefore\|bookingWindowStartHour\|autoNotifyPassengers" "app/(admin)/settings/page.tsx"`
Expected after edits: only `autoNotifyPassengers` may remain if still shown; `sendReminderHours`, `bookingWindowDaysBefore`, `bookingWindowStartHour` must have **zero** matches. Remove any leftover JSX referencing them (the "Reminder Hours" block, the "Auto-notify Passengers" control if you keep it, and the "Booking Window (Days Before)" input).

> Decision for Phase 1: keep `autoNotifyPassengers` out of the Scheduling tab (its canonical control moves to the Notifications tab in Phase 4). The save payload still sends `autoNotifyPassengers` from `schedulingSettings` so the stored value is preserved; just don't render a control for it here.

- [ ] **Step 4: Build + typecheck the page**

Run: `npm run build`
Expected: build succeeds. The Scheduling tab now sends `{ enableBookingTimeWindow, bookingWindowEndHour, bookingDaysAhead, autoNotifyPassengers }`.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/settings/page.tsx" lib/scheduling-config.ts
git commit -m "feat(settings): Scheduling tab exposes bookingDaysAhead, drops decorative fields, live policy text"
```

---

### Task 8: Full-suite verification + manual smoke checklist

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite for touched libs**

Run: `npx vitest run lib/booking lib/settings`
Expected: PASS (window, calendar, scheduling).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no new errors in the touched files.

- [ ] **Step 3: Record the manual smoke test for the user**

The following require the **user's** authenticated browser (agent Chrome is unauthenticated; see memory `project_auth_verification`). Write these as the PR's smoke checklist — do not claim them as passed without the user running them:
  1. Settings → Scheduling: set Cutoff = 7 PM, Booking days available = 3, Save → toast success; reload → values persist.
  2. As a transport learner: the booking calendar shows exactly 3 upcoming days (minus any Sunday), and a date's booking is rejected after 7 PM the prior day.
  3. Set Enable Booking Time Window = off → booking stays open through the prior day for in-horizon dates.
  4. Confirm a non-admin without `tms.settings.manage` gets 403 on save (super admins bypass).

- [ ] **Step 4: Commit any final doc/checklist note (if applicable)**

```bash
git commit --allow-empty -m "chore(settings): Phase 1 verification checkpoint"
```

---

## Self-review notes

- **Spec coverage:** Phase 1 of the design (cutoff wiring, configurable horizon, settings API hardening, UI honesty) is covered by Tasks 1–7; Task 8 is verification. Phases 2–4 are separate plans (to be written next).
- **Type consistency:** `WindowOpts { cutoffHour?, daysAhead? }` is defined in Task 1 and consumed with identical key names in Tasks 2 and 5. `SchedulingConfig` (Task 3) field names (`cutoffHour`, `daysAhead`, `enableBookingTimeWindow`, `autoNotifyPassengers`) match their use in Task 5. The stored blob keys (`bookingWindowEndHour`, `bookingDaysAhead`) are consistent across Tasks 3, 4, 7.
- **Default consistency:** `daysAhead` default is **6** in the pure function (Task 1), the loader/parser (Task 3), the API default (Task 4), and the form default (Task 7). `cutoffHour` default is **20** everywhere.
- **Behavior-change flag:** replacing the variable weekly window with a fixed N-day horizon changes the exact bookable set; the rewritten `window.test.ts` asserts the new behavior and Task 8's smoke checklist covers the observable effect.
