# Smooth Live Bus Marker on All Portals — Design

**Date:** 2026-07-01
**Status:** Approved (design). Scope = Sub-project 1 only.
**Author:** Brainstorming session with the user.

## Problem

The driver's own `/driver/location` map moves smoothly in real time (it reads the phone's
`watchPosition` directly). Every *other* portal that shows the bus — admin **Track All**,
student **live-track**, boarding **live-track** — only samples the shared vehicle row every
15–30 s and renders the gap poorly, so the bus appears to teleport or (admin) flicker and
auto-zoom. The user wants all portals to show the bus **moving continuously**, like the
driver view.

## Scope

This spec covers **Sub-project 1: the smooth live moving marker** only. Two related asks the
user raised depend on data that does not exist yet and are explicitly deferred:

| Sub-project | Depends on | This spec? |
|---|---|---|
| 1. Smooth live moving marker (all portals) | `tms_vehicle.current_*` (exists) | ✅ yes |
| 2. Stop coordinates (geocode ~465 of 479 stops) | a geocoding source (TBD) | ❌ deferred |
| 3. Route line + stop pins + ETA | Sub-project 2 | ❌ deferred |

**Why deferred:** `tms_route_stop` has `latitude`/`longitude` columns but only **14 of 479
stops (≈3%)** are populated (scattered across routes 01/22/23/24; the active routes 19 and 31
have none). The route line is a polyline through stops, the pins are the stops, and ETA is
"distance from the bus to the next stop" — all three need stop coordinates. Building them now
would render nothing on 24 of 24 routes. Sub-project 2 (geocoding) is the prerequisite and
gets its own spec.

## Current flow (unchanged by this work)

```
driver phone → POST /api/driver/location (monotonic guard) → tms_vehicle.current_* (one row/vehicle)
      readers poll a GET that reads that row:
        admin    /track-all           GET /api/admin/track-all/drivers   every 30s → LiveTrackingMap (multi-marker)
        student  /student/live-track   GET /api/student/location          every 15s → LivePositionMap (single)
        boarding /boarding/live-track  GET /api/boarding/location         every 15s → LivePositionMap (single)
```

The **ingest/storage is correct** (recent fix). This work touches **only the read + render**
side. No API, DB, or capture changes.

## Design

Three focused changes, plus one shared pure helper.

### A. Faster, no-cache polling (client only)
- Student & boarding: React Query `refetchInterval` 15000 → **5000**.
- Admin: `setInterval(..., 30000)` → **5000**, and add `cache: 'no-store'` to its `fetch`
  (student/boarding already pass it; admin does not, so a stale HTTP cache could freeze it).

### B. Fix the admin map render — `components/live-tracking-map.tsx`
Today the `[driverLocations]` effect **removes every marker, recreates them, and calls
`map.fitBounds()` on every poll** → flicker, closed popups, viewport yank every 30 s.

Rewrite to **diff**:
- Keep `markersRef` as a `Map<driverId, L.Marker>`.
- Existing driver → set a new glide **target** (see C); new driver → create marker; missing
  driver → remove marker.
- `fitBounds` **once** on first populate (or via a manual "Recenter" button), never on every
  poll. Preserve user zoom/pan and any open popup between updates.

### C. Smooth glide interpolation (shared) — `lib/gps/interpolate.ts` (new)
A pure, unit-tested core plus thin `requestAnimationFrame` wiring in each map component.

- `lerp(a, b, t)` and `interpolateLatLng(from, to, t)` — linear blend, `t` clamped to [0,1].
- `haversineMeters(from, to)` and `shouldSnap(from, to, thresholdMeters)` — when the jump is
  implausibly large (first fix, a teleport), **snap** instead of gliding a straight line
  across the map.
- Each map runs one RAF loop: on a new fix, set `from = current animated position`,
  `to = new fix`, restart `t`; advance `t` over the poll interval so the marker **glides**.
  `LivePositionMap` also gently `panTo` the animated position.

`LivePositionMap` (single marker, used by student + boarding + driver self) and
`LiveTrackingMap` (multi-marker, admin) both consume the same helper; the RAF stepper differs
(one marker vs a map of markers).

### Data flow
Unchanged. Readers still GET the same JSON; only poll cadence and marker animation change.

## Error handling / edge cases
- **No fix / offline vehicle:** unchanged — the existing "not sharing / offline" empty states
  still apply; no marker glide when there is no coordinate.
- **First fix or huge jump:** `shouldSnap` places the marker instantly (no cross-map streak).
- **Driver goes off-duty / disappears from the admin list:** its marker is removed on the next
  diff.
- **Tab backgrounded:** `requestAnimationFrame` pauses automatically; on return the marker
  snaps or glides to the latest target. No stuck animation.

## Testing
- Unit (vitest, `lib/gps/interpolate.test.ts`): `lerp` endpoints & midpoint, `t` clamping,
  `haversineMeters` sanity, `shouldSnap` threshold both sides.
- `tsc --noEmit` on changed files (ESLint is broken project-wide).
- Dev-server route probes (auth-gated 307/401 = compiles, no 500). Live authenticated render
  is confirmed by the user (agent browser is unauthenticated).

## Out of scope (this spec)
- Route line, stop pins, ETA/next-stop (Sub-projects 2 & 3).
- Supabase Realtime / SSE (the project stays on polling per the prior tracking design).
- Any capture, API, or DB change.

## Build order
`lib/gps/interpolate.ts` (+test) → `LivePositionMap` glide → `LiveTrackingMap` diff+glide →
poll-interval bumps → verify.
