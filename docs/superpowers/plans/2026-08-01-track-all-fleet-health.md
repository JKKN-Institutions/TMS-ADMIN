# Track-All Fleet Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin `/track-all` page so every one of the 24 routes is accounted for with a plain-English status and reason, instead of silently showing only the 2 drivers that have location sharing switched on.

**Architecture:** A new route-centric API (`GET /api/admin/track-all/routes`) starts from `tms_route` and LEFT JOINs driver and vehicle, so routes with no driver or no vehicle still appear. Status is computed server-side by a pure, unit-tested classifier (`lib/gps/route-status.ts`) that delegates its live/recent thresholds to the existing `lib/gps/freshness.ts`. The page becomes a searchable fleet list beside a map, with two-way selection sync.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role reads), TanStack Query, Leaflet, Tailwind CSS, vitest.

**Spec:** `docs/superpowers/specs/2026-08-01-track-all-fleet-health-design.md`

## Global Constraints

- **Branch:** `feat/track-all-fleet-health`, already created off `origin/main` @ `69e7bed`.
- **Never stage these pre-existing dirty files** — they belong to unrelated in-flight work: `.claude/settings.local.json`, `app/auth/callback/route.ts`, `lib/boarding/eligibility.ts`, `next-env.d.ts`, `proxy.ts`, and `supabase/migrations/20260731093000_restore_staff_boarding_eligibility_execute_grant.sql`. Always `git add` explicit paths, never `git add -A` or `git add .`.
- **Test imports inside `lib/` must be relative** (`./freshness`, not `@/lib/gps/freshness`). The `@/*` path alias does not resolve under vitest in this repo.
- **Run tests with `npm test`** (= `vitest run`). A single file: `npx vitest run lib/gps/route-status.test.ts`.
- **Do not run `npm run lint`** — it crashes with a circular-config error. Do not treat `npm run type-check` as a gate either; `tsc` is chronically red on `main` for unrelated reasons (~540 pre-existing errors) and `next build` has `ignoreBuildErrors: true`.
- **Verification gates are:** `npm test` green, `npm run build` succeeding, and unauthenticated route probes returning 401 or 307.
- **`tms_vehicle.gps_speed` is metres per second** (`GeolocationCoordinates.speed`). Multiply by 3.6 for km/h. Convert once, in the API.
- **Permission constants** come from `@/lib/constants/tms-permissions`. Never use raw permission strings.
- **No new database tables or migrations.** This feature is read-only against existing tables plus one notification insert.
- **Out of scope, do not fix:** the m/s-labelled-km/h bug on `app/driver/location/page.tsx:259`. It is real and recorded in the spec, but the user explicitly deferred it.

## File Structure

**Create:**
| Path | Responsibility |
|---|---|
| `lib/gps/route-status.ts` | Pure classifier: route facts → state, label, reason, tone |
| `lib/gps/route-status.test.ts` | vitest coverage of every state, precedence and boundary |
| `app/api/admin/track-all/routes/route.ts` | Route-centric fleet read, permission-gated |
| `app/(admin)/track-all/types.ts` | Shared client types for the fleet response |
| `app/(admin)/track-all/route-row.tsx` | One presentational row: collapsed + expanded |
| `app/(admin)/track-all/fleet-list.tsx` | Search, filter chips, sort over rows |

**Modify:**
| Path | Change |
|---|---|
| `app/(admin)/track-all/page.tsx` | Full rewrite: coverage header, two panes, TanStack Query |
| `components/live-tracking-map.tsx` | Route-keyed props, controlled selection, stale ghosting, dark overlays |
| `lib/activity/log.ts` | Add `'notify'` to the closed `ActivityAction` union |

**Create (Task 7):**
| Path | Responsibility |
|---|---|
| `app/api/admin/track-all/nudge/route.ts` | Send a driver a "start sharing" notification, with cooldown |

**Delete (Task 6):**
| Path | Reason |
|---|---|
| `app/api/admin/track-all/drivers/route.ts` | Replaced. Verified sole consumer is the page being rewritten. |

---

### Task 1: Pure route-status classifier

**Files:**
- Create: `lib/gps/route-status.ts`
- Test: `lib/gps/route-status.test.ts`

**Interfaces:**
- Consumes: `gpsFreshness` from `lib/gps/freshness.ts` — `(lastUpdate: string | null | undefined) => { status: 'online' | 'recent' | 'offline'; minutes: number | null }`
- Produces: `TrackingState`, `RouteStatusInput`, `RouteStatus`, `classifyRouteStatus(input: RouteStatusInput): RouteStatus`, `STUCK_AFTER_MIN: 30`

- [ ] **Step 1: Write the failing test**

Create `lib/gps/route-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyRouteStatus, STUCK_AFTER_MIN, type RouteStatusInput } from './route-status';

const NOW = Date.parse('2026-08-01T10:00:00Z');

/** Build an input whose last fix is `minutes` old. Pass null for "never reported". */
function at(minutes: number | null, over: Partial<RouteStatusInput> = {}): RouteStatusInput {
  return {
    hasDriver: true,
    hasVehicle: true,
    sharing: true,
    lastFixAt: minutes === null ? null : new Date(NOW - minutes * 60_000).toISOString(),
    nowMs: NOW,
    ...over,
  };
}

describe('classifyRouteStatus — configuration problems outrank sharing', () => {
  it('reports unconfigured when there is neither driver nor vehicle', () => {
    const r = classifyRouteStatus(at(0, { hasDriver: false, hasVehicle: false }));
    expect(r.state).toBe('unconfigured');
    expect(r.canNudge).toBe(false);
  });

  it('reports no_vehicle even when the driver has sharing on', () => {
    const r = classifyRouteStatus(at(0, { hasVehicle: false, sharing: true }));
    expect(r.state).toBe('no_vehicle');
  });

  it('reports no_driver when a vehicle exists but no driver does', () => {
    const r = classifyRouteStatus(at(0, { hasDriver: false }));
    expect(r.state).toBe('no_driver');
  });
});

describe('classifyRouteStatus — sharing off', () => {
  it('reports off when the driver has not gone on duty', () => {
    const r = classifyRouteStatus(at(0, { sharing: false }));
    expect(r.state).toBe('off');
    expect(r.canNudge).toBe(true);
  });

  it('reports off regardless of how fresh an old fix is', () => {
    expect(classifyRouteStatus(at(1, { sharing: false })).state).toBe('off');
  });
});

describe('classifyRouteStatus — freshness bands', () => {
  it('is live at 0 minutes', () => {
    expect(classifyRouteStatus(at(0)).state).toBe('live');
  });

  it('is live at exactly the 2-minute boundary', () => {
    expect(classifyRouteStatus(at(2)).state).toBe('live');
  });

  it('is recent just past 2 minutes', () => {
    expect(classifyRouteStatus(at(3)).state).toBe('recent');
  });

  it('is recent at exactly the 5-minute boundary', () => {
    expect(classifyRouteStatus(at(5)).state).toBe('recent');
  });

  it('is paused just past 5 minutes', () => {
    expect(classifyRouteStatus(at(6)).state).toBe('paused');
  });

  it('is paused at exactly the stuck boundary', () => {
    expect(classifyRouteStatus(at(STUCK_AFTER_MIN)).state).toBe('paused');
  });

  it('is stuck just past the stuck boundary', () => {
    expect(classifyRouteStatus(at(STUCK_AFTER_MIN + 1)).state).toBe('stuck');
  });

  it('is stuck for a 28-day-old fix (the route 19 case)', () => {
    const r = classifyRouteStatus(at(28 * 24 * 60));
    expect(r.state).toBe('stuck');
    expect(r.canNudge).toBe(true);
  });

  it('is stuck when sharing is on but nothing was ever reported', () => {
    expect(classifyRouteStatus(at(null)).state).toBe('stuck');
  });
});

describe('classifyRouteStatus — presentation', () => {
  it('gives live a green tone and recent a green tone', () => {
    expect(classifyRouteStatus(at(0)).tone).toBe('green');
    expect(classifyRouteStatus(at(4)).tone).toBe('green');
  });

  it('gives paused amber and stuck red', () => {
    expect(classifyRouteStatus(at(10)).tone).toBe('amber');
    expect(classifyRouteStatus(at(60)).tone).toBe('red');
  });

  it('never returns an empty label or reason', () => {
    const inputs = [
      at(0), at(4), at(10), at(60), at(null),
      at(0, { sharing: false }),
      at(0, { hasVehicle: false }),
      at(0, { hasDriver: false }),
      at(0, { hasDriver: false, hasVehicle: false }),
    ];
    for (const i of inputs) {
      const r = classifyRouteStatus(i);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it('only allows nudging in off and stuck states', () => {
    expect(classifyRouteStatus(at(0)).canNudge).toBe(false);
    expect(classifyRouteStatus(at(10)).canNudge).toBe(false);
    expect(classifyRouteStatus(at(60)).canNudge).toBe(true);
    expect(classifyRouteStatus(at(0, { sharing: false })).canNudge).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/gps/route-status.test.ts`
Expected: FAIL — `Failed to resolve import "./route-status"`

- [ ] **Step 3: Write the implementation**

Create `lib/gps/route-status.ts`:

```ts
/**
 * Why a route is or is not being tracked right now.
 *
 * Ordered by what an admin should do about it, not by severity:
 *   live/recent  — nothing to do
 *   paused       — wait, the driver's phone will probably resume
 *   stuck        — clear the flag; the driver's session is gone but says otherwise
 *   off          — remind the driver to go on duty
 *   no_*         — fix the route's configuration
 */
export type TrackingState =
  | 'live'
  | 'recent'
  | 'paused'
  | 'stuck'
  | 'off'
  | 'no_vehicle'
  | 'no_driver'
  | 'unconfigured';

/**
 * Minutes of silence, while still flagged as sharing, after which we stop calling it
 * a pause and call it a dead session. Nothing in the app clears
 * `tms_driver.location_sharing_enabled` except an explicit "Go Off Duty" tap, so a
 * driver who closes the browser leaves the flag true forever — the common case, not
 * an edge case.
 */
export const STUCK_AFTER_MIN = 30;

export interface RouteStatusInput {
  hasDriver: boolean;
  hasVehicle: boolean;
  sharing: boolean;
  /** tms_vehicle.last_gps_update — server-receipt time, not device time. */
  lastFixAt: string | null;
  /** Injected so tests are deterministic. Callers pass Date.now(). */
  nowMs: number;
}

export interface RouteStatus {
  state: TrackingState;
  /** Short chip text, e.g. "Live". */
  label: string;
  /** One-line explanation, e.g. "Updated 12 min ago". */
  reason: string;
  tone: 'green' | 'amber' | 'red' | 'gray';
  canNudge: boolean;
}

/** "45s" / "12 min" / "3 h" / "28 days" — the coarsest unit that stays honest. */
export function humanizeAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

export function classifyRouteStatus(input: RouteStatusInput): RouteStatus {
  const { hasDriver, hasVehicle, sharing, lastFixAt, nowMs } = input;

  // 1-3. Configuration problems outrank any sharing flag. A route with no vehicle
  // cannot be tracked even by a willing driver: POST /api/driver/location returns
  // 422 "No vehicle assigned to this route".
  if (!hasDriver && !hasVehicle) {
    return {
      state: 'unconfigured',
      label: 'Not set up',
      reason: 'No driver or vehicle assigned to this route',
      tone: 'gray',
      canNudge: false,
    };
  }
  if (!hasVehicle) {
    return {
      state: 'no_vehicle',
      label: "Can't track",
      reason: "No vehicle assigned — the driver's app will refuse to broadcast",
      tone: 'gray',
      canNudge: false,
    };
  }
  if (!hasDriver) {
    return {
      state: 'no_driver',
      label: "Can't track",
      reason: 'No driver assigned to this route',
      tone: 'gray',
      canNudge: false,
    };
  }

  // 4. Configured but the driver has not started a session.
  if (!sharing) {
    return {
      state: 'off',
      label: 'Not sharing',
      reason: "Driver hasn't gone on duty",
      tone: 'gray',
      canNudge: true,
    };
  }

  // 5-8. Sharing is on, so the only question left is how fresh the fix is.
  // Delegate the 2- and 5-minute boundaries to gpsFreshness so this module can
  // never drift from the student, boarding and driver readers.
  const fixMs = lastFixAt ? Date.parse(lastFixAt) : NaN;
  if (!Number.isFinite(fixMs)) {
    return {
      state: 'stuck',
      label: 'Session stuck',
      reason: 'On duty but has never reported a position — driver never went off duty',
      tone: 'red',
      canNudge: true,
    };
  }

  const ageMs = nowMs - fixMs;

  // These are the SAME 2-/5-minute boundaries as lib/gps/freshness.ts, deliberately
  // re-declared rather than imported. gpsFreshness() reads Date.now() internally, so
  // calling it here would make this function impure and its boundary tests
  // non-deterministic. Keep these two constants in step with that file.
  const ONLINE_MAX_MS = 2 * 60_000;
  const RECENT_MAX_MS = 5 * 60_000;

  if (ageMs <= ONLINE_MAX_MS) {
    return {
      state: 'live',
      label: 'Live',
      reason: `Updated ${humanizeAge(ageMs)} ago`,
      tone: 'green',
      canNudge: false,
    };
  }
  if (ageMs <= RECENT_MAX_MS) {
    return {
      state: 'recent',
      label: 'Live',
      reason: `Updated ${humanizeAge(ageMs)} ago`,
      tone: 'green',
      canNudge: false,
    };
  }

  if (ageMs <= STUCK_AFTER_MIN * 60_000) {
    return {
      state: 'paused',
      label: 'Paused',
      reason: `Phone stopped sending ${humanizeAge(ageMs)} ago — screen may be locked`,
      tone: 'amber',
      canNudge: false,
    };
  }

  return {
    state: 'stuck',
    label: 'Session stuck',
    reason: `On duty but silent for ${humanizeAge(ageMs)} — driver never went off duty`,
    tone: 'red',
    canNudge: true,
  };
}
```

**Why this file does not import `gpsFreshness`:** `gpsFreshness()` reads `Date.now()` internally rather than taking an injected clock, so calling it here would make `classifyRouteStatus` impure and its boundary tests non-deterministic — the tests build `lastFixAt` relative to a fixed `NOW` in the past. The 2- and 5-minute constants are therefore re-declared locally with a comment tying them back. Write the file exactly as given above; do not add a `freshness` import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/gps/route-status.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Run the whole suite to check nothing regressed**

Run: `npm test`
Expected: all pre-existing suites still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/gps/route-status.ts lib/gps/route-status.test.ts
git commit -m "feat(tracking): add pure route-status classifier

Separates 'paused' (phone screen off, will resume) from 'stuck'
(session dead but location_sharing_enabled still true). Nothing in
the app clears that flag except an explicit Go Off Duty tap, so a
closed browser leaves a route claiming to share forever."
```

---

### Task 2: Route-centric fleet API

**Files:**
- Create: `app/api/admin/track-all/routes/route.ts`
- Create: `app/(admin)/track-all/types.ts`

**Interfaces:**
- Consumes: `classifyRouteStatus`, `TrackingState` from Task 1; `withAuth` / `AuthContext` from `@/lib/api/with-auth`; `createServiceRoleClient` from `@/lib/supabase/server`; `TMS_PERMISSIONS` from `@/lib/constants/tms-permissions`; `haversineKm` and `CAMPUS` from `@/lib/gps/distance` and `@/lib/gps/campus`
- Produces: `GET /api/admin/track-all/routes` returning `FleetResponse`; the exported types `FleetRoute`, `FleetSummary`, `FleetResponse` in `app/(admin)/track-all/types.ts`

- [ ] **Step 1: Create the shared client types**

Create `app/(admin)/track-all/types.ts`:

```ts
import type { TrackingState } from '@/lib/gps/route-status';

export type { TrackingState };

export interface FleetRoute {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; registrationNumber: string | null } | null;
  position: { lat: number; lng: number } | null;
  heading: number | null;
  /** Already converted from tms_vehicle.gps_speed (m/s) to km/h by the API. */
  speedKmh: number | null;
  accuracyM: number | null;
  distanceToCampusKm: number | null;
  lastFixAt: string | null;
  sharing: boolean;
  state: TrackingState;
  label: string;
  reason: string;
  tone: 'green' | 'amber' | 'red' | 'gray';
  fixHref: string | null;
  canNudge: boolean;
}

export interface FleetSummary {
  /** Every route in tms_route. */
  total: number;
  /** Routes with both a driver and a vehicle — the honest denominator. */
  trackable: number;
  /** Routes currently in state live or recent — the honest numerator. */
  reporting: number;
  live: number;
  recent: number;
  paused: number;
  stuck: number;
  off: number;
  noVehicle: number;
  noDriver: number;
  unconfigured: number;
}

export interface FleetResponse {
  success: true;
  summary: FleetSummary;
  routes: FleetRoute[];
}
```

- [ ] **Step 2: Write the API route**

Create `app/api/admin/track-all/routes/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { classifyRouteStatus, type TrackingState } from '@/lib/gps/route-status';
import { haversineKm } from '@/lib/gps/distance';
import { CAMPUS } from '@/lib/gps/campus';

/**
 * GET /api/admin/track-all/routes — the admin fleet-health read.
 *
 * ROUTE-CENTRIC on purpose. The endpoint this replaces started from tms_driver and
 * kept only drivers that resolved to a route, so routes with no driver never
 * appeared at all and the page silently showed 2 of 24 routes. Starting from
 * tms_route and LEFT JOINing driver + vehicle is what makes "every route accounted
 * for" possible.
 *
 * The route -> driver link is resolved in BOTH directions, because the app writes it
 * in two places: tms_route.driver_id (Routes -> Edit, holds a staff id) and
 * tms_driver.active_route_id / assigned_route_id (Drivers -> Edit). Honouring only
 * one made drivers assigned via the other screen invisible.
 */

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

type RouteRow = {
  id: string;
  route_number: string | null;
  route_name: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
};
type DriverRow = {
  id: string;
  staff_id: string | null;
  location_sharing_enabled: boolean | null;
  active_route_id: string | null;
  assigned_route_id: string | null;
};
type StaffRow = { id: string; first_name: string | null; last_name: string | null };
type VehRow = {
  id: string;
  registration_number: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  gps_speed: number | null;
  gps_heading: number | null;
  gps_accuracy: number | null;
  last_gps_update: string | null;
};

const NONE = '00000000-0000-0000-0000-000000000000';
const uniq = (arr: (string | null)[]): string[] =>
  Array.from(new Set(arr.filter((v): v is string => !!v)));

async function handler(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    // Both tables are tiny (24 routes, 31 drivers), so fetch whole and join in JS —
    // the same shape the endpoint this replaces used.
    const [routesRes, driversRes] = await Promise.all([
      svc.from('tms_route').select('id, route_number, route_name, vehicle_id, driver_id'),
      svc
        .from('tms_driver')
        .select('id, staff_id, location_sharing_enabled, active_route_id, assigned_route_id'),
    ]);
    if (routesRes.error) throw routesRes.error;
    if (driversRes.error) throw driversRes.error;

    const routes = (routesRes.data ?? []) as RouteRow[];
    const drivers = (driversRes.data ?? []) as DriverRow[];

    const staffIds = uniq(drivers.map((d) => d.staff_id));
    const vehicleIds = uniq(routes.map((r) => r.vehicle_id));

    const [staffRes, vehRes] = await Promise.all([
      svc
        .from('staff')
        .select('id, first_name, last_name')
        .in('id', staffIds.length ? staffIds : [NONE]),
      svc
        .from('tms_vehicle')
        .select(
          'id, registration_number, current_latitude, current_longitude, gps_speed, gps_heading, gps_accuracy, last_gps_update',
        )
        .in('id', vehicleIds.length ? vehicleIds : [NONE]),
    ]);
    const staffById = new Map(((staffRes.data ?? []) as StaffRow[]).map((s) => [s.id, s]));
    const vehById = new Map(((vehRes.data ?? []) as VehRow[]).map((v) => [v.id, v]));

    // routeId -> driver, in the same precedence the driver's own broadcast uses:
    // active_route_id beats assigned_route_id beats tms_route.driver_id.
    const driverByRoute = new Map<string, DriverRow>();
    for (const d of drivers) {
      if (d.active_route_id) driverByRoute.set(d.active_route_id, d);
    }
    for (const d of drivers) {
      if (d.assigned_route_id && !driverByRoute.has(d.assigned_route_id)) {
        driverByRoute.set(d.assigned_route_id, d);
      }
    }
    const driverByStaffId = new Map(drivers.filter((d) => d.staff_id).map((d) => [d.staff_id!, d]));
    for (const r of routes) {
      if (!r.driver_id || driverByRoute.has(r.id)) continue;
      const d = driverByStaffId.get(r.driver_id);
      if (d) driverByRoute.set(r.id, d);
    }

    const nowMs = Date.now();

    const result = routes.map((r) => {
      const d = driverByRoute.get(r.id) ?? null;
      const veh = r.vehicle_id ? vehById.get(r.vehicle_id) ?? null : null;
      const s = d?.staff_id ? staffById.get(d.staff_id) : undefined;
      const driverName = s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() : '';

      const lat = veh?.current_latitude ?? null;
      const lng = veh?.current_longitude ?? null;
      const position = lat != null && lng != null ? { lat, lng } : null;

      const status = classifyRouteStatus({
        hasDriver: d !== null,
        hasVehicle: veh !== null,
        sharing: !!d?.location_sharing_enabled,
        lastFixAt: veh?.last_gps_update ?? null,
        nowMs,
      });

      const fixHref =
        status.state === 'off' || status.state === 'stuck' || status.state === 'paused'
          ? d
            ? `/drivers/${d.id}/edit`
            : null
          : status.state === 'no_vehicle' ||
              status.state === 'no_driver' ||
              status.state === 'unconfigured'
            ? `/routes/${r.id}/edit`
            : null;

      return {
        routeId: r.id,
        routeNumber: r.route_number,
        routeName: r.route_name,
        driver: d ? { id: d.id, name: driverName || '—' } : null,
        vehicle: veh ? { id: veh.id, registrationNumber: veh.registration_number } : null,
        position,
        heading: veh?.gps_heading ?? null,
        // gps_speed is GeolocationCoordinates.speed in METRES PER SECOND. Convert
        // once here so no consumer can forget and print a wrong number.
        speedKmh: veh?.gps_speed != null ? veh.gps_speed * 3.6 : null,
        accuracyM: veh?.gps_accuracy ?? null,
        distanceToCampusKm: position ? haversineKm(position, CAMPUS) : null,
        lastFixAt: veh?.last_gps_update ?? null,
        sharing: !!d?.location_sharing_enabled,
        state: status.state,
        label: status.label,
        reason: status.reason,
        tone: status.tone,
        fixHref,
        canNudge: status.canNudge,
      };
    });

    const count = (st: TrackingState) => result.filter((x) => x.state === st).length;
    const summary = {
      total: result.length,
      trackable: result.filter((x) => x.driver !== null && x.vehicle !== null).length,
      reporting: count('live') + count('recent'),
      live: count('live'),
      recent: count('recent'),
      paused: count('paused'),
      stuck: count('stuck'),
      off: count('off'),
      noVehicle: count('no_vehicle'),
      noDriver: count('no_driver'),
      unconfigured: count('unconfigured'),
    };

    return NextResponse.json({ success: true, summary, routes: result });
  } catch (error) {
    console.error('track-all/routes GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handler(request, auth));
```

`haversineKm` is confirmed exported from `lib/gps/distance.ts` — `components/live-tracking-map.tsx:9` already imports it from that path, and `lib/gps/distance.test.ts:2` imports it relatively. `CAMPUS` is confirmed exported from `lib/gps/campus.ts`.

- [ ] **Step 3: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds and the route appears in the output as `/api/admin/track-all/routes`.

- [ ] **Step 4: Probe the endpoint unauthenticated**

Start the dev server in one shell (`npm run dev`), then in another:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/admin/track-all/routes`
Expected: `401` or `307`. **Not** `200`, which would mean the permission gate is missing.

Note: use `127.0.0.1`, not `localhost` — `localhost` gives false negatives in this environment. Also confirm the port actually belongs to TMS-ADMIN by checking the page `<title>`; port assignment is not stable between this project and its sibling.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/track-all/routes/route.ts app/\(admin\)/track-all/types.ts
git commit -m "feat(tracking): add route-centric fleet API

Starts from tms_route and LEFT JOINs driver + vehicle so all 24 routes
appear, including the 3 that can never track. Resolves the route-driver
link in both directions (tms_route.driver_id and
tms_driver.active_route_id/assigned_route_id).

Adds the requirePerm(tms.tracking.view) gate the endpoint it replaces
was missing, and converts gps_speed from m/s to km/h at the boundary."
```

---

### Task 3: Map component — route-keyed props, controlled selection, stale ghosting

**Files:**
- Modify: `components/live-tracking-map.tsx`

**Interfaces:**
- Consumes: `TrackingState` from `@/lib/gps/route-status`
- Produces: the exported `MapBus` interface and a `LiveTrackingMap` whose props are `{ buses: MapBus[]; selectedRouteId: string | null; onSelectRoute: (routeId: string | null) => void }`

- [ ] **Step 1: Replace the props interface**

Replace the `DriverLocation` and `LiveTrackingMapProps` interfaces (currently lines 19–41) with:

```ts
import type { TrackingState } from '@/lib/gps/route-status';

export interface MapBus {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  driverName: string | null;
  registrationNumber: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  accuracyM: number | null;
  state: TrackingState;
  reason: string;
}

interface LiveTrackingMapProps {
  buses: MapBus[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
}
```

- [ ] **Step 2: Retarget the marker state and colours**

Change `MarkerState.driver: DriverLocation` to `bus: MapBus`, and replace the `STATUS_COLORS` map with one keyed by `TrackingState`:

```ts
const STATE_COLORS: Record<TrackingState, string> = {
  live: '#10B981',
  recent: '#10B981',
  paused: '#F59E0B',
  stuck: '#EF4444',
  off: '#6B7280',
  no_vehicle: '#6B7280',
  no_driver: '#6B7280',
  unconfigured: '#6B7280',
};

/** Stale buses ghost back so a marker from 10 hours ago doesn't read as present. */
const STALE_STATES: ReadonlySet<TrackingState> = new Set(['paused', 'stuck']);
```

- [ ] **Step 3: Ghost stale markers in the icon factory**

Replace `createCustomIcon` with:

```ts
function createBusIcon(bus: MapBus): L.DivIcon {
  const color = STATE_COLORS[bus.state];
  const stale = STALE_STATES.has(bus.state);
  const opacity = stale ? 0.45 : 1;
  const displayText = bus.routeNumber || '?';
  // A stale fix's heading is as old as the fix, so don't imply a current direction.
  const pointer =
    stale || bus.heading == null || Number.isNaN(bus.heading)
      ? ''
      : `<div style="position:absolute;inset:0;transform:rotate(${bus.heading}deg);">
           <div style="position:absolute;top:-6px;left:50%;margin-left:-4px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid ${color};"></div>
         </div>`;
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position:relative;width:30px;height:30px;opacity:${opacity};">
        ${pointer}
        <div style="
          position:absolute;top:3px;left:3px;background:${color};width:24px;height:24px;border-radius:50%;
          border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;
        ">${displayText}</div>
      </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}
```

- [ ] **Step 4: Rewrite the popup builder**

Replace `buildPopup` with:

```ts
function buildPopup(bus: MapBus): string {
  const color = STATE_COLORS[bus.state];
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  const title = `Route ${esc(bus.routeNumber ?? '?')}${bus.routeName ? ` · ${esc(bus.routeName)}` : ''}`;
  return `
    <div style="min-width:220px;font-family:system-ui,-apple-system,sans-serif;">
      <h3 style="margin:0 0 8px 0;color:#111827;font-size:15px;font-weight:600;">${title}</h3>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
        <span style="font-size:12px;color:#6B7280;">${esc(bus.reason)}</span>
      </div>
      <div style="font-size:13px;color:#374151;">
        ${bus.registrationNumber ? `<div style="margin-bottom:4px;"><strong>Bus:</strong> ${esc(bus.registrationNumber)}</div>` : ''}
        ${bus.driverName ? `<div><strong>Driver:</strong> ${esc(bus.driverName)}</div>` : ''}
      </div>
    </div>`;
}
```

Note the `esc` helper: route and driver names are free text from the database and Leaflet renders popup HTML raw. The code being replaced interpolated them unescaped.

- [ ] **Step 5: Make selection controlled**

In the component body, delete the local `const [selected, setSelected] = useState(...)` declaration and drive selection from props instead. Keep `selectedIdRef` as an internal echo — the enrichment callbacks use it to cancel stale responses, and removing it would break that.

Replace the `selectBus` function with:

```ts
  // Keep the ref in step with the prop so in-flight enrichment can still cancel itself.
  useEffect(() => {
    selectedIdRef.current = selectedRouteId;
    if (!selectedRouteId) clearRouteLine();
  }, [selectedRouteId]);

  // Draw the road line + address for whichever route the parent has selected.
  useEffect(() => {
    if (!selectedRouteId) return;
    const st = markersRef.current.get(selectedRouteId);
    if (!st) return;
    const bus = st.bus;
    void fetchEnrichment(bus.lat, bus.lng, { route: true, address: true }).then((e) => {
      if (!e || selectedIdRef.current !== selectedRouteId) return;
      const map = mapInstanceRef.current;
      if (map && e.route) {
        clearRouteLine();
        routeLineRef.current = L.polyline(e.route.geometry, {
          color: '#2563eb', weight: 5, opacity: 0.85,
        }).addTo(map);
      }
      if (e.snapped) {
        enrichRef.current.set(selectedRouteId, { at: { lat: bus.lat, lng: bus.lng }, snapped: e.snapped });
        const cur = markersRef.current.get(selectedRouteId);
        if (cur) { cur.from = { ...cur.anim }; cur.to = e.snapped; cur.start = performance.now(); }
      }
      setEnrichment({ address: e.address, distanceKm: e.route?.distanceKm ?? null, durationMin: e.route?.durationMin ?? null });
    });
  }, [selectedRouteId]);
```

Add `const [enrichment, setEnrichment] = useState<{ address: string | null; distanceKm: number | null; durationMin: number | null } | null>(null);` alongside the other hooks, and reset it to `null` inside the `selectedRouteId` effect above.

In the marker-creation branch, change the click binding from `marker.on('click', () => selectBus(st.driver))` to:

```ts
        marker.on('click', () => onSelectRoute(st.bus.routeId));
```

- [ ] **Step 6: Update the diff loop to iterate buses**

In the marker-diffing effect, change the source from `(driverLocations || []).filter((d) => d.current_latitude && d.current_longitude)` to `buses` (the parent only sends buses that have a position), key everything on `bus.routeId` instead of `d.id`, use `createBusIcon(bus)` and `buildPopup(bus)`, set `existing.bus = bus`, and target `{ lat: bus.lat, lng: bus.lng }`. In the snap pass, replace `const fresh = d.gps_status === 'online' || d.gps_status === 'recent'` with:

```ts
      const fresh = bus.state === 'live' || bus.state === 'recent';
```

Change the effect's dependency array from `[driverLocations]` to `[buses, onSelectRoute]`.

- [ ] **Step 7: Convert the two overlays to Tailwind with dark variants**

Replace the inline-styled Recenter button and selection card in the returned JSX with:

```tsx
  const selectedBus = selectedRouteId ? markersRef.current.get(selectedRouteId)?.bus ?? null : null;

  return (
    <div className="relative h-full min-h-[420px] w-full">
      <div ref={mapRef} className="h-full min-h-[420px] w-full" />
      <button
        type="button"
        onClick={fitToMarkers}
        className="absolute right-2.5 top-2.5 z-[1000] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        Recenter
      </button>
      {selectedBus && (
        <div className="absolute bottom-3 left-3 z-[1000] max-w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                Route {selectedBus.routeNumber ?? '?'}
                {selectedBus.routeName ? ` · ${selectedBus.routeName}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectRoute(null)}
              aria-label="Clear selection"
              className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            📍 {enrichment?.address ?? 'Locating…'}
          </p>
          {enrichment?.distanceKm != null && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              🚌 {enrichment.distanceKm.toFixed(1)} km to campus
              {enrichment.durationMin != null ? ` · ~${enrichment.durationMin} min` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
```

The `min-h-[600px]` in the old markup is deliberately dropped — the parent now controls height so the map can shrink on mobile.

- [ ] **Step 8: Build to verify**

Run: `npm run build`
Expected: succeeds. Compile errors pointing at `app/(admin)/track-all/page.tsx` are expected at this point — that file is rewritten in Task 6. If the build fails only there, continue.

- [ ] **Step 9: Commit**

```bash
git add components/live-tracking-map.tsx
git commit -m "refactor(tracking): route-keyed map with controlled selection

Props move from driver-keyed to route-keyed and selection is lifted to
the parent so the list and map can sync both ways. Paused/stuck markers
ghost to 45% with no heading pointer so a 10-hour-old fix stops reading
as present. Overlays move from inline styles to Tailwind with dark
variants, and popup interpolation is now HTML-escaped."
```

---

### Task 4: Fleet row component

**Files:**
- Create: `app/(admin)/track-all/route-row.tsx`

**Interfaces:**
- Consumes: `FleetRoute` from `./types`
- Produces: `RouteRow`, a presentational component with props `{ route: FleetRoute; expanded: boolean; selected: boolean; onToggle: () => void; onNudge: () => void; nudgeState: 'idle' | 'sending' | 'sent' | 'cooldown'; cooldownMin: number | null }`

- [ ] **Step 1: Write the component**

Create `app/(admin)/track-all/route-row.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Bell, MapPin, Gauge, Crosshair, School } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FleetRoute } from './types';

const DOT: Record<FleetRoute['tone'], string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
};

const CHIP: Record<FleetRoute['tone'], string> = {
  green: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50',
  red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
};

/** Label for the deep link, chosen by what the admin actually has to change. */
function fixLabel(state: FleetRoute['state']): string {
  switch (state) {
    case 'off':
    case 'paused':
      return 'Open driver';
    case 'stuck':
      return 'Clear session';
    default:
      return 'Fix route setup';
  }
}

function Stat({ icon: Icon, label, value }: {
  icon: typeof Gauge; label: string; value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800/40">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export function RouteRow({
  route, expanded, selected, onToggle, onNudge, nudgeState, cooldownMin,
}: {
  route: FleetRoute;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onNudge: () => void;
  nudgeState: 'idle' | 'sending' | 'sent' | 'cooldown';
  cooldownMin: number | null;
}) {
  // Reverse-geocoded address, fetched only when the row is opened. Raw lat/lng is
  // never shown — it is not information an admin can act on.
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!expanded || !route.position || address !== null) return;
    let cancelled = false;
    const qs = new URLSearchParams({
      lat: String(route.position.lat), lng: String(route.position.lng), route: '0', address: '1',
    });
    fetch(`/api/admin/track-all/directions?${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setAddress(j?.address ?? 'Location unavailable'); })
      .catch(() => { if (!cancelled) setAddress('Location unavailable'); });
    return () => { cancelled = true; };
  }, [expanded, route.position, address]);

  return (
    <li
      className={cn(
        'border-b border-gray-100 last:border-0 dark:border-gray-800',
        selected && 'bg-blue-50/60 dark:bg-blue-950/20',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT[route.tone])} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="shrink-0 text-sm font-bold text-gray-900 dark:text-white">
              {route.routeNumber ?? '—'}
            </span>
            <span className="truncate text-sm text-gray-700 dark:text-gray-300">
              {route.routeName ?? 'Unnamed route'}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', CHIP[route.tone])}>
              {route.label}
            </span>
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">{route.reason}</span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            'mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 px-4 pb-4 pl-9">
          {route.position && (
            <p className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">{address ?? 'Locating…'}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              icon={School}
              label="To campus"
              value={route.distanceToCampusKm != null ? `${route.distanceToCampusKm.toFixed(1)} km` : '—'}
            />
            <Stat
              icon={Gauge}
              label="Speed"
              value={route.speedKmh != null ? `${Math.round(route.speedKmh)} km/h` : '—'}
            />
            <Stat
              icon={Crosshair}
              label="Accuracy"
              value={route.accuracyM != null ? `±${Math.round(route.accuracyM)} m` : '—'}
            />
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-gray-400 dark:text-gray-500">Bus</dt>
            <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              {route.vehicle?.registrationNumber ?? 'Not assigned'}
            </dd>
            <dt className="text-gray-400 dark:text-gray-500">Driver</dt>
            <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              {route.driver?.name ?? 'Not assigned'}
            </dd>
            <dt className="text-gray-400 dark:text-gray-500">Last fix</dt>
            <dd className="min-w-0 truncate text-gray-700 dark:text-gray-300">
              {route.lastFixAt ? new Date(route.lastFixAt).toLocaleString() : 'Never'}
            </dd>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {route.fixHref && (
              <Link
                href={route.fixHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {fixLabel(route.state)}
              </Link>
            )}
            {route.canNudge && (
              <button
                type="button"
                onClick={onNudge}
                disabled={nudgeState !== 'idle'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Bell className="h-3.5 w-3.5" />
                {nudgeState === 'sending' && 'Sending…'}
                {nudgeState === 'sent' && 'Reminder sent'}
                {nudgeState === 'cooldown' && `Reminded ${cooldownMin ?? 0} min ago`}
                {nudgeState === 'idle' && 'Remind driver'}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: succeeds, or fails only on `app/(admin)/track-all/page.tsx` (rewritten in Task 6).

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/track-all/route-row.tsx
git commit -m "feat(tracking): add fleet route row

Collapsed shows state dot, route and reason. Expanded shows a
reverse-geocoded address instead of raw coordinates, plus distance,
speed, accuracy, bus, driver and last fix — everything the retired
6-column table carried. Includes the deep link and nudge affordances."
```

---

### Task 5: Fleet list — search, filter chips, sort

**Files:**
- Create: `app/(admin)/track-all/fleet-list.tsx`

**Interfaces:**
- Consumes: `RouteRow` from `./route-row`; `FleetRoute`, `FleetSummary`, `TrackingState` from `./types`
- Produces: `FleetList` with props `{ routes: FleetRoute[]; summary: FleetSummary; selectedRouteId: string | null; onSelectRoute: (id: string | null) => void; onNudge: (routeId: string) => void; nudges: Record<string, { state: 'idle' | 'sending' | 'sent' | 'cooldown'; cooldownMin: number | null }> }`

- [ ] **Step 1: Write the component**

Create `app/(admin)/track-all/fleet-list.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Search, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RouteRow } from './route-row';
import type { FleetRoute, FleetSummary, TrackingState } from './types';

/** Actionable rows first. Ties broken by route number so the order is stable. */
const SORT_RANK: Record<TrackingState, number> = {
  live: 0, recent: 1, paused: 2, stuck: 3,
  off: 4, no_vehicle: 5, no_driver: 6, unconfigured: 7,
};

type FilterKey = 'all' | 'reporting' | 'problem' | 'off' | 'setup';

/** Which states each filter chip admits. `all` is handled separately. */
const FILTERS: { key: FilterKey; label: string; states: TrackingState[] }[] = [
  { key: 'all', label: 'All', states: [] },
  { key: 'reporting', label: 'Reporting', states: ['live', 'recent'] },
  { key: 'problem', label: 'Paused or stuck', states: ['paused', 'stuck'] },
  { key: 'off', label: 'Not sharing', states: ['off'] },
  { key: 'setup', label: 'Not set up', states: ['no_vehicle', 'no_driver', 'unconfigured'] },
];

export function FleetList({
  routes, summary, selectedRouteId, onSelectRoute, onNudge, nudges,
}: {
  routes: FleetRoute[];
  summary: FleetSummary;
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
  onNudge: (routeId: string) => void;
  nudges: Record<string, { state: 'idle' | 'sending' | 'sent' | 'cooldown'; cooldownMin: number | null }>;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts: Record<FilterKey, number> = {
    all: summary.total,
    reporting: summary.reporting,
    problem: summary.paused + summary.stuck,
    off: summary.off,
    setup: summary.noVehicle + summary.noDriver + summary.unconfigured,
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowed = FILTERS.find((f) => f.key === filter)?.states ?? [];
    return routes
      .filter((r) => (filter === 'all' ? true : allowed.includes(r.state)))
      .filter((r) => {
        if (!q) return true;
        return [r.routeNumber, r.routeName, r.driver?.name, r.vehicle?.registrationNumber]
          .some((v) => (v ?? '').toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const d = SORT_RANK[a.state] - SORT_RANK[b.state];
        if (d !== 0) return d;
        return (a.routeNumber ?? '').localeCompare(b.routeNumber ?? '', undefined, { numeric: true });
      });
  }, [routes, query, filter]);

  // Opening a row also selects it on the map; closing clears the selection.
  const toggle = (routeId: string) => {
    const next = expandedId === routeId ? null : routeId;
    setExpandedId(next);
    onSelectRoute(next);
  };

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="space-y-3 border-b border-gray-100 p-4 dark:border-gray-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search route, driver or bus…"
            aria-label="Search routes"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors',
                filter === f.key
                  ? 'bg-blue-600 text-white ring-blue-600'
                  : 'bg-gray-50 text-gray-600 ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700',
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Inbox className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">No routes match</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Try clearing the search or choosing a different filter.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((r) => (
            <RouteRow
              key={r.routeId}
              route={r}
              expanded={expandedId === r.routeId}
              selected={selectedRouteId === r.routeId}
              onToggle={() => toggle(r.routeId)}
              onNudge={() => onNudge(r.routeId)}
              nudgeState={nudges[r.routeId]?.state ?? 'idle'}
              cooldownMin={nudges[r.routeId]?.cooldownMin ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: succeeds, or fails only on `app/(admin)/track-all/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/track-all/fleet-list.tsx
git commit -m "feat(tracking): add searchable fleet list

Search across route number, name, driver and registration; filter chips
by state group with live counts; sort puts actionable rows first.
Opening a row selects it on the map."
```

---

### Task 6: Page shell rewrite

**Files:**
- Modify: `app/(admin)/track-all/page.tsx` (full rewrite)
- Delete: `app/api/admin/track-all/drivers/route.ts`

**Interfaces:**
- Consumes: `FleetList` (Task 5), `LiveTrackingMap` + `MapBus` (Task 3), `FleetResponse` / `FleetRoute` (Task 2)
- Produces: the finished page. `POST /api/admin/track-all/nudge` is called here but only built in Task 7 — until then the nudge button will surface an error toast, which is expected.

- [ ] **Step 1: Confirm the old endpoint has no other consumer**

Run: `npx grep -rn "track-all/drivers" --include=*.ts --include=*.tsx .`
Expected: matches only in `app/(admin)/track-all/page.tsx` (about to be replaced) and the endpoint file itself. If anything else references it, stop and report rather than deleting.

- [ ] **Step 2: Rewrite the page**

Replace the entire contents of `app/(admin)/track-all/page.tsx` with:

```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { RefreshCw, AlertTriangle, Bus } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { FleetList } from './fleet-list';
import type { FleetResponse, FleetRoute } from './types';
import type { MapBus } from '@/components/live-tracking-map';

const LiveTrackingMap = dynamic(() => import('@/components/live-tracking-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

type NudgeState = { state: 'idle' | 'sending' | 'sent' | 'cooldown'; cooldownMin: number | null };

async function fetchFleet(): Promise<FleetResponse> {
  const res = await fetch('/api/admin/track-all/routes', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load fleet');
  return (await res.json()) as FleetResponse;
}

function toMapBus(r: FleetRoute): MapBus | null {
  if (!r.position) return null;
  return {
    routeId: r.routeId,
    routeNumber: r.routeNumber,
    routeName: r.routeName,
    driverName: r.driver?.name ?? null,
    registrationNumber: r.vehicle?.registrationNumber ?? null,
    lat: r.position.lat,
    lng: r.position.lng,
    heading: r.heading,
    accuracyM: r.accuracyM,
    state: r.state,
    reason: r.reason,
  };
}

export default function TrackAllPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Record<string, NudgeState>>({});

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['track-all-fleet'],
    queryFn: fetchFleet,
    // Poll fast only while something is actually moving. With no bus reporting —
    // the normal case on this fleet — a 5s poll is pure waste.
    refetchInterval: (q) => ((q.state.data?.summary.reporting ?? 0) > 0 ? 5_000 : 30_000),
    refetchIntervalInBackground: false,
  });

  const routes = useMemo(() => data?.routes ?? [], [data]);
  const buses = useMemo(
    () => routes.map(toMapBus).filter((b): b is MapBus => b !== null),
    [routes],
  );

  const handleRefresh = useCallback(async () => {
    const res = await refetch();
    if (res.error) toast.error("Couldn't refresh — check your connection");
    else toast.success('Fleet refreshed');
  }, [refetch]);

  const handleNudge = useCallback(async (routeId: string) => {
    setNudges((p) => ({ ...p, [routeId]: { state: 'sending', cooldownMin: null } }));
    try {
      const res = await fetch('/api/admin/track-all/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setNudges((p) => ({
          ...p,
          [routeId]: { state: 'cooldown', cooldownMin: json?.retryAfterMin ?? null },
        }));
        return;
      }
      if (!res.ok) throw new Error(json?.error ?? 'Failed');
      setNudges((p) => ({ ...p, [routeId]: { state: 'sent', cooldownMin: null } }));
      toast.success('Reminder sent to the driver');
    } catch {
      setNudges((p) => ({ ...p, [routeId]: { state: 'idle', cooldownMin: null } }));
      toast.error("Couldn't send the reminder");
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Couldn&apos;t load the fleet</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Something went wrong reading route and vehicle data.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const s = data.summary;
  const notSetUp = s.noVehicle + s.noDriver + s.unconfigured;

  return (
    <div className="space-y-5">
      {/* Coverage header — the honest headline the old stat cards never gave. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Live Tracking</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">
              {s.reporting} of {s.trackable}
            </span>{' '}
            buses reporting right now
            {notSetUp > 0 && (
              <span className="text-gray-500 dark:text-gray-500">
                {' '}· {notSetUp} route{notSetUp === 1 ? '' : 's'} not set up
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isFetching}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* List and map. Stacks on mobile, side by side from lg up. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 lg:max-h-[calc(100vh-13rem)]">
          <FleetList
            routes={routes}
            summary={s}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            onNudge={(id) => void handleNudge(id)}
            nudges={nudges}
          />
        </div>

        <div className="min-w-0">
          {buses.length === 0 ? (
            <div className="flex h-[45vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 text-center dark:border-gray-700 lg:h-[calc(100vh-13rem)]">
              <Bus className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">No bus has a position yet</p>
              <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
                Buses appear here once a driver goes on duty and their phone sends a GPS fix.
              </p>
            </div>
          ) : (
            <div className="h-[45vh] overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 lg:h-[calc(100vh-13rem)]">
              <LiveTrackingMap
                buses={buses}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete the retired endpoint**

```bash
git rm app/api/admin/track-all/drivers/route.ts
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: succeeds with no errors in `app/(admin)/track-all/` or `components/live-tracking-map.tsx`.

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/track-all/page.tsx
git commit -m "feat(tracking): rebuild track-all as a fleet-health page

Replaces the 4 stat cards and 6-column table with a coverage header,
searchable route list and synced map. Every route is now accounted for
with a reason instead of 19 vanishing behind a default filter.

Polling drops to 30s when nothing is reporting and pauses on a hidden
tab; Refresh now awaits the refetch instead of claiming success before
the request resolves. Removes the dead lastUpdate state and the retired
driver-centric endpoint."
```

---

### Task 7: Nudge endpoint

**Files:**
- Create: `app/api/admin/track-all/nudge/route.ts`
- Modify: `lib/activity/log.ts:11-14`

**Interfaces:**
- Consumes: `dispatchNotification` from `@/lib/notifications/dispatch`; `logActivity` from `@/lib/activity/log`; `classifyRouteStatus` from Task 1
- Produces: `POST /api/admin/track-all/nudge` accepting `{ routeId: string }`, returning `{ success: true }`, `409 { error, retryAfterMin }`, or an error status

- [ ] **Step 1: Extend the closed ActivityAction union**

In `lib/activity/log.ts`, change the `ActivityAction` type (lines 11–14) to add `'notify'`:

```ts
export type ActivityAction =
  | 'create' | 'update' | 'delete' | 'import' | 'assign' | 'unassign'
  | 'upload' | 'activate' | 'deactivate' | 'scan' | 'mark' | 'unmark' | 'generate'
  | 'submit' | 'approve' | 'reject' | 'notify';
```

This union is compile-enforced across the codebase, so the route below will not build without it.

- [ ] **Step 2: Write the endpoint**

Create `app/api/admin/track-all/nudge/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { logActivity } from '@/lib/activity/log';
import { classifyRouteStatus } from '@/lib/gps/route-status';

/**
 * POST /api/admin/track-all/nudge — remind a driver to start location sharing.
 *
 * Calls dispatchNotification directly rather than notify.ts's notifyProfile wrapper,
 * for two reasons: the wrapper swallows errors and returns void (this is an
 * interactive action, so the admin must be told if it failed), and it does not accept
 * metadata (which is where the cooldown marker lives).
 */

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Don't let an admin pester the same driver more than twice an hour. */
const COOLDOWN_MIN = 30;

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVERS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { routeId?: unknown } | null;
    const routeId = typeof body?.routeId === 'string' ? body.routeId : null;
    if (!routeId) {
      return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    const { data: route } = await svc
      .from('tms_route')
      .select('id, route_number, route_name, vehicle_id, driver_id')
      .eq('id', routeId)
      .maybeSingle();
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Same dual-linkage resolution the fleet read uses, narrowed to one route.
    const { data: driversData } = await svc
      .from('tms_driver')
      .select('id, staff_id, profile_id, location_sharing_enabled, active_route_id, assigned_route_id');
    const drivers = (driversData ?? []) as {
      id: string; staff_id: string | null; profile_id: string | null;
      location_sharing_enabled: boolean | null;
      active_route_id: string | null; assigned_route_id: string | null;
    }[];

    const driver =
      drivers.find((d) => d.active_route_id === routeId) ??
      drivers.find((d) => d.assigned_route_id === routeId) ??
      (route.driver_id ? drivers.find((d) => d.staff_id === route.driver_id) : undefined) ??
      null;

    if (!driver) {
      return NextResponse.json({ error: 'No driver assigned to this route' }, { status: 404 });
    }

    // Re-derive the state server-side. The client's canNudge is a hint, not authority.
    let lastFixAt: string | null = null;
    if (route.vehicle_id) {
      const { data: veh } = await svc
        .from('tms_vehicle')
        .select('last_gps_update')
        .eq('id', route.vehicle_id)
        .maybeSingle();
      lastFixAt = (veh as { last_gps_update: string | null } | null)?.last_gps_update ?? null;
    }
    const status = classifyRouteStatus({
      hasDriver: true,
      hasVehicle: !!route.vehicle_id,
      sharing: !!driver.location_sharing_enabled,
      lastFixAt,
      nowMs: Date.now(),
    });
    if (!status.canNudge) {
      return NextResponse.json(
        { error: `This route is ${status.state} — a reminder wouldn't help` },
        { status: 422 },
      );
    }

    // Resolve the driver's auth profile: direct FK first, then via staff.
    let profileId = driver.profile_id;
    if (!profileId && driver.staff_id) {
      const { data: st } = await svc
        .from('staff')
        .select('profile_id')
        .eq('id', driver.staff_id)
        .maybeSingle();
      profileId = (st as { profile_id: string | null } | null)?.profile_id ?? null;
    }
    if (!profileId) {
      return NextResponse.json(
        { error: 'This driver has no login account, so they cannot be notified' },
        { status: 404 },
      );
    }

    // Cooldown: look for a tracking reminder we sent this driver recently. Keyed on
    // metadata.driverId so no new table is needed.
    const since = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();
    const { data: recent } = await svc
      .from('tms_notification')
      .select('created_at')
      .eq('category', 'tracking')
      .eq('metadata->>driverId', driver.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    const last = (recent ?? [])[0] as { created_at: string } | undefined;
    if (last) {
      const ageMin = Math.floor((Date.now() - Date.parse(last.created_at)) / 60_000);
      return NextResponse.json(
        { error: 'Already reminded recently', retryAfterMin: ageMin },
        { status: 409 },
      );
    }

    const routeLabel = `${route.route_number ?? '?'} · ${route.route_name ?? ''}`.trim();

    await dispatchNotification(svc, {
      title: 'Start location sharing',
      body: `Please open Live Location and go on duty for route ${routeLabel} so admins and students can track the bus.`,
      category: 'tracking',
      priority: 'high',
      url: '/driver/location',
      createdBy: auth.userId,
      metadata: { driverId: driver.id, routeId },
      targeting: { type: 'users', user_ids: [profileId] },
    });

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'notify',
      entityType: 'tms_driver',
      entityId: driver.id,
      entityLabel: routeLabel,
      description: `Reminded driver to start location sharing on route ${routeLabel}`,
      metadata: { routeId, state: status.state },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('track-all/nudge POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handler(request, auth));
```

- [ ] **Step 3: Verify the `targeting` shape matches what audience.ts expects**

Open `lib/notifications/audience.ts` and confirm the `Targeting` union has a `{ type: 'users'; user_ids: string[] }` member. `lib/notifications/notify.ts:30` already uses exactly this shape, so it should match — but confirm the property name is `user_ids` and not `userIds` before building.

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: succeeds. If `logActivity`'s `metadata` parameter is not part of `ActivityEntry`, drop that line rather than widening the interface.

- [ ] **Step 5: Probe the endpoint unauthenticated**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/admin/track-all/nudge -H "Content-Type: application/json" -d '{"routeId":"test"}'`
Expected: `401` or `307`. **Not** `200` or `400` — a `400` would mean the request reached the handler body without authenticating.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/track-all/nudge/route.ts lib/activity/log.ts
git commit -m "feat(tracking): add driver nudge endpoint

Sends an in-app notification through the existing tms_notification
dispatch primitive, deep-linked to /driver/location. Gated on
tms.drivers.manage, re-derives the route state server-side rather than
trusting the client's canNudge, and enforces a 30-minute per-driver
cooldown via notification metadata so no new table is needed.

Adds 'notify' to the closed ActivityAction union."
```

---

### Task 8: Final verification and handover

**Files:** none modified.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all green, including the 20 new `route-status` cases.

- [ ] **Step 3: Confirm no unrelated files were committed**

Run: `git log --stat origin/main..HEAD`
Expected: only the files listed in the File Structure section appear. **`proxy.ts`, `lib/boarding/eligibility.ts`, `app/auth/callback/route.ts`, `next-env.d.ts` and `.claude/settings.local.json` must NOT appear in any commit.** If any of them does, `git reset` that file out of the commit and recommit.

- [ ] **Step 4: Confirm the working tree still holds the unrelated changes**

Run: `git status --porcelain`
Expected: still shows the five modified files plus the untracked boarding-eligibility migration, exactly as at the start.

- [ ] **Step 5: Hand over the manual smoke test**

The agent's browser cannot authenticate against this app, so the following must be done by the user in a logged-in session. Report this list rather than claiming the feature is verified:

1. Open `/track-all`. The header should read **"0 of 21 buses reporting right now · 3 routes not set up"** on current data.
2. All 24 routes are listed. Route 19 (OMALUR) shows **Session stuck** with a multi-week age. Routes 13 and 36 show **Not set up**. Route 20 shows **Can't track — No driver assigned**.
3. Search "meche" narrows to route 24. Search "31" narrows to route 31.
4. The filter chips change the visible set and their counts add up to 24.
5. Expanding a route with a position shows a readable address, never raw coordinates.
6. Clicking a row highlights its marker; clicking a marker highlights and selects the row.
7. "Remind driver" on a stuck or not-sharing route sends the notification; the driver sees it in their bell inbox and tapping it lands on `/driver/location`. Pressing it again within 30 minutes shows "Reminded N min ago".
8. Toggle dark mode — no white-on-white anywhere, including the map's Recenter button and selection card.
9. On a phone-width viewport the list sits above the map and nothing scrolls sideways.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1 · Route-centric API, dual linkage, `TRACKING_VIEW` gate, m/s→km/h | Task 2 |
| 2 · Pure classifier, 8 states, precedence, `STUCK_AFTER_MIN`, `fixHref` | Tasks 1 and 2 |
| 3 · Coverage header, two panes, search, rows, sort, adaptive polling, honest Refresh, dead state removed | Tasks 4, 5, 6 |
| 4 · Map: route-keyed props, controlled selection, ghosting, dark overlays | Task 3 |
| 5 · Nudge: permission, server-side re-derivation, cooldown, `notify` action | Task 7 |
| 6 · Dark mode, `min-w-0` | Tasks 3–6 throughout |
| 7 · Testing: classifier tests, relative imports, probes, manual smoke | Tasks 1, 2, 7, 8 |
| Retire `/api/admin/track-all/drivers` | Task 6 |

No gaps.

**Known deviations from the spec, decided during planning:**

- The spec said `classifyRouteStatus` would delegate to `gpsFreshness`. It cannot: `gpsFreshness` reads `Date.now()` internally, which would make the classifier impure and its boundary tests non-deterministic. Task 1 Step 3 inlines the same 2- and 5-minute constants with a comment tying them back. The single source of truth for those numbers is now duplicated in two files, which is the cost of testability. A follow-up could add an optional `nowMs` parameter to `gpsFreshness` and remove the duplication.
- The nudge calls `dispatchNotification` directly instead of `notifyProfile`, because the wrapper returns `void`, swallows errors, and accepts no `metadata`. Documented in the route's header comment.

**Type consistency:** `TrackingState`, `RouteStatus`, `RouteStatusInput`, `classifyRouteStatus`, `STUCK_AFTER_MIN` and `humanizeAge` are defined in Task 1 and used unchanged in Tasks 2 and 7. `FleetRoute`, `FleetSummary` and `FleetResponse` are defined in Task 2 and consumed unchanged in Tasks 4, 5 and 6. `MapBus` is defined in Task 3 and constructed in Task 6 by `toMapBus`. The nudge state union `'idle' | 'sending' | 'sent' | 'cooldown'` is identical in Tasks 4, 5 and 6.
