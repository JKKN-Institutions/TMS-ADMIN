# Reliable Foreground Live Tracking (pure web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make foreground live bus tracking robust and, above all, *truthful* — never show "Active" for a bus that is not actually sending fresh fixes, tell the driver exactly what to do (keep screen on, enable OS location, grant permission), and remove the one server bug that can freeze a bus even in the foreground.

**Architecture:** Extract the driver-phone capture logic into a **pure, unit-tested state machine** (`lib/driver/tracking-controller.ts`) wrapped by a thin React hook (`lib/driver/use-live-tracking.ts`); the driver page becomes presentation. Fix the server monotonic guard to base *freshness* on server-receipt time and *ordering* on a new `last_capture_at` column (clamped to now, so a fast phone clock can't freeze the bus). Drive every viewer's "active" chrome from real GPS freshness. Make the driver page an installable PWA. Maps (Leaflet/OSM) and polling transport are unchanged.

**Tech Stack:** Next.js 15 App Router, TypeScript, React, `@tanstack/react-query`, Supabase (service-role ingest), Leaflet/OpenStreetMap, vitest.

## Global Constraints

- **Pure web only.** No Capacitor/native, no background-geolocation plugin. True locked-screen tracking is explicitly out of scope.
- **Free maps only.** Keep Leaflet 1.9.4 + OpenStreetMap tiles. Do NOT add Google Maps / Mapbox / any paid GPS/telematics.
- **Transport unchanged.** Polling only — no Supabase Realtime/SSE. Reader poll cadences stay (admin 5 s, student/boarding 5 s, driver-self 15 s).
- **Send cadence:** driver phone posts the latest fix every **6000 ms** (down from 12000).
- **Heartbeat:** while sharing, no fresh GPS fix for **25000 ms** → `paused` state + loud banner.
- **OS-off detection:** **3** consecutive `POSITION_UNAVAILABLE` errors with **no fix ever received this session** → `os_location_off`.
- **Freshness thresholds unchanged:** `lib/gps/freshness.ts` = online ≤ 2 min, recent ≤ 5 min, else offline.
- **Verification:** ESLint is broken project-wide — verify with `npx tsc --noEmit` (filtered to changed files' errors) + dev-server route probes (auth-gated 307/401 = compiles). vitest for pure logic. Live phone render is confirmed by the user.
- **Commits:** never `git add -A` (parallel sessions commit to `main`); stage explicit paths only. End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **HTTPS required** for `navigator.geolocation` (production is HTTPS; `localhost` is exempt).

---

## File Structure

**Create:**
- `supabase/migrations/20260701120000_add_vehicle_last_capture_at.sql` — adds `tms_vehicle.last_capture_at`.
- `lib/driver/tracking-controller.ts` — pure capture state machine (no DOM).
- `lib/driver/tracking-controller.test.ts` — vitest for the state machine.
- `lib/driver/use-live-tracking.ts` — React hook wiring geolocation/wake-lock/heartbeat/retry to the controller.
- `public/sw-driver.js` — minimal no-op-fetch service worker (installability only).
- `public/icons/driver-icon.svg` — app icon (green rounded square + bus glyph).
- `public/driver.webmanifest` — PWA manifest for the driver portal.
- `components/driver/pwa.tsx` — client component: inject manifest/theme links, register SW, render install button.

**Modify:**
- `lib/driver/tracking.ts` — clamp capture time to now (kill future-skew poison); doc update.
- `lib/driver/tracking.test.ts` — new clamp cases.
- `app/api/driver/location/route.ts` — order on `last_capture_at`; write `last_gps_update = server now`.
- `app/driver/location/page.tsx` — consume `useLiveTracking`; freshness-honest status UI + heartbeat banner.
- `app/api/admin/track-all/drivers/route.ts` — derive tracking status + counts from freshness.
- `app/(admin)/track-all/page.tsx` — honest "Last Update" + "Active Tracking"; add `paused` styling.
- `app/driver/layout.tsx` — mount `<DriverPwa />`.

**Note on scope:** Student (`app/student/live-track`) and boarding (`app/boarding/live-track`) readers are already freshness-driven (they render the map only while `status !== 'offline'` and show a freshness pill). No code change is needed there for honesty; they inherit the corrected server-receipt `last_gps_update` automatically. They are intentionally NOT modified in this plan.

---

## Phase 0 — Server clock-trust correctness fix

*Independent, ship-able alone. Removes the up-to-60 s foreground freeze from a fast phone clock and decouples reader freshness from the device clock.*

### Task 0.1: Clamp client capture time to server-now in `normalizeCapturedAt`

**Files:**
- Modify: `lib/driver/tracking.ts:19-45`
- Test: `lib/driver/tracking.test.ts:24-51`

**Interfaces:**
- Produces: `normalizeCapturedAt(value: unknown, fallbackIso: string, nowMs: number): string` — unchanged signature; new behavior: any capture time **at or after** `nowMs` returns `fallbackIso` (the server-now ISO the caller passes), i.e. future device times are clamped to now. `FUTURE_SKEW_MS` is removed.

- [ ] **Step 1: Update the failing tests first**

Replace the far-future case and add a near-future clamp case in `lib/driver/tracking.test.ts` inside `describe('normalizeCapturedAt …')`:

```ts
  it('clamps a near-future capture time to server-now (fast device clock cannot poison the guard)', () => {
    // 30s ahead of server-now must NOT pass through — it clamps to the fallback (server-now).
    expect(normalizeCapturedAt('2026-07-01T04:04:30.000Z', fallback, nowMs)).toBe(fallback);
  });

  it('clamps an absurd far-future time to server-now', () => {
    expect(normalizeCapturedAt('2027-01-01T00:00:00.000Z', fallback, nowMs)).toBe(fallback);
  });
```

Delete the old `it('falls back on an absurd far-future time …')` case (superseded by the two above).

- [ ] **Step 2: Run the tests to verify the new clamp case fails**

Run: `npx vitest run lib/driver/tracking.test.ts`
Expected: FAIL — "clamps a near-future capture time…" fails (current code passes a +30 s time through because `FUTURE_SKEW_MS` is 60 s).

- [ ] **Step 3: Implement the clamp**

In `lib/driver/tracking.ts`, delete the `FUTURE_SKEW_MS` constant (lines 19-20) and change the future check in `normalizeCapturedAt` from `if (t > nowMs + FUTURE_SKEW_MS)` to:

```ts
export function normalizeCapturedAt(value: unknown, fallbackIso: string, nowMs: number): string {
  if (typeof value !== 'string') return fallbackIso;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return fallbackIso;
  // Clamp any future device time to server-now: a phone clock running fast must not
  // stamp the ordering baseline into the future and lock out subsequent real fixes.
  if (t >= nowMs) return fallbackIso;
  return new Date(t).toISOString();
}
```

Update the function's doc comment (lines 31-38) to describe clamping to now rather than a 60 s skew window.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/driver/tracking.test.ts`
Expected: PASS (all `normalizeCapturedAt` and other cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/driver/tracking.ts lib/driver/tracking.test.ts
git commit -m "$(printf 'fix(driver-tracking): clamp client capture time to server-now\n\nA phone clock running fast stamped last_capture_at into the future and\nrejected every genuinely-newer fix until wall-clock caught up (up to a\n60s foreground freeze). Clamp any future device time to now.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 0.2: Add `tms_vehicle.last_capture_at` and order the guard on it

**Files:**
- Create: `supabase/migrations/20260701120000_add_vehicle_last_capture_at.sql`
- Modify: `app/api/driver/location/route.ts:144-177`

**Interfaces:**
- Consumes: `normalizeCapturedAt` (Task 0.1), `isNewerCapture(storedIso, incomingIso)` (unchanged, `lib/driver/tracking.ts:54-61`).
- Produces: `tms_vehicle.last_capture_at` (timestamptz, nullable) = the clamped device capture time of the last accepted fix; `tms_vehicle.last_gps_update` now = **server-receipt** time (`now()`), used only for freshness.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260701120000_add_vehicle_last_capture_at.sql`:

```sql
-- Ordering baseline for the driver-app live-tracking monotonic guard.
-- Kept separate from last_gps_update so freshness can key off SERVER-receipt time
-- while stale/duplicate rejection keeps ordering by the DEVICE capture time.
ALTER TABLE tms_vehicle
  ADD COLUMN IF NOT EXISTS last_capture_at timestamptz;

COMMENT ON COLUMN tms_vehicle.last_capture_at IS
  'Clamped device capture time of the last accepted driver-app GPS fix; ordering baseline for the ingest monotonic guard. last_gps_update holds server-receipt time for freshness.';
```

- [ ] **Step 2: Apply the migration to the live project**

Apply via the Supabase MCP `apply_migration` tool (project `kvizhngldtiuufknvehv`), name `add_vehicle_last_capture_at`, with the SQL above. Then confirm with `list_migrations` (or `execute_sql`: `select column_name from information_schema.columns where table_name='tms_vehicle' and column_name='last_capture_at';` → one row).

- [ ] **Step 3: Update the ingest guard to order on `last_capture_at` and stamp server-receipt time**

In `app/api/driver/location/route.ts`, change the guard block (currently lines 144-177). Read `last_capture_at` instead of `last_gps_update`, and on advance write `last_gps_update: nowIso` (server-receipt) plus `last_capture_at: capturedIso`:

```ts
    const { data: veh } = await svc
      .from('tms_vehicle')
      .select('last_capture_at')
      .eq('id', route.vehicleId)
      .maybeSingle();
    const advanced = isNewerCapture((veh?.last_capture_at as string | null) ?? null, capturedIso);

    if (advanced) {
      await svc
        .from('tms_vehicle')
        .update({
          current_latitude: latitude,
          current_longitude: longitude,
          gps_speed: speed,
          gps_heading: heading,
          gps_accuracy: accuracy,
          last_gps_update: nowIso,        // server-receipt time → drives reader freshness
          last_capture_at: capturedIso,   // device capture time → ordering baseline
          live_tracking_enabled: true,
          gps_provider: 'driver_app',
        })
        .eq('id', route.vehicleId);

      await svc.from('gps_location_history').insert({
        vehicle_id: route.vehicleId,
        latitude,
        longitude,
        speed,
        heading,
        accuracy,
        source: 'driver_app',
        timestamp: capturedIso,
      });
    }
```

Update the guard comment above the block to note ordering is by device capture time (`last_capture_at`) while `last_gps_update` is server-receipt.

- [ ] **Step 4: Type-check the changed route**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `app/api/driver/location/route.ts` (pre-existing unrelated errors elsewhere are acceptable — this repo does not compile clean project-wide).

- [ ] **Step 5: Probe the route compiles (dev server running)**

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/driver/location`
Expected: `401` or `307` (auth gate) — NOT `500`. (Confirms the handler compiled.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260701120000_add_vehicle_last_capture_at.sql app/api/driver/location/route.ts
git commit -m "$(printf 'fix(driver-tracking): base freshness on server-receipt time\n\nAdd tms_vehicle.last_capture_at as the monotonic ordering baseline (device\ncapture time) and stamp last_gps_update with server now() for freshness, so\na skewed phone clock can no longer make a live bus read stale/offline.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Phase 1 — Capture controller + `useLiveTracking` hook (the core)

### Task 1.1: The pure capture state machine

**Files:**
- Create: `lib/driver/tracking-controller.ts`
- Test: `lib/driver/tracking-controller.test.ts`

**Interfaces:**
- Consumes: `GEO_PERMISSION_DENIED`, `GEO_POSITION_UNAVAILABLE`, `GEO_TIMEOUT` from `lib/driver/geo.ts:21-23`.
- Produces:
  - `type TrackingStatus = 'idle' | 'starting' | 'live' | 'paused' | 'os_location_off' | 'permission_denied' | 'stopped'`
  - `interface TrackingBanner { tone: 'info' | 'warn' | 'error'; title: string; body: string }`
  - `interface TrackingState { status: TrackingStatus; lastFixAt: number | null; everFixed: boolean; unavailableStreak: number; banner: TrackingBanner | null }`
  - `type TrackingEvent = { type: 'start' } | { type: 'stop' } | { type: 'fix'; atMs: number } | { type: 'geoError'; code: number } | { type: 'visibility'; visible: boolean } | { type: 'tick'; nowMs: number }`
  - `const initialTrackingState: TrackingState`
  - `function reduceTracking(state: TrackingState, event: TrackingEvent): TrackingState`
  - `function isSharing(status: TrackingStatus): boolean` (true for `starting | live | paused`)
  - `const PAUSE_AFTER_MS = 25_000`, `const OS_OFF_STREAK = 3`

- [ ] **Step 1: Write the failing tests**

Create `lib/driver/tracking-controller.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  reduceTracking,
  initialTrackingState,
  isSharing,
  PAUSE_AFTER_MS,
  OS_OFF_STREAK,
  type TrackingState,
} from './tracking-controller';
import { GEO_PERMISSION_DENIED, GEO_POSITION_UNAVAILABLE, GEO_TIMEOUT } from './geo';

const run = (events: Parameters<typeof reduceTracking>[1][], from: TrackingState = initialTrackingState) =>
  events.reduce(reduceTracking, from);

describe('reduceTracking — session lifecycle', () => {
  it('starts in idle', () => {
    expect(initialTrackingState.status).toBe('idle');
  });

  it('start → starting (acquiring), no fix yet', () => {
    const s = run([{ type: 'start' }]);
    expect(s.status).toBe('starting');
    expect(s.everFixed).toBe(false);
  });

  it('first fix → live and clears the banner', () => {
    const s = run([{ type: 'start' }, { type: 'fix', atMs: 1000 }]);
    expect(s.status).toBe('live');
    expect(s.lastFixAt).toBe(1000);
    expect(s.everFixed).toBe(true);
    expect(s.banner).toBeNull();
  });

  it('stop → stopped', () => {
    const s = run([{ type: 'start' }, { type: 'fix', atMs: 1000 }, { type: 'stop' }]);
    expect(s.status).toBe('stopped');
  });
});

describe('reduceTracking — OS location OFF detection', () => {
  it('3 POSITION_UNAVAILABLE with no fix ever → os_location_off (error banner)', () => {
    const s = run([
      { type: 'start' },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
    ]);
    expect(s.unavailableStreak).toBeGreaterThanOrEqual(OS_OFF_STREAK);
    expect(s.status).toBe('os_location_off');
    expect(s.banner?.tone).toBe('error');
  });

  it('POSITION_UNAVAILABLE AFTER a fix is a transient pause, never os_location_off', () => {
    const s = run([
      { type: 'start' },
      { type: 'fix', atMs: 1000 },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
    ]);
    expect(s.status).toBe('paused');
  });

  it('a fresh fix recovers from os_location_off', () => {
    const s = run([
      { type: 'start' },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'geoError', code: GEO_POSITION_UNAVAILABLE },
      { type: 'fix', atMs: 5000 },
    ]);
    expect(s.status).toBe('live');
  });
});

describe('reduceTracking — permission denied is terminal', () => {
  it('PERMISSION_DENIED → permission_denied with error banner, not sharing', () => {
    const s = run([{ type: 'start' }, { type: 'fix', atMs: 1000 }, { type: 'geoError', code: GEO_PERMISSION_DENIED }]);
    expect(s.status).toBe('permission_denied');
    expect(s.banner?.tone).toBe('error');
    expect(isSharing(s.status)).toBe(false);
  });
});

describe('reduceTracking — heartbeat + visibility', () => {
  it('no fresh fix for PAUSE_AFTER_MS while live → paused (warn banner)', () => {
    const s = run([
      { type: 'start' },
      { type: 'fix', atMs: 1000 },
      { type: 'tick', nowMs: 1000 + PAUSE_AFTER_MS + 1 },
    ]);
    expect(s.status).toBe('paused');
    expect(s.banner?.tone).toBe('warn');
  });

  it('a tick within the window keeps it live', () => {
    const s = run([
      { type: 'start' },
      { type: 'fix', atMs: 1000 },
      { type: 'tick', nowMs: 1000 + PAUSE_AFTER_MS - 1 },
    ]);
    expect(s.status).toBe('live');
  });

  it('hidden while live → paused; a later fix → live again', () => {
    const hidden = run([{ type: 'start' }, { type: 'fix', atMs: 1000 }, { type: 'visibility', visible: false }]);
    expect(hidden.status).toBe('paused');
    const back = run([{ type: 'visibility', visible: true }, { type: 'fix', atMs: 9000 }], hidden);
    expect(back.status).toBe('live');
  });

  it('TIMEOUT while starting stays starting (still acquiring), not os_location_off', () => {
    const s = run([{ type: 'start' }, { type: 'geoError', code: GEO_TIMEOUT }, { type: 'geoError', code: GEO_TIMEOUT }]);
    expect(s.status).toBe('starting');
  });

  it('ticks/visibility do not resurrect a terminal permission_denied', () => {
    const s = run([
      { type: 'start' },
      { type: 'geoError', code: GEO_PERMISSION_DENIED },
      { type: 'visibility', visible: true },
      { type: 'tick', nowMs: 999999 },
    ]);
    expect(s.status).toBe('permission_denied');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/driver/tracking-controller.test.ts`
Expected: FAIL — "Cannot find module './tracking-controller'".

- [ ] **Step 3: Implement the controller**

Create `lib/driver/tracking-controller.ts`:

```ts
/**
 * Pure capture state machine for the driver live-sharing page. No DOM, no timers —
 * the `useLiveTracking` hook feeds it events (fix / geoError / visibility / tick) and
 * renders the resulting status + banner. Modelled as reduce(state, event) so every
 * lifecycle transition (OS-location-off, screen-lock pause, heartbeat stall,
 * permission-denied) is deterministically unit-testable.
 */
import { GEO_PERMISSION_DENIED, GEO_POSITION_UNAVAILABLE } from './geo';

export type TrackingStatus =
  | 'idle'
  | 'starting'
  | 'live'
  | 'paused'
  | 'os_location_off'
  | 'permission_denied'
  | 'stopped';

export interface TrackingBanner {
  tone: 'info' | 'warn' | 'error';
  title: string;
  body: string;
}

export interface TrackingState {
  status: TrackingStatus;
  /** ms epoch of the last GPS fix received this session. */
  lastFixAt: number | null;
  /** Have we EVER received a fix this session (distinguishes "location off" from "signal lost"). */
  everFixed: boolean;
  /** Consecutive POSITION_UNAVAILABLE errors (reset by any fix). */
  unavailableStreak: number;
  banner: TrackingBanner | null;
}

export type TrackingEvent =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'fix'; atMs: number }
  | { type: 'geoError'; code: number }
  | { type: 'visibility'; visible: boolean }
  | { type: 'tick'; nowMs: number };

/** No fresh fix for this long while sharing → paused + loud banner. */
export const PAUSE_AFTER_MS = 25_000;
/** POSITION_UNAVAILABLE this many times with no fix ever → device location is likely OFF. */
export const OS_OFF_STREAK = 3;

export const initialTrackingState: TrackingState = {
  status: 'idle',
  lastFixAt: null,
  everFixed: false,
  unavailableStreak: 0,
  banner: null,
};

/** Session is alive (capturing or trying to) — used to keep the watch + timers running. */
export function isSharing(status: TrackingStatus): boolean {
  return status === 'starting' || status === 'live' || status === 'paused';
}

const ACQUIRING: TrackingBanner = {
  tone: 'info',
  title: 'Acquiring GPS…',
  body: 'Keep a clear view of the sky. Sharing starts as soon as we get a fix.',
};
const OS_OFF: TrackingBanner = {
  tone: 'error',
  title: 'Turn on Location',
  body: "Your phone's location service looks off. Enable Location in your phone settings (Android: Settings → Location; iPhone: Settings → Privacy & Security → Location Services), then tap Go On Duty again.",
};
const DENIED: TrackingBanner = {
  tone: 'error',
  title: 'Location permission denied',
  body: 'Allow location access for this site in your browser settings, then try again.',
};
const pausedBanner = (reason: string): TrackingBanner => ({
  tone: 'warn',
  title: 'Tracking paused',
  body: `${reason} Keep this screen on and don't lock the phone while driving.`,
});

const isTerminal = (s: TrackingStatus) => s === 'permission_denied' || s === 'stopped' || s === 'idle';

export function reduceTracking(state: TrackingState, event: TrackingEvent): TrackingState {
  switch (event.type) {
    case 'start':
      return { status: 'starting', lastFixAt: null, everFixed: false, unavailableStreak: 0, banner: ACQUIRING };

    case 'stop':
      return { ...initialTrackingState, status: 'stopped' };

    case 'fix':
      return { status: 'live', lastFixAt: event.atMs, everFixed: true, unavailableStreak: 0, banner: null };

    case 'geoError': {
      if (event.code === GEO_PERMISSION_DENIED) {
        return { ...state, status: 'permission_denied', banner: DENIED };
      }
      if (event.code === GEO_POSITION_UNAVAILABLE) {
        const streak = state.unavailableStreak + 1;
        if (!state.everFixed) {
          return streak >= OS_OFF_STREAK
            ? { ...state, unavailableStreak: streak, status: 'os_location_off', banner: OS_OFF }
            : { ...state, unavailableStreak: streak, status: 'starting', banner: ACQUIRING };
        }
        // Had a fix before → this is a transient drop, not a disabled service.
        return { ...state, unavailableStreak: streak, status: 'paused', banner: pausedBanner('GPS signal lost.') };
      }
      // TIMEOUT / unknown: keep whatever we were (acquiring or live); don't demote hard.
      return state.everFixed ? state : { ...state, status: 'starting', banner: ACQUIRING };
    }

    case 'visibility':
      if (isTerminal(state.status)) return state;
      if (!event.visible) {
        return { ...state, status: 'paused', banner: pausedBanner('The screen went to the background.') };
      }
      // Back to foreground: hold paused until the next fix flips us live.
      return state.status === 'paused'
        ? { ...state, banner: { tone: 'info', title: 'Resuming…', body: 'Re-acquiring your location.' } }
        : state;

    case 'tick':
      if (state.status !== 'live') return state;
      if (state.lastFixAt !== null && event.nowMs - state.lastFixAt > PAUSE_AFTER_MS) {
        return { ...state, status: 'paused', banner: pausedBanner('No GPS update recently.') };
      }
      return state;

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/driver/tracking-controller.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/driver/tracking-controller.ts lib/driver/tracking-controller.test.ts
git commit -m "$(printf 'feat(driver-tracking): pure capture state machine\n\nreduce(state,event) modelling starting/live/paused/os_location_off/\npermission_denied, with OS-location-off detection, heartbeat pause, and\nscreen-hidden pause. Fully unit-tested.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 1.2: The `useLiveTracking` hook

**Files:**
- Create: `lib/driver/use-live-tracking.ts`

**Interfaces:**
- Consumes: `reduceTracking`, `initialTrackingState`, `isSharing`, `TrackingStatus`, `TrackingBanner` (Task 1.1).
- Produces: `function useLiveTracking(routeId: string | null): { status: TrackingStatus; banner: TrackingBanner | null; onDuty: boolean; fix: { lat: number; lng: number; accuracy: number | null; speed: number | null } | null; lastSentAt: number | null; start: () => Promise<void>; stop: (notifyServer?: boolean) => Promise<void> }`

There is no unit test for this task — it is impure DOM/timer wiring. It is verified by `tsc` (Step 2) and the live phone test in Phase 2. This task carries no behavior the controller does not already test.

- [ ] **Step 1: Implement the hook**

Create `lib/driver/use-live-tracking.ts`:

```ts
'use client';

import { useCallback, useReducer, useRef, useState, useEffect } from 'react';
import {
  reduceTracking,
  initialTrackingState,
  isSharing,
  type TrackingBanner,
  type TrackingStatus,
} from './tracking-controller';

/** Post the latest fix this often (send-latest, not per-callback — saves battery + data). */
const SEND_INTERVAL_MS = 6000;
/** Heartbeat cadence feeding the controller's stall watchdog. */
const TICK_INTERVAL_MS = 5000;
/** Basic retry: attempts per send before giving up until the next tick. */
const SEND_ATTEMPTS = 3;

type WakeLock =
  | { release: () => Promise<void>; addEventListener?: (t: 'release', cb: () => void) => void }
  | null;

export interface DriverFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
}

export function useLiveTracking(routeId: string | null) {
  const [state, dispatch] = useReducer(reduceTracking, initialTrackingState);
  const [fix, setFix] = useState<DriverFix | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);

  const routeIdRef = useRef(routeId);
  const latestFixRef = useRef<GeolocationPosition | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLock>(null);

  useEffect(() => {
    routeIdRef.current = routeId;
  }, [routeId]);

  const acquireWakeLock = useCallback(async () => {
    if (wakeLockRef.current || typeof navigator === 'undefined') return;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
      const sentinel = (await nav.wakeLock?.request('screen')) ?? null;
      wakeLockRef.current = sentinel;
      sentinel?.addEventListener?.('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      /* unsupported/denied — capture still works while visible */
    }
  }, []);

  const sendPing = useCallback(async () => {
    const pos = latestFixRef.current;
    const rid = routeIdRef.current;
    if (!pos || !rid) return;
    const body = JSON.stringify({
      routeId: rid,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      speed: pos.coords.speed ?? null,
      heading: pos.coords.heading ?? null,
      capturedAt: new Date(pos.timestamp).toISOString(),
    });
    for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
      try {
        const res = await fetch('/api/driver/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body,
        });
        if (res.ok) {
          setLastSentAt(Date.now());
          return;
        }
      } catch {
        /* network hiccup — retry */
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }, []);

  const stop = useCallback(async (notifyServer = true) => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sendTimerRef.current) clearInterval(sendTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    sendTimerRef.current = null;
    tickTimerRef.current = null;
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null;
    }
    latestFixRef.current = null;
    setFix(null);
    setLastSentAt(null);
    dispatch({ type: 'stop' });
    if (notifyServer) {
      try {
        await fetch('/api/driver/location', { method: 'DELETE', credentials: 'same-origin', keepalive: true });
      } catch {
        /* ignore */
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      dispatch({ type: 'geoError', code: 2 });
      return;
    }
    if (!routeIdRef.current) return;
    dispatch({ type: 'start' });

    // Pre-check permission so a hard "denied" is surfaced immediately.
    try {
      const perm = await (navigator as Navigator & {
        permissions?: { query: (d: { name: 'geolocation' }) => Promise<{ state: string }> };
      }).permissions?.query({ name: 'geolocation' });
      if (perm?.state === 'denied') {
        dispatch({ type: 'geoError', code: 1 });
        return;
      }
    } catch {
      /* Permissions API unsupported — fall through to the live prompt */
    }

    await acquireWakeLock();

    const onPos = (pos: GeolocationPosition) => {
      latestFixRef.current = pos;
      dispatch({ type: 'fix', atMs: Date.now() });
      setFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
      });
    };
    const onErr = (err: GeolocationPositionError) => dispatch({ type: 'geoError', code: err.code });

    const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPos(pos);
        void sendPing();
      },
      onErr,
      opts
    );
    watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, opts);
    sendTimerRef.current = setInterval(() => void sendPing(), SEND_INTERVAL_MS);
    tickTimerRef.current = setInterval(() => dispatch({ type: 'tick', nowMs: Date.now() }), TICK_INTERVAL_MS);
  }, [acquireWakeLock, sendPing]);

  // Re-acquire the wake lock and tell the controller when the tab returns/hides.
  useEffect(() => {
    if (!isSharing(state.status) || typeof document === 'undefined') return;
    const onVisible = () => {
      const visible = document.visibilityState === 'visible';
      dispatch({ type: 'visibility', visible });
      if (visible) void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [state.status, acquireWakeLock]);

  // Stop + notify server if the page unmounts while sharing.
  useEffect(() => {
    return () => {
      void stop(true);
    };
  }, [stop]);

  return {
    status: state.status as TrackingStatus,
    banner: state.banner as TrackingBanner | null,
    onDuty: isSharing(state.status),
    fix,
    lastSentAt,
    start,
    stop,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `lib/driver/use-live-tracking.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/driver/use-live-tracking.ts
git commit -m "$(printf 'feat(driver-tracking): useLiveTracking hook wiring the controller\n\nwatchPosition + 6s send-latest + basic retry + wake-lock re-acquire +\nheartbeat ticks + Permissions API pre-check, all feeding the pure\ntracking-controller.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Phase 2 — Honest status across viewers

### Task 2.1: Rewire the driver page onto the hook with freshness-honest status

**Files:**
- Modify: `app/driver/location/page.tsx` (replace all capture logic + the on-duty status block)

**Interfaces:**
- Consumes: `useLiveTracking` (Task 1.2). Removes the page's own `sendPing`/`startSharing`/`stopSharing`/`acquireWakeLock`/refs and the `geoErrorOutcome`/`isFixStale` imports.

No unit test (presentation). Verified by `tsc` + the live phone checklist in Task 2.3.

- [ ] **Step 1: Replace the capture machinery with the hook**

In `app/driver/location/page.tsx`:

1. Replace the imports on lines 10-11:
```ts
import { useLiveTracking } from '@/lib/driver/use-live-tracking';
```
(delete `import { geoErrorOutcome } from '@/lib/driver/geo';` and `import { isFixStale } from '@/lib/driver/tracking';`).

2. Delete `const SEND_INTERVAL_MS = 12000;` (line 54) and the `WakeLock` type (lines 56-59).

3. Inside `DriverLocationPage`, delete the capture state/refs and callbacks — everything from `const [onDuty, setOnDuty] = useState(false);` through the visibility `useEffect` (lines 81-248) EXCEPT keep `const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);` and the "default the active route" effect (lines 94-96). Replace with:

```ts
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedRouteId && routes.length > 0) setSelectedRouteId(routes[0].id);
  }, [routes, selectedRouteId]);

  const { status, banner, onDuty, fix, lastSentAt, start, stop } = useLiveTracking(selectedRouteId);
```

- [ ] **Step 2: Replace the geoError box + on-duty status block with freshness-honest UI**

Replace the `{geoError && (…)}` block (old lines 315-320) with a tone-aware banner from the controller:

```tsx
          {banner && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1',
                banner.tone === 'error' && 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50',
                banner.tone === 'warn' && 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50',
                banner.tone === 'info' && 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/50'
              )}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">{banner.title}</span> {banner.body}
              </span>
            </div>
          )}
```

Update the button `onClick` (old line 324) to use the hook: `onClick={() => (onDuty ? void stop(true) : void start())}`.

Replace the sticky-green pill (old lines 336-342) with a status pill derived from the real `status`:

```tsx
              {(() => {
                const live = status === 'live';
                const paused = status === 'paused' || status === 'starting';
                const label = live ? 'Sharing live' : paused ? 'Paused — no fresh GPS' : 'Not sharing';
                const dot = live ? 'bg-green-600' : paused ? 'bg-amber-500' : 'bg-gray-400';
                const wrap = live
                  ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50'
                  : paused
                    ? 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50'
                    : 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300';
                return (
                  <div className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1', wrap)}>
                    <span className="relative flex h-2 w-2">
                      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />}
                      <span className={cn('relative inline-flex h-2 w-2 rounded-full', dot)} />
                    </span>
                    {label}
                  </div>
                );
              })()}
```

The `LiveStat` grid and the self-map (old lines 344-362) keep working unchanged — they already read `fix` and `lastSentAt`, which now come from the hook. The bottom "Keep this page open…" helper text (old lines 366-369) stays.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `app/driver/location/page.tsx` (e.g. no "onDuty is not defined", no unused-import errors for the removed imports).

- [ ] **Step 4: Probe the page compiles (dev server running)**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/driver/location`
Expected: `307` or `200` (auth redirect or render) — NOT `500`.

- [ ] **Step 5: Commit**

```bash
git add app/driver/location/page.tsx
git commit -m "$(printf 'feat(driver-tracking): honest capture status on the driver page\n\nDriver page now consumes useLiveTracking: the status pill reflects real\nGPS freshness (live/paused/not-sharing) instead of a sticky toggle, and a\ntone-aware banner surfaces OS-location-off, permission-denied, and pause.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 2.2: Make the admin Track-All map tell the truth

**Files:**
- Modify: `app/api/admin/track-all/drivers/route.ts:146-168`
- Modify: `app/(admin)/track-all/page.tsx:93-99,142-159,212-215,240-244`

**Interfaces:**
- Produces (route): each driver gains `is_live: boolean` (= `location_sharing_enabled && gps_status === 'online'`); `location_tracking_status` becomes `'active' | 'paused' | 'inactive'`; response gains `active_tracking` = count of `is_live` and `freshest_update: string | null` (max `last_gps_update`).
- Consumes (page): `is_live`, `freshest_update`, `location_tracking_status` from the route.

- [ ] **Step 1: Derive tracking status + counts from freshness in the API**

In `app/api/admin/track-all/drivers/route.ts`, inside the `resolved.map(...)` return object (around lines 146-158), replace the `location_tracking_status` line and add `is_live`:

```ts
      const isLive = !!d.location_sharing_enabled && fresh.status === 'online';
      return {
        id: d.id,
        name,
        current_latitude: lat,
        current_longitude: lng,
        location_accuracy: veh?.gps_accuracy ?? null,
        location_timestamp: veh?.last_gps_update ?? null,
        last_location_update: veh?.last_gps_update ?? null,
        location_sharing_enabled: !!d.location_sharing_enabled,
        is_live: isLive,
        // Honest tri-state: sharing + fresh = active; sharing but stale = paused; off = inactive.
        location_tracking_status: !d.location_sharing_enabled ? 'inactive' : isLive ? 'active' : 'paused',
        route_id: route.id,
        route_number: route.route_number,
        route_name: route.route_name,
        vehicle_id: veh?.id ?? null,
        registration_number: veh?.registration_number ?? null,
        gps_status: fresh.status,
        time_since_update: fresh.minutes,
        location_status: hasFix ? 'vehicle_gps' : 'no_location',
        status_message: hasFix ? 'Live position from driver app' : 'No location data available',
      };
```

Then change the response summary (lines 161-168) so `active_tracking` counts genuinely-live buses and add `freshest_update`:

```ts
    const timestamps = result
      .map((d) => d.last_location_update)
      .filter((t): t is string => !!t)
      .sort();
    return NextResponse.json({
      success: true,
      drivers: result,
      total: result.length,
      active_tracking: result.filter((d) => d.is_live).length,
      online_drivers: result.filter((d) => d.gps_status === 'online').length,
      freshest_update: timestamps.length ? timestamps[timestamps.length - 1] : null,
      last_updated: new Date().toISOString(),
    });
```

- [ ] **Step 2: Make the page's stat cards + status badge honest**

In `app/(admin)/track-all/page.tsx`:

1. Add `is_live` and `freshest_update` to the types. In `interface DriverLocation` (after line 39) add:
```ts
  is_live?: boolean;
```

2. Add a `paused` colour/icon. In `getStatusColor` (lines 93-99) add a case:
```ts
      case 'paused': return 'text-amber-600 bg-amber-50 border-amber-200';
```
and in `getStatusIcon` (lines 101-107) add:
```ts
      case 'paused': return <Clock className="w-4 h-4" />;
```

3. Track the freshest fix. Add state near line 47:
```ts
  const [freshestUpdate, setFreshestUpdate] = useState<string | null>(null);
```
and set it in `fetchDriverLocations` right after `setDriverLocations(data.drivers);` (line 61):
```ts
        setFreshestUpdate(data.freshest_update ?? null);
```

4. Fix the "Active Tracking" card (lines 212-215) to count genuinely-live buses:
```tsx
              <p className="text-2xl font-bold text-gray-900">
                {driverLocations.filter(d => d.is_live).length}
              </p>
```

5. Fix the "Last Update" card (lines 240-244) to show the real freshest fix age, not the poll time:
```tsx
              <p className="text-sm font-bold text-gray-900">
                {freshestUpdate ? formatTimeSince(freshestUpdate) : 'No live fixes'}
              </p>
```
(The `lastUpdate` poll-time state can remain for the header's own use, but it must no longer feed this card.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `app/(admin)/track-all/page.tsx` or `app/api/admin/track-all/drivers/route.ts`.

- [ ] **Step 4: Probe both compile (dev server running)**

Run:
```bash
curl -s -o /dev/null -w "drivers-api %{http_code}\n" http://localhost:3000/api/admin/track-all/drivers
curl -s -o /dev/null -w "track-all %{http_code}\n" http://localhost:3000/track-all
```
Expected: `401`/`307` for the API and `307`/`200` for the page — NOT `500`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/track-all/drivers/route.ts "app/(admin)/track-all/page.tsx"
git commit -m "$(printf 'fix(tracking): admin Track-All reflects real GPS freshness\n\nActive Tracking now counts sharing AND online buses; Last Update shows the\nfreshest fix age (not the poll time); tracking badge is active/paused/\ninactive. No more Active + Just now over a frozen marker.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 2.3: Live phone verification checklist (user-run)

**Files:** none (manual verification; the agent browser is unauthenticated).

- [ ] **Step 1: Ask the user to run this on a phone over HTTPS**

Provide the user this checklist and record the results in the commit/PR description:

1. Open `/driver/location` on the phone, go On Duty → status pill shows **Sharing live** within a few seconds; admin `/track-all` shows the bus, **Active Tracking = 1**, **Last Update = "Just now"** ticking with movement.
2. Turn the phone's **OS location OFF** (leave the page open) → within ~15 s the driver page shows the red **Turn on Location** banner (not "signal dropped"); admin flips the bus to **paused/offline**.
3. Turn OS location back ON → returns to **Sharing live**.
4. **Lock the phone** for ~40 s, then unlock → while locked the admin bus goes **paused** and Last Update ages; on unlock the driver page resumes **Sharing live**. (Confirms the honest pause + resume; capture pausing on lock is the documented web limit.)
5. Deny location permission once → driver page shows the terminal **permission denied** banner and stops.

---

## Phase 3 — Installable PWA (driver portal)

### Task 3.1: Manifest, icon, and no-op service worker

**Files:**
- Create: `public/icons/driver-icon.svg`
- Create: `public/driver.webmanifest`
- Create: `public/sw-driver.js`

**Interfaces:** static assets served from the site root (`/icons/driver-icon.svg`, `/driver.webmanifest`, `/sw-driver.js`).

- [ ] **Step 1: Create the app icon**

Create `public/icons/driver-icon.svg` (green rounded square + white bus glyph; `purpose: any maskable` needs safe padding, so the glyph sits in the middle ~60%):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#16a34a"/>
  <g fill="#ffffff">
    <rect x="146" y="128" width="220" height="230" rx="28"/>
    <rect x="166" y="158" width="180" height="90" rx="12" fill="#16a34a"/>
    <circle cx="192" cy="372" r="26"/>
    <circle cx="320" cy="372" r="26"/>
    <rect x="150" y="300" width="212" height="18" fill="#16a34a"/>
  </g>
</svg>
```

- [ ] **Step 2: Create the manifest**

Create `public/driver.webmanifest`:

```json
{
  "name": "JKKN Transport — Driver",
  "short_name": "JKKN Driver",
  "description": "Share your bus location live while driving.",
  "start_url": "/driver/location",
  "scope": "/driver",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#16a34a",
  "icons": [
    { "src": "/icons/driver-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: Create the no-op service worker**

Create `public/sw-driver.js` (a fetch handler must exist for installability, but it caches nothing — zero risk to the rest of the app):

```js
// Minimal SW for PWA installability of the driver portal ONLY.
// It intentionally caches nothing: background geolocation is impossible in a SW,
// so this exists purely to satisfy the browser's "installable" fetch-handler check.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* pass-through: do not intercept, do not cache */
});
```

- [ ] **Step 4: Verify the files are served (dev server running)**

Run:
```bash
curl -s -o /dev/null -w "manifest %{http_code}\n" http://localhost:3000/driver.webmanifest
curl -s -o /dev/null -w "sw %{http_code}\n" http://localhost:3000/sw-driver.js
curl -s -o /dev/null -w "icon %{http_code}\n" http://localhost:3000/icons/driver-icon.svg
```
Expected: `200` for all three.

- [ ] **Step 5: Commit**

```bash
git add public/driver.webmanifest public/sw-driver.js public/icons/driver-icon.svg
git commit -m "$(printf 'feat(driver-pwa): manifest, icon, and no-op service worker\n\nInstallable driver portal (Add to Home Screen). The SW caches nothing —\nit exists only to satisfy the installability fetch-handler requirement.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 3.2: Wire the PWA into the driver layout with an install button

**Files:**
- Create: `components/driver/pwa.tsx`
- Modify: `app/driver/layout.tsx:11,147`

**Interfaces:**
- Produces: `export default function DriverPwa(): JSX.Element` — injects the manifest/theme/apple-touch links into `document.head`, registers `/sw-driver.js`, and renders a small "Install app" button when the browser offers one.
- Consumes (layout): mounts `<DriverPwa />`.

No unit test (DOM/browser wiring). Verified by `tsc` + the manual install check.

- [ ] **Step 1: Create the PWA client component**

Create `components/driver/pwa.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Injects driver-portal PWA head tags, registers the no-op SW, and offers an install button. */
export default function DriverPwa() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    // Inject head tags once (the driver layout is a client component, so we can't use `metadata`).
    const add = (tag: string, attrs: Record<string, string>) => {
      const sel = Object.entries(attrs)
        .map(([k, v]) => `[${k}="${v}"]`)
        .join('');
      if (document.head.querySelector(`${tag}${sel}`)) return;
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    };
    add('link', { rel: 'manifest', href: '/driver.webmanifest' });
    add('meta', { name: 'theme-color', content: '#16a34a' });
    add('link', { rel: 'apple-touch-icon', href: '/icons/driver-icon.svg' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'JKKN Driver' });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-driver.js').catch(() => {
        /* installability is best-effort */
      });
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!deferred) return <></>;
  return (
    <button
      type="button"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice.catch(() => undefined);
        setDeferred(null);
      }}
      className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-green-700 lg:bottom-4"
    >
      <Download className="h-4 w-4" />
      Install app
    </button>
  );
}
```

- [ ] **Step 2: Mount it in the driver layout**

In `app/driver/layout.tsx`, add the import after line 11:
```ts
import DriverPwa from '@/components/driver/pwa';
```
and mount the component just before the closing `</div>` — add it right after `<DriverBottomNav />` (line 147):
```tsx
      <DriverBottomNav />
      <DriverPwa />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `components/driver/pwa.tsx` or `app/driver/layout.tsx`.

- [ ] **Step 4: Probe the driver shell compiles (dev server running)**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/driver/location`
Expected: `307`/`200` — NOT `500`.

- [ ] **Step 5: Manual install check (user-run)**

Ask the user, on Android Chrome over HTTPS: open `/driver/location`, confirm the browser's install affordance appears (the in-app "Install app" button or Chrome's menu → Install), install it, and confirm it launches standalone at `/driver/location`. On iOS: Share → Add to Home Screen launches standalone (custom icon may fall back to a page snapshot — acceptable for v1).

- [ ] **Step 6: Commit**

```bash
git add components/driver/pwa.tsx app/driver/layout.tsx
git commit -m "$(printf 'feat(driver-pwa): register SW + install button in the driver shell\n\nInjects manifest/theme/apple-touch head tags, registers the no-op SW, and\nshows an Install app button when the browser offers beforeinstallprompt.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Problem ① (foreground pause) → honest pause surfaced (Task 1.1 pause states, 2.1 UI, 2.3 checklist); the platform limit itself is documented, not "fixed" (by design).
- Problem ② (faked Active) → Task 2.1 (driver pill) + Task 2.2 (admin counts/badges/Last-Update).
- Problem ③ (OS-off misreported) → Task 1.1 `os_location_off` + Task 1.2 Permissions pre-check + Task 2.1 banner.
- Problem ④ (client-clock freeze) → Task 0.1 (clamp) + Task 0.2 (server-receipt + `last_capture_at`).
- Decisions: pure-web (no native task); basic retry (Task 1.2 `SEND_ATTEMPTS`); heartbeat+alerts (Task 1.1 tick/pause + 2.1 banner); installable PWA (Tasks 3.1-3.2); 6 s cadence (Task 1.2 `SEND_INTERVAL_MS`); 25 s heartbeat (Task 1.1 `PAUSE_AFTER_MS`); `start_url` `/driver/location` (Task 3.1); controller extraction (Tasks 1.1-1.2).
- Cross-cutting: activity-log on/off-duty audit is untouched in the ingest route (preserved). Student/boarding explicitly out (documented in File Structure note; they inherit the Phase 0 freshness fix).

**2. Placeholder scan** — no "TBD/TODO/handle edge cases/similar to Task N". Every code step shows full code; every command shows expected output. The SVG icon and no-op SW are concrete, not placeholders.

**3. Type consistency** — `TrackingStatus`/`TrackingBanner`/`TrackingEvent`/`TrackingState` are defined once in Task 1.1 and consumed by the same names in Tasks 1.2 and 2.1. `is_live` / `freshest_update` / `location_tracking_status` (`active|paused|inactive`) are produced by the Task 2.2 API and consumed by the same names in the Task 2.2 page edits. `useLiveTracking(routeId)` returns `{ status, banner, onDuty, fix, lastSentAt, start, stop }` — the exact fields the Task 2.1 page destructures. `normalizeCapturedAt`/`isNewerCapture` signatures are unchanged; only `normalizeCapturedAt`'s future-handling behavior changes (Task 0.1), consumed by the Task 0.2 route.

## Build order
Phase 0 (0.1 → 0.2) → Phase 1 (1.1 → 1.2) → Phase 2 (2.1 → 2.2 → 2.3) → Phase 3 (3.1 → 3.2). Phase 0 is shippable on its own; each later phase is independently testable.
