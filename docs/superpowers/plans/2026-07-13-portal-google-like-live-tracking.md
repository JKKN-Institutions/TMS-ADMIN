# Student + Boarding Google-like Live Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the student + boarding "Track my bus" map to a Google-Maps-like basemap with a road route line (bus → campus), keeping the smooth live-moving bus — free, no key.

**Architecture:** Reuse the Track-All OSRM engine (`lib/geo/osrm.ts`, already on this branch). A new cached helper feeds a road route from each location endpoint; the shared `live-position-map.tsx` gets the Voyager/Esri basemap and a new `routeGeometry` polyline prop; the two pages pass the route through.

**Tech Stack:** Next.js 15 App Router, TypeScript, Leaflet, OSRM (free public demo, env-swappable), vitest.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-07-13-portal-google-like-live-tracking-design.md` (authority).
- **No new npm dependencies** (Leaflet + `lib/geo/osrm.ts` already present).
- **Scope:** student + boarding only. Do NOT touch `components/live-tracking-map.tsx` (admin) or the GPS pipeline/glide. `components/live-position-map.tsx` is shared with the driver self-view — the basemap change applies there too (intended); the route line is prop-driven so only student/boarding get it.
- **Reuse:** `routeToCampus`, `roundCoord`, `RouteResult` from `lib/geo/osrm.ts`; `CAMPUS` from `lib/gps/campus.ts`.
- **Vitest:** tests at `lib/**/*.test.ts`, node env. The `@/` alias does NOT resolve under vitest — `lib/geo/route-to-campus.ts` MUST use RELATIVE imports (`../gps/campus`, `./osrm`), and its test a relative import (`./route-to-campus`). App code (routes/pages) uses `@/` normally.
- **Fail soft:** the route helper returns `null` on any failure; the map shows no line and still works.
- **SHARED branch** (`feat/driver-mobile-supply`): a parallel session commits here. Implementers COMMIT per task with explicit `git add <exact paths>` — NEVER `-A`. NEVER `git commit --amend`/`rebase`/`reset`/`push`. Review each task in isolation as `<commit>^..<commit>`.
- **tsc gate:** `npx tsc --noEmit 2>&1 | grep <file>` must show ZERO lines for touched files (project has ~559 pre-existing unrelated errors; touched files add none).
- **Commit trailer:** end each commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- `lib/geo/route-to-campus.ts` (**new**) — `cachedRouteToCampus(lat,lng,routeFn?)` + `RoadRoute` type. Relative imports.
- `lib/geo/route-to-campus.test.ts` (**new**) — unit tests.
- `components/live-position-map.tsx` (**modify**) — basemap (Voyager+Esri) + `routeGeometry` prop → blue polyline.
- `app/api/student/location/route.ts` (**modify**) — add `roadRoute`.
- `app/api/boarding/location/route.ts` (**modify**) — add `roadRoute`.
- `app/student/live-track/page.tsx` (**modify**) — pass `routeGeometry`.
- `app/boarding/live-track/page.tsx` (**modify**) — pass `routeGeometry`.

---

## Task 1: Cached route helper (`lib/geo/route-to-campus.ts`)

**Files:**
- Create: `lib/geo/route-to-campus.ts`
- Test: `lib/geo/route-to-campus.test.ts`

**Interfaces:**
- Consumes: `routeToCampus`, `roundCoord`, `RouteResult` (from `./osrm`); `CAMPUS` (from `../gps/campus`).
- Produces:
  - `interface RoadRoute { geometry: [number, number][]; distanceKm: number; durationMin: number }`
  - `cachedRouteToCampus(lat: number, lng: number, routeFn?): Promise<RoadRoute | null>`

- [ ] **Step 1: Write the failing test**

Create `lib/geo/route-to-campus.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { cachedRouteToCampus } from './route-to-campus';

const fakeRoute = {
  geometry: [[11.4, 77.7], [11.44, 77.73]] as [number, number][],
  distanceKm: 5,
  durationMin: 10,
  origin: { lat: 11.4, lng: 77.7, snapDistanceM: 0 },
};

describe('cachedRouteToCampus', () => {
  it('maps the OSRM result to a RoadRoute (drops origin)', async () => {
    const routeFn = vi.fn().mockResolvedValue(fakeRoute);
    const r = await cachedRouteToCampus(11.11, 77.11, routeFn);
    expect(r).toEqual({ geometry: fakeRoute.geometry, distanceKm: 5, durationMin: 10 });
    expect(routeFn).toHaveBeenCalledTimes(1);
  });

  it('caches by rounded coords — a nearby second call within TTL does not re-call', async () => {
    const routeFn = vi.fn().mockResolvedValue(fakeRoute);
    await cachedRouteToCampus(22.22, 78.22, routeFn);
    await cachedRouteToCampus(22.22001, 78.22001, routeFn); // same 4-dp bucket
    expect(routeFn).toHaveBeenCalledTimes(1);
  });

  it('returns null when the router returns null (fail-soft)', async () => {
    const routeFn = vi.fn().mockResolvedValue(null);
    expect(await cachedRouteToCampus(33.33, 79.33, routeFn)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/geo/route-to-campus.test.ts`
Expected: FAIL — `Failed to resolve import "./route-to-campus"`.

- [ ] **Step 3: Write the implementation**

Create `lib/geo/route-to-campus.ts` (NOTE: relative imports, required for vitest):

```ts
/**
 * Server helper: road route from a live bus position → campus, mapped to a compact
 * RoadRoute and cached by rounded coordinates (4 dp ≈ 11 m, 60 s). A moving bus
 * recomputes its route as it drives, but repeated polls at one spot hit cache.
 * Fail-soft: null when the router is unavailable (the map simply shows no line).
 * Wraps the Track-All OSRM engine; relative imports so it is vitest-resolvable.
 */
import { CAMPUS } from '../gps/campus';
import { routeToCampus, roundCoord, type RouteResult } from './osrm';

export interface RoadRoute {
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
}

type RouteFn = (
  lat: number,
  lng: number,
  campus: { lat: number; lng: number },
) => Promise<RouteResult | null>;

interface Entry {
  value: RoadRoute | null;
  expires: number;
}
const cache = new Map<string, Entry>();
const TTL_MS = 60_000;

export async function cachedRouteToCampus(
  lat: number,
  lng: number,
  routeFn: RouteFn = routeToCampus,
): Promise<RoadRoute | null> {
  const key = `${roundCoord(lat)},${roundCoord(lng)}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  const r = await routeFn(lat, lng, { lat: CAMPUS.lat, lng: CAMPUS.lng });
  const value: RoadRoute | null = r
    ? { geometry: r.geometry, distanceKm: r.distanceKm, durationMin: r.durationMin }
    : null;
  cache.set(key, { value, expires: now + TTL_MS });
  return value;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/geo/route-to-campus.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "lib/geo/route-to-campus" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 6: Commit**

```bash
git add lib/geo/route-to-campus.ts lib/geo/route-to-campus.test.ts
git commit -m "$(printf 'feat(portal-tracking): cached route-to-campus helper over OSRM\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: Basemap + route line (`components/live-position-map.tsx`)

**Files:**
- Modify: `components/live-position-map.tsx`

**Interfaces:**
- Produces (new prop on the existing component): `routeGeometry?: [number, number][]` — an array of `[lat,lng]` points; when length > 1, drawn as a blue polyline.

- [ ] **Step 1: Add the `routeGeometry` prop to the interface**

Find:

```tsx
  /** Optional route stops (future phase — pins + dashed connecting line). */
  stops?: StopPoint[];
}
```

Replace with:

```tsx
  /** Optional route stops (future phase — pins + dashed connecting line). */
  stops?: StopPoint[];
  /** Road route (bus → campus) as [lat,lng] points; drawn as a solid blue polyline. */
  routeGeometry?: [number, number][];
}
```

- [ ] **Step 2: Destructure the new prop**

Find:

```tsx
  latitude, longitude, label, zoom = 15,
  heading, accuracyM, destination, viewer, stops,
}) => {
```

Replace with:

```tsx
  latitude, longitude, label, zoom = 15,
  heading, accuracyM, destination, viewer, stops, routeGeometry,
}) => {
```

- [ ] **Step 3: Add the route-line ref**

Find:

```tsx
  const stopsRef = useRef<L.LayerGroup | null>(null);
```

Add immediately after it:

```tsx
  const routeLineRef = useRef<L.Polyline | null>(null);
```

- [ ] **Step 4: Swap the basemap for Voyager + Esri + a layer control**

Find:

```tsx
    const map = L.map(elRef.current).setView([latitude, longitude], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
```

Replace with:

```tsx
    const map = L.map(elRef.current).setView([latitude, longitude], zoom);
    // Street basemap: CARTO Voyager — clean, Google-like, free, no API key.
    const street = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '© OpenStreetMap contributors © CARTO',
    });
    // Satellite basemap: Esri World Imagery — free with attribution, no key.
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, attribution: 'Tiles © Esri' },
    );
    street.addTo(map);
    L.control.layers({ Street: street, Satellite: satellite }, {}, { position: 'topright' }).addTo(map);
```

- [ ] **Step 5: Null the route-line ref on unmount**

Find (inside the init effect's cleanup return):

```tsx
      stopsRef.current = null;
      hasFitRef.current = false;
    };
```

Replace with:

```tsx
      stopsRef.current = null;
      routeLineRef.current = null;
      hasFitRef.current = false;
    };
```

- [ ] **Step 6: Add the route-line effect**

Find the whole stops effect and the line after it:

```tsx
      group.addTo(map);
      stopsRef.current = group;
    }
  }, [stops]);
```

Replace with (appends the route-line effect right after the stops effect):

```tsx
      group.addTo(map);
      stopsRef.current = group;
    }
  }, [stops]);

  // Road route (bus → campus): solid blue polyline. Redraws when the route changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    if (routeGeometry && routeGeometry.length > 1) {
      routeLineRef.current = L.polyline(routeGeometry, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.8,
      }).addTo(map);
    }
  }, [routeGeometry]);
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "live-position-map" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 8: Commit**

```bash
git add components/live-position-map.tsx
git commit -m "$(printf 'feat(portal-tracking): Voyager/Esri basemap + route-line prop on live-position-map\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Add `roadRoute` to the location endpoints

**Files:**
- Modify: `app/api/student/location/route.ts`
- Modify: `app/api/boarding/location/route.ts`

**Interfaces:**
- Consumes: `cachedRouteToCampus` (Task 1).
- Produces: both endpoints' `data` now includes `roadRoute: RoadRoute | null`.

- [ ] **Step 1: Import the helper in BOTH files**

In `app/api/student/location/route.ts` AND `app/api/boarding/location/route.ts`, add after the existing `import { gpsFreshness } from '@/lib/gps/freshness';` line:

```ts
import { cachedRouteToCampus } from '@/lib/geo/route-to-campus';
```

- [ ] **Step 2: Compute + return `roadRoute` in BOTH files**

Both files end their handler with this identical block:

```ts
    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, label: `${route.route_number ?? '?'} · ${route.route_name ?? ''}`.trim() },
        vehicle,
      },
    });
```

Replace it (in BOTH files) with:

```ts
    const roadRoute =
      vehicle && vehicle.hasFix && vehicle.status !== 'offline' &&
      vehicle.latitude != null && vehicle.longitude != null
        ? await cachedRouteToCampus(vehicle.latitude, vehicle.longitude)
        : null;

    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, label: `${route.route_number ?? '?'} · ${route.route_name ?? ''}`.trim() },
        vehicle,
        roadRoute,
      },
    });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "student/location|boarding/location" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 4: Commit**

```bash
git add "app/api/student/location/route.ts" "app/api/boarding/location/route.ts"
git commit -m "$(printf 'feat(portal-tracking): location endpoints return bus->campus roadRoute\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: Pass `routeGeometry` from the pages

**Files:**
- Modify: `app/student/live-track/page.tsx`
- Modify: `app/boarding/live-track/page.tsx`

**Interfaces:**
- Consumes: `RoadRoute` type (Task 1); the `roadRoute` response field (Task 3); the `routeGeometry` prop (Task 2).

- [ ] **Step 1: Import the `RoadRoute` type in BOTH pages**

In BOTH files, add after the `import { CAMPUS } from '@/lib/gps/campus';` line:

```tsx
import type { RoadRoute } from '@/lib/geo/route-to-campus';
```

- [ ] **Step 2 (student): widen the response type**

In `app/student/live-track/page.tsx`, find:

```tsx
type Resp = { data?: { route: RouteInfo | null; vehicle: Vehicle | null }; notFound?: boolean };
```

Replace with:

```tsx
type Resp = { data?: { route: RouteInfo | null; vehicle: Vehicle | null; roadRoute?: RoadRoute | null }; notFound?: boolean };
```

Then find:

```tsx
  return { data: (await res.json()).data as { route: RouteInfo | null; vehicle: Vehicle | null } };
```

Replace with:

```tsx
  return { data: (await res.json()).data as { route: RouteInfo | null; vehicle: Vehicle | null; roadRoute?: RoadRoute | null } };
```

- [ ] **Step 3 (student): extract `roadRoute` and pass it to the map**

Find:

```tsx
  const route = data?.data?.route ?? null;
  const v = data?.data?.vehicle ?? null;
```

Replace with:

```tsx
  const route = data?.data?.route ?? null;
  const v = data?.data?.vehicle ?? null;
  const roadRoute = data?.data?.roadRoute ?? null;
```

Then find the map render:

```tsx
                <LivePositionMap
                  latitude={v.latitude as number}
                  longitude={v.longitude as number}
                  label={`Bus ${v.registrationNumber ?? ''}`}
                  heading={v.heading}
                  accuracyM={v.accuracyM}
                  destination={CAMPUS}
                  viewer={viewer}
                />
```

Replace with:

```tsx
                <LivePositionMap
                  latitude={v.latitude as number}
                  longitude={v.longitude as number}
                  label={`Bus ${v.registrationNumber ?? ''}`}
                  heading={v.heading}
                  accuracyM={v.accuracyM}
                  destination={CAMPUS}
                  viewer={viewer}
                  routeGeometry={roadRoute?.geometry}
                />
```

- [ ] **Step 4 (boarding): widen the response type**

In `app/boarding/live-track/page.tsx`, find:

```tsx
async function fetchBus(): Promise<{ route: RouteInfo | null; vehicle: Vehicle | null }> {
  const res = await fetch('/api/boarding/location', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load location');
  return (await res.json()).data as { route: RouteInfo | null; vehicle: Vehicle | null };
}
```

Replace with:

```tsx
async function fetchBus(): Promise<{ route: RouteInfo | null; vehicle: Vehicle | null; roadRoute?: RoadRoute | null }> {
  const res = await fetch('/api/boarding/location', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('Failed to load location');
  return (await res.json()).data as { route: RouteInfo | null; vehicle: Vehicle | null; roadRoute?: RoadRoute | null };
}
```

- [ ] **Step 5 (boarding): extract `roadRoute` and pass it to the map**

Find:

```tsx
  const route = data?.route ?? null;
  const v = data?.vehicle ?? null;
```

Replace with:

```tsx
  const route = data?.route ?? null;
  const v = data?.vehicle ?? null;
  const roadRoute = data?.roadRoute ?? null;
```

Then find the map render:

```tsx
                <LivePositionMap
                  latitude={v.latitude as number}
                  longitude={v.longitude as number}
                  label={`Bus ${v.registrationNumber ?? ''}`}
                  heading={v.heading}
                  accuracyM={v.accuracyM}
                  destination={CAMPUS}
                  viewer={viewer}
                />
```

Replace with:

```tsx
                <LivePositionMap
                  latitude={v.latitude as number}
                  longitude={v.longitude as number}
                  label={`Bus ${v.registrationNumber ?? ''}`}
                  heading={v.heading}
                  accuracyM={v.accuracyM}
                  destination={CAMPUS}
                  viewer={viewer}
                  routeGeometry={roadRoute?.geometry}
                />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "student/live-track|boarding/live-track" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 7: Commit**

```bash
git add "app/student/live-track/page.tsx" "app/boarding/live-track/page.tsx"
git commit -m "$(printf 'feat(portal-tracking): pass bus->campus route line to the live map\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Final verification

- [ ] **Unit suite:** `npx vitest run lib/geo/route-to-campus.test.ts` → 3/3 green.
- [ ] **Typecheck touched files:** `npx tsc --noEmit 2>&1 | grep -E "route-to-campus|live-position-map|student/location|boarding/location|student/live-track|boarding/live-track" ; echo "clean if no lines"` → no lines.
- [ ] **User smoke test** (authenticated browser, a bus broadcasting): `/student/live-track` and `/boarding/live-track` show the Google-like basemap with a Street/Satellite toggle; the bus glides live; a blue road line runs bus→campus and updates as it moves; the map still renders (no line) when OSRM is unavailable.

## Notes / risks (from the spec)

- Free OSRM public demo; `OSRM_BASE_URL` env-swappable. Fail-soft (no line if down).
- `live-position-map.tsx` is shared with the driver self-view — the basemap improves there too (intended); the route line is student/boarding-only (prop-driven).
- Not literally Google tiles — accepted trade-off for free + smooth.
