# Real-Time Bus Tracking — Plan 1: Trip Backbone + Realtime

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the TMS a real trip lifecycle (START TRIP → tracking → END TRIP) with a durable `trip_id`, and stream live positions to admin and students over Supabase Realtime with authorization enforced by the database.

**Architecture:** A new `tms_trip` table becomes the lifecycle backbone; the existing `POST /api/driver/location` ingest binds every fix to an active trip and additionally publishes it to two Supabase Realtime topics (`tms_bus:<routeId>` and `tms_fleet`) via the Realtime HTTP broadcast endpoint. An RLS policy on `realtime.messages` — modelled on the `induction_poll_realtime_receive` policy already present in this database — makes it impossible for a student to subscribe to a route that is not theirs. The existing 5-second poll is retained as a fallback and backs off to 30s while the socket is healthy.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + Realtime), TanStack Query, Leaflet, vitest.

**Spec:** `docs/superpowers/specs/2026-08-11-realtime-bus-tracking-design.md` (Phases 1 and 2 only; Phases 3–5 get their own plans).

**Branch:** `feat/realtime-bus-tracking`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **`npm run lint` is BROKEN** in this repo (circular ESLint config, crashes). Never run it. Never add it to a verification step.
- **`npx tsc --noEmit` is chronically red** — roughly 540 pre-existing errors, mostly from an untyped Supabase `Database` type resolving to `never`. It is **not** gated by `next build` (`ignoreBuildErrors: true`). A red `tsc` is **not** a regression signal. Verify with `npx vitest run` and, where it matters, `npm run build`.
- **Test files must live under `lib/`.** `vitest.config.ts` sets `test.include = ['lib/**/*.test.ts', 'proxy.test.ts']`. A test placed next to an `app/` route silently never runs.
- The `@/*` alias **does** resolve under vitest (`resolve.alias` is configured). New code may use `@/`. Existing `lib/gps/` and `lib/geo/` files use relative imports for historical reasons — leave them alone.
- **Baseline before starting:** `npx vitest run` → 61 files, 597 tests, 0 failures. Never finish a task below this count.
- **API pattern (modern):** `withAuth` + `AuthContext` from `@/lib/api/with-auth`, `createServiceRoleClient` from `@/lib/supabase/server`, and a local `requirePerm(auth, TMS_PERMISSIONS.X)` helper. Responses are `{ success: true, data }` or `{ error: string }` with an HTTP status.
- **Permissions are a jsonb blob on `public.custom_roles.permissions`**, not a table. Seed them data-driven and idempotently with an additive `||` merge targeting roles that already hold a related permission. Never hardcode `role_key`.
- **`admin_settings` primary key is `setting_type`** → `on conflict (setting_type)`.
- **The database is SHARED with other MyJKKN apps** (project `kvizhngldtiuufknvehv`). All changes must be additive. Migrations go in `supabase/migrations/YYYYMMDDHHMMSS_name.sql` **and** are applied with the Supabase MCP `apply_migration` tool.
- **`tms_vehicle.gps_speed` and `GeolocationCoordinates.speed` are METRES PER SECOND.** Multiply by 3.6 for km/h, once, at the boundary.
- **RECURRING DEFECT CLASS — never put an object or array from fetched data into a React dependency array.** These pages poll, so every `JSON.parse` yields fresh object identities. This caused four separate bugs in `/track-all`. Depend on primitives only.
- **Freshness is measured from server-receipt time** (`tms_vehicle.last_gps_update`, `tms_trip.last_fix_at`), never a device clock.
- Commit after every task. Never include unrelated files in a commit — the user routinely has in-flight work in the tree.

---

## File Structure

**New — pure logic (unit-tested):**

| File | Responsibility |
|---|---|
| `lib/tracking/settings.ts` | Tracking thresholds: defaults, parsing a stored blob, loading from `admin_settings` |
| `lib/tracking/trip-state.ts` | Pure trip logic: direction derivation, fix-quality gate, live-status vocabulary, expiry decision, distance increment |
| `lib/tracking/broadcast.ts` | Building and publishing Realtime broadcast messages over HTTP |

**New — database-touching helpers (not unit-tested; exercised via routes):**

| File | Responsibility |
|---|---|
| `lib/tracking/trips.ts` | `expireStaleTrips`, `getActiveTripForDriver`, `loadTripRoute` |

**New — API routes:**

| File | Responsibility |
|---|---|
| `app/api/driver/trips/route.ts` | `POST` start a trip, `GET` the driver's active trip |
| `app/api/driver/trips/[tripId]/end/route.ts` | `POST` end a trip |

**New — client:**

| File | Responsibility |
|---|---|
| `hooks/use-live-bus.ts` | Subscribe to a server-supplied Realtime topic; expose the latest fix + channel status; drive poll backoff |

**Modified:**

| File | Change |
|---|---|
| `app/api/driver/location/route.ts` | Bind fixes to an active trip; quality gate; update trip counters; broadcast |
| `lib/driver/tracking-controller.ts` | Add `no_active_trip` status and network state |
| `lib/driver/use-live-tracking.ts` | Carry `tripId`; offline ring buffer; expose network status |
| `app/driver/location/page.tsx` | Trip card, START TRIP / END TRIP, GPS + Network status lines |
| `app/student/live-track/page.tsx` | Consume `use-live-bus` |
| `app/(admin)/track-all/page.tsx` | Consume `use-live-bus` on the `tms_fleet` topic |

**New — migrations:**

| File | Change |
|---|---|
| `supabase/migrations/20260811150000_create_tms_trip.sql` | Table, indexes, `gps_location_history.trip_id`, settings row, permission seed, stuck-session cleanup |
| `supabase/migrations/20260811151000_tms_bus_realtime_authorization.sql` | `tms_can_view_route_live()` + RLS policy on `realtime.messages` |

---

# PHASE 1 — Trip Backbone

## Task 1: Tracking settings module

**Files:**
- Create: `lib/tracking/settings.ts`
- Test: `lib/tracking/settings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TrackingSettings` (interface), `DEFAULT_TRACKING_SETTINGS`, `parseTrackingSettings(raw: unknown): TrackingSettings`, `loadTrackingSettings(svc): Promise<TrackingSettings>`.

- [ ] **Step 1: Write the failing test**

Create `lib/tracking/settings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_TRACKING_SETTINGS, parseTrackingSettings } from './settings';

describe('parseTrackingSettings', () => {
  it('returns the defaults for null, undefined, and non-objects', () => {
    expect(parseTrackingSettings(null)).toEqual(DEFAULT_TRACKING_SETTINGS);
    expect(parseTrackingSettings(undefined)).toEqual(DEFAULT_TRACKING_SETTINGS);
    expect(parseTrackingSettings('nope')).toEqual(DEFAULT_TRACKING_SETTINGS);
    expect(parseTrackingSettings(42)).toEqual(DEFAULT_TRACKING_SETTINGS);
  });

  it('overrides only the keys supplied', () => {
    const s = parseTrackingSettings({ liveMaxSec: 45 });
    expect(s.liveMaxSec).toBe(45);
    expect(s.staleMaxSec).toBe(DEFAULT_TRACKING_SETTINGS.staleMaxSec);
  });

  it('ignores values that are not positive finite numbers', () => {
    const s = parseTrackingSettings({
      liveMaxSec: -1,
      staleMaxSec: 0,
      tripExpiryMin: Number.NaN,
      minAccuracyM: '80',
      offlineMaxMin: Number.POSITIVE_INFINITY,
    });
    expect(s).toEqual(DEFAULT_TRACKING_SETTINGS);
  });

  it('ignores unknown keys', () => {
    const s = parseTrackingSettings({ liveMaxSec: 45, bogus: 9 }) as Record<string, unknown>;
    expect(s.bogus).toBeUndefined();
  });

  it('never mutates the exported defaults', () => {
    parseTrackingSettings({ liveMaxSec: 999 });
    expect(DEFAULT_TRACKING_SETTINGS.liveMaxSec).toBe(120);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/tracking/settings.test.ts`
Expected: FAIL — cannot resolve `./settings`.

- [ ] **Step 3: Write the implementation**

Create `lib/tracking/settings.ts`:

```ts
/**
 * Tracking thresholds, configurable per deployment via the `admin_settings` row
 * `setting_type = 'tracking'`.
 *
 * The defaults deliberately mirror constants already in use elsewhere, so an absent
 * settings row changes no behaviour: 2 min / 5 min freshness matches
 * lib/gps/freshness.ts, and the 30 min expiry matches STUCK_AFTER_MIN in
 * lib/gps/route-status.ts.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';

export interface TrackingSettings {
  /** Fix no older than this ⇒ LIVE. */
  liveMaxSec: number;
  /** Fix no older than this ⇒ STALE; beyond it ⇒ OFFLINE. */
  staleMaxSec: number;
  /** Reserved for the admin fleet view's coarse bucketing. */
  offlineMaxMin: number;
  /** Active trip silent this long ⇒ auto-expired. */
  tripExpiryMin: number;
  /** Stationary this long during an active trip ⇒ UNEXPECTED_STOP (Phase 5). */
  unexpectedStopMin: number;
  /** Fixes with accuracy worse than this many metres are rejected at ingest. */
  minAccuracyM: number;
  /** Stop geofence radius in metres (Phase 4). */
  stopGeofenceM: number;
}

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  liveMaxSec: 120,
  staleMaxSec: 300,
  offlineMaxMin: 30,
  tripExpiryMin: 30,
  unexpectedStopMin: 10,
  minAccuracyM: 100,
  stopGeofenceM: 150,
};

const KEYS = Object.keys(DEFAULT_TRACKING_SETTINGS) as (keyof TrackingSettings)[];

/**
 * Merge a stored settings blob over the defaults. Anything that is not a positive
 * finite number is ignored rather than trusted — a corrupt row must degrade to the
 * defaults, never to NaN thresholds that would classify every bus as OFFLINE.
 */
export function parseTrackingSettings(raw: unknown): TrackingSettings {
  const out: TrackingSettings = { ...DEFAULT_TRACKING_SETTINGS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const rec = raw as Record<string, unknown>;
  for (const k of KEYS) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

/** Load the thresholds; falls back to defaults when the row is absent or unreadable. */
export async function loadTrackingSettings(
  svc: ReturnType<typeof createServiceRoleClient>
): Promise<TrackingSettings> {
  const { data } = await svc
    .from('admin_settings')
    .select('settings_data')
    .eq('setting_type', 'tracking')
    .maybeSingle();
  return parseTrackingSettings((data as { settings_data?: unknown } | null)?.settings_data);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/tracking/settings.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tracking/settings.ts lib/tracking/settings.test.ts
git commit -m "feat(tracking): configurable tracking thresholds with safe defaults"
```

---

## Task 2: Pure trip-state logic

**Files:**
- Create: `lib/tracking/trip-state.ts`
- Test: `lib/tracking/trip-state.test.ts`

**Interfaces:**
- Consumes: `hmToMinutes` from `@/lib/boarding/attendance-window`; `haversineKm` from `@/lib/gps/distance`.
- Produces: types `TripStatus`, `TripDirection`, `LiveStatus`; `deriveDirection(nowMinutesIst, arrivalTime)`, `shouldAcceptFix(accuracyM, minAccuracyM)`, `liveStatus(input)`, `isTripExpired(lastFixAt, startedAt, nowMs, tripExpiryMin)`, `distanceIncrementKm(prev, next)`, constants `ONWARD_GRACE_MIN`, `MIN_MOVE_KM`.

- [ ] **Step 1: Write the failing test**

Create `lib/tracking/trip-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  deriveDirection,
  shouldAcceptFix,
  liveStatus,
  isTripExpired,
  distanceIncrementKm,
  ONWARD_GRACE_MIN,
} from './trip-state';

describe('deriveDirection', () => {
  it('is onward before the route arrival time', () => {
    expect(deriveDirection(7 * 60, '09:00:00')).toBe('onward');
  });

  it('stays onward through the grace window after arrival', () => {
    const pivot = 9 * 60 + ONWARD_GRACE_MIN;
    expect(deriveDirection(pivot, '09:00:00')).toBe('onward');
  });

  it('is return once past arrival plus grace', () => {
    const pivot = 9 * 60 + ONWARD_GRACE_MIN;
    expect(deriveDirection(pivot + 1, '09:00:00')).toBe('return');
  });

  it('falls back to a noon pivot when the route has no arrival time', () => {
    expect(deriveDirection(11 * 60, null)).toBe('onward');
    expect(deriveDirection(13 * 60, null)).toBe('return');
  });
});

describe('shouldAcceptFix', () => {
  it('accepts a fix at or better than the threshold', () => {
    expect(shouldAcceptFix(100, 100)).toBe(true);
    expect(shouldAcceptFix(8, 100)).toBe(true);
  });

  it('rejects a fix worse than the threshold', () => {
    expect(shouldAcceptFix(101, 100)).toBe(false);
  });

  it('accepts a fix whose accuracy is unknown', () => {
    // Some devices report null accuracy; rejecting these would break capture entirely.
    expect(shouldAcceptFix(null, 100)).toBe(true);
  });
});

describe('liveStatus', () => {
  const base = { nowMs: 1_000_000, liveMaxSec: 120, staleMaxSec: 300 };

  it('reports TRIP_COMPLETED for any non-active trip', () => {
    expect(liveStatus({ ...base, tripStatus: 'completed', lastFixAt: null })).toBe('TRIP_COMPLETED');
    expect(liveStatus({ ...base, tripStatus: 'expired', lastFixAt: null })).toBe('TRIP_COMPLETED');
  });

  it('reports CONNECTING for an active trip with no fix yet', () => {
    expect(liveStatus({ ...base, tripStatus: 'active', lastFixAt: null })).toBe('CONNECTING');
  });

  it('reports CONNECTING when the stored fix time is unparseable', () => {
    expect(liveStatus({ ...base, tripStatus: 'active', lastFixAt: 'not-a-date' })).toBe('CONNECTING');
  });

  it('walks LIVE → STALE → OFFLINE across the thresholds', () => {
    const at = (ageSec: number) =>
      liveStatus({
        ...base,
        tripStatus: 'active',
        lastFixAt: new Date(base.nowMs - ageSec * 1000).toISOString(),
      });
    expect(at(0)).toBe('LIVE');
    expect(at(120)).toBe('LIVE');
    expect(at(121)).toBe('STALE');
    expect(at(300)).toBe('STALE');
    expect(at(301)).toBe('OFFLINE');
  });
});

describe('isTripExpired', () => {
  const now = 10_000_000;
  const iso = ( msAgo: number) => new Date(now - msAgo).toISOString();

  it('expires an active trip silent past the threshold', () => {
    expect(isTripExpired(iso(31 * 60_000), iso(60 * 60_000), now, 30)).toBe(true);
  });

  it('does not expire a trip still reporting', () => {
    expect(isTripExpired(iso(29 * 60_000), iso(60 * 60_000), now, 30)).toBe(false);
  });

  it('measures from started_at when no fix has ever arrived', () => {
    expect(isTripExpired(null, iso(31 * 60_000), now, 30)).toBe(true);
    expect(isTripExpired(null, iso(5 * 60_000), now, 30)).toBe(false);
  });

  it('never expires on a future timestamp', () => {
    expect(isTripExpired(new Date(now + 60_000).toISOString(), iso(0), now, 30)).toBe(false);
  });

  it('does not expire when both timestamps are unparseable', () => {
    expect(isTripExpired('junk', 'junk', now, 30)).toBe(false);
  });
});

describe('distanceIncrementKm', () => {
  it('is zero when there is no previous point', () => {
    expect(distanceIncrementKm(null, { lat: 11.44, lng: 77.73 })).toBe(0);
  });

  it('ignores GPS jitter below the movement floor', () => {
    expect(distanceIncrementKm({ lat: 11.44, lng: 77.73 }, { lat: 11.44005, lng: 77.73 })).toBe(0);
  });

  it('accumulates a real move', () => {
    const km = distanceIncrementKm({ lat: 11.44, lng: 77.73 }, { lat: 11.45, lng: 77.73 });
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(1.3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/tracking/trip-state.test.ts`
Expected: FAIL — cannot resolve `./trip-state`.

- [ ] **Step 3: Write the implementation**

Create `lib/tracking/trip-state.ts`:

```ts
/**
 * Pure trip logic. No DB, no Date.now(), no I/O — every function takes the clock as
 * an argument so the boundaries are deterministically testable, the same discipline
 * lib/gps/route-status.ts follows.
 */
import { hmToMinutes } from '@/lib/boarding/attendance-window';
import { haversineKm } from '@/lib/gps/distance';

export type TripStatus = 'active' | 'completed' | 'expired' | 'cancelled';
export type TripDirection = 'onward' | 'return';

/** The vocabulary the driver, admin and student UIs display. */
export type LiveStatus = 'LIVE' | 'CONNECTING' | 'STALE' | 'OFFLINE' | 'TRIP_COMPLETED';

/**
 * Minutes after a route's arrival_time during which a newly started trip is still
 * considered the onward leg — covers a late-running morning run.
 */
export const ONWARD_GRACE_MIN = 120;

/** Pivot used when a route has no arrival_time recorded. */
const NOON_MINUTES = 12 * 60;

/** Metres of movement below which a fix is treated as GPS jitter, not travel. */
export const MIN_MOVE_KM = 0.02;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Which leg is this? Derived from IST time-of-day against the route's arrival_time.
 * `tms_attendance` only ever holds 'onward' because the transport office retired the
 * return ATTENDANCE leg — but buses still run both ways (all 24 routes carry evening
 * stop times), so trips support both. The driver may override this.
 */
export function deriveDirection(
  nowMinutesIst: number,
  arrivalTime: string | null
): TripDirection {
  const pivot = arrivalTime ? hmToMinutes(arrivalTime) + ONWARD_GRACE_MIN : NOON_MINUTES;
  return nowMinutesIst <= pivot ? 'onward' : 'return';
}

/**
 * Should this fix be written at all? A wildly inaccurate fix would teleport the marker
 * and corrupt trip distance. A fix with UNKNOWN accuracy is accepted — some devices
 * report null, and rejecting those would break capture entirely.
 */
export function shouldAcceptFix(accuracyM: number | null, minAccuracyM: number): boolean {
  if (accuracyM === null || !Number.isFinite(accuracyM)) return true;
  return accuracyM <= minAccuracyM;
}

export interface LiveStatusInput {
  tripStatus: TripStatus;
  /** Server-receipt time of the newest fix — never a device clock. */
  lastFixAt: string | null;
  nowMs: number;
  liveMaxSec: number;
  staleMaxSec: number;
}

export function liveStatus(input: LiveStatusInput): LiveStatus {
  if (input.tripStatus !== 'active') return 'TRIP_COMPLETED';
  if (!input.lastFixAt) return 'CONNECTING';
  const t = Date.parse(input.lastFixAt);
  if (Number.isNaN(t)) return 'CONNECTING';
  const ageSec = (input.nowMs - t) / 1000;
  if (ageSec <= input.liveMaxSec) return 'LIVE';
  if (ageSec <= input.staleMaxSec) return 'STALE';
  return 'OFFLINE';
}

/**
 * Has an active trip gone silent long enough to be auto-ended?
 *
 * Measured from the last fix, or from started_at when no fix ever arrived — a trip
 * started next to a dead GPS must still expire. A future timestamp yields a negative
 * age and therefore never expires, so a skewed phone clock cannot end a live trip.
 */
export function isTripExpired(
  lastFixAt: string | null,
  startedAt: string,
  nowMs: number,
  tripExpiryMin: number
): boolean {
  const raw = lastFixAt ?? startedAt;
  const ref = Date.parse(raw);
  if (Number.isNaN(ref)) return false;
  return nowMs - ref > tripExpiryMin * 60_000;
}

/**
 * Kilometres to add to a trip's odometer for this fix. Movement below MIN_MOVE_KM is
 * discarded: a parked bus jitters by several metres per fix, which over a 3-hour trip
 * would otherwise accumulate into kilometres of phantom distance.
 */
export function distanceIncrementKm(prev: LatLng | null, next: LatLng): number {
  if (!prev) return 0;
  const km = haversineKm(prev, next);
  return km < MIN_MOVE_KM ? 0 : km;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/tracking/trip-state.test.ts`
Expected: PASS, 18 tests.

If `haversineKm` has a different signature than `(a: LatLng, b: LatLng)`, read `lib/gps/distance.ts` and adapt the call — do **not** reimplement haversine.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: 63 files, 620 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add lib/tracking/trip-state.ts lib/tracking/trip-state.test.ts
git commit -m "feat(tracking): pure trip lifecycle logic (direction, quality, status, expiry)"
```

---

## Task 3: `tms_trip` migration

**Files:**
- Create: `supabase/migrations/20260811150000_create_tms_trip.sql`

**Interfaces:**
- Produces: table `public.tms_trip`; column `gps_location_history.trip_id`; `admin_settings` row `setting_type='tracking'`; permission key `tms.tracking.trip.manage`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260811150000_create_tms_trip.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- tms_trip — the driver trip/tracking-session backbone.
--
-- Before this, "START TRIP" was a boolean (tms_driver.location_sharing_enabled)
-- plus active_route_id, so there was no trip_id, no history, no summary, and no
-- duplicate-session detection. Nothing cleared the flag except an explicit "Go Off
-- Duty" tap, so closed browsers left routes "sharing" for weeks.
--
-- Shared MyJKKN database — additive only, idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_trip (
  id               uuid primary key default gen_random_uuid(),
  route_id         uuid not null references public.tms_route(id),
  driver_id        uuid not null references public.tms_driver(id),
  vehicle_id       uuid not null references public.tms_vehicle(id),
  travel_date      date not null default (now() at time zone 'Asia/Kolkata')::date,
  direction        text not null default 'onward'
                     check (direction in ('onward','return')),
  status           text not null default 'active'
                     check (status in ('active','completed','expired','cancelled')),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  end_reason       text check (end_reason in ('driver','auto_expiry','admin')),
  last_fix_at      timestamptz,
  start_latitude   numeric,
  start_longitude  numeric,
  end_latitude     numeric,
  end_longitude    numeric,
  distance_km      numeric not null default 0,
  fix_count        integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid
);

-- Duplicate-session prevention, enforced by the database rather than app logic.
--
-- Deliberately NOT keyed on (route_id, travel_date, direction): that would cap a
-- route at one onward trip per day, so a driver who ends a trip early and restarts
-- would hit a constraint violation. Constraining only ACTIVE rows gives the
-- guarantee we want (one live session per route / driver / bus) while allowing
-- any number of trips per day.
create unique index if not exists tms_trip_one_active_per_route
  on public.tms_trip (route_id) where status = 'active';
create unique index if not exists tms_trip_one_active_per_driver
  on public.tms_trip (driver_id) where status = 'active';
-- Safe today: 0 routes share a vehicle. Two active trips on one bus would corrupt
-- the shared tms_vehicle.current_* position under last-write-wins.
create unique index if not exists tms_trip_one_active_per_vehicle
  on public.tms_trip (vehicle_id) where status = 'active';

create index if not exists tms_trip_route_date
  on public.tms_trip (route_id, travel_date desc);
create index if not exists tms_trip_active
  on public.tms_trip (status) where status = 'active';

-- Link position history to trips. Nullable so the 27,767 pre-existing rows are
-- untouched and keep meaning exactly what they meant.
alter table public.gps_location_history
  add column if not exists trip_id uuid references public.tms_trip(id);
create index if not exists gps_location_history_trip
  on public.gps_location_history (trip_id) where trip_id is not null;

-- Reads/writes go through service-role API routes. RLS is enabled with one explicit
-- own-driver read policy so a direct client query fails visibly rather than silently
-- returning an empty set.
alter table public.tms_trip enable row level security;

drop policy if exists tms_trip_select_own_driver on public.tms_trip;
create policy tms_trip_select_own_driver on public.tms_trip
  for select to authenticated
  using (
    exists (
      select 1
      from public.tms_driver d
      left join public.staff s on s.id = d.staff_id
      where d.id = tms_trip.driver_id
        and (d.profile_id = auth.uid() or s.profile_id = auth.uid())
    )
  );

-- ── Configurable thresholds ──────────────────────────────────────────────────
-- Defaults mirror the constants already in the code, so inserting this row changes
-- no behaviour on its own.
insert into public.admin_settings (setting_type, settings_data, updated_at)
values (
  'tracking',
  jsonb_build_object(
    'liveMaxSec', 120,
    'staleMaxSec', 300,
    'offlineMaxMin', 30,
    'tripExpiryMin', 30,
    'unexpectedStopMin', 10,
    'minAccuracyM', 100,
    'stopGeofenceM', 150
  ),
  now()
)
on conflict (setting_type) do nothing;

-- ── Permission ───────────────────────────────────────────────────────────────
-- Data-driven and idempotent, matching 20260703121000_seed_tms_notification_permissions.sql:
-- grant to every role that can already broadcast location, rather than hardcoding
-- role_key values that would miss any role added later.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || '{"tms.tracking.trip.manage": true}'::jsonb,
    updated_at = now()
where coalesce((permissions ->> 'tms.tracking.share')::boolean, false) = true;

-- ── One-time cleanup of stuck sessions ───────────────────────────────────────
-- Two drivers are flagged as sharing while reporting nothing. There is no trip to
-- migrate them into (they are not transmitting), so clear the flags. Those drivers
-- must tap START TRIP again — user-visible and intended.
update public.tms_driver
set location_sharing_enabled = false,
    active_route_id = null,
    location_sharing_started_at = null
where location_sharing_enabled = true;

-- ── Verification (run separately after applying) ─────────────────────────────
--   select count(*) from public.tms_trip;                          -- 0
--   select count(*) from public.tms_driver where location_sharing_enabled;  -- 0
--   select settings_data from public.admin_settings where setting_type='tracking';
--   select count(*) from public.custom_roles where permissions ? 'tms.tracking.trip.manage';
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `apply_migration` with name `create_tms_trip` and the SQL above.

- [ ] **Step 3: Verify against the live database**

Run each verification query via the Supabase MCP `execute_sql`:

```sql
select count(*) as trips from public.tms_trip;
select count(*) as still_sharing from public.tms_driver where location_sharing_enabled;
select settings_data from public.admin_settings where setting_type = 'tracking';
select count(*) as roles_granted from public.custom_roles
  where permissions ? 'tms.tracking.trip.manage';
select count(*) as history_has_trip_col from information_schema.columns
  where table_name = 'gps_location_history' and column_name = 'trip_id';
```

Expected: `trips = 0`, `still_sharing = 0`, settings row present, `roles_granted >= 1`, `history_has_trip_col = 1`.

- [ ] **Step 4: Verify the unique index actually blocks a duplicate**

A constraint that is never exercised is a constraint that might not work. Run:

```sql
do $$
declare r uuid; d uuid; v uuid;
begin
  select id into r from public.tms_route where vehicle_id is not null limit 1;
  select id into d from public.tms_driver limit 1;
  select vehicle_id into v from public.tms_route where id = r;

  insert into public.tms_trip (route_id, driver_id, vehicle_id) values (r, d, v);
  begin
    insert into public.tms_trip (route_id, driver_id, vehicle_id) values (r, d, v);
    raise exception 'FAIL: duplicate active trip was allowed';
  exception when unique_violation then
    raise notice 'PASS: duplicate active trip rejected';
  end;

  delete from public.tms_trip where route_id = r;
end $$;
```

Expected: `NOTICE: PASS: duplicate active trip rejected`, and the table is left empty.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811150000_create_tms_trip.sql
git commit -m "feat(tracking): add tms_trip table, settings row, permission, stuck-session cleanup"
```

---

## Task 4: Trip DB helpers

**Files:**
- Create: `lib/tracking/trips.ts`

**Interfaces:**
- Consumes: `TrackingSettings` from `./settings`; `isTripExpired` from `./trip-state`; `createServiceRoleClient`.
- Produces: `TripRow` (interface), `TRIP_SELECT`, `expireStaleTrips(svc, settings)`, `getActiveTripForDriver(svc, driverId)`.

- [ ] **Step 1: Write the implementation**

This module is a thin database wrapper with no branching logic of its own (all decisions live in the unit-tested `trip-state.ts`), so it has no separate test file; it is exercised by the routes in Tasks 5–7.

Create `lib/tracking/trips.ts`:

```ts
/**
 * Database helpers for tms_trip. All decision logic lives in ./trip-state (pure and
 * unit-tested); this file only reads and writes.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import type { TrackingSettings } from './settings';
import { isTripExpired, type TripDirection, type TripStatus } from './trip-state';

export interface TripRow {
  id: string;
  route_id: string;
  driver_id: string;
  vehicle_id: string;
  travel_date: string;
  direction: TripDirection;
  status: TripStatus;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  last_fix_at: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  distance_km: number;
  fix_count: number;
}

export const TRIP_SELECT =
  'id, route_id, driver_id, vehicle_id, travel_date, direction, status, started_at, ended_at, end_reason, last_fix_at, start_latitude, start_longitude, end_latitude, end_longitude, distance_km, fix_count';

/**
 * End active trips that have gone silent past the expiry threshold.
 *
 * Called from READ paths (the driver's trip status, the admin fleet read) rather than
 * relying only on a scheduler. This project has two Vercel cron jobs that have never
 * fired in production; an expiry mechanism that depends solely on a scheduler would
 * reproduce the exact stuck-session bug it exists to fix. A pg_cron job is added as a
 * backstop, not as the primary mechanism.
 *
 * Idempotent and safe to call concurrently: the WHERE clause re-filters on
 * status = 'active', so a racing caller updates zero rows.
 *
 * Returns the number of trips expired.
 */
interface ActiveTripProbe {
  id: string;
  driver_id: string;
  started_at: string;
  last_fix_at: string | null;
}

export async function expireStaleTrips(
  svc: ReturnType<typeof createServiceRoleClient>,
  settings: TrackingSettings
): Promise<number> {
  const { data, error } = await svc
    .from('tms_trip')
    .select('id, driver_id, started_at, last_fix_at')
    .eq('status', 'active');
  if (error || !data || data.length === 0) return 0;

  const nowMs = Date.now();
  const stale = (data as ActiveTripProbe[]).filter((t) =>
    isTripExpired(t.last_fix_at, t.started_at, nowMs, settings.tripExpiryMin)
  );
  if (stale.length === 0) return 0;

  const ids = stale.map((t) => t.id);
  const nowIso = new Date(nowMs).toISOString();
  const { error: upErr } = await svc
    .from('tms_trip')
    .update({ status: 'expired', ended_at: nowIso, end_reason: 'auto_expiry', updated_at: nowIso })
    .in('id', ids)
    .eq('status', 'active');
  if (upErr) {
    console.error('expireStaleTrips update failed:', upErr);
    return 0;
  }

  // Release the driver-side sharing flags so the driver app and the admin fleet view
  // agree with tms_trip rather than contradicting it.
  const driverIds = [...new Set(stale.map((t) => t.driver_id))];
  if (driverIds.length > 0) {
    await svc
      .from('tms_driver')
      .update({
        location_sharing_enabled: false,
        active_route_id: null,
        location_sharing_started_at: null,
      })
      .in('id', driverIds);
  }

  return ids.length;
}

/** The driver's current active trip, or null. Does NOT expire — call expireStaleTrips first. */
export async function getActiveTripForDriver(
  svc: ReturnType<typeof createServiceRoleClient>,
  driverId: string
): Promise<TripRow | null> {
  const { data } = await svc
    .from('tms_trip')
    .select(TRIP_SELECT)
    .eq('driver_id', driverId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as TripRow | null) ?? null;
}
```

- [ ] **Step 2: Type-check just this file**

Run: `npx tsc --noEmit --skipLibCheck lib/tracking/trips.ts 2>&1 | head -20`

Expected: errors, if any, must reference only the Supabase `never` typing that affects the whole repo — not undefined symbols in this file. Remember the repo-wide `tsc` baseline is red; you are only checking that *you* did not add a name error.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: still 620 tests passing (this file adds no tests).

- [ ] **Step 4: Commit**

```bash
git add lib/tracking/trips.ts
git commit -m "feat(tracking): trip DB helpers with read-path expiry"
```

---

## Task 5: Trip start + active endpoints

**Files:**
- Create: `app/api/driver/trips/route.ts`

**Interfaces:**
- Consumes: `withAuth`, `AuthContext`, `createServiceRoleClient`, `getDriverForUser`, `getDriverRoutes`, `TMS_PERMISSIONS`, `loadTrackingSettings`, `expireStaleTrips`, `getActiveTripForDriver`, `TRIP_SELECT`, `deriveDirection`, `liveStatus`, `istMinutesOfDay`.
- Produces: `POST /api/driver/trips` → `{ success, data: { trip, route } }` or `409 { error, data: { trip } }`; `GET /api/driver/trips` → `{ success, data: { trip, route, status } }`.

- [ ] **Step 1: Add the permission constant**

Modify `lib/constants/tms-permissions.ts`, next to the existing tracking keys (lines 39–40):

```ts
  TRACKING_VIEW: 'tms.tracking.view',
  TRACKING_SHARE: 'tms.tracking.share',
  TRACKING_TRIP_MANAGE: 'tms.tracking.trip.manage',
```

- [ ] **Step 2: Write the route**

Create `app/api/driver/trips/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { loadTrackingSettings } from '@/lib/tracking/settings';
import { expireStaleTrips, getActiveTripForDriver, TRIP_SELECT, type TripRow } from '@/lib/tracking/trips';
import { deriveDirection, liveStatus, type TripDirection } from '@/lib/tracking/trip-state';
import { istMinutesOfDay } from '@/lib/boarding/attendance-window';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Postgres unique_violation — the active-trip partial indexes. */
const UNIQUE_VIOLATION = '23505';

/**
 * GET /api/driver/trips — the signed-in driver's active trip (or null).
 *
 * Runs expiry first so a trip abandoned with the browser closed reports as ended here
 * rather than lingering as "active" forever.
 */
async function getActive(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_TRIP_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const svc = createServiceRoleClient();
    const settings = await loadTrackingSettings(svc);
    await expireStaleTrips(svc, settings);

    const trip = await getActiveTripForDriver(svc, drv.id);
    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const route = trip ? routes.find((r) => r.id === trip.route_id) ?? null : null;

    return NextResponse.json({
      success: true,
      data: {
        trip,
        route,
        routes,
        status: trip
          ? liveStatus({
              tripStatus: trip.status,
              lastFixAt: trip.last_fix_at,
              nowMs: Date.now(),
              liveMaxSec: settings.liveMaxSec,
              staleMaxSec: settings.staleMaxSec,
            })
          : null,
      },
    });
  } catch (e) {
    console.error('driver/trips GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface StartBody {
  routeId?: unknown;
  direction?: unknown;
}

/** POST /api/driver/trips — start a trip on one of THIS driver's routes. */
async function startTrip(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_TRIP_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as StartBody | null;
    const routeId = typeof body?.routeId === 'string' ? body.routeId : null;
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });

    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const svc = createServiceRoleClient();
    const settings = await loadTrackingSettings(svc);
    // Clear abandoned sessions before the unique index can reject this start on
    // behalf of a trip that should already have ended.
    await expireStaleTrips(svc, settings);

    // Authorization: the route must be assigned to THIS driver. Never trust the body.
    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const route = routes.find((r) => r.id === routeId);
    if (!route) {
      return NextResponse.json({ error: 'Route not assigned to this driver' }, { status: 403 });
    }
    if (!route.vehicleId) {
      return NextResponse.json({ error: 'No vehicle assigned to this route' }, { status: 422 });
    }

    const direction: TripDirection =
      body?.direction === 'onward' || body?.direction === 'return'
        ? body.direction
        : deriveDirection(istMinutesOfDay(new Date()), route.arrivalTime);

    const nowIso = new Date().toISOString();
    const { data, error } = await svc
      .from('tms_trip')
      .insert({
        route_id: routeId,
        driver_id: drv.id,
        vehicle_id: route.vehicleId,
        direction,
        status: 'active',
        started_at: nowIso,
        created_by: auth.userId,
      })
      .select(TRIP_SELECT)
      .single();

    if (error) {
      // A trip is already live for this route, driver, or bus. Hand the caller the
      // existing trip so the UI can offer "resume" instead of a dead end.
      if (error.code === UNIQUE_VIOLATION) {
        const existing = await getActiveTripForDriver(svc, drv.id);
        return NextResponse.json(
          { error: 'A trip is already active', data: { trip: existing } },
          { status: 409 }
        );
      }
      throw error;
    }

    const trip = data as unknown as TripRow;

    await svc
      .from('tms_driver')
      .update({
        location_sharing_enabled: true,
        active_route_id: routeId,
        location_sharing_started_at: nowIso,
      })
      .eq('id', drv.id);

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'activate',
      entityType: 'tms_trip',
      entityId: trip.id,
      entityLabel: route.label,
      description: `Driver started a ${direction} trip on route ${route.label}`,
      metadata: { routeId, vehicleId: route.vehicleId, direction },
    });

    return NextResponse.json({ success: true, data: { trip, route } }, { status: 201 });
  } catch (e) {
    console.error('driver/trips POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getActive(request, auth));
export const POST = withAuth((request, auth) => startTrip(request, auth));
```

**Before writing:** open `lib/activity/log.ts` and confirm `'drivers'` and `'activate'` are members of its CLOSED module/action unions, and that `entityType` accepts an arbitrary string. If `tms_trip` is not accepted, extend the union in that file as part of this task — routes will not compile otherwise.

- [ ] **Step 3: Verify the route responds**

Start the dev server (`npm run dev`) and probe unauthenticated:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/driver/trips \
  -H 'Content-Type: application/json' -d '{"routeId":"00000000-0000-0000-0000-000000000000"}'
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/driver/trips
```

Expected: `401` (or `307` to login) for both — never `200`, never `500`.

Use `127.0.0.1`, not `localhost`: `curl localhost` gives false negatives in this environment. Confirm the port belongs to TMS-ADMIN by checking the page `<title>` — the 3000/3001 assignment has swapped with the sibling MyJKKN app before.

- [ ] **Step 4: Commit**

```bash
git add lib/constants/tms-permissions.ts app/api/driver/trips/route.ts
git commit -m "feat(tracking): driver trip start and active-trip endpoints"
```

---

## Task 6: Trip end endpoint

**Files:**
- Create: `app/api/driver/trips/[tripId]/end/route.ts`

**Interfaces:**
- Consumes: same helpers as Task 5.
- Produces: `POST /api/driver/trips/:tripId/end` → `{ success, data: { trip } }`.

- [ ] **Step 1: Write the route**

Create `app/api/driver/trips/[tripId]/end/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { TRIP_SELECT, type TripRow } from '@/lib/tracking/trips';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * POST /api/driver/trips/:tripId/end — the driver ends their own trip.
 *
 * Ownership is resolved from the session, never from the URL: a driver who edits the
 * tripId gets 404, because the update is filtered on their own driver_id.
 */
async function endTrip(
  request: NextRequest,
  auth: AuthContext,
  tripId: string
) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_TRIP_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const svc = createServiceRoleClient();

    // Final position for the trip summary, read before we close the row. Scoped to
    // this driver so a foreign tripId reveals nothing about another driver's bus.
    const { data: tripRow } = await svc
      .from('tms_trip')
      .select('vehicle_id')
      .eq('id', tripId)
      .eq('driver_id', drv.id)
      .maybeSingle();
    if (!tripRow) {
      return NextResponse.json({ error: 'No active trip found for this driver' }, { status: 404 });
    }

    const { data: veh } = await svc
      .from('tms_vehicle')
      .select('current_latitude, current_longitude')
      .eq('id', (tripRow as { vehicle_id: string }).vehicle_id)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const { data, error } = await svc
      .from('tms_trip')
      .update({
        status: 'completed',
        ended_at: nowIso,
        end_reason: 'driver',
        end_latitude: (veh as { current_latitude?: number } | null)?.current_latitude ?? null,
        end_longitude: (veh as { current_longitude?: number } | null)?.current_longitude ?? null,
        updated_at: nowIso,
      })
      .eq('id', tripId)
      .eq('driver_id', drv.id)   // ownership guard
      .eq('status', 'active')
      .select(TRIP_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'No active trip found for this driver' }, { status: 404 });
    }
    const trip = data as unknown as TripRow;

    await svc
      .from('tms_driver')
      .update({
        location_sharing_enabled: false,
        active_route_id: null,
        location_sharing_started_at: null,
      })
      .eq('id', drv.id);

    await svc.from('tms_vehicle').update({ live_tracking_enabled: false }).eq('id', trip.vehicle_id);

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'deactivate',
      entityType: 'tms_trip',
      entityId: trip.id,
      description: `Driver ended a trip after ${trip.fix_count} fixes over ${Number(trip.distance_km).toFixed(1)} km`,
      metadata: { routeId: trip.route_id, distanceKm: trip.distance_km, fixCount: trip.fix_count },
    });

    return NextResponse.json({ success: true, data: { trip } });
  } catch (e) {
    console.error('driver/trips/[tripId]/end POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth(async (request, auth) => {
  // Next 15 dynamic params are async; derive from the URL to keep withAuth's signature.
  const segments = new URL(request.url).pathname.split('/');
  const tripId = segments[segments.indexOf('trips') + 1] ?? '';
  if (!tripId) return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
  return endTrip(request, auth, tripId);
});
```

- [ ] **Step 2: Probe unauthenticated**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  http://127.0.0.1:3000/api/driver/trips/00000000-0000-0000-0000-000000000000/end
```

Expected: `401` or `307`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/driver/trips/[tripId]/end/route.ts"
git commit -m "feat(tracking): driver trip end endpoint with ownership guard"
```

---

## Task 7: Bind location ingest to a trip

**Files:**
- Modify: `app/api/driver/location/route.ts`

**Interfaces:**
- Consumes: `loadTrackingSettings`, `expireStaleTrips`, `getActiveTripForDriver`, `shouldAcceptFix`, `distanceIncrementKm`.
- Produces: `POST /api/driver/location` now returns `{ success, data: { accepted, advanced, tripId, rejectedReason? } }` and `409 { error: 'No active trip' }` when none exists.

- [ ] **Step 1: Add imports**

At the top of `app/api/driver/location/route.ts`, alongside the existing imports:

```ts
import { loadTrackingSettings } from '@/lib/tracking/settings';
import { expireStaleTrips, getActiveTripForDriver } from '@/lib/tracking/trips';
import { shouldAcceptFix, distanceIncrementKm } from '@/lib/tracking/trip-state';
```

- [ ] **Step 2: Require an active trip in `postLocation`**

In `postLocation`, immediately after the existing driver resolution
(`const drv = await getDriverForUser(auth); if (!drv) { ... }`) and the
`const svc = createServiceRoleClient();` line, insert:

```ts
    const settings = await loadTrackingSettings(svc);
    await expireStaleTrips(svc, settings);

    // Tracking is bound to an explicit trip: no active trip means no position is
    // stored. This is what makes "the driver must start tracking" enforceable rather
    // than merely a UI convention.
    const trip = await getActiveTripForDriver(svc, drv.id);
    if (!trip) {
      return NextResponse.json({ error: 'No active trip' }, { status: 409 });
    }
    if (trip.route_id !== routeId) {
      return NextResponse.json({ error: 'Route does not match the active trip' }, { status: 403 });
    }

    // Quality gate: a wildly inaccurate fix would teleport every reader's marker and
    // inflate trip distance. Accepted-but-ignored, not an error — the phone should
    // keep trying rather than treat this as a failure.
    if (!shouldAcceptFix(accuracy, settings.minAccuracyM)) {
      return NextResponse.json({
        success: true,
        data: { accepted: false, advanced: false, tripId: trip.id, rejectedReason: 'accuracy' },
      });
    }
```

- [ ] **Step 3: Stamp the trip on history rows and update trip counters**

In the existing `if (advanced) { ... }` block, add `trip_id: trip.id` to the
`gps_location_history` insert:

```ts
      await svc.from('gps_location_history').insert({
        vehicle_id: route.vehicleId,
        trip_id: trip.id,
        latitude,
        longitude,
        speed,
        heading,
        accuracy,
        source: 'driver_app',
        timestamp: capturedIso,
      });

      // Trip odometer. distanceIncrementKm discards sub-20m jitter, so a parked bus
      // does not accumulate phantom kilometres over a three-hour trip.
      const prev =
        trip.end_latitude != null && trip.end_longitude != null
          ? { lat: trip.end_latitude, lng: trip.end_longitude }
          : null;
      const increment = distanceIncrementKm(prev, { lat: latitude, lng: longitude });

      await svc
        .from('tms_trip')
        .update({
          last_fix_at: nowIso,
          fix_count: trip.fix_count + 1,
          distance_km: Number(trip.distance_km) + increment,
          // start_* is stamped once, on the first fix of the trip.
          ...(trip.start_latitude == null
            ? { start_latitude: latitude, start_longitude: longitude }
            : {}),
          // end_* tracks the newest fix and doubles as the previous point above.
          end_latitude: latitude,
          end_longitude: longitude,
          updated_at: nowIso,
        })
        .eq('id', trip.id);
```

- [ ] **Step 4: Replace the on-duty stamping block**

The existing block that sets `location_sharing_started_at` and logs an `activate`
activity is now redundant — Task 5 does that at trip start. **Delete** the block that
begins `const { data: started } = await svc.from('tms_driver').update({ location_sharing_started_at: nowIso })`
through the closing brace of its `if (started && started.length > 0) { ... }` activity log.

Keep the simpler flag refresh that precedes it:

```ts
    await svc
      .from('tms_driver')
      .update({ location_sharing_enabled: true, active_route_id: routeId })
      .eq('id', drv.id);
```

- [ ] **Step 5: Return the trip id**

Change the success return to:

```ts
    return NextResponse.json({
      success: true,
      data: { accepted: true, advanced, tripId: trip.id },
    });
```

- [ ] **Step 6: Make DELETE end the trip**

In `stopLocation`, after the existing `tms_vehicle` update and before the `tms_driver`
update, add:

```ts
    // Ending the broadcast ends the trip: the two must never disagree.
    const nowIso = new Date().toISOString();
    await svc
      .from('tms_trip')
      .update({ status: 'completed', ended_at: nowIso, end_reason: 'driver', updated_at: nowIso })
      .eq('driver_id', drv.id)
      .eq('status', 'active');
```

- [ ] **Step 7: Verify**

Run: `npx vitest run`
Expected: 620 tests, 0 failures (this route has no unit tests; confirm nothing regressed).

Run: `npm run build`
Expected: build completes. Type errors are not gated, but a *syntax* error will fail the build.

Probe: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/driver/location -H 'Content-Type: application/json' -d '{}'`
Expected: `401` or `307`.

- [ ] **Step 8: Commit**

```bash
git add app/api/driver/location/route.ts
git commit -m "feat(tracking): bind location ingest to an active trip with a quality gate"
```

---

## Task 8: Driver capture controller — network + no-trip states

**Files:**
- Modify: `lib/driver/tracking-controller.ts`
- Modify: `lib/driver/tracking-controller.test.ts`

**Interfaces:**
- Produces: `TrackingStatus` gains `'no_active_trip'`; `TrackingState` gains `network: NetworkStatus`; `TrackingEvent` gains `{ type: 'sendOk' }` and `{ type: 'sendFail' }`; new exported type `NetworkStatus = 'idle' | 'connected' | 'reconnecting'`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/driver/tracking-controller.test.ts`:

```ts
describe('network state', () => {
  it('starts idle', () => {
    expect(initialTrackingState.network).toBe('idle');
  });

  it('becomes connected on a successful send', () => {
    const s = reduceTracking({ ...initialTrackingState, status: 'live' }, { type: 'sendOk' });
    expect(s.network).toBe('connected');
  });

  it('becomes reconnecting on a failed send', () => {
    const s = reduceTracking({ ...initialTrackingState, status: 'live' }, { type: 'sendFail' });
    expect(s.network).toBe('reconnecting');
  });

  it('recovers to connected after a failure', () => {
    let s = reduceTracking({ ...initialTrackingState, status: 'live' }, { type: 'sendFail' });
    s = reduceTracking(s, { type: 'sendOk' });
    expect(s.network).toBe('connected');
  });

  it('does not change GPS status — network and GPS are independent signals', () => {
    const live = { ...initialTrackingState, status: 'live' as const, lastFixAt: 5, everFixed: true };
    expect(reduceTracking(live, { type: 'sendFail' }).status).toBe('live');
  });

  it('resets to idle on start', () => {
    const s = reduceTracking(
      { ...initialTrackingState, status: 'live', network: 'reconnecting' },
      { type: 'start' }
    );
    expect(s.network).toBe('idle');
  });
});

describe('no_active_trip', () => {
  it('is terminal — a stray fix cannot resurrect it', () => {
    const s = reduceTracking({ ...initialTrackingState, status: 'no_active_trip' }, { type: 'fix', atMs: 1 });
    expect(s.status).toBe('no_active_trip');
  });

  it('carries an explanatory banner', () => {
    const s = reduceTracking({ ...initialTrackingState, status: 'live' }, { type: 'noActiveTrip' });
    expect(s.status).toBe('no_active_trip');
    expect(s.banner?.tone).toBe('warn');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/driver/tracking-controller.test.ts`
Expected: FAIL — `network` undefined, `'noActiveTrip'` not assignable.

- [ ] **Step 3: Implement**

In `lib/driver/tracking-controller.ts`:

1. Extend the status union:

```ts
export type TrackingStatus =
  | 'idle'
  | 'starting'
  | 'live'
  | 'paused'
  | 'os_location_off'
  | 'permission_denied'
  | 'no_active_trip'
  | 'stopped';
```

2. Add the network type and state field:

```ts
/**
 * Whether the SERVER is receiving our fixes. Deliberately independent of GPS status:
 * a phone can have a perfect fix and no signal, or vice versa, and the driver needs
 * to see which one is broken.
 */
export type NetworkStatus = 'idle' | 'connected' | 'reconnecting';
```

Add `network: NetworkStatus;` to `TrackingState`, and `network: 'idle',` to
`initialTrackingState`.

3. Add the events:

```ts
  | { type: 'sendOk' }
  | { type: 'sendFail' }
  | { type: 'noActiveTrip' }
```

4. Add the banner and make `no_active_trip` terminal:

```ts
const NO_TRIP: TrackingBanner = {
  tone: 'warn',
  title: 'No active trip',
  body: 'Your trip has ended or expired. Tap START TRIP to begin sharing again.',
};

const isTerminal = (s: TrackingStatus) =>
  s === 'permission_denied' || s === 'stopped' || s === 'idle' || s === 'no_active_trip';
```

5. Handle the new events. `start` must reset `network` to `'idle'`; `stop` already
spreads `initialTrackingState`. Place `sendOk`/`sendFail` **before** the terminal
guard is irrelevant — they belong inside the switch, after it:

```ts
    case 'sendOk':
      return { ...state, network: 'connected' };

    case 'sendFail':
      return { ...state, network: 'reconnecting' };

    case 'noActiveTrip':
      return { ...state, status: 'no_active_trip', banner: NO_TRIP };
```

Update the `start` branch to include `network: 'idle'`, and every other explicit state
construction to carry `network` through (`fix`, `geoError`, etc. use `...state`, so
only the two literal constructions need it).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/driver/tracking-controller.test.ts`
Expected: PASS — the pre-existing cases plus 8 new ones.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: 628 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add lib/driver/tracking-controller.ts lib/driver/tracking-controller.test.ts
git commit -m "feat(tracking): add network status and no-active-trip state to the capture controller"
```

---

## Task 9: Driver hook — trip binding and offline buffer

**Files:**
- Modify: `lib/driver/use-live-tracking.ts`

**Interfaces:**
- Consumes: the controller events from Task 8.
- Produces: `useLiveTracking(routeId, tripId)` returning `{ status, banner, network, onDuty, fix, lastSentAt, bufferedCount, start, stop }`.

- [ ] **Step 1: Add the ring buffer and signature change**

Change the hook signature and add a buffer ref:

```ts
/** Fixes held while the network is down. Bounded — ~6 minutes at the 6s send cadence. */
const MAX_BUFFERED = 60;

interface BufferedFix {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  capturedAt: string;
}

export function useLiveTracking(routeId: string | null, tripId: string | null) {
  ...
  const tripIdRef = useRef(tripId);
  const bufferRef = useRef<BufferedFix[]>([]);
  const [bufferedCount, setBufferedCount] = useState(0);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);
```

- [ ] **Step 2: Rewrite `sendPing` to buffer and flush**

Replace the body of `sendPing` with:

```ts
  const sendPing = useCallback(async () => {
    if (sendingRef.current) return;
    const pos = latestFixRef.current;
    const rid = routeIdRef.current;
    if (!pos || !rid) return;
    if (isFixStale(pos.timestamp, Date.now())) return;

    const current: BufferedFix = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      speed: pos.coords.speed ?? null,
      heading: pos.coords.heading ?? null,
      capturedAt: new Date(pos.timestamp).toISOString(),
    };

    // Oldest-out ring: a long outage keeps the most RECENT fixes, which are the ones
    // worth replaying. Dropping the newest instead would replay ancient positions.
    const queue = [...bufferRef.current, current].slice(-MAX_BUFFERED);
    const signal = abortRef.current?.signal;

    sendingRef.current = true;
    try {
      for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
        if (signal?.aborted) return;
        try {
          // Send the newest fix; older buffered ones ride along for history.
          const res = await fetch('/api/driver/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ routeId: rid, tripId: tripIdRef.current, ...current }),
            signal,
          });
          if (signal?.aborted) return;
          if (res.status === 409) {
            // The server says there is no active trip — stop pretending we are live.
            dispatch({ type: 'noActiveTrip' });
            bufferRef.current = [];
            setBufferedCount(0);
            return;
          }
          if (res.ok) {
            bufferRef.current = [];
            setBufferedCount(0);
            setLastSentAt(Date.now());
            dispatch({ type: 'sendOk' });
            return;
          }
        } catch {
          if (signal?.aborted) return;
          /* network hiccup — retry */
        }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      // Every attempt failed: keep the queue for the next tick and say so honestly.
      bufferRef.current = queue;
      setBufferedCount(queue.length);
      dispatch({ type: 'sendFail' });
    } finally {
      sendingRef.current = false;
    }
  }, []);
```

- [ ] **Step 3: Clear the buffer in `teardown`**

In `teardown`, next to `latestFixRef.current = null;` add:

```ts
    bufferRef.current = [];
    setBufferedCount(0);
```

- [ ] **Step 4: Refuse to start without a trip**

In `start`, alongside the existing `if (!routeIdRef.current) return;`:

```ts
    if (!tripIdRef.current) return; // no trip ⇒ no capture; the page starts the trip first
```

- [ ] **Step 5: Return the new fields**

```ts
  return {
    status: state.status as TrackingStatus,
    banner: state.banner as TrackingBanner | null,
    network: state.network,
    onDuty: isSharing(state.status),
    fix,
    lastSentAt,
    bufferedCount,
    start,
    stop,
  };
```

- [ ] **Step 6: Verify**

Run: `npx vitest run`
Expected: 628 tests, 0 failures.

Run: `npm run build`
Expected: completes.

- [ ] **Step 7: Commit**

```bash
git add lib/driver/use-live-tracking.ts
git commit -m "feat(tracking): bind driver capture to a trip and buffer fixes while offline"
```

---

## Task 10: Driver trip UI

**Files:**
- Modify: `app/driver/location/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/driver/trips`, `POST /api/driver/trips/:id/end`, `useLiveTracking(routeId, tripId)`.

- [ ] **Step 1: Read the current page**

Read `app/driver/location/page.tsx` in full and inventory which primitives it already
imports from `@/components/driver/ui` (`Stat`, `StatCard`, `DetailTile`, `NoticeCard`,
`Tag`, `Section`, `PageHeader`, `Spinner`, `TILE`). **Reuse these.** Do not introduce
shadcn `<Card>` or any new visual language — the driver portal deliberately uses
gradient tiles and soft-bordered `rounded-xl/2xl` cards.

- [ ] **Step 2: Destructure the hook's new fields**

The page already calls `useLiveTracking`. Update the call to pass `tripId` (defined in
Step 3) and to take the fields added in Tasks 8–9:

```tsx
const { status, banner, network, onDuty, fix, bufferedCount, start, stop } =
  useLiveTracking(activeRouteId, tripId);
```

`activeRouteId` is whatever the page already uses for the driver's selected route.

- [ ] **Step 3: Load the active trip**

Add a TanStack Query fetch alongside the existing route load:

```tsx
const { data: tripData, refetch: refetchTrip } = useQuery({
  queryKey: ['driver-active-trip'],
  queryFn: async () => {
    const res = await fetch('/api/driver/trips', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).data as {
      trip: { id: string; route_id: string; direction: string; started_at: string; fix_count: number; distance_km: number } | null;
      route: { id: string; label: string; startLocation: string | null; endLocation: string | null } | null;
      routes: { id: string; label: string; startLocation: string | null; endLocation: string | null }[];
      status: string | null;
    };
  },
  refetchInterval: 15000,
});

const trip = tripData?.trip ?? null;
const tripId = trip?.id ?? null;
```

**Dependency-array rule:** `tripData` is a fresh object every poll. Never place it, or
`tripData.routes`, in a `useEffect`/`useMemo`/`useCallback` dependency array. Depend on
`tripId`, `trip?.route_id`, or `tripData?.status` — primitives only. This defect class
caused four separate bugs in `/track-all`.

- [ ] **Step 4: Add start/end handlers**

```tsx
const [busy, setBusy] = useState(false);
const [tripError, setTripError] = useState<string | null>(null);

const startTrip = async (routeId: string) => {
  setBusy(true);
  setTripError(null);
  try {
    const res = await fetch('/api/driver/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ routeId }),
    });
    if (res.status === 409) {
      // A trip is already live — adopt it rather than showing an error.
      await refetchTrip();
      return;
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setTripError(j?.error ?? 'Could not start the trip. Please try again.');
      return;
    }
    await refetchTrip();
  } catch {
    setTripError('Network problem. Check your connection and try again.');
  } finally {
    setBusy(false);
  }
};

const endTrip = async () => {
  if (!tripId) return;
  setBusy(true);
  try {
    await stop(true);                                  // release GPS + tell the server
    await fetch(`/api/driver/trips/${tripId}/end`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    await refetchTrip();
  } catch {
    setTripError('Could not end the trip cleanly. It will expire automatically.');
  } finally {
    setBusy(false);
  }
};
```

- [ ] **Step 5: Auto-start capture when a trip exists**

```tsx
// Capture follows the trip: when a trip is active and we are not yet sharing, start.
// Depends on primitives only — `trip` itself is a new object every poll.
useEffect(() => {
  if (tripId && !onDuty && status !== 'permission_denied' && status !== 'no_active_trip') {
    void start();
  }
}, [tripId, onDuty, status, start]);
```

- [ ] **Step 6: Render the two states**

**No active trip** — a card per assignable route showing label, `startLocation → endLocation`,
and a single large button:

```tsx
<button
  type="button"
  disabled={busy}
  onClick={() => startTrip(r.id)}
  className="w-full rounded-xl bg-green-600 px-6 py-5 text-lg font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-60"
>
  {busy ? 'Starting…' : 'START TRIP'}
</button>
```

Above it, a plain-language permission explanation shown *before* the browser prompt:

> **Location sharing starts when you tap START TRIP.** Your phone will share the bus's
> position with the transport office and the students on this route until you tap END
> TRIP. Keep this screen on while driving.

**Active trip** — a persistent indicator plus two independent status lines and the end
button:

```tsx
<div className="space-y-2 text-sm">
  <div className="flex items-center gap-2">
    <span className={cn('h-2.5 w-2.5 rounded-full', status === 'live' ? 'bg-green-500' : 'bg-amber-500')} />
    <span>GPS: {status === 'live' ? 'Connected' : 'Acquiring…'}</span>
  </div>
  <div className="flex items-center gap-2">
    <span className={cn('h-2.5 w-2.5 rounded-full', network === 'connected' ? 'bg-green-500' : 'bg-amber-500')} />
    <span>
      Network: {network === 'connected' ? 'Connected' : 'Reconnecting…'}
      {bufferedCount > 0 ? ` (${bufferedCount} queued)` : ''}
    </span>
  </div>
</div>

<button
  type="button"
  disabled={busy}
  onClick={endTrip}
  className="w-full rounded-xl border-2 border-red-600 px-6 py-5 text-lg font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
>
  {busy ? 'Ending…' : 'END TRIP'}
</button>
```

Render `tripError` in the existing `NoticeCard` with `tone="red"`, and the controller's
`banner` exactly as the page does today.

**Driver safety:** START TRIP and END TRIP are the only controls. Nothing else may
require interaction while the vehicle is moving.

- [ ] **Step 7: Verify**

Run: `npm run build`
Expected: completes.

Run: `npx vitest run`
Expected: 628 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add app/driver/location/page.tsx
git commit -m "feat(tracking): trip-centric driver screen with START/END TRIP and honest status"
```

---

# PHASE 2 — Realtime Distribution

## Task 11: Realtime broadcast module

**Files:**
- Create: `lib/tracking/broadcast.ts`
- Test: `lib/tracking/broadcast.test.ts`

**Interfaces:**
- Produces: `LiveFix` (interface), `busTopic(routeId)`, `FLEET_TOPIC`, `buildFixMessages(routeId, fix)`, `publishFix(routeId, fix)`.

- [ ] **Step 1: Write the failing test**

Create `lib/tracking/broadcast.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { busTopic, FLEET_TOPIC, buildFixMessages, publishFix } from './broadcast';

const fix = {
  tripId: 't1',
  routeId: 'r1',
  vehicleId: 'v1',
  latitude: 11.44,
  longitude: 77.73,
  speed: 8,
  heading: 90,
  accuracyM: 12,
  at: '2026-08-11T10:00:00.000Z',
};

describe('topics', () => {
  it('namespaces the per-route topic', () => {
    expect(busTopic('abc')).toBe('tms_bus:abc');
  });

  it('uses a distinct fleet topic', () => {
    expect(FLEET_TOPIC).toBe('tms_fleet');
  });
});

describe('buildFixMessages', () => {
  it('emits exactly one message per topic, both private', () => {
    const msgs = buildFixMessages('r1', fix);
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.topic)).toEqual(['tms_bus:r1', 'tms_fleet']);
    expect(msgs.every((m) => m.private)).toBe(true);
    expect(msgs.every((m) => m.event === 'fix')).toBe(true);
  });

  it('carries the routeId in the payload so fleet subscribers can route it', () => {
    const [, fleet] = buildFixMessages('r1', fix);
    expect((fleet.payload as { routeId: string }).routeId).toBe('r1');
  });
});

describe('publishFix', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns false and does not throw when the environment is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await expect(publishFix('r1', fix)).resolves.toBe(false);
  });

  it('returns false when the transport throws — never rejects', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(publishFix('r1', fix)).resolves.toBe(false);
  });

  it('posts both messages in a single request', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    const f = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', f);

    await expect(publishFix('r1', fix)).resolves.toBe(true);
    expect(f).toHaveBeenCalledTimes(1);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/realtime/v1/api/broadcast');
    const body = JSON.parse(init.body as string) as { messages: unknown[] };
    expect(body.messages).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/tracking/broadcast.test.ts`
Expected: FAIL — cannot resolve `./broadcast`.

- [ ] **Step 3: Implement**

Create `lib/tracking/broadcast.ts`:

```ts
/**
 * Publishing live fixes to Supabase Realtime.
 *
 * Uses the Realtime HTTP broadcast endpoint rather than opening a websocket. The
 * ingest route runs on Vercel serverless, where establishing and tearing down a
 * socket per invocation would cost more than the message itself. Both topics ride in
 * ONE request.
 *
 * Every failure path returns false rather than throwing: by the time we broadcast,
 * the database writes have already committed and the 5-second poll fallback will
 * still deliver the fix. A broken broadcast must degrade latency, never correctness.
 */

/** Per-route topic. The RLS policy on realtime.messages matches this exact prefix. */
export function busTopic(routeId: string): string {
  return `tms_bus:${routeId}`;
}

/** Fleet-wide topic, restricted to holders of tms.tracking.view. */
export const FLEET_TOPIC = 'tms_fleet';

export interface LiveFix {
  tripId: string;
  routeId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  /** METRES PER SECOND, as GeolocationCoordinates reports it. Convert at the UI edge. */
  speed: number | null;
  heading: number | null;
  accuracyM: number | null;
  /** Server-receipt time. */
  at: string;
}

export interface BroadcastMessage {
  topic: string;
  event: string;
  payload: unknown;
  private: boolean;
}

export function buildFixMessages(routeId: string, fix: LiveFix): BroadcastMessage[] {
  return [
    { topic: busTopic(routeId), event: 'fix', payload: fix, private: true },
    { topic: FLEET_TOPIC, event: 'fix', payload: fix, private: true },
  ];
}

export async function publishFix(routeId: string, fix: LiveFix): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ messages: buildFixMessages(routeId, fix) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/tracking/broadcast.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tracking/broadcast.ts lib/tracking/broadcast.test.ts
git commit -m "feat(tracking): fail-soft realtime broadcast over the HTTP endpoint"
```

---

## Task 12: Realtime authorization migration

**Files:**
- Create: `supabase/migrations/20260811151000_tms_bus_realtime_authorization.sql`

**Interfaces:**
- Produces: `public.tms_can_view_route_live(uuid)`; policy `tms_bus_realtime_receive` on `realtime.messages`.

- [ ] **Step 1: Read the existing precedent**

Before writing, read the policy already on `realtime.messages` so the new one matches
its shape:

```sql
select policyname, cmd, qual from pg_policies
where schemaname = 'realtime' and tablename = 'messages';
```

You should see `induction_poll_realtime_receive`, a `SELECT` policy using
`topic ~~ 'induction_poll:%'` plus `split_part(topic, ':', 2)::uuid`. Mirror it.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260811151000_tms_bus_realtime_authorization.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime Authorization for live bus positions.
--
-- Live fixes are broadcast to two topics:
--   tms_bus:<routeId>  — that route's riders, in-charges, driver, and tracking staff
--   tms_fleet          — holders of tms.tracking.view
--
-- Subscription is authorized by RLS on realtime.messages. This is what makes
-- "a student cannot watch another bus" a database guarantee rather than a frontend
-- convention: editing the topic string in devtools yields no rows.
--
-- Modelled on induction_poll_realtime_receive, which already exists on this table in
-- this shared database. Our policy is PREFIX-SCOPED to tms_bus:/tms_fleet, so it is
-- purely additive and cannot widen access for any other app's topics.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_can_view_route_live(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_route_id is not null
    and (
      -- Transport staff / admins: any route.
      public.user_has_permission('tms.tracking.view')

      -- The learner allocated to this route.
      or exists (
        select 1 from public.learners_profiles lp
        where lp.id = public.get_my_learner_id()
          and lp.transport_route_id = p_route_id
      )

      -- The route's driver, via either linkage column.
      or exists (
        select 1
        from public.tms_driver d
        left join public.staff s on s.id = d.staff_id
        where (d.profile_id = auth.uid() or s.profile_id = auth.uid())
          and (
            d.active_route_id = p_route_id
            or d.assigned_route_id = p_route_id
            or exists (
              select 1 from public.tms_route r
              where r.id = p_route_id and r.driver_id = d.staff_id
            )
          )
      )
    );
$$;

comment on function public.tms_can_view_route_live(uuid) is
  'True when the calling user may receive live positions for this route. Used by the '
  'tms_bus_realtime_receive RLS policy on realtime.messages.';

revoke all on function public.tms_can_view_route_live(uuid) from public;
grant execute on function public.tms_can_view_route_live(uuid) to authenticated;

drop policy if exists tms_bus_realtime_receive on realtime.messages;
create policy tms_bus_realtime_receive on realtime.messages
  for select
  to authenticated
  using (
    (
      topic like 'tms_bus:%'
      and public.tms_can_view_route_live(
            nullif(split_part(topic, ':', 2), '')::uuid
          )
    )
    or (
      topic = 'tms_fleet'
      and public.user_has_permission('tms.tracking.view')
    )
  );

-- ── Verification (run separately after applying) ─────────────────────────────
--   select policyname from pg_policies
--     where schemaname='realtime' and tablename='messages';
--   -- expect BOTH induction_poll_realtime_receive AND tms_bus_realtime_receive
```

- [ ] **Step 3: Apply the migration**

Use the Supabase MCP `apply_migration` with name `tms_bus_realtime_authorization`.

- [ ] **Step 4: Verify the induction policy still exists**

```sql
select policyname from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;
```

Expected: **both** `induction_poll_realtime_receive` and `tms_bus_realtime_receive`.
If the induction policy is missing, you dropped another app's policy — restore it
immediately from the definition captured in Step 1.

- [ ] **Step 5: Verify the authorization actually denies**

A permission check that is never exercised proves nothing. Critically, testing this as
service role would falsely succeed — you **must** assume a role:

```sql
do $$
declare
  r_a uuid;
  r_b uuid;
  learner_profile uuid;
  allowed boolean;
begin
  select lp.transport_route_id, lp.profile_id
    into r_a, learner_profile
  from public.learners_profiles lp
  where lp.transport_route_id is not null and lp.profile_id is not null
  limit 1;

  select id into r_b from public.tms_route where id <> r_a limit 1;

  -- Impersonate that learner.
  perform set_config('request.jwt.claims',
    json_build_object('sub', learner_profile, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select public.tms_can_view_route_live(r_a) into allowed;
  if not allowed then raise exception 'FAIL: learner denied their OWN route'; end if;

  select public.tms_can_view_route_live(r_b) into allowed;
  if allowed then raise exception 'FAIL: learner allowed ANOTHER route'; end if;

  raise notice 'PASS: learner sees only their own route';
end $$;
```

Expected: `NOTICE: PASS: learner sees only their own route`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260811151000_tms_bus_realtime_authorization.sql
git commit -m "feat(tracking): database-enforced authorization for live position channels"
```

---

## Task 13: Publish fixes from the ingest route

**Files:**
- Modify: `app/api/driver/location/route.ts`

- [ ] **Step 1: Import and publish**

Add the import:

```ts
import { publishFix } from '@/lib/tracking/broadcast';
```

Inside `postLocation`, at the very end of the `if (advanced) { ... }` block — after the
history insert and the trip update, so we only broadcast positions that actually moved
forward:

```ts
      // Fan out to subscribers. Deliberately NOT awaited for correctness: the writes
      // above have already committed and the poll fallback still serves this fix, so a
      // slow or failing Realtime endpoint must not delay the driver's next ping.
      void publishFix(routeId, {
        tripId: trip.id,
        routeId,
        vehicleId: route.vehicleId,
        latitude,
        longitude,
        speed,
        heading,
        accuracyM: accuracy,
        at: nowIso,
      });
```

- [ ] **Step 2: Verify**

Run: `npx vitest run`
Expected: 635 tests, 0 failures.

Run: `npm run build`
Expected: completes.

- [ ] **Step 3: Commit**

```bash
git add app/api/driver/location/route.ts
git commit -m "feat(tracking): broadcast each accepted fix to its route and fleet topics"
```

---

## Task 14: Client subscription hook

**Files:**
- Create: `hooks/use-live-bus.ts`

**Interfaces:**
- Consumes: `createClientSupabaseClient` from `@/lib/supabase/client`; `LiveFix` from `@/lib/tracking/broadcast`.
- Produces: `useLiveBus(topic: string | null)` → `{ fix, channelStatus, pollIntervalMs }`.

- [ ] **Step 1: Write the hook**

Create `hooks/use-live-bus.ts`:

```ts
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LiveFix } from '@/lib/tracking/broadcast';

/** Poll cadence while the socket is healthy — a reconcile, not the primary path. */
export const POLL_SUBSCRIBED_MS = 30_000;
/** Poll cadence while the socket is down — the original behaviour, unchanged. */
export const POLL_FALLBACK_MS = 5_000;

export type ChannelStatus = 'idle' | 'subscribing' | 'subscribed' | 'error';

/**
 * Subscribe to a live-position topic.
 *
 * The topic MUST come from the server (the location endpoints return it). Never build
 * it from a value the user can edit — although the RLS policy on realtime.messages
 * would refuse anyway, constructing it client-side invites exactly the bug the policy
 * exists to catch.
 *
 * Channel health drives the caller's poll interval: realtime is an accelerator layered
 * over the existing poll, never a replacement, so a blocked websocket degrades to
 * today's behaviour instead of a dead page.
 */
export function useLiveBus(topic: string | null) {
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');
  const supabaseRef = useRef(createClientSupabaseClient());
  // Distinct topic per hook instance, mirroring hooks/use-tms-notifications.ts: two
  // consumers sharing one topic on the singleton client makes the second .on() call
  // throw ("cannot add callbacks after subscribe()").
  const instanceId = useId();

  useEffect(() => {
    if (!topic) {
      setChannelStatus('idle');
      return;
    }
    const supabase = supabaseRef.current;
    setChannelStatus('subscribing');

    const channel = supabase
      .channel(`${topic}#${instanceId}`, { config: { private: true } })
      .on('broadcast', { event: 'fix' }, (message) => {
        const payload = (message as { payload?: unknown }).payload;
        if (payload && typeof payload === 'object') setFix(payload as LiveFix);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setChannelStatus('subscribed');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setChannelStatus('error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setChannelStatus('idle');
    };
    // `topic` and `instanceId` are STRINGS. Never add an object or array here — these
    // pages poll, so fetched objects have a new identity every tick.
  }, [topic, instanceId]);

  return {
    fix,
    channelStatus,
    pollIntervalMs: channelStatus === 'subscribed' ? POLL_SUBSCRIBED_MS : POLL_FALLBACK_MS,
  };
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: completes.

If the Supabase JS version in this repo does not accept `{ config: { private: true } }`
on `.channel()`, check the installed `@supabase/supabase-js` version in `package.json`
and consult its channel options. Private channels require a version supporting Realtime
Authorization; if it is too old, **stop and report** rather than silently falling back to
a public channel — a public channel would defeat Task 12 entirely.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-live-bus.ts
git commit -m "feat(tracking): realtime subscription hook with poll backoff"
```

---

## Task 15: Wire student and admin pages

**Files:**
- Modify: `app/api/student/location/route.ts`
- Modify: `app/student/live-track/page.tsx`
- Modify: `app/(admin)/track-all/page.tsx`

- [ ] **Step 1: Return the topic from the student endpoint**

In `app/api/student/location/route.ts`, import the topic builder:

```ts
import { busTopic } from '@/lib/tracking/broadcast';
```

and add `realtimeTopic` to the response `data` object:

```ts
        route: { id: route.id, label: `${route.route_number ?? '?'} · ${route.route_name ?? ''}`.trim() },
        realtimeTopic: busTopic(route.id),
        vehicle,
        roadRoute,
```

The client therefore never constructs a topic from anything it controls.

- [ ] **Step 2: Consume it on the student page**

In `app/student/live-track/page.tsx`:

```tsx
import { useLiveBus } from '@/hooks/use-live-bus';
```

Add `realtimeTopic?: string | null` to the `Resp` data type, then:

```tsx
const topic = data?.data?.realtimeTopic ?? null;
const { fix: liveFix, channelStatus, pollIntervalMs } = useLiveBus(topic);
```

Change the query to use the dynamic interval:

```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['student-live-track'],
  queryFn: fetchBus,
  refetchInterval: pollIntervalMs,
});
```

Prefer the realtime fix when it is newer than the polled one:

```tsx
// A broadcast fix outranks the polled snapshot when it is newer. Compared as
// primitives (parsed epoch ms), never by object identity.
const polledAtMs = v?.lastUpdate ? Date.parse(v.lastUpdate) : 0;
const liveAtMs = liveFix?.at ? Date.parse(liveFix.at) : 0;
const useLive = !!liveFix && liveAtMs > polledAtMs;

const shownLat = useLive ? liveFix!.latitude : v?.latitude ?? null;
const shownLng = useLive ? liveFix!.longitude : v?.longitude ?? null;
const shownHeading = useLive ? liveFix!.heading : v?.heading ?? null;
const shownAccuracy = useLive ? liveFix!.accuracyM : v?.accuracyM ?? null;
const shownSpeedMs = useLive ? liveFix!.speed : v?.speed ?? null;
```

Pass `shownLat`/`shownLng`/`shownHeading`/`shownAccuracy` to `<LivePositionMap>` and
`<BusContextStrip>` in place of the direct `v.*` reads. Remember `speed` is m/s —
the existing `v.speed * 3.6` conversion must be applied to `shownSpeedMs` too.

- [ ] **Step 3: Wire the admin page**

In `app/(admin)/track-all/page.tsx`:

```tsx
import { useLiveBus, } from '@/hooks/use-live-bus';
import { FLEET_TOPIC } from '@/lib/tracking/broadcast';

const { fix: liveFix, pollIntervalMs } = useLiveBus(FLEET_TOPIC);
```

Replace the hardcoded 5-second `refetchInterval` with `pollIntervalMs`.

Merge the broadcast fix into the fleet rows by `routeId`, comparing **primitives**:

```tsx
// Overlay the newest broadcast fix onto its route. Keyed on routeId strings; the
// merged array is recomputed on render and must never enter a dependency array.
const routes = (fleet?.routes ?? []).map((r) =>
  liveFix && liveFix.routeId === r.routeId && Date.parse(liveFix.at) > Date.parse(r.lastFixAt ?? '')
    ? {
        ...r,
        position: { lat: liveFix.latitude, lng: liveFix.longitude },
        heading: liveFix.heading,
        speedKmh: liveFix.speed != null ? liveFix.speed * 3.6 : null,
        accuracyM: liveFix.accuracyM,
        lastFixAt: liveFix.at,
      }
    : r
);
```

**Critical:** `routes` is a new array every render. Do not add it, `fleet`, or
`fleet.routes` to any dependency array. If a `useMemo`/`useEffect` needs to react to
fleet changes, depend on a primitive such as `fleet?.routes?.length` or a joined id
string.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: completes.

Run: `npx vitest run`
Expected: 635 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/api/student/location/route.ts app/student/live-track/page.tsx "app/(admin)/track-all/page.tsx"
git commit -m "feat(tracking): consume realtime positions on the student and admin maps"
```

---

## Task 16: pg_cron expiry backstop

**Files:**
- Create: `supabase/migrations/20260811152000_tms_trip_expiry_cron.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Backstop for trip expiry.
--
-- The PRIMARY mechanism is lib/tracking/trips.ts expireStaleTrips(), called on read
-- paths. This job exists only so trips still close when nobody opens a page. It is
-- deliberately the secondary mechanism: this project has two Vercel cron jobs that
-- have never fired in production, so scheduler-only expiry would be untrustworthy.
--
-- Threshold is read from admin_settings so it stays in step with the app.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tms_expire_stale_trips()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer;
  v_count   integer;
begin
  select coalesce((settings_data ->> 'tripExpiryMin')::integer, 30)
    into v_minutes
  from public.admin_settings
  where setting_type = 'tracking';

  v_minutes := coalesce(v_minutes, 30);

  with expired as (
    update public.tms_trip
    set status = 'expired',
        ended_at = now(),
        end_reason = 'auto_expiry',
        updated_at = now()
    where status = 'active'
      and coalesce(last_fix_at, started_at) < now() - make_interval(mins => v_minutes)
    returning driver_id
  )
  update public.tms_driver d
  set location_sharing_enabled = false,
      active_route_id = null,
      location_sharing_started_at = null
  from expired e
  where d.id = e.driver_id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

select cron.schedule(
  'tms-expire-stale-trips',
  '*/5 * * * *',
  $$select public.tms_expire_stale_trips();$$
);
```

- [ ] **Step 2: Apply and verify**

Apply via MCP `apply_migration`, name `tms_trip_expiry_cron`. Then:

```sql
select jobname, schedule, active from cron.job where jobname = 'tms-expire-stale-trips';
select public.tms_expire_stale_trips() as expired_now;
```

Expected: the job exists and is active; the direct call returns `0` (no stale trips).

If `cron.schedule` errors because the job already exists, run
`select cron.unschedule('tms-expire-stale-trips');` first — the migration is not
otherwise idempotent on that call.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260811152000_tms_trip_expiry_cron.sql
git commit -m "feat(tracking): pg_cron backstop for trip expiry"
```

---

## Task 17: Final verification

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: **64 files, 635 tests, 0 failures.** The baseline was 61 files / 597 tests; this
plan adds three test files (`settings`, `trip-state`, `broadcast`) and extends
`tracking-controller.test.ts`. A *lower* count than 64 files means a new test file is not
being picked up — check it lives under `lib/` and ends in `.test.ts`.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: completes without error.

- [ ] **Step 3: Route probes**

With `npm run dev` running, confirm every new route is auth-gated:

```bash
for p in /api/driver/trips /api/student/location /api/admin/track-all/routes; do
  printf "%s -> " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000$p"
done
```

Expected: `401` or `307` for each. Any `200` is a security regression — stop and fix.

- [ ] **Step 4: Confirm no unrelated files are staged**

Run: `git status --porcelain`
Expected: clean. The user frequently has in-flight work; a stray file in a commit is a
defect.

- [ ] **Step 5: Report**

Summarise: tasks completed, migrations applied to the live database, test counts before
and after, and the explicit list of **owed manual verification** (below).

---

## Owed manual verification (cannot be automated here)

The agent's browser cannot authenticate against this app, so these require the user on a
real device:

1. Driver: START TRIP → permission prompt → live status → lock the phone → observe the
   paused banner → unlock → resume → END TRIP.
2. Driver: airplane mode mid-trip → `Network: Reconnecting… (N queued)` → restore →
   queue drains.
3. Driver: tap START TRIP twice quickly → the second is absorbed, no duplicate trip.
4. Student: only their own bus is visible; marker moves without a page reload.
5. Student: with devtools, attempt to subscribe to `tms_bus:<another route id>` →
   must receive nothing.
6. Admin: `/track-all` markers update live; stale and offline routes render correctly.
7. Confirm the two cleared drivers can start a trip again.

---

## Self-Review Notes

- **Spec coverage:** §4.1 → Task 3; §4.2 → Task 3; §4.3 → Tasks 1, 3; §4.4 → Tasks 3, 5;
  §4.5 → Task 3; §4.6 → Tasks 4, 16; §5 → Tasks 11, 12, 13; §6 (driver + student
  endpoints) → Tasks 5, 6, 7, 15; §7 → Tasks 8, 9, 10; §12 status vocabulary → Task 2;
  §13 error handling → Tasks 7, 8, 9, 10; §14 → every task's verification steps.
- **Deferred to later plans (by design):** §8 admin students-assigned/boarded counts and
  §9 student MY BUS header / honest-ETA copy are Phase 3; §10 stop map-picker and
  geofencing are Phase 4; §11 transport events are Phase 5.
- **Type consistency:** `TripRow` (Task 4) is the single row shape used by Tasks 5, 6, 7.
  `LiveFix` (Task 11) is the single payload shape used by Tasks 13, 14, 15.
  `TrackingSettings` (Task 1) is consumed by Tasks 4, 5, 7. `busTopic()`/`FLEET_TOPIC`
  (Task 11) are the only topic constructors, used by Tasks 12 (as a SQL literal), 14, 15.
