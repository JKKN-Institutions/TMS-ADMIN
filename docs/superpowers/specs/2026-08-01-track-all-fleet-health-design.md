# Track-All → Fleet Health — Design

**Date:** 2026-08-01
**Branch:** `feat/track-all-fleet-health` (off `origin/main` @ `69e7bed`)
**Surface:** admin `/track-all` only

## Problem

`/track-all` is a live map that is almost always empty, and it never explains why.

Measured against the live database on 2026-08-01:

| | |
|---|---|
| Drivers with `location_sharing_enabled` | 2 of 31 |
| Vehicles that have ever reported a fix | 4 of 35 |
| GPS fixes in the last 24 h | 0 |
| Freshest fix anywhere | 2026-07-30 10:11 UTC (a 90-second blip) |
| Last day of real use | 2026-07-20 |
| Typical active day | 1–2 buses, 07:00–18:40 IST |

What an admin actually sees today: the API resolves 21 drivers, the default filter
drops that to **2**, and both are hours-to-days stale. The stat cards read
"Total Drivers 21 / Active Tracking 0". Nineteen routes vanish with no explanation,
and ten more drivers are dropped server-side for having no route — invisibly.

Three structural causes:

1. **The API is driver-centric.** It starts from `tms_driver` and keeps only drivers
   that resolve to a route, so routes with no driver never appear at all. Routes 13
   and 36 have neither driver nor vehicle; route 20 has a vehicle but no driver.
2. **The default filter hides non-sharing drivers** with no visible affordance
   explaining that 19 rows were withheld.
3. **"Sharing" is not the same as "tracking".** Route 19 has
   `location_sharing_enabled = true` and a last fix from 2026-07-03 — 28 days stale.

Cause 3 is not an edge case. `lib/driver/tracking-controller.ts` reaches `'stopped'`
only from an explicit stop; there is no time-based auto-stop in the current code.
Nothing clears `location_sharing_enabled` unless the driver taps "Go Off Duty", so a
killed browser leaves the flag `true` indefinitely. The current page renders this as
`paused`, which tells an admin to wait when the correct action is to clear the flag.

## Goals

- Every one of the 24 routes is accounted for on screen, with a plain-English reason.
- The distinction between *live*, *momentarily paused*, and *stuck* is visible and honest.
- Each problem state links to the screen that resolves it.
- Drivers who have not gone on duty can be reminded from this page.
- The page works in dark mode and on a phone.

## Non-goals

- Rider (`/student/live-track`, `/boarding/live-track`) and driver (`/driver/location`) surfaces.
- Plotting route stops on the map — blocked on data: 14 of 479 `tms_route_stop` rows
  have coordinates and those 14 are wrong (auto-geocoded against a nationwide gazetteer).
- Background / locked-screen tracking — impossible in pure web; needs the native wrapper.
- A server-side sweep that clears stuck sessions. Recommended as a follow-up (see below).

## Approach

Compute status on the server, in a pure and unit-tested module.

This mirrors `lib/gps/freshness.ts`, which is already a shared pure function with tests
and is the reason all four tracking surfaces agree on what "online" means.

Rejected alternatives:

- **Compute in the React component.** Fewer backend changes, but the logic becomes
  unshareable and untestable, and "minutes ago" would drift with the admin's laptop
  clock instead of the server's.
- **A Postgres view or RPC.** Reusable across apps, but every read in this repo goes
  through a TS route handler with a service-role client. A view would be the only one
  of its kind, adding migration surface for no gain.

## Design

### 1 · Data — one row per route

**New `GET /api/admin/track-all/routes`.** Retires `GET /api/admin/track-all/drivers`
(no other consumer — verified by grep).

- Selects all rows from `tms_route`, LEFT JOINing driver and vehicle, so a route with
  no driver or no vehicle still appears.
- Resolves the route↔driver link in **both** directions, preserving the dual-linkage
  the existing endpoint honours:
  - `tms_route.driver_id → staff.id → tms_driver.staff_id` (the Routes screen), and
  - `tms_driver.active_route_id` / `assigned_route_id` (the Drivers screen).

  Both sets are unioned, so no assignment path is missed. Where a route resolves to
  more than one driver, `active_route_id` wins, then `assigned_route_id`, then the
  `tms_route.driver_id` match — the same precedence the driver's own broadcast uses
  in `lib/driver/routes.ts`.
- Wrapped in `withAuth` + `requirePerm(TMS_PERMISSIONS.TRACKING_VIEW)`. The endpoint
  it replaces used a raw service-role client with no granular check, so this closes
  that inconsistency as a side effect.
- Response:

```ts
{
  success: true,
  summary: { total, live, recent, paused, stuck, off, noVehicle, noDriver, unconfigured },
  routes: Array<{
    routeId: string;
    routeNumber: string | null;
    routeName: string | null;
    driver: { id: string; name: string } | null;      // tms_driver.id, for deep links
    vehicle: { id: string; registrationNumber: string | null } | null;
    position: { lat: number; lng: number } | null;
    heading: number | null;
    speedKmh: number | null;                          // gps_speed (m/s) × 3.6, converted here
    accuracyM: number | null;
    lastFixAt: string | null;                         // tms_vehicle.last_gps_update
    sharing: boolean;
    state: TrackingState;
    label: string;
    reason: string;
    fixHref: string | null;
    canNudge: boolean;
  }>
}
```

`speedKmh` is converted **in the API**, not the component. `tms_vehicle.gps_speed` is
`GeolocationCoordinates.speed` in metres per second; every consumer that forgot the
`× 3.6` has shown a wrong number. Converting once at the boundary removes the trap.

### 2 · Logic — a pure classifier

**New `lib/gps/route-status.ts` + `lib/gps/route-status.test.ts`.**

```ts
export type TrackingState =
  | 'live' | 'recent' | 'paused' | 'stuck'
  | 'off' | 'no_vehicle' | 'no_driver' | 'unconfigured';

export const STUCK_AFTER_MIN = 30;

export interface RouteStatusInput {
  hasDriver: boolean;
  hasVehicle: boolean;
  sharing: boolean;
  lastFixAt: string | null;
  nowMs: number;          // injected so tests are deterministic
}

export interface RouteStatus {
  state: TrackingState;
  label: string;          // short chip text
  reason: string;         // one-line explanation
  tone: 'green' | 'amber' | 'red' | 'gray';
  canNudge: boolean;
}
```

Classification, in strict order:

| # | Condition | State | Label | Reason |
|---|---|---|---|---|
| 1 | `!hasDriver && !hasVehicle` | `unconfigured` | Not set up | No driver or vehicle assigned to this route |
| 2 | `!hasVehicle` | `no_vehicle` | Can't track | No vehicle assigned — the driver's app will refuse to broadcast |
| 3 | `!hasDriver` | `no_driver` | Can't track | No driver assigned to this route |
| 4 | `!sharing` | `off` | Not sharing | Driver hasn't gone on duty |
| 5 | fix ≤ 2 min | `live` | Live | Updated {n}s ago |
| 6 | fix ≤ 5 min | `recent` | Live | Updated {n} min ago |
| 7 | fix ≤ 30 min | `paused` | Paused | Phone stopped sending {n} min ago — screen may be locked |
| 8 | otherwise | `stuck` | Session stuck | On duty but silent for {duration} — driver never went off duty |

**Precedence rationale.** Configuration problems outrank sharing flags. A route with
no vehicle is `no_vehicle` even when its driver has sharing on, because
`POST /api/driver/location` returns 422 for exactly that case — the driver *would*
fail. Surfacing it before the attempt is the useful behaviour.

Rows 5 and 6 delegate to the existing `gpsFreshness()` rather than re-deriving the
2- and 5-minute boundaries, so this module cannot drift from the other three surfaces.

A `sharing` route with `lastFixAt === null` (never reported) classifies as `stuck`,
since the flag claims a session that has produced nothing.

`canNudge` is true only for `off` and `stuck`. Nudging a mid-trip `paused` driver is
noise; nudging `no_vehicle` / `no_driver` / `unconfigured` cannot help.

`fixHref` is derived in the API from state and ids:

| State | `fixHref` |
|---|---|
| `off`, `stuck`, `paused` | `/drivers/{driverId}/edit` — has the Location Sharing checkbox (`driver-form.tsx:196`) |
| `no_vehicle`, `no_driver`, `unconfigured` | `/routes/{routeId}/edit` |
| `live`, `recent` | `null` |

### 3 · UI — page shell rewrite

**Rewritten `app/(admin)/track-all/page.tsx`; new `fleet-list.tsx` and `route-row.tsx`
in the same folder.** The four stat cards and the six-column table are removed; every
field the table showed moves into the expanded row.

- **Coverage header** — e.g. "1 of 21 buses reporting right now", plus state chips that
  act as filters.
  - **Numerator** = routes in state `live` or `recent`. Those are the only states where
    a position on the map is currently trustworthy.
  - **Denominator** = routes that *could* track, i.e. have both a driver and a vehicle.
    On today's data that is 21 of 24: routes 13 and 36 have neither, route 20 has a
    vehicle but no driver.
  - Routes that cannot track are reported beside the ratio ("3 routes not set up")
    rather than folded into the denominator, so the ratio never looks worse than the
    fleet actually is.
- **Two panes** — list left (~380 px), sticky map right. On mobile they stack:
  header → list → map at `45vh`, replacing today's fixed `600px`.
- **Search** — one input filtering across route number, route name, driver name and
  registration number.
- **Row, collapsed** — state dot, route number, route name, one-line reason.
- **Row, expanded** — reverse-geocoded address (never raw lat/lng), vehicle
  registration, driver name, distance to campus, speed in km/h, GPS accuracy, and the
  last fix time. Plus the deep-link button and, where applicable, "Remind driver".
- **Sort order** — `live`/`recent` first, then `paused`/`stuck`, then `off`, then
  configuration problems, then `unconfigured`. Actionable rows stay above the fold.
- **Polling** — migrated to TanStack Query, matching the rider pages. `refetchInterval`
  is **5s when at least one route is live or recent, 30s otherwise**, and refetching
  pauses while the browser tab is hidden. The Refresh button awaits the refetch and
  toasts based on the outcome, fixing today's `toast.success` that fires before the
  request resolves.
- **Dead state removed** — `lastUpdate` is currently set every poll and never rendered.

### 4 · Map — reused, not rewritten

**`components/live-tracking-map.tsx`** keeps its glide animation, OSRM road-snapping,
basemap toggle, accuracy circles and campus pin. Four changes:

- Props change from driver-keyed to route-keyed, matching the new API shape.
- Selection is lifted to controlled props `selectedRouteId` / `onSelectRoute`, so the
  list and map sync **both ways**: clicking a row focuses its marker, clicking a marker
  highlights and scrolls to its row. Selection state currently lives inside the
  component in `selectedIdRef` + `selected`; the ref stays as an internal echo so the
  existing enrichment-cancellation logic is untouched.
- Markers for `paused` and `stuck` routes render at ~45% opacity with no heading
  pointer, so a bus that stopped ten hours ago no longer reads as present.
- The two inline-styled overlays (the Recenter button and the selection card) become
  Tailwind with `dark:` variants.

Only routes with a position get a marker. Routes with no fix appear in the list only.

### 5 · Nudge

**New `POST /api/admin/track-all/nudge`.**

- `withAuth` + `requirePerm(TMS_PERMISSIONS.DRIVERS_MANAGE)`. Stronger than
  `TRACKING_VIEW` because this is a write that reaches a person.
- Body `{ routeId: string }`. The route is re-resolved server-side and the request is
  rejected unless the recomputed state is `off` or `stuck` — the client's `canNudge`
  is a hint, not the authority.
- Resolves the driver's profile via `tms_driver.profile_id`, falling back to
  `staff.profile_id` through `staff_id`. All 31 drivers are reachable today (28 direct,
  3 via staff), so this will not silently no-op.
- **30-minute cooldown**, enforced by querying recent `tms_notification` rows in
  category `tracking` for that profile. No new table and no migration. Returns 409 with
  `retryAfterMin` when on cooldown; the button then reads "Reminded {n} min ago" and
  disables.
- Sends via the existing `notifyProfile()` from `lib/notifications/notify.ts` with
  `category: 'tracking'` and `url: '/driver/location'`, so the driver's tap lands on
  the page that has the Go On Duty button.
- Audited via `logActivity({ module: 'drivers', action: 'notify', ... })`.

**Required upstream edit:** `ActivityAction` in `lib/activity/log.ts` is a closed union
and does not contain `'notify'`. It must be added or the route will not compile. This
is a required change, not an optional one.

### 6 · Quality baselines

Included, not optional:

- Full `dark:` variant coverage. `/track-all` is currently the only admin page with
  none — every `bg-white` / `text-gray-900` on it is unconditioned.
- `min-w-0` on flex children and `truncate` on long route names, because the shared
  admin shell sets `overflow-x-hidden` at the root and clips wide children.

## Data flow

```
tms_route (all 24)
  ├─ LEFT JOIN driver  (via tms_route.driver_id→staff.id→tms_driver.staff_id
  │                     UNION tms_driver.active_route_id/assigned_route_id)
  └─ LEFT JOIN tms_vehicle (position, last_gps_update, gps_* )
        │
        ▼
  classifyRouteStatus()   ← pure, injected nowMs, delegates to gpsFreshness()
        │
        ▼
  GET /api/admin/track-all/routes   { summary, routes[] }
        │
        ├──────────────► FleetList  (search, filter chips, expandable rows)
        │                    │  selectedRouteId / onSelectRoute
        └──────────────► LiveTrackingMap (markers, ghosting, OSRM snap)
```

## Error handling

- **Endpoint 5xx** — the list renders an inline error card with a working Retry that
  re-runs the query. Any previously loaded data stays on screen rather than blanking.
- **Empty `tms_route`** — an empty-state card, not a bare page.
- **Reverse-geocode / OSRM failure** — already fail-soft in `lib/geo/*`; the row falls
  back to "Location unavailable" and the marker stays on the raw fix. No error surfaced.
- **Nudge 409 (cooldown)** — not an error toast; the button switches to its
  "Reminded {n} min ago" disabled state.
- **Nudge 403 / 404 (no profile)** — an error toast naming the cause.
- **`logActivity` failure** — already swallowed by design; must never fail the nudge.

## Testing

- `lib/gps/route-status.test.ts` under vitest: one case per state, the precedence
  rules (no-vehicle beats sharing-on), the exact 2 / 5 / 30-minute boundaries, and the
  `lastFixAt === null` while sharing case.
  **Imports must be relative** (`./freshness`) — `@/` path aliases do not resolve
  under vitest in this repo.
- Unauthenticated probes on both new endpoints expecting 401/307.
- `next build` for compile verification. `npm run lint` is broken here (circular
  config) and `tsc` is chronically red on main for unrelated reasons, so neither is a
  gate.
- Manual browser smoke by the user — the agent's Chrome cannot authenticate.

## Known findings recorded but deliberately out of scope

- **`/driver/location` shows speed in the wrong unit.** `GET /api/driver/location`
  returns `gps_speed` in m/s and `app/driver/location/page.tsx:259` renders it as
  `` `${v.speed} km/h` ``, so 10.45 m/s displays as "10.45 km/h" instead of 37.6.
  The student and boarding pages already apply `× 3.6`. One-line fix, deferred by
  explicit decision.
- **Nothing clears a stuck `location_sharing_enabled` flag.** The nudge and the deep
  link both treat the symptom. The durable fix is a scheduled sweep that clears the
  flag after N hours of silence. Recommended as separate work — note that both existing
  Vercel crons have never run in production, so a cron would need that fixed first.
