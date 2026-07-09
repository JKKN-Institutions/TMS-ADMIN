# Live Tracking — Map Context & Exact Location (Design)

**Date:** 2026-07-09
**Status:** Approved design, pending spec review → implementation plan
**Branch:** `feat/live-tracking-map-context`

## Problem

The live-tracking maps in all four portals (student, boarding, driver, admin)
render exactly **one thing: the bus dot**. There is no destination, no direction,
no sense of precision, and no "how far is my bus" readout. Users see *where* the
bus is but get zero *spatial context*: where it is relative to campus, which way
it is heading, how accurate the fix is, or how far it is from them.

The original ask was to plot **route stops** on the map. Investigation of the live
database showed this is currently **not data-ready**:

- `tms_route_stop`: **479 rows, only 14 have coordinates**, across just 4 of 24 routes.
- Those **14 coordinates are wrong** — auto-geocoded by name against a nationwide
  gazetteer and mismatched to the wrong towns. Example: Route 23 (ELAMPILLAI, near
  Salem ~11.6°N) has its "COLLEGE" stop pinned at `13.07, 80.25` — that is **Chennai**,
  ~330 km away; "MEDICAL COLLEGE" landed near Thanjavur.
- **0 of 24 routes** have `start_/end_` coordinates.
- The only coordinate we trust is the campus itself: `[11.4444567, 77.730258]`
  (currently hardcoded as `DEFAULT_CENTER` in the admin map).

**Decision (confirmed with the product owner):** defer stop coordinates to a later
phase. Improve the live map now using **only trusted data** — the bus's live GPS
(position, speed, heading, accuracy, all on `tms_vehicle`) and the known campus
location — while keeping the map **forward-compatible** so real stop pins drop in
later with no component rework.

## Goals

1. Give the bus dot spatial meaning: a fixed **campus destination pin** on every map.
2. Improve the "exact location" feel: **heading arrow** (which way it's going) and a
   **GPS-accuracy circle** (how precise the fix is).
3. Answer "how far is my bus": **distance-to-campus** + **rough ETA** (honest, and
   only when the bus is actually approaching campus and moving).
4. Personal "where's my bus" for riders: **"distance from you"** using the viewer's
   own device location, on explicit opt-in (never an unprompted permission popup).
5. Do all of the above across student, boarding, driver, and admin maps.
6. Leave a clean seam for a future **stops** phase (optional prop, no dead-ends).

## Non-goals

- Sourcing / correcting the 479 stop coordinates (separate future phase).
- Drawing the real road-following route polyline (needs stop coordinates).
- Road-network routing / turn-by-turn / true drive-time ETA (we use straight-line
  distance × a road-factor, clearly labelled "approx").
- Background / locked-screen GPS (unchanged; still the deferred native-wrapper phase).

## Architecture

Chosen approach: **enhance the two existing map components in place, backed by a
pure, unit-tested `lib/geo` module.** Rejected alternatives: (B) rewriting both maps
into one unified component — bigger refactor, risks the working admin map, YAGNI now;
(C) computing distance/ETA server-side — "distance from you" is inherently client-side
(only the browser knows the viewer's location), so server-side math would split the
logic. All geometry lives in one pure client-shared module instead.

### Units

**1. `lib/geo/campus.ts` (new)**
- Exports `CAMPUS = { lat: 11.4444567, lng: 77.730258, label: 'JKKN Campus' }`.
- Single source of truth for the destination; replaces the hardcoded `DEFAULT_CENTER`
  in `components/live-tracking-map.tsx`.
- **Open item:** product owner to confirm this is the exact campus gate location
  (one-line change if not).

**2. `lib/geo/distance.ts` (new, pure)**
- `haversineKm(a: LatLng, b: LatLng): number` — great-circle distance.
- `bearingDeg(from: LatLng, to: LatLng): number` — initial bearing 0–360.
- `isApproaching(headingDeg: number, bearingToTargetDeg: number): boolean` — true when
  the heading is within ±90° of the bearing to the target.
- `etaMinutes(distanceKm: number, speedKmh: number, roadFactor = 1.3): number | null` —
  `null` when speed is below a small threshold (idle); otherwise
  `(distanceKm * roadFactor) / speedKmh * 60`. Straight-line × road-factor so it is not
  falsely optimistic; always surfaced to the user as "approx".
- No React, no Leaflet. Fully vitest-tested.

**3. `components/live-position-map.tsx` (shared single-marker map — student/boarding/driver)**
- New **optional** props (existing callers unaffected):
  - `destination?: { lat; lng; label }` — draws a distinct campus pin.
  - `heading?: number | null` — rotates the bus marker (see marker note).
  - `accuracyM?: number | null` — translucent `L.circle` of that radius around the bus.
  - `viewer?: { lat; lng } | null` — a "you" marker.
- Fit behavior: frame bus + destination (+ viewer when present) on first data; then
  leave the user's pan/zoom alone (same rule the map already uses).
- Keeps the existing glide/interpolation for the bus marker.

**4. `components/live-tracking-map.tsx` (admin multi-marker map — Track-All)**
- Adds the fixed **campus pin** (from `CAMPUS`), per-bus **heading pointer** and
  **accuracy circle**, and a **distance-to-campus** line inside each bus popup.
- No "distance from you" here (admins oversee many routes, not one bus).

**5. Marker technique (heading)**
- Leaflet's default marker is a static PNG. To rotate by heading we render a `divIcon`
  containing an inline SVG bus/arrow, rotated with `transform: rotate(<heading>deg)`.
- The admin map already uses `divIcon`, so both maps converge on the same technique.
- When `heading` is null (no heading yet), render the upright/un-rotated marker.

**6. Location API additions (small)**
- `app/api/student/location/route.ts` and `app/api/boarding/location/route.ts` currently
  return position + speed but **not heading or accuracy**. Add `heading` (from
  `tms_vehicle.gps_heading`) and `accuracyM` (from `tms_vehicle.gps_accuracy`) to the
  `vehicle` payload.
- Admin (`/api/admin/track-all/drivers`) and driver (`/api/driver/location`) already
  carry heading/accuracy — no change beyond what the map reads.

**7. Page UX — an "info strip" above each map**
- Student / boarding / driver: a compact strip showing:
  - **Distance to campus** (always, when there is a fix).
  - **Rough ETA** — shown only when `isApproaching(heading, bearingToCampus)` is true
    **and** the bus is moving; otherwise "Heading away from campus — no ETA." This keeps
    it honest in the **morning** (bus → campus) and **evening** (bus → home) alike.
  - **"Show distance from me"** button (student + boarding only) → requests device
    location via `navigator.geolocation.getCurrentPosition` **on tap**, then shows
    "the bus is ~X km from you" and passes `viewer` to the map. Never auto-prompts.
- Preserves the existing freshness pill (Live now / Updated N min ago) and the
  "bus isn't sharing its location" empty state.
- A small `useViewerLocation()` client helper encapsulates the permission request,
  loading/denied/unsupported states, and caching of the last viewer fix.

**8. Forward-compatibility for stops**
- The shared map also accepts an **optional `stops?: StopPoint[]`** prop it does not
  receive yet. When real stop coordinates exist, pages pass them and the map renders
  stop pins (+ a connecting polyline) with no component rework — preserving the
  original "route stops on the map" goal for a later phase.

## Data flow

```
tms_vehicle (position, speed, heading, accuracy, last_gps_update)
   │
   ├─ /api/student/location   ┐
   ├─ /api/boarding/location  ├─ vehicle{ lat,lng,speed,heading,accuracyM,status,minutesAgo }
   ├─ /api/driver/location    │
   └─ /api/admin/track-all/drivers ┘
        │
   page (client)
        │  compute via lib/geo: distanceToCampus, bearingToCampus, approaching, etaMinutes
        │  viewer location via navigator.geolocation (opt-in, riders only)
        ▼
   map component  ← props: destination(CAMPUS), heading, accuracyM, viewer, (future) stops
```

## Error / edge handling

- **No fix / stale fix:** existing "bus isn't sharing" empty state unchanged; no info
  strip numbers shown.
- **Heading null:** upright marker, no rotation.
- **Accuracy null:** no accuracy circle.
- **Speed ~0 / idle:** ETA is `null` → "no ETA" (distance still shown).
- **Bus departing campus:** ETA hidden, "heading away from campus."
- **Viewer denies or lacks geolocation support:** button shows a friendly "couldn't get
  your location" state; the rest of the map is unaffected.
- **Campus constant wrong:** cosmetic only (pin + distances shift); fixed in one place.

## Testing & verification

- **Vitest** for `lib/geo/distance.ts`: haversine against known city-pair distances,
  bearing quadrants (N/E/S/W), `isApproaching` boundary at ±90°, `etaMinutes` idle/road-factor.
- **tsc** on changed files only (project ESLint is broken — verify with tsc + route probes).
- **Route probes** for the two changed APIs (expect 401/redirect unauthenticated).
- **Live render** requires the product owner's authenticated browser (the agent's Chrome
  is unauthenticated); manual check of all four portals' maps.

## Rollout / scope summary

Touched files:
- New: `lib/geo/campus.ts`, `lib/geo/distance.ts`, `lib/geo/distance.test.ts`,
  `lib/hooks/use-viewer-location.ts` (or co-located).
- Edit: `components/live-position-map.tsx`, `components/live-tracking-map.tsx`,
  `app/api/student/location/route.ts`, `app/api/boarding/location/route.ts`,
  `app/student/live-track/page.tsx`, `app/boarding/live-track/page.tsx`,
  `app/driver/location/page.tsx`, `app/(admin)/track-all/page.tsx` (only if the strip
  is added there; admin gets popup distance regardless).

Assumed defaults (confirmed):
- "Distance from you" = **student + boarding only** (driver is on the bus; admin watches many).
- ETA shows **only when the bus is approaching campus and moving**; otherwise distance only.

## Future phases (out of scope here)

1. **Stop coordinates** — an admin map-picker (or geocode-and-verify, or spreadsheet
   import) to populate accurate `tms_route_stop.latitude/longitude`, then flip on the
   `stops` prop for pins + polyline.
2. **Real road-following ETA** once stops exist (still free-tier friendly via OSRM/OSM).
