# Student + Boarding live tracking — Google-like map (free, smooth)

- **Date:** 2026-07-13
- **Status:** Approved design (pre-implementation)
- **Scope:** Student (`/student/live-track`) and Boarding (`/boarding/live-track`) portals. **Admin is NOT touched** (it uses a different map component, `live-tracking-map.tsx`).
- **Builds on:** the Track-All exact-geolocation feature — reuses `lib/geo/osrm.ts` (already on this branch) and the CARTO/Esri basemap approach.

## 1. Problem

The student & boarding "Track my bus" pages already show a **smoothly-moving** bus, but on plain OpenStreetMap tiles. The user wants a **Google-Maps-like** experience: the moving vehicle on a Google-looking map with a **road route from the bus's current position to the destination (campus)**. Real Google tiles + smooth movement needs a billing key (declined); the free Google iframe can't move smoothly (flickers). Chosen path: **upgrade the existing Leaflet map to a Google-*like* basemap + add the road route line** — smooth, free, no key, no flicker.

## 2. Goals

1. Student + boarding "Track my bus" maps use a **Google-Maps-like basemap** (CARTO Voyager street + Esri satellite toggle).
2. Draw the **road route line** from the bus's live position → campus ("current place → destination").
3. Keep the **smooth live-moving** bus (existing glide) — no flicker, no reload.
4. **Free**: no key, no billing, no new dependency.

### Non-goals / out of scope

- Real Google Maps tiles / JS SDK / billing key; the flickery Google iframe.
- Route **stops**/boarding points on the map (user chose bus + route only; stop coords are 14/479 anyway).
- **Admin** (`components/live-tracking-map.tsx`, `/track-all`) — untouched.
- Changing the driver GPS pipeline, the glide/interpolation, or the location endpoints' existing fields.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Map | Free & smooth, **Google-*like*** (Voyager + Esri) — not real Google tiles |
| Route line | Bus → campus, OSRM road-following polyline |
| Stops | Not shown |
| Surfaces | Student + boarding live-track pages |
| Moving vehicle | Existing Leaflet glide (unchanged) |

## 4. Current state (verified)

- `app/student/live-track/page.tsx` + `app/boarding/live-track/page.tsx`: React-Query poll (`refetchInterval: 5000`) `/api/student/location` / `/api/boarding/location`; render `components/live-position-map.tsx` with `destination={CAMPUS}`, `heading`, `accuracyM`, `viewer`.
- `components/live-position-map.tsx`: Leaflet, single bus, **glides** the marker between fixes (interpolation), campus pin, heading arrow, accuracy circle, optional `stops` seam. Currently a single OSM `tileLayer`. **Shared with the driver self-view** — see §6.
- `/api/student/location` (`withAuth` + `PASSENGER_SELF_VIEW`) and `/api/boarding/location` (`withAuth` + `ATTENDANCE_SCAN`) return `{ success, data: { route: {id,label}, vehicle: {...}|null } }`. `vehicle` carries `latitude/longitude/hasFix/status`.
- `lib/geo/osrm.ts` exports `routeToCampus(lat,lng,campus,fetchImpl?)`, `roundCoord`, `RouteResult` (present on this branch from the Track-All feature).
- `CAMPUS` = `lib/gps/campus.ts` (11.4444567, 77.730258).

## 5. Design

### 5.1 Basemap upgrade — `components/live-position-map.tsx`

Replace the single OSM `tileLayer` in the init `useEffect` with two named base layers + a Leaflet layer control (identical to the admin map):
- Street (default): CARTO Voyager `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png` (`subdomains:'abcd'`, `maxZoom:20`, attribution `© OpenStreetMap contributors © CARTO`).
- Satellite: Esri World Imagery `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` (`maxZoom:20`, attribution `Tiles © Esri`).
- `L.control.layers({ Street, Satellite }, {}, { position: 'topright' })`.

### 5.2 Route line — `components/live-position-map.tsx`

- New optional prop `routeGeometry?: [number, number][]` (an array of `[lat,lng]` points).
- New `routeLineRef` + a `useEffect([routeGeometry])`: remove any prior line; if `routeGeometry.length > 1`, draw `L.polyline(routeGeometry, { color:'#2563eb', weight:5, opacity:0.8 })`. Null the ref in the init effect's cleanup.
- This layers on top of the existing bus/campus/accuracy/stops; nothing else changes.

### 5.3 Cached route helper — `lib/geo/route-to-campus.ts` (new, unit-tested)

```ts
export interface RoadRoute { geometry: [number, number][]; distanceKm: number; durationMin: number }
export async function cachedRouteToCampus(lat: number, lng: number, routeFn?): Promise<RoadRoute | null>;
```
- Wraps `routeToCampus(lat, lng, CAMPUS)` from `lib/geo/osrm.ts`; maps `RouteResult` → `RoadRoute` (drops the snapped `origin`).
- Module-level cache keyed by `` `${roundCoord(lat)},${roundCoord(lng)}` `` (4 dp ≈ 11 m), TTL 60 s — so a moving bus recomputes its route as it drives, but repeated polls at the same spot hit cache.
- Fail-soft: returns `null` when the router returns null. `routeFn` param is injectable for tests (defaults to the real `routeToCampus`).
- `OSRM_BASE_URL` (via `lib/geo/osrm.ts`) is env-swappable; default is the free public demo server.

### 5.4 Location endpoints — add `roadRoute`

In BOTH `app/api/student/location/route.ts` and `app/api/boarding/location/route.ts`, after `vehicle` is computed and before the final `return`, compute:
```ts
const roadRoute =
  vehicle && vehicle.hasFix && vehicle.status !== 'offline' &&
  vehicle.latitude != null && vehicle.longitude != null
    ? await cachedRouteToCampus(vehicle.latitude, vehicle.longitude)
    : null;
```
and add `roadRoute` to `data` (alongside the existing `route` + `vehicle`). Distinct name from the existing `route` (route id/label). Fail-soft: if `cachedRouteToCampus` returns null, `roadRoute` is null and the map simply shows no line.

### 5.5 Pages — pass `routeGeometry`

In BOTH `app/student/live-track/page.tsx` and `app/boarding/live-track/page.tsx`: extend the fetch response type with `roadRoute?: RoadRoute | null`, read it, and pass `routeGeometry={data?.data?.roadRoute?.geometry}` to `<LivePositionMap>`.

### Data flow

```
5s poll ─ /api/{student,boarding}/location
             ├ vehicle (existing)                         ─▶ LivePositionMap (glides live)
             └ roadRoute = cachedRouteToCampus(veh) (OSRM, cached, fail-soft)
                                                           ─▶ routeGeometry ─▶ blue polyline (bus→campus)
                            basemap: Voyager street + Esri satellite toggle (component-level)
```

## 6. Scope note — shared component

`live-position-map.tsx` is shared by student, boarding, AND the **driver self-view**. The **basemap upgrade (§5.1) applies to all three** — the driver's map also gets the nicer basemap. That is acceptable (a consistent visual improvement; the driver portal is NOT the admin panel). The **route line (§5.2) is prop-driven**, so only the student + boarding pages (which pass `routeGeometry`) get it; the driver view is otherwise unchanged.

## 7. Risks & mitigations

- **Free OSRM public demo** fair-use — on-demand + cached; env-swappable (`OSRM_BASE_URL`) to self-host if needed. Fail-soft (no line if unavailable).
- **Adds one OSRM call to the location poll** — mitigated by the rounded-coord cache (most polls hit cache; only a moved bus recomputes).
- **Not literally Google tiles** — accepted trade-off for free + smooth (documented in §1).
- **Live verification** needs a phone broadcasting (0 fresh fixes today) — pure logic is unit-tested; visual is manual.

## 8. Testing

- **vitest** (`lib/geo/route-to-campus.test.ts`, relative import — `@/` breaks vitest): maps RouteResult→RoadRoute; caches by rounded coords (nearby second call within TTL does not re-call `routeFn`); returns null fail-soft. Inject a mock `routeFn`.
- **tsc**: `npx tsc --noEmit` clean for touched files.
- **Manual (user, authenticated browser, bus broadcasting):** open `/student/live-track` and `/boarding/live-track` → Google-like basemap with Street/Satellite toggle; the bus glides; a blue road line runs bus→campus and updates as the bus moves. Confirm the map still works (no line) when OSRM is unavailable.

## 9. Files touched

- **New:** `lib/geo/route-to-campus.ts`, `lib/geo/route-to-campus.test.ts`.
- **Edit:** `components/live-position-map.tsx` (basemap + `routeGeometry`), `app/api/student/location/route.ts`, `app/api/boarding/location/route.ts`, `app/student/live-track/page.tsx`, `app/boarding/live-track/page.tsx`.
- **Unchanged:** admin `live-tracking-map.tsx` / `/track-all`; the GPS pipeline; the glide.

## 10. Open questions

None — free-smooth-Google-like, bus+route only, student+boarding are all resolved.
