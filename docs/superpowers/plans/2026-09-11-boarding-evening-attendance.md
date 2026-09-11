# Evening Return-Trip Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let boarding staff mark attendance for the evening return trip, switched on from Settings, with Settings changes reaching open staff screens instantly.

**Architecture:** The evening leg was retired only in application code; the database already stores a morning and an evening mark per learner per day. The server clock picks the trip for ordinary marks, via two pure decision functions. A Settings save sends a data-free signal on a private Realtime channel, and open boarding screens re-read the windows through the existing permission-checked endpoint.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres and Realtime, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-boarding-evening-attendance-design.md`

## Global Constraints

- Branch `feat/boarding-evening-attendance`, cut from `main` at `6c39992`.
- Test command: `npx vitest run <path>`. `npm run lint` is broken in this repo and is NOT a gate; never run it.
- `tsc` is red on `main` with ~532 pre-existing errors and is NOT a gate. Check only files you touch, e.g. `npx tsc --noEmit 2>&1 | grep "<path>"`.
- Test files live under `lib/` so vitest resolves the `@/` alias.
- Migrations go in `supabase/migrations/` named `YYYYMMDDHHMMSS_snake_case.sql`, applied with the Supabase MCP tool `mcp__supabase__apply_migration` against the REAL production database. Execute or query every database change once after applying it.
- ORDERING HAZARD: `loadAttendanceWindows` falls back to hard-coded defaults (morning 07:00–09:30) on ANY read error. Once Task 1 makes it select `is_active`, deploying that code before the `is_active` column exists would silently shrink the live morning window. Task 1 applies the column migration before anything else lands.
- `tms_attendance_window.enabled` means "apply the time limit". A window with `enabled = false` is open ALL DAY. It is NOT the evening on/off switch; `is_active` is. Never repurpose `enabled`.
- Morning attendance is always on. Only the evening leg is switched by `is_active`.
- The trip-name words shown to users are exactly `Morning` and `Evening` (see `LEG_NAME`).
- Another session is editing this working tree. `app/globals.css` has changes you did not make. Never stage it. Always `git add` explicit paths, never `git add -A` or `git add .`.

---

### Task 1: Time-window logic for two trips, and the evening switch column

**Files:**
- Create: `supabase/migrations/20260911160000_attendance_window_is_active.sql`
- Modify: `lib/boarding/attendance-window.ts`
- Test: `lib/boarding/attendance-window.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `lib/boarding/attendance-window.ts`:
  - `type AttDirection = 'onward' | 'return'`
  - `interface AttendanceWindow { direction: AttDirection; start: string; end: string; enabled: boolean; active: boolean }`
  - `type AttendanceWindows = { onward: AttendanceWindow; return: AttendanceWindow }`
  - `DEFAULT_WINDOWS: AttendanceWindows` (return 16:30–19:00, enabled, INACTIVE)
  - `LEG_NAME: Record<AttDirection, string>` = `{ onward: 'Morning', return: 'Evening' }`
  - `ATTENDANCE_SETTINGS_TOPIC = 'tms_attendance_settings'`
  - `activeDirection(windows, now?): AttDirection | null`
  - `validateWindows(windows): string | null`
  - `loadAttendanceWindows(svc): Promise<AttendanceWindows>`
  - unchanged: `isDirectionOpen`, `istMinutesOfDay`, `hmToMinutes`, `normalizeTime`, `formatHM`

- [ ] **Step 1: Apply the column migration FIRST**

Create `supabase/migrations/20260911160000_attendance_window_is_active.sql`:

```sql
-- The evening return trip is coming back, switched on from Settings.
--
-- It needs its own on/off switch. The existing `enabled` column CANNOT be that
-- switch: in lib/boarding/attendance-window.ts `enabled = false` means "apply
-- no time limit", i.e. the window is open ALL DAY. Turning the evening row's
-- `enabled` off would open evening marking around the clock, not switch it off.
--
-- `is_active` is the switch. The morning row stays true and is never read as a
-- switch (morning attendance is always on). The evening row starts OFF.

alter table public.tms_attendance_window
  add column if not exists is_active boolean not null default true;

update public.tms_attendance_window
   set is_active = false
 where direction = 'return';
```

Apply it with `mcp__supabase__apply_migration` (name: `attendance_window_is_active`). Then confirm:

```sql
select direction, start_time, end_time, enabled, is_active
from public.tms_attendance_window order by direction;
```

Expected: `onward` with `is_active = true`, `return` with `is_active = false`. Record the output in your report.

- [ ] **Step 2: Update the existing test that assumes a morning-only shape, and add the new failing tests**

In `lib/boarding/attendance-window.test.ts`, change the import to:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  istMinutesOfDay,
  hmToMinutes,
  normalizeTime,
  formatHM,
  isDirectionOpen,
  activeDirection,
  validateWindows,
  loadAttendanceWindows,
  DEFAULT_WINDOWS,
  type AttendanceWindows,
} from './attendance-window';
```

In the existing `describe('activeDirection', ...)`, replace the test `'returns onward at any time when the window is disabled'` with this version, because `AttendanceWindows` now requires both trips:

```ts
  it('returns onward at any time when the window is disabled', () => {
    const win: AttendanceWindows = {
      ...DEFAULT_WINDOWS,
      onward: { ...DEFAULT_WINDOWS.onward, enabled: false },
    };
    expect(activeDirection(win, new Date('2026-07-23T12:30:00Z'))).toBe('onward');
  });
```

Append these new blocks at the end of the file:

```ts
// IST is UTC+5:30. 08:00 IST = 02:30Z, 16:30 IST = 11:00Z, 17:00 IST = 11:30Z, 20:00 IST = 14:30Z.
const withEvening = (over: Partial<AttendanceWindows['return']> = {}): AttendanceWindows => ({
  onward: { ...DEFAULT_WINDOWS.onward },
  return: { ...DEFAULT_WINDOWS.return, active: true, ...over },
});

describe('activeDirection with two trips', () => {
  it('is onward inside the morning window', () => {
    expect(activeDirection(withEvening(), new Date('2026-07-23T02:30:00Z'))).toBe('onward');
  });
  it('is return inside the evening window when evening is switched on', () => {
    expect(activeDirection(withEvening(), new Date('2026-07-23T11:30:00Z'))).toBe('return');
  });
  it('is null inside the evening window when evening is switched off', () => {
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-07-23T11:30:00Z'))).toBeNull();
  });
  it('is null outside both windows', () => {
    expect(activeDirection(withEvening(), new Date('2026-07-23T14:30:00Z'))).toBeNull();
  });
  it('lets morning win if stored data overlaps despite validation', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward, end: '17:30' },
      return: { ...DEFAULT_WINDOWS.return, active: true },
    };
    expect(activeDirection(w, new Date('2026-07-23T11:30:00Z'))).toBe('onward');
  });
});

describe('validateWindows', () => {
  it('accepts the defaults', () => {
    expect(validateWindows(DEFAULT_WINDOWS)).toBeNull();
  });
  it('refuses overlapping windows when evening is switched on', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward, end: '17:30' },
      return: { ...DEFAULT_WINDOWS.return, active: true },
    };
    expect(validateWindows(w)).toBe('End the morning window at or before 4:30 PM to switch on evening attendance.');
  });
  it('allows a morning that ends exactly when the evening starts', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward, end: '16:30' },
      return: { ...DEFAULT_WINDOWS.return, active: true },
    };
    expect(validateWindows(w)).toBeNull();
  });
  it('refuses switching evening on while either trip has no set hours', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward, enabled: false },
      return: { ...DEFAULT_WINDOWS.return, active: true },
    };
    expect(validateWindows(w)).toBe('To switch on evening attendance, both trips need set hours. Turn Enforce on for both.');
  });
  it('ignores the evening times while evening is switched off', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward },
      return: { ...DEFAULT_WINDOWS.return, start: '19:00', end: '16:00', active: false },
    };
    expect(validateWindows(w)).toBeNull();
  });
  it('refuses an evening that starts after it ends when switched on', () => {
    expect(validateWindows(withEvening({ start: '19:00', end: '16:00' })))
      .toBe('Evening: start time must be before end time');
  });
  it('refuses a morning that starts after it ends', () => {
    const w: AttendanceWindows = { ...DEFAULT_WINDOWS, onward: { ...DEFAULT_WINDOWS.onward, start: '10:00', end: '09:00' } };
    expect(validateWindows(w)).toBe('Morning: start time must be before end time');
  });
});

describe('loadAttendanceWindows', () => {
  const fakeSvc = (result: { data: unknown; error: unknown }) =>
    ({ from: () => ({ select: async () => result }) }) as unknown as SupabaseClient;

  it('reads both trips and the evening switch', async () => {
    const w = await loadAttendanceWindows(fakeSvc({
      data: [
        { direction: 'onward', start_time: '07:00:00', end_time: '16:30:00', enabled: true, is_active: true },
        { direction: 'return', start_time: '16:30:00', end_time: '19:00:00', enabled: true, is_active: true },
      ],
      error: null,
    }));
    expect(w.onward).toEqual({ direction: 'onward', start: '07:00', end: '16:30', enabled: true, active: true });
    expect(w.return).toEqual({ direction: 'return', start: '16:30', end: '19:00', enabled: true, active: true });
  });
  it('never treats the morning row as switched off', async () => {
    const w = await loadAttendanceWindows(fakeSvc({
      data: [{ direction: 'onward', start_time: '07:00:00', end_time: '09:30:00', enabled: true, is_active: false }],
      error: null,
    }));
    expect(w.onward.active).toBe(true);
  });
  it('keeps evening off when there is no evening row', async () => {
    const w = await loadAttendanceWindows(fakeSvc({
      data: [{ direction: 'onward', start_time: '07:00:00', end_time: '09:30:00', enabled: true, is_active: true }],
      error: null,
    }));
    expect(w.return.active).toBe(false);
  });
  it('falls back to the defaults on a read error', async () => {
    const w = await loadAttendanceWindows(fakeSvc({ data: null, error: { message: 'boom' } }));
    expect(w).toEqual(DEFAULT_WINDOWS);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run lib/boarding/attendance-window.test.ts`
Expected: FAIL — `validateWindows` is not exported, and the two-trip cases fail.

- [ ] **Step 4: Implement**

In `lib/boarding/attendance-window.ts`:

Replace the file header comment's "History note" paragraph and the line "Attendance is Onward (morning) only." with:

```ts
/**
 * Pure IST time-of-day logic for attendance scan windows + a thin DB loader.
 *
 * Two trips: the morning (onward) trip is always on; the evening (return) trip
 * is switched on from Settings via `tms_attendance_window.is_active`. The server
 * clock picks which trip a mark belongs to (activeDirection). India has no DST,
 * so IST is a fixed +5:30 offset and all math is deterministic integer
 * arithmetic — no timezone lib, fully unit-testable. The pure functions never
 * touch the DB; `loadAttendanceWindows` wraps the table and falls back to
 * DEFAULT_WINDOWS if it's absent/empty.
 *
 * `enabled` means "apply the time limit": a window with enabled=false is open
 * ALL DAY. It is NOT an on/off switch — `active` (the is_active column) is.
 */
```

Replace the type block and defaults:

```ts
export type AttDirection = 'onward' | 'return';

export interface AttendanceWindow {
  direction: AttDirection;
  start: string;   // 'HH:MM' IST
  end: string;     // 'HH:MM' IST
  enabled: boolean; // false ⇒ no time restriction (always open). NOT an on/off switch.
  /** Is this trip's attendance switched on at all? Morning always; evening from Settings. */
  active: boolean;
}

export type AttendanceWindows = { onward: AttendanceWindow; return: AttendanceWindow };

/** Defaults used until an admin customises them (and the fallback if the table is missing). */
export const DEFAULT_WINDOWS: AttendanceWindows = {
  onward: { direction: 'onward', start: '07:00', end: '09:30', enabled: true, active: true },
  return: { direction: 'return', start: '16:30', end: '19:00', enabled: true, active: false },
};

/** The words staff see for each trip. */
export const LEG_NAME: Record<AttDirection, string> = { onward: 'Morning', return: 'Evening' };

/**
 * Private Realtime topic a Settings save signals on. Shared by the sender
 * (lib/boarding/attendance-broadcast.ts), the listener
 * (hooks/use-attendance-settings-live.ts) and the receive policy on
 * realtime.messages, which matches this exact string.
 */
export const ATTENDANCE_SETTINGS_TOPIC = 'tms_attendance_settings';
```

Replace `activeDirection`:

```ts
/**
 * Which trip a mark made right now belongs to, by the clock: morning while its
 * window is open; otherwise evening, if switched on and its window is open;
 * otherwise null. Settings refuse overlapping windows, but if stored data ever
 * overlaps (a direct SQL edit), morning wins so the answer stays deterministic.
 */
export function activeDirection(windows: AttendanceWindows, now: Date = new Date()): AttDirection | null {
  if (isDirectionOpen(windows.onward, now)) return 'onward';
  if (windows.return.active && isDirectionOpen(windows.return, now)) return 'return';
  return null;
}

/**
 * Settings validation, shared by the admin API and the Settings screen.
 * Returns the message to show, or null when the windows are acceptable.
 *
 * With evening switched on, the clock can only pick the trip if both windows
 * have set hours and do not overlap. Intervals are half-open [start, end), so a
 * morning ending at 16:30 and an evening starting at 16:30 do not overlap.
 */
export function validateWindows(w: AttendanceWindows): string | null {
  if (hmToMinutes(w.onward.start) >= hmToMinutes(w.onward.end)) {
    return `${LEG_NAME.onward}: start time must be before end time`;
  }
  if (!w.return.active) return null;
  if (hmToMinutes(w.return.start) >= hmToMinutes(w.return.end)) {
    return `${LEG_NAME.return}: start time must be before end time`;
  }
  if (!w.onward.enabled || !w.return.enabled) {
    return 'To switch on evening attendance, both trips need set hours. Turn Enforce on for both.';
  }
  const overlap =
    hmToMinutes(w.onward.start) < hmToMinutes(w.return.end) &&
    hmToMinutes(w.return.start) < hmToMinutes(w.onward.end);
  if (overlap) {
    return `End the morning window at or before ${formatHM(w.return.start)} to switch on evening attendance.`;
  }
  return null;
}
```

Replace `loadAttendanceWindows`:

```ts
/**
 * Load both trips' windows from the DB; each falls back to DEFAULT_WINDOWS when
 * its row is absent, and both do on a read error. The morning row's is_active is
 * ignored: morning attendance is always on.
 */
export async function loadAttendanceWindows(svc: SupabaseClient): Promise<AttendanceWindows> {
  const out: AttendanceWindows = {
    onward: { ...DEFAULT_WINDOWS.onward },
    return: { ...DEFAULT_WINDOWS.return },
  };
  const { data, error } = await svc
    .from('tms_attendance_window')
    .select('direction, start_time, end_time, enabled, is_active');
  if (error || !data) return out; // missing table / empty ⇒ defaults
  for (const r of data as {
    direction: string; start_time: string; end_time: string; enabled: boolean; is_active: boolean | null;
  }[]) {
    if (r.direction !== 'onward' && r.direction !== 'return') continue;
    out[r.direction] = {
      direction: r.direction,
      start: normalizeTime(r.start_time),
      end: normalizeTime(r.end_time),
      enabled: r.enabled,
      active: r.direction === 'onward' ? true : r.is_active === true,
    };
  }
  return out;
}
```

`validateWindows` calls `formatHM`, which is declared earlier in the file; if `validateWindows` sits above `formatHM`, that is fine for function declarations.

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run lib/boarding/attendance-window.test.ts`
Expected: PASS, every test including the updated disabled-window one.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260911160000_attendance_window_is_active.sql lib/boarding/attendance-window.ts lib/boarding/attendance-window.test.ts
git commit -m "feat(attendance): model the evening trip and its on/off switch"
```

---

### Task 2: Which trip a mark, scan or undo is for

**Files:**
- Create: `lib/boarding/trip-direction.ts`
- Test: `lib/boarding/trip-direction.test.ts`

**Interfaces:**
- Consumes from Task 1: `activeDirection`, `formatHM`, `LEG_NAME`, `AttDirection`, `AttendanceWindows`, `DEFAULT_WINDOWS`.
- Produces:
  - `type DirectionDecision = { ok: true; direction: AttDirection } | { ok: false; status: number; reason: 'window_closed' | 'wrong_trip' | 'evening_off' | 'bad_direction'; error: string }`
  - `openHoursText(windows: AttendanceWindows): string`
  - `decideMarkDirection(args: { windows: AttendanceWindows; requested: unknown; windowExempt: boolean; now?: Date }): DirectionDecision`
  - `decideClearDirection(args: { windows: AttendanceWindows; requested: unknown }): DirectionDecision`

- [ ] **Step 1: Write the failing test**

Create `lib/boarding/trip-direction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideMarkDirection, decideClearDirection, openHoursText } from './trip-direction';
import { DEFAULT_WINDOWS, type AttendanceWindows } from './attendance-window';

// IST is UTC+5:30. 08:00 IST = 02:30Z, 17:00 IST = 11:30Z, 20:00 IST = 14:30Z.
const AT_0800 = new Date('2026-09-12T02:30:00Z');
const AT_1700 = new Date('2026-09-12T11:30:00Z');
const AT_2000 = new Date('2026-09-12T14:30:00Z');

const eveningOn: AttendanceWindows = {
  onward: { ...DEFAULT_WINDOWS.onward },
  return: { ...DEFAULT_WINDOWS.return, active: true },
};
const eveningOff = DEFAULT_WINDOWS;

describe('openHoursText', () => {
  it('names only the morning while evening is off', () => {
    expect(openHoursText(eveningOff)).toBe('morning 7:00 AM–9:30 AM');
  });
  it('names both trips while evening is on', () => {
    expect(openHoursText(eveningOn)).toBe('morning 7:00 AM–9:30 AM, evening 4:30 PM–7:00 PM');
  });
});

describe('decideMarkDirection, ordinary staff', () => {
  const staff = (windows: AttendanceWindows, requested: unknown, now: Date) =>
    decideMarkDirection({ windows, requested, windowExempt: false, now });

  it('is the morning trip in the morning', () => {
    expect(staff(eveningOff, undefined, AT_0800)).toEqual({ ok: true, direction: 'onward' });
  });
  it('accepts a request that names the trip the clock agrees with', () => {
    expect(staff(eveningOn, 'onward', AT_0800)).toEqual({ ok: true, direction: 'onward' });
  });
  it('is the evening trip in the evening when evening is on', () => {
    expect(staff(eveningOn, undefined, AT_1700)).toEqual({ ok: true, direction: 'return' });
  });
  it('refuses a stale screen that asks for the morning trip during the evening', () => {
    expect(staff(eveningOn, 'onward', AT_1700)).toEqual({
      ok: false, status: 409, reason: 'wrong_trip',
      error: 'It is the evening trip now. Reload the page to mark it.',
    });
  });
  it('refuses outside every open window, naming the hours of both trips', () => {
    expect(staff(eveningOn, undefined, AT_2000)).toEqual({
      ok: false, status: 409, reason: 'window_closed',
      error: 'Attendance is open morning 7:00 AM–9:30 AM, evening 4:30 PM–7:00 PM only.',
    });
  });
  it('refuses the evening while evening is switched off', () => {
    expect(staff(eveningOff, undefined, AT_1700)).toEqual({
      ok: false, status: 409, reason: 'window_closed',
      error: 'Attendance is open morning 7:00 AM–9:30 AM only.',
    });
  });
  it('refuses an unknown trip value', () => {
    expect(staff(eveningOn, 'sideways', AT_0800)).toEqual({
      ok: false, status: 400, reason: 'bad_direction', error: 'Unknown trip.',
    });
  });
});

describe('decideMarkDirection, window-exempt correction', () => {
  const exempt = (windows: AttendanceWindows, requested: unknown, now: Date) =>
    decideMarkDirection({ windows, requested, windowExempt: true, now });

  it('corrects the trip it names, even with no window open', () => {
    expect(exempt(eveningOn, 'return', AT_2000)).toEqual({ ok: true, direction: 'return' });
  });
  it('may not correct the evening while evening is switched off', () => {
    expect(exempt(eveningOff, 'return', AT_2000)).toEqual({
      ok: false, status: 409, reason: 'evening_off', error: 'Evening attendance is switched off.',
    });
  });
  it('falls back to the clock when no trip is named', () => {
    expect(exempt(eveningOn, undefined, AT_1700)).toEqual({ ok: true, direction: 'return' });
  });
  it('falls back to the morning when no trip is named and none is open', () => {
    expect(exempt(eveningOn, undefined, AT_2000)).toEqual({ ok: true, direction: 'onward' });
  });
});

describe('decideClearDirection', () => {
  it('undoes the morning mark when no trip is named', () => {
    expect(decideClearDirection({ windows: eveningOn, requested: undefined })).toEqual({ ok: true, direction: 'onward' });
  });
  it('undoes the trip it names, not the one the clock says', () => {
    // An undo has no time window: at 17:00, undoing a morning mark must not
    // delete the evening one.
    expect(decideClearDirection({ windows: eveningOn, requested: 'onward' })).toEqual({ ok: true, direction: 'onward' });
    expect(decideClearDirection({ windows: eveningOn, requested: 'return' })).toEqual({ ok: true, direction: 'return' });
  });
  it('refuses the evening while evening is switched off', () => {
    expect(decideClearDirection({ windows: eveningOff, requested: 'return' })).toEqual({
      ok: false, status: 409, reason: 'evening_off', error: 'Evening attendance is switched off.',
    });
  });
  it('refuses an unknown trip value', () => {
    expect(decideClearDirection({ windows: eveningOn, requested: 'x' })).toEqual({
      ok: false, status: 400, reason: 'bad_direction', error: 'Unknown trip.',
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/boarding/trip-direction.test.ts`
Expected: FAIL — cannot find `./trip-direction`.

- [ ] **Step 3: Implement**

Create `lib/boarding/trip-direction.ts`:

```ts
import {
  activeDirection, formatHM, LEG_NAME,
  type AttDirection, type AttendanceWindows,
} from './attendance-window';

/**
 * trip-direction — which trip (morning or evening) a mark, scan or undo is for.
 * Pure, so each rule below is pinned by a test.
 *
 * The three callers need DIFFERENT rules, and that is the point of this file:
 *  - A scan, or a mark by ordinary staff: the SERVER CLOCK decides. A request
 *    naming a different trip is refused, not overridden — silently using the
 *    clock's trip would record an evening mark from a staffer looking at a
 *    stale morning roster.
 *  - A mark by a window-exempt caller (super admin, override holder): they
 *    correct marks OUTSIDE the windows, where the clock has no answer, so they
 *    name the trip.
 *  - An undo: there is no time window on undo, and it removes one specific
 *    existing mark, so it names the trip. The clock must not decide — an undo
 *    at 17:00 would otherwise delete the evening mark meant to be the morning one.
 */

export type DirectionDecision =
  | { ok: true; direction: AttDirection }
  | {
      ok: false;
      status: number;
      reason: 'window_closed' | 'wrong_trip' | 'evening_off' | 'bad_direction';
      error: string;
    };

const BAD: DirectionDecision = { ok: false, status: 400, reason: 'bad_direction', error: 'Unknown trip.' };
const EVENING_OFF: DirectionDecision = {
  ok: false, status: 409, reason: 'evening_off', error: 'Evening attendance is switched off.',
};

/** undefined/null/'' = none named; a known trip; or 'invalid'. */
function parseRequested(requested: unknown): AttDirection | null | 'invalid' {
  if (requested === undefined || requested === null || requested === '') return null;
  return requested === 'onward' || requested === 'return' ? requested : 'invalid';
}

/** "morning 7:00 AM–9:30 AM, evening 4:30 PM–7:00 PM" — every switched-on trip. */
export function openHoursText(w: AttendanceWindows): string {
  const legs = w.return.active ? [w.onward, w.return] : [w.onward];
  return legs
    .map((l) => `${LEG_NAME[l.direction].toLowerCase()} ${formatHM(l.start)}–${formatHM(l.end)}`)
    .join(', ');
}

export function decideMarkDirection(args: {
  windows: AttendanceWindows;
  requested: unknown;
  windowExempt: boolean;
  now?: Date;
}): DirectionDecision {
  const requested = parseRequested(args.requested);
  if (requested === 'invalid') return BAD;

  if (args.windowExempt) {
    if (requested === 'return' && !args.windows.return.active) return EVENING_OFF;
    return { ok: true, direction: requested ?? activeDirection(args.windows, args.now) ?? 'onward' };
  }

  const current = activeDirection(args.windows, args.now);
  if (!current) {
    return {
      ok: false, status: 409, reason: 'window_closed',
      error: `Attendance is open ${openHoursText(args.windows)} only.`,
    };
  }
  if (requested && requested !== current) {
    return {
      ok: false, status: 409, reason: 'wrong_trip',
      error: `It is the ${LEG_NAME[current].toLowerCase()} trip now. Reload the page to mark it.`,
    };
  }
  return { ok: true, direction: current };
}

export function decideClearDirection(args: {
  windows: AttendanceWindows;
  requested: unknown;
}): DirectionDecision {
  const requested = parseRequested(args.requested);
  if (requested === 'invalid') return BAD;
  if (requested === 'return' && !args.windows.return.active) return EVENING_OFF;
  return { ok: true, direction: requested ?? 'onward' };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run lib/boarding/trip-direction.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/trip-direction.ts lib/boarding/trip-direction.test.ts
git commit -m "feat(attendance): decide which trip a mark, scan or undo is for"
```

---

### Task 3: Settings save accepts the evening trip and signals open screens

**Files:**
- Create: `lib/boarding/attendance-broadcast.ts`
- Create: `supabase/migrations/20260911161000_attendance_settings_realtime_receive.sql`
- Modify: `app/api/admin/attendance-windows/route.ts`

**Interfaces:**
- Consumes from Task 1: `loadAttendanceWindows`, `validateWindows`, `LEG_NAME`, `ATTENDANCE_SETTINGS_TOPIC`, `AttDirection`, `AttendanceWindow`, `AttendanceWindows`.
- Produces:
  - `publishAttendanceSettingsChanged(): Promise<boolean>` in `lib/boarding/attendance-broadcast.ts`.
  - `GET /api/admin/attendance-windows` → `{ success: true, data: { windows: AttendanceWindows } }`.
  - `PUT /api/admin/attendance-windows` accepts `{ onward?: { start, end, enabled }, return?: { start, end, enabled, active } }` and returns `{ success: true, data: { windows } }` or `{ error }` with status 400.
  - RLS policy `tms_attendance_settings_realtime_receive` on `realtime.messages`.

- [ ] **Step 1: Create the sender**

Create `lib/boarding/attendance-broadcast.ts`:

```ts
import { ATTENDANCE_SETTINGS_TOPIC } from './attendance-window';

/**
 * Tell open boarding screens that the attendance windows just changed, so they
 * re-read them now instead of on their next reload.
 *
 * Mirrors publishFix in lib/tracking/broadcast.ts: one POST to the Realtime HTTP
 * broadcast endpoint with the service-role key, because a websocket per
 * serverless invocation costs more than the message.
 *
 * The payload is EMPTY on purpose. The signal only says "re-read"; each screen
 * re-reads through GET /api/boarding/attendance-window, which checks the
 * caller's permission. What a staffer may see is decided there, never here.
 *
 * Never throws. It runs after the settings write has committed, so a failed
 * signal may only delay a screen, which also re-reads on focus and every two
 * minutes — it can never corrupt anything.
 */
export async function publishAttendanceSettingsChanged(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: [{ topic: ATTENDANCE_SETTINGS_TOPIC, event: 'changed', payload: {}, private: true }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Apply the receive policy**

Create `supabase/migrations/20260911161000_attendance_settings_realtime_receive.sql`:

```sql
-- Who may RECEIVE the "attendance settings changed" signal on the private
-- Realtime topic 'tms_attendance_settings'. Mirrors tms_bus_realtime_receive
-- (for select, to authenticated), but is a separate policy: the bus policy is
-- not touched.
--
-- Only staff who may scan (tms.attendance.scan) receive it. The signal carries
-- no data at all — it only tells a screen to re-read the windows through
-- GET /api/boarding/attendance-window, which checks the same permission.

drop policy if exists tms_attendance_settings_realtime_receive on realtime.messages;

create policy tms_attendance_settings_realtime_receive
  on realtime.messages
  for select
  to authenticated
  using (
    topic = 'tms_attendance_settings'
    and public.user_has_permission('tms.attendance.scan')
  );
```

Apply with `mcp__supabase__apply_migration` (name: `attendance_settings_realtime_receive`). Then confirm the new policy exists AND the bus policy is unchanged:

```sql
select policyname, cmd, roles::text, qual
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;
```

Expected: `tms_attendance_settings_realtime_receive` (SELECT, `{authenticated}`) is present, and `tms_bus_realtime_receive` still reads exactly:
`(((topic ~~ 'tms_bus:%'::text) AND tms_can_view_route_live((NULLIF(split_part(topic, ':'::text, 2), ''::text))::uuid)) OR ((topic = 'tms_fleet'::text) AND user_has_permission('tms.tracking.fleet.view'::text)))`

- [ ] **Step 3: Rewrite the admin route for two trips**

In `app/api/admin/attendance-windows/route.ts`:

Replace the imports line for attendance-window with:

```ts
import {
  loadAttendanceWindows, validateWindows, LEG_NAME,
  type AttDirection, type AttendanceWindow, type AttendanceWindows,
} from '@/lib/boarding/attendance-window';
import { publishAttendanceSettingsChanged } from '@/lib/boarding/attendance-broadcast';
```

Replace the file's header comment with:

```ts
/**
 * Admin read/update of the attendance windows: the morning (onward) trip, and
 * the evening (return) trip with its on/off switch. Gated on .manage (stronger
 * than the scanner's .scan). Times are 'HH:MM'. The scan flow, the marking
 * endpoints and the boarding page read the same config via
 * loadAttendanceWindows. A save signals open boarding screens to re-read.
 */
```

Replace the `WindowInput` interface and the whole `validate` function with:

```ts
interface WindowInput { start?: string; end?: string; enabled?: boolean; active?: boolean }

/** Shape-check one trip's input, filling missing fields from what is stored. */
function parseWindow(dir: AttDirection, w: WindowInput, stored: AttendanceWindow): AttendanceWindow | string {
  const start = String(w.start ?? stored.start);
  const end = String(w.end ?? stored.end);
  if (!HM.test(start) || !HM.test(end)) return `${LEG_NAME[dir]}: start/end must be HH:MM`;
  return {
    direction: dir,
    start,
    end,
    enabled: w.enabled !== false,
    // Morning attendance is always on; only the evening has a switch.
    active: dir === 'onward' ? true : w.active === true,
  };
}
```

Leave `getWindows` as it is (it already returns `loadAttendanceWindows(svc)`, which now includes the evening trip).

Replace the whole `putWindows` function with:

```ts
async function putWindows(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { onward?: WindowInput; return?: WindowInput };
    const svc = createServiceRoleClient();
    const stored = await loadAttendanceWindows(svc);

    const onward = parseWindow('onward', body.onward ?? {}, stored.onward);
    if (typeof onward === 'string') return NextResponse.json({ error: onward }, { status: 400 });

    // An older Settings screen sends no `return` key. Keep the stored evening
    // row exactly as it is, rather than reading the absence as "switch it off".
    const ret = body.return ? parseWindow('return', body.return, stored.return) : stored.return;
    if (typeof ret === 'string') return NextResponse.json({ error: ret }, { status: 400 });

    const windows: AttendanceWindows = { onward, return: ret };
    const invalid = validateWindows(windows);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const now = new Date().toISOString();
    const rows = [onward, ret].map((w) => ({
      direction: w.direction,
      start_time: w.start,
      end_time: w.end,
      enabled: w.enabled,
      is_active: w.active,
      updated_at: now,
      updated_by: auth.userId,
    }));
    const { error } = await svc.from('tms_attendance_window').upsert(rows, { onConflict: 'direction' });
    if (error) {
      console.error('admin attendance-windows PUT error:', error);
      return NextResponse.json({ error: 'Failed to save attendance windows' }, { status: 500 });
    }

    const leg = (w: AttendanceWindow) => `${w.start}-${w.end}${w.enabled ? '' : ' (not enforced)'}`;
    await logActivity(auth, request, {
      module: 'settings',
      action: 'update',
      entityType: 'tms_attendance_window',
      description:
        `Updated attendance windows — morning ${leg(onward)}; evening ${ret.active ? leg(ret) : 'off'}`,
      metadata: { windows },
    });

    // After the write has committed. A failed signal only delays open screens;
    // the server enforces the new times on the very next request regardless.
    await publishAttendanceSettingsChanged();

    return NextResponse.json({ success: true, data: { windows } });
  } catch (e) {
    console.error('admin attendance-windows PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

If `hmToMinutes` is no longer used in this file after the rewrite, it is no longer imported — the import line above already omits it. `HM` stays defined as it was.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "attendance-windows/route|attendance-broadcast"`
Expected: no output.

Run: `npx vitest run lib/boarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/boarding/attendance-broadcast.ts supabase/migrations/20260911161000_attendance_settings_realtime_receive.sql app/api/admin/attendance-windows/route.ts
git commit -m "feat(settings): save the evening trip and signal open boarding screens"
```

---

### Task 4: Marking endpoints mark the right trip

**Files:**
- Modify: `app/api/boarding/scan/route.ts`
- Modify: `app/api/boarding/attendance/route.ts` (the POST mark handler and the DELETE clear handler)

**Interfaces:**
- Consumes from Task 1: `loadAttendanceWindows`, `activeDirection`, `AttDirection`. From Task 2: `decideMarkDirection`, `decideClearDirection`.
- Produces: the scan and mark endpoints now return 409 with `reason: 'window_closed' | 'wrong_trip' | 'evening_off'` and 400 with `reason: 'bad_direction'`, in their existing error shapes. A successful scan's `direction` field can now be `'return'`.

Read both files end to end before editing. The ONLY change is where `direction` comes from. Every other gate — permission, identity resolution, learner lookup, allocated route, route assignment, share ownership, booking and walk-up, the atomic write — stays exactly where it is.

- [ ] **Step 1: Scan endpoint**

In `app/api/boarding/scan/route.ts`:

Change the attendance-window import to:

```ts
import { loadAttendanceWindows, activeDirection, type AttDirection } from '@/lib/boarding/attendance-window';
import { decideMarkDirection } from '@/lib/boarding/trip-direction';
```

Delete this block entirely:

```ts
    // Attendance is onward-only. A stale client requesting the retired evening
    // leg must fail loudly rather than silently having its scan recorded as onward.
    if (body.direction && body.direction !== 'onward') {
      return NextResponse.json(
        { ok: false, error: 'Only onward (morning) attendance is supported.' },
        { status: 400 },
      );
    }
    const direction: AttDirection = 'onward';
```

Replace the time-window gate block, which currently reads:

```ts
    // Time-window gate: scanning is only allowed inside the admin-configurable
    // morning window. Outside it, the scan is rejected rather than recorded.
    const windows = await loadAttendanceWindows(svc);
    if (!isDirectionOpen(windows[direction])) {
      const w = windows[direction];
      return NextResponse.json({
        ok: false,
        reason: 'window_closed',
        error: `Onward (morning) scanning is open ${formatHM(w.start)}–${formatHM(w.end)} only.`,
        activeDirection: activeDirection(windows),
      }, { status: 409 });
    }
```

with:

```ts
    // Which trip, and whether scanning is open at all. The server clock decides;
    // a scanner that names a different trip is on a stale screen and is refused
    // rather than silently recorded on the other trip. See trip-direction.ts.
    const windows = await loadAttendanceWindows(svc);
    const decided = decideMarkDirection({ windows, requested: body.direction, windowExempt: false });
    if (!decided.ok) {
      return NextResponse.json({
        ok: false,
        reason: decided.reason,
        error: decided.error,
        activeDirection: activeDirection(windows),
      }, { status: decided.status });
    }
    const direction: AttDirection = decided.direction;
```

Confirm with `grep -n "direction" app/api/boarding/scan/route.ts` that nothing between the deleted block and the new declaration reads `direction`.

- [ ] **Step 2: Mark handler (POST)**

In `app/api/boarding/attendance/route.ts`:

Change the attendance-window import to:

```ts
import { loadAttendanceWindows, type AttDirection } from '@/lib/boarding/attendance-window';
import { decideMarkDirection, decideClearDirection } from '@/lib/boarding/trip-direction';
```

If `isDirectionOpen` or `formatHM` are still referenced anywhere else in this file after the edits below, keep them in the import; check with grep.

In the mark handler, delete:

```ts
    // Attendance is onward-only. A stale client requesting the retired evening
    // leg must fail loudly rather than silently having its marks recorded as onward.
    if (body.direction && body.direction !== 'onward') {
      return NextResponse.json(
        { error: 'Only onward (morning) attendance is supported.' },
        { status: 400 },
      );
    }
```

and delete the line:

```ts
    const direction: AttDirection = 'onward';
```

(the one directly after `const routeId = String(body.routeId ?? '');` in the mark handler).

Replace the mark handler's time-window gate, which currently reads:

```ts
    if (!auth.isSuperAdmin && !isOverrideHolder) {
      const windows = await loadAttendanceWindows(svc);
      if (!isDirectionOpen(windows[direction])) {
        const w = windows[direction];
        return NextResponse.json({
          error: `Onward (morning) marking is open ${formatHM(w.start)}–${formatHM(w.end)} only.`,
          reason: 'window_closed',
        }, { status: 409 });
      }
    }
```

with:

```ts
    // Which trip. Ordinary staff get the server clock's trip and are refused
    // outside the windows. A window-exempt caller (super admin, override holder)
    // corrects marks outside the windows, where the clock has no answer, so they
    // name the trip. See lib/boarding/trip-direction.ts.
    const windows = await loadAttendanceWindows(svc);
    const decided = decideMarkDirection({
      windows,
      requested: body.direction,
      windowExempt: auth.isSuperAdmin || isOverrideHolder,
    });
    if (!decided.ok) {
      return NextResponse.json({ error: decided.error, reason: decided.reason }, { status: decided.status });
    }
    const direction: AttDirection = decided.direction;
```

Keep the explanatory comment that sits immediately above the old gate (the one about override holders fixing marks after the window closes).

Confirm with grep that nothing in the mark handler reads `direction` between `const routeId` and the new declaration.

- [ ] **Step 3: Clear handler (DELETE)**

In the clear handler, delete:

```ts
    // Attendance is onward-only. A stale client requesting the retired evening
    // leg must fail loudly rather than silently clearing the wrong (or a nonexistent) leg.
    if (body.direction && body.direction !== 'onward') {
      return NextResponse.json(
        { error: 'Only onward (morning) attendance is supported.' },
        { status: 400 },
      );
    }
```

and delete its line:

```ts
    const direction: AttDirection = 'onward';
```

Directly after the clear handler's `const svc = createServiceRoleClient();`, insert:

```ts
    // An undo names the trip whose mark it removes. The clock must NOT decide:
    // there is no time window on undo, and at 17:00 the clock would say
    // "evening" while the staffer is undoing a morning mark.
    const windows = await loadAttendanceWindows(svc);
    const decided = decideClearDirection({ windows, requested: body.direction });
    if (!decided.ok) {
      return NextResponse.json({ error: decided.error, reason: decided.reason }, { status: decided.status });
    }
    const direction: AttDirection = decided.direction;
```

Confirm with grep that nothing in the clear handler reads `direction` before this new declaration.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/api/boarding/(scan|attendance)/route"`
Expected: no output.

Run: `npx vitest run lib/boarding lib/booking`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/boarding/scan/route.ts app/api/boarding/attendance/route.ts
git commit -m "feat(attendance): mark, scan and undo the right trip"
```

---

### Task 5: Boarding page tabs, live settings, and a trip-aware scanner

**Files:**
- Create: `hooks/use-attendance-settings-live.ts`
- Modify: `app/boarding/attendance/page.tsx`
- Modify: `components/boarding/scan-dialog.tsx`

**Interfaces:**
- Consumes from Task 1: `activeDirection`, `LEG_NAME`, `ATTENDANCE_SETTINGS_TOPIC`, `DEFAULT_WINDOWS`, `AttDirection`, `AttendanceWindows`. From Task 2: `openHoursText`. From Task 4: the scan endpoint returns `direction` and may refuse with `reason: 'wrong_trip'`.
- Produces: `useAttendanceSettingsLive(): void`.

- [ ] **Step 1: The live listener**

Create `hooks/use-attendance-settings-live.ts`:

```ts
'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ATTENDANCE_SETTINGS_TOPIC } from '@/lib/boarding/attendance-window';

/**
 * Re-read the attendance windows the moment an admin saves them in Settings.
 *
 * The server sends a data-free "changed" signal on the private topic (see
 * lib/boarding/attendance-broadcast.ts); on receipt this invalidates the page's
 * windows query, which re-reads through the permission-checked
 * GET /api/boarding/attendance-window. Receiving is limited to scan-capable
 * staff by the tms_attendance_settings_realtime_receive policy.
 *
 * BARE TOPIC, no `#instance` suffix. hooks/use-live-bus.ts appends one because
 * several consumers on a page share a topic on the singleton client; this hook
 * has one subscriber per page, so it listens on the exact name the server sends to.
 *
 * Phones drop live connections in the background, so the page also re-reads on
 * tab focus and every two minutes. This hook is the fast path, not the only one.
 */
export function useAttendanceSettingsLive(): void {
  const qc = useQueryClient();
  const supabaseRef = useRef(createClientSupabaseClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // A private channel is authorized against realtime.messages RLS, which
      // needs the user's JWT on the socket.
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch {
        /* subscribe will fail; the focus and two-minute re-reads still apply */
      }
      if (!active) return;

      const ch = supabase
        .channel(ATTENDANCE_SETTINGS_TOPIC, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, () => {
          void qc.invalidateQueries({ queryKey: ['boarding-attendance-window'] });
        })
        .subscribe();

      channel = ch;
      // Unmounted while awaiting getSession() (StrictMode/navigation) — tear down now.
      if (!active) {
        supabase.removeChannel(ch);
        channel = null;
      }
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);
}
```

- [ ] **Step 2: Boarding attendance page**

In `app/boarding/attendance/page.tsx`:

Change the attendance-window import to:

```ts
import {
  DEFAULT_WINDOWS, activeDirection, LEG_NAME,
  type AttendanceWindows, type AttDirection,
} from '@/lib/boarding/attendance-window';
import { openHoursText } from '@/lib/boarding/trip-direction';
import { useAttendanceSettingsLive } from '@/hooks/use-attendance-settings-live';
```

If `formatHM` or `isDirectionOpen` are still used elsewhere in the page after these edits, add them back to the import; check with grep. Make sure `useRef` is imported from `react` alongside the existing hooks.

Replace `fetchWindows` with:

```ts
async function fetchWindows(): Promise<{ windows: AttendanceWindows; activeDirection: AttDirection | null }> {
  const res = await fetch('/api/boarding/attendance-window', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json?.success) return { windows: DEFAULT_WINDOWS, activeDirection: null };
  return {
    windows: json.data.windows as AttendanceWindows,
    // The server's clock, not the phone's: a wrong device clock must not open the wrong tab.
    activeDirection: (json.data.activeDirection ?? null) as AttDirection | null,
  };
}
```

Replace the constant:

```ts
  const direction: AttDirection = 'onward';
```

with:

```ts
  const [direction, setDirection] = useState<AttDirection>('onward');
  // Once the staffer picks a tab, stop moving them to the open trip.
  const tabChosen = useRef(false);
```

Replace the windows query and the two lines after it:

```ts
  const { data: winData } = useQuery({ queryKey: ['boarding-attendance-window'], queryFn: fetchWindows });
  const windows = winData?.windows ?? DEFAULT_WINDOWS;

  const legOpenNow = isDirectionOpen(windows.onward);
  const canMarkNow = isToday && legOpenNow;
```

with:

```ts
  const { data: winData } = useQuery({
    queryKey: ['boarding-attendance-window'],
    queryFn: fetchWindows,
    // Settings changes are pushed live (useAttendanceSettingsLive). These two
    // re-reads cover a phone that dropped its live connection in the background.
    refetchOnWindowFocus: true,
    refetchInterval: 120_000,
  });
  useAttendanceSettingsLive();
  const windows = winData?.windows ?? DEFAULT_WINDOWS;

  // Open on the trip that is open for marking, unless the staffer picked a tab.
  useEffect(() => {
    if (!tabChosen.current && winData?.activeDirection) setDirection(winData.activeDirection);
  }, [winData?.activeDirection]);
  // Evening switched off while its tab is showing: fall back to the morning.
  useEffect(() => {
    if (direction === 'return' && !windows.return.active) setDirection('onward');
  }, [direction, windows.return.active]);

  // Marking is allowed only on the tab whose window is open right now.
  const openLeg = activeDirection(windows);
  const canMarkNow = isToday && openLeg === direction;
```

Further down, replace:

```ts
  const legOpen = isDirectionOpen(windows.onward);
  const canMark = isToday && legOpen;
```

with:

```ts
  const canMark = canMarkNow;
```

Find the amber closed-window hint, which begins `{isToday && !legOpen && (` and contains the text `Attendance window is`. Replace that whole element with the trip tabs followed by the new hint:

```tsx
      {windows.return.active && (
        <div
          role="tablist"
          aria-label="Trip"
          className="inline-flex rounded-lg border border-gray-300 p-0.5 text-sm dark:border-gray-700"
        >
          {(['onward', 'return'] as const).map((leg) => (
            <button
              key={leg}
              type="button"
              role="tab"
              aria-selected={direction === leg}
              onClick={() => {
                tabChosen.current = true;
                setDirection(leg);
              }}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                direction === leg
                  ? 'bg-green-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {LEG_NAME[leg]}
              {isToday && openLeg === leg ? ' · open now' : ''}
            </button>
          ))}
        </div>
      )}

      {isToday && !canMark && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {openLeg
            ? `Marking is open for the ${LEG_NAME[openLeg].toLowerCase()} trip now. Switch to the ${LEG_NAME[openLeg]} tab to mark.`
            : `Attendance is open ${openHoursText(windows)} only. Marking present or absent and scanning are closed until then.`}
        </p>
      )}
```

Grep the page for any remaining `legOpen` or `windows.onward` reference and replace it with `canMark` / the new logic; none should remain.

- [ ] **Step 3: Scanner**

In `components/boarding/scan-dialog.tsx`:

Change the attendance-window import to:

```ts
import { activeDirection, LEG_NAME, type AttendanceWindows } from '@/lib/boarding/attendance-window';
import { openHoursText } from '@/lib/boarding/trip-direction';
```

Replace:

```ts
  const win = windows.onward;
  const legOpen = isDirectionOpen(win);
```

with:

```ts
  // Which trip is open for scanning right now, if any.
  const leg = activeDirection(windows);
  const legOpen = leg !== null;
```

In `submit`, replace the window check:

```ts
    const w = windowsRef.current;
    if (!isDirectionOpen(w.onward)) {
      setResult({
        ok: false,
        reason: 'window_closed',
        error: `Scanning is open ${formatHM(w.onward.start)}–${formatHM(w.onward.end)} only.`,
      });
      return;
    }
```

with:

```ts
    const w = windowsRef.current;
    const current = activeDirection(w);
    if (!current) {
      setResult({ ok: false, reason: 'window_closed', error: `Scanning is open ${openHoursText(w)} only.` });
      return;
    }
```

and in the same function change the request body from `direction: 'onward'` to `direction: current`. The server re-decides from its own clock and refuses a mismatch, so a wrong phone clock cannot record the wrong trip.

Change the title:

```tsx
          <DialogTitle>Scan boarding pass{leg ? ` · ${LEG_NAME[leg]}` : ''}</DialogTitle>
```

Change the closed banner text from `Scanning is open {formatHM(win.start)}–{formatHM(win.end)} only.` to:

```tsx
              Scanning is open {openHoursText(windows)} only.
```

In the success panel, find the line:

```tsx
                  {result.alreadyMarked ? '✓ Already marked present' : '✓ Marked present'}
```

and add, directly after it inside the same element:

```tsx
                  {result.direction === 'onward' || result.direction === 'return'
                    ? ` · ${LEG_NAME[result.direction]}`
                    : ''}
```

Grep the dialog for any remaining `win.`, `isDirectionOpen` or `formatHM` reference; none should remain.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "use-attendance-settings-live|boarding/attendance/page|scan-dialog"`
Expected: no output.

Run: `npx vitest run`
Expected: PASS, the whole suite.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-attendance-settings-live.ts app/boarding/attendance/page.tsx components/boarding/scan-dialog.tsx
git commit -m "feat(boarding): morning and evening tabs, live settings, trip-aware scanner"
```

---

### Task 6: Settings screen gets the evening trip

**Files:**
- Modify: `components/admin/attendance-window-settings.tsx`

**Interfaces:**
- Consumes from Task 1: `validateWindows`, `DEFAULT_WINDOWS`, `type AttendanceWindows`. From Task 3: the admin GET/PUT shape.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Replace the component**

Replace the whole contents of `components/admin/attendance-window-settings.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Clock, Save, Loader2, Sunrise, Sunset } from 'lucide-react';
import toast from 'react-hot-toast';
import { validateWindows, DEFAULT_WINDOWS, type AttendanceWindows } from '@/lib/boarding/attendance-window';

interface WinForm { start: string; end: string; enabled: boolean }
interface EveningForm extends WinForm { active: boolean }

/**
 * Admin editor for the boarding attendance windows: the morning trip, and the
 * evening return trip with its own on/off switch. "Enforce" limits a trip to
 * its hours; it is not the on/off switch. Persists to
 * /api/admin/attendance-windows, which signals open boarding screens to re-read.
 */
export function AttendanceWindowSettings() {
  const [onward, setOnward] = useState<WinForm>({
    start: DEFAULT_WINDOWS.onward.start, end: DEFAULT_WINDOWS.onward.end, enabled: true,
  });
  const [evening, setEvening] = useState<EveningForm>({
    start: DEFAULT_WINDOWS.return.start, end: DEFAULT_WINDOWS.return.end, enabled: true, active: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/attendance-windows', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json();
        if (json?.success) {
          const w = json.data.windows as AttendanceWindows;
          setOnward({ start: w.onward.start, end: w.onward.end, enabled: w.onward.enabled });
          setEvening({ start: w.return.start, end: w.return.end, enabled: w.return.enabled, active: w.return.active });
        }
      } catch {
        /* keep defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    // Same rules as the API, so the message appears before a round trip. The API re-validates.
    const invalid = validateWindows({
      onward: { direction: 'onward', ...onward, active: true },
      return: { direction: 'return', ...evening },
    });
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/attendance-windows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ onward, return: evening }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save');
      toast.success('Attendance windows saved. Open boarding screens update now.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save attendance windows');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading attendance windows…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Attendance Scan Windows</h3>
        <p className="mt-1 text-sm text-gray-600">
          Boarding staff can mark attendance only during these windows. The time decides which
          trip a mark belongs to. Outside them, scanning and manual marking are closed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WindowCard
          title="Morning trip"
          icon={<Sunrise className="h-5 w-5 text-amber-500" />}
          value={onward}
          onChange={setOnward}
        />

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-5 py-3">
            <span>
              <span className="block font-medium text-gray-900">Evening return attendance</span>
              <span className="block text-xs text-gray-600">
                {evening.active ? 'On. Staff can mark the evening trip.' : 'Off. Only the morning trip is marked.'}
              </span>
            </span>
            <input
              type="checkbox"
              checked={evening.active}
              onChange={(e) => setEvening({ ...evening, active: e.target.checked })}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
          <div className={evening.active ? '' : 'opacity-50'}>
            <WindowCard
              title="Evening return trip"
              icon={<Sunset className="h-5 w-5 text-indigo-500" />}
              value={evening}
              onChange={(v) => setEvening({ ...evening, ...v })}
            />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Turn off <strong>Enforce</strong> on the morning trip to allow scanning at any time. To use
          the evening trip, both trips need Enforce on and the morning must end before the evening starts.
        </span>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save windows
      </button>
    </div>
  );
}

function WindowCard({
  title, icon, value, onChange,
}: {
  title: string;
  icon: React.ReactNode;
  value: WinForm;
  onChange: (v: WinForm) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-medium text-gray-900">{icon} {title}</h4>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Enforce
        </label>
      </div>
      <div className={`grid grid-cols-2 gap-4 ${value.enabled ? '' : 'opacity-50'}`}>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Start time</label>
          <input
            type="time"
            value={value.start}
            disabled={!value.enabled}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">End time</label>
          <input
            type="time"
            value={value.end}
            disabled={!value.enabled}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
```

`WindowCard` is unchanged from the original file; it is repeated in full above so the file is complete.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "attendance-window-settings"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/admin/attendance-window-settings.tsx
git commit -m "feat(settings): evening return trip switch and hours"
```

---

### Task 7: Verify everything, including the live push

**Files:**
- Create: `docs/superpowers/reviews/2026-09-11-evening-attendance-verification.md`

**Interfaces:**
- Consumes: every earlier task. Produces the evidence record.

Your duty is an honest record. If a check fails, STOP and report it; do not fix code in this task.

- [ ] **Step 1: Whole suite and build**

Run: `npx vitest run` — record the exact totals.
Run: `npm run build` — record the result. If it dies with "could not find bin metadata file", run `bun install` and build again, and say so.

- [ ] **Step 2: Scoped type check**

Run `git diff --name-only main...HEAD` to list touched files, then `npx tsc --noEmit` and report errors ONLY in those files.

- [ ] **Step 3: Database state (read only)**

```sql
select direction, start_time, end_time, enabled, is_active from public.tms_attendance_window order by direction;
select policyname, cmd, roles::text, qual from pg_policies where schemaname='realtime' and tablename='messages' order by policyname;
```

Expected: evening row `is_active = false`; the new receive policy present; the bus policy text unchanged (compare against the text in Task 3 Step 2).

- [ ] **Step 4: Prove the live push is delivered**

Write this throwaway script to your scratchpad directory (NOT inside the repository; another session commits broadly there), as `push-check.mjs`:

```js
import { createRequire } from 'node:module';
const require = createRequire('D:/Sangeetha_V/TMS-ADMIN/package.json');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

function listen(name) {
  return new Promise((resolve) => {
    let got = false;
    const ch = sb
      .channel(name, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, () => { got = true; })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve({ ch, received: () => got, status });
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve({ ch, received: () => false, status });
      });
  });
}

const bare = await listen('tms_attendance_settings');
const suffixed = await listen('tms_attendance_settings#probe');
const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
  body: JSON.stringify({ messages: [{ topic: 'tms_attendance_settings', event: 'changed', payload: {}, private: true }] }),
});
await new Promise((r) => setTimeout(r, 4000));
console.log(JSON.stringify({
  broadcastHttpStatus: res.status,
  bareSubscribeStatus: bare.status, bareReceived: bare.received(),
  suffixedSubscribeStatus: suffixed.status, suffixedReceived: suffixed.received(),
}));
process.exit(0);
```

Run it from the repository root so the env file resolves:

```bash
node --env-file=.env.local <scratchpad>/push-check.mjs
```

Expected: `bareReceived: true`. Record the whole JSON line. Delete the script afterwards.

`suffixedReceived` is REPORT-ONLY. If it is `false`, state plainly in the record that a channel named with a `#suffix` does not receive a message sent to the bare topic, and that `hooks/use-live-bus.ts` uses that suffixed form, so live bus tracking may be running on its polling fallback. Do not change any bus code.

The script uses the service-role key, which bypasses RLS, so it proves delivery, not the staff receive policy. Say so; the staff policy is covered by the browser check below.

- [ ] **Step 5: Write the verification record**

Create `docs/superpowers/reviews/2026-09-11-evening-attendance-verification.md` with the outputs above, a prominent section on what was NOT verified (no browser session is logged in; no test harness covers route handlers; the receive policy was not exercised as a real staff user), and this checklist for the product owner:

1. In Settings, end the morning trip at or before 16:30, switch Evening return attendance on, and save. With a boarding attendance screen already open on another device, the Evening tab should appear within a couple of seconds, without reloading.
2. Try to switch evening on while the morning still ends after the evening starts. Settings should refuse with a message saying when the morning must end.
3. During the evening window, scan a learner. The panel should say "Marked present · Evening".
4. On the Morning tab during the evening window, marking should be closed with a hint to switch to the Evening tab.
5. Outside both windows, scanning should be refused, naming both trips' hours.
6. Undo an evening mark from the Evening tab. It should undo the evening mark only; the learner's morning mark must remain.
7. Switch evening off in Settings. The Evening tab should disappear from the open screen without reloading.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/reviews/2026-09-11-evening-attendance-verification.md
git commit -m "docs(boarding): record verification for evening attendance"
```

---

## Notes for whoever executes this

- Order: Task 1 first (its migration protects the live morning window). Tasks 2 and 3 depend only on Task 1. Task 4 needs Task 2. Task 5 needs Tasks 1, 2 and 4. Task 6 needs Tasks 1 and 3. Task 7 needs all.
- The boarding dashboard and the student attendance page already render evening rows (a purple dot; an Onward/Return filter). They need no change.
- Evening ships switched OFF. The live morning window currently ends at 17:30, overlapping the evening's 16:30 start, so switching evening on will be refused until the morning window is shortened. That is the product owner's setting to change, not this plan's.
