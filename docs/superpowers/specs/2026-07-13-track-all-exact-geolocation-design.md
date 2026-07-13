# Track-All map — exact vehicle geolocation (Google-Maps-like)

- **Date:** 2026-07-13
- **Status:** Approved design (pre-implementation)
- **Scope:** Admin **Track-All** map only (`app/(admin)/track-all`). No changes to the student / driver / boarding "where's-my-bus" maps.
- **Reference:** A Google Maps *directions* view (Jalakandapuram bus stand → JKKN Dental College) — a road-level basemap with a road-following route line to the campus.

## 1. Problem

The Track-All map already plots each bus at its exact live GPS fix, but as a bare colored dot on a plain OpenStreetMap raster basemap, with no road-path context. Compared to the Google Maps reference it reads as low-detail and imprecise. The admin wants the bus's exact location presented like Google Maps: a richer basemap, the marker sitting on the road, a road-following line to campus, and a human-readable address.

## 2. Goals

1. **Richer, Google-like basemap** — crisper street tiles + an optional satellite layer.
2. **Road-following route line** — draw the road path from a bus to the JKKN campus (directions-style).
3. **Road-snapped bus marker** — snap the raw GPS dot onto the nearest road (guarded).
4. **Readable address** — reverse-geocode and show the bus's street/area name.

### Non-goals / out of scope

- Google Maps JS SDK / Directions API (rejected: needs a billing-enabled key + a component rewrite). We stay on **free Leaflet**.
- Drawing the **assigned multi-stop route** path — infeasible from stored data (see §4) until stop coordinates are backfilled. Separate effort.
- Per-row addresses for **every** bus (Nominatim fair-use). Address is for the **selected** bus only.
- Changes to `components/live-position-map.tsx` (student/driver/boarding).

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Map stack | Free Leaflet upgrade — no Google key |
| Basemap | CARTO **Voyager** (street) + Esri **World Imagery** (satellite), layer toggle |
| Routing | **OSRM** (`OSRM_BASE_URL`, default public demo server) |
| Reverse geocoding | **Nominatim** via existing `lib/geo/geocode.ts` |
| Route line | **Selected (clicked) bus → campus only** |
| Address | **Selected bus only** |
| Marker snapping | All buses with a **fresh** fix, guarded at 60 m |

## 4. Current architecture & data constraints

**Position pipeline (unchanged):** `app/(admin)/track-all/page.tsx` polls `/api/admin/track-all/drivers` every 5 s → reads each bus's `tms_vehicle.current_latitude/longitude`, `gps_heading`, `gps_accuracy`, `last_gps_update` → `components/live-tracking-map.tsx` renders gliding Leaflet markers (interpolated between polls) + accuracy circle + 🎓 campus pin.

**Verified data state (2026-07-13):**
- Vehicles: 35 total; only **4** have any GPS fix; **2** live-tracking-enabled; **0** fresh in the last 10 min (foreground-only limitation).
- Routes: **24** total, **0** with start coordinates. Stops: **479** total, only **14** with coordinates.
- ⇒ The assigned route path is **not drawable** from stored data. The only reliably-known coordinate pair per bus is **(live vehicle position) → (CAMPUS)** — which is what the route line uses. `CAMPUS` = `lib/gps/campus.ts` (11.4444567, 77.730258).

**Auth reality:** the existing `/api/admin/track-all/drivers` route uses a raw service-role client with **no** granular permission check (legacy pattern). The new endpoint will use the **modern** `withAuth` + `requirePerm('tms.tracking.view')` idiom — an improvement, not a repeat of the gap. `user_has_permission(permission_name)` resolves against `custom_roles.permissions` JSONB with a super-admin bypass; `tms.tracking.view` is the established tracking-view key.

## 5. Design

Two isolated units. Unit A is a self-contained basemap swap (no backend). Unit B is on-demand geo-enrichment that only fires for buses with a fresh fix (snap) and the selected bus (route + address), keeping free-service usage tiny and rate-limit-safe.

### Unit A — Basemap upgrade (`live-tracking-map.tsx`)

Replace the single OSM `tileLayer` with two named base layers and a Leaflet layer control:

- **Street (default):** CARTO Voyager — `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`, subdomains `abcd`, `maxZoom: 20`, attribution `© OpenStreetMap contributors © CARTO`.
- **Satellite:** Esri World Imagery — `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attribution `Tiles © Esri`.
- `L.control.layers({ Street, Satellite }).addTo(map)`.

No other change to marker/glide logic.

### Unit B — Geo-enrichment

#### B1. `lib/geo/osrm.ts` (new, unit-testable)

```ts
export interface SnapResult { lat: number; lng: number; snapDistanceM: number }
export interface RouteResult {
  geometry: [number, number][];   // [lat, lng] points, ready for L.polyline
  distanceKm: number;
  durationMin: number;
  origin: SnapResult;             // OSRM's snapped first waypoint
}
// base = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'
export async function snapToRoad(lat, lng, fetchImpl?): Promise<SnapResult | null>;      // /nearest/v1/driving
export async function routeToCampus(lat, lng, fetchImpl?): Promise<RouteResult | null>;  // /route/v1/driving/...;dest?overview=full&geometries=geojson
```

- `routeToCampus` requests `overview=full&geometries=geojson`; maps `routes[0].geometry.coordinates` (`[lng,lat]`) → `[lat,lng]`, `distance`→km, `duration`→min, and `waypoints[0].location` → snapped `origin`.
- `snapToRoad` uses `/nearest`; `waypoints[0].distance` → `snapDistanceM`.
- Both return `null` on any non-200 / malformed response (caller degrades gracefully). `fetchImpl` injectable for tests.

#### B2. `lib/geo/geocode.ts` (edit)

Add `reverseGeocode(lat, lng): Promise<string | null>` — Nominatim `/reverse?format=jsonv2&zoom=16&addressdetails=1`, existing `User-Agent` header, `GEOCODE_REGION` untouched. Returns a concise label built from `address` (road / suburb / city / state) or falls back to `display_name`; `null` on failure. Honors the Google path if `GEOCODE_PROVIDER=google` (reverse via Google if key present), mirroring `geocodeAddress`.

#### B3. `GET /api/admin/track-all/directions` (new)

- Auth: `withAuth` + `requirePerm(auth, 'tms.tracking.view')` (super-admin bypass built into the RPC).
- Query: `lat`, `lng` (required); `route` (`0|1`, default `0`); `address` (`0|1`, default `0`).
- Response: `{ success, snapped: {lat,lng,snapDistanceM} | null, route: {geometry,distanceKm,durationMin} | null, address: string | null }`.
- Server-side **cache** (module-level `Map`, TTL): snap/route keyed by `route|lat4|lng4` (4 dp ≈ 11 m) TTL 60 s; address keyed by `lat4|lng4` TTL 10 min. Nominatim/OSRM base URLs env-configurable so the whole thing is swappable to self-hosted/commercial later.
- Fails soft: any upstream error → that field is `null`, `success: true`.

#### B4. `live-tracking-map.tsx` — selection + enrichment lifecycle

- **Selection state:** clicking a bus marker sets `selectedBusId`; a marker for the same id re-clicked, or a "Clear" control, deselects.
- **"Fresh fix"** here = a bus that has `current_latitude/longitude` **and** `gps_status ∈ {online, recent}` (from the drivers feed's `gpsFreshness`). Offline/no-fix buses are not enriched (they aren't moving) and render at their raw last-known dot.
- **Snap (all fresh buses):** for each fresh bus **except the selected one**, call `directions?route=0&address=0`, cache per bus id, refetch only when it moves > **150 m** from its last-enriched point. If `snapDistanceM ≤ 60 m`, render the marker at the snapped point; otherwise keep the raw fix. The **accuracy circle always stays on the raw fix** (never hide real uncertainty).
- **Selected bus:** call `directions?route=1&address=1` (this single response already carries the snapped `origin`, so the selected bus does **not** also issue a `route=0` call). Draw an `L.polyline(geometry, { color:'#2563eb', weight:5, opacity:0.85 })` from bus → campus; snap its marker using the response's `origin` under the same 60 m guard; show a compact **selected-bus banner** (route name, address, distance km, ETA min) and enrich the popup. Redraw on select-change / >150 m move; clear polyline + banner on deselect.
- Existing glide/interpolation, campus pin, and "Recenter" button are preserved.

### Data flow

```
poll (5s) ─ /track-all/drivers ─→ raw fixes ─→ gliding markers (unchanged)
                                                     │
     click marker ─ selectedBusId ────────────────────┤
                                                     ▼
   per fresh bus:  /directions?route=0 ─ snapToRoad ─→ marker snapped (≤60m guard)
   selected bus :  /directions?route=1&address=1
                     ├ routeToCampus (OSRM) ─→ blue road polyline + distance/ETA
                     └ reverseGeocode (Nominatim) ─→ address in banner + popup
```

## 6. Error handling & degradation

- OSRM down / null → no snapping (raw dot), no route line; map still fully works.
- Nominatim down / null → address shows "—".
- Endpoint 403 (missing permission) → client silently skips enrichment; base map + raw markers still render.
- All upstream calls are wrapped; the 5 s position poll is never blocked by enrichment.

## 7. Config / env

| Var | Default | Purpose |
|---|---|---|
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | Routing/snap host (self-hostable) |
| `GEOCODE_PROVIDER` | `nominatim` | reused; `google` if a key is set |
| `GEOCODE_API_KEY` / `GOOGLE_MAPS_API_KEY` | — | optional, reused by reverse geocode |
| `GEOCODE_REGION` | `Tamil Nadu, India` | reused |

No new secrets required for the default (free) path.

## 8. Testing

- **vitest (pure units, relative imports — `@/` alias breaks vitest here):**
  - `osrm.ts`: parse a canned OSRM route JSON → correct `[lat,lng]` order, km/min conversion, snapped origin; malformed/non-200 → `null`; `snapDistanceM` extraction.
  - snap guard: `snapDistanceM > 60` ⇒ keep raw; `≤ 60` ⇒ use snapped.
  - cache key rounding to 4 dp; >150 m move triggers refetch (haversine via `lib/gps/distance`).
- **tsc:** `npx tsc --noEmit` clean for all touched files (project has ~pre-existing unrelated errors; touched files must add none).
- **Manual (user, authenticated browser):** open Track-All with a phone broadcasting; verify basemap toggle, marker on road, blue line to campus, banner address/ETA. Agent Chrome is unauthenticated so it cannot do this.

## 9. Risks & limitations

- **Free-service fair-use:** public OSRM demo + Nominatim prohibit heavy/production polling. On-demand + caching + small live fleet keeps us inside tolerance; env-swappable when the fleet grows. Documented, not hidden.
- **Snapping error at junctions / genuinely off-road buses** — mitigated by the 60 m guard + accuracy circle on the true fix.
- **Assigned route path** needs stop-coordinate backfill (0/24 routes, 14/479 stops) — out of scope.
- **Live verification** currently blocked by 0 fresh fixes; needs a broadcasting phone.
- **Serverless cache** is per-instance (fine at this scale; not shared across Vercel lambdas).

## 10. Files touched

- **New:** `lib/geo/osrm.ts`, `app/api/admin/track-all/directions/route.ts`, tests under `lib/geo/__tests__/` (or co-located `*.test.ts`).
- **Edit:** `lib/geo/geocode.ts` (add `reverseGeocode`), `components/live-tracking-map.tsx` (basemap + selection + enrichment).
- **Unchanged:** `/api/admin/track-all/drivers`, `app/(admin)/track-all/page.tsx` position pipeline, all portal maps.

## 11. Open questions

None — provider (free Leaflet), scope (Track-All only), route line (clicked bus → campus), and address (selected bus only) are all resolved.
