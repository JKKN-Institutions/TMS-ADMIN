# Track-All Exact Geolocation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin Track-All map show each bus's exact location like Google Maps — richer basemap, road-following route line to campus, road-snapped markers, and a readable address — on a free Leaflet stack.

**Architecture:** Keep the existing Leaflet map + 5 s position poll untouched. Add (a) a basemap swap with a Street/Satellite layer control, and (b) on-demand geo-enrichment isolated to one lib file (`lib/geo/osrm.ts`) + one `withAuth`-gated API route (`/api/admin/track-all/directions`) that call OSRM (route + snap) and Nominatim (reverse geocode), fail-soft and cached. The map component fetches enrichment only for fresh buses (snap) and the clicked bus (route + address).

**Tech Stack:** Next.js 15 App Router, TypeScript, Leaflet, OSRM (public demo, env-swappable), Nominatim (via existing `lib/geo/geocode.ts`), vitest.

## Global Constraints

- **No new npm dependencies.** Use the installed `leaflet` and global `fetch`.
- **Design spec:** `docs/superpowers/specs/2026-07-13-track-all-exact-geolocation-design.md` (authority for scope & decisions).
- **Scope:** admin Track-All only. Do **not** modify `components/live-position-map.tsx` or the student/driver/boarding maps.
- **Vitest:** tests live at `lib/**/*.test.ts`, `environment: 'node'`. The `@/` path alias is **not** resolved in vitest — use **relative imports** in `lib/**` and their tests.
- **Auth:** the new route uses `withAuth` + `requirePerm(auth, 'tms.tracking.view')` (super-admin bypass is inside the `user_has_permission` RPC). Do not use raw service-role without a permission check.
- **Fail soft:** every OSRM/Nominatim call returns `null` on any error; the map must fully work (raw dot) when enrichment is unavailable.
- **Free-service fair-use:** enrichment is on-demand + cached only. Never call OSRM/Nominatim inside the 5 s poll for every bus unconditionally.
- **Campus constant:** `CAMPUS` from `lib/gps/campus.ts` = `{ lat: 11.4444567, lng: 77.730258 }`.
- **Commit style:** end each commit message body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Stage only the files listed in each task (a parallel session commits to this branch; never `git add -A`).
- **tsc gate:** `npx tsc --noEmit 2>&1 | grep <file>` must show **no** errors for touched files (the project has ~pre-existing unrelated errors; touched files add none).

---

## File Structure

- `lib/geo/osrm.ts` (**new**) — OSRM client: `snapToRoad`, `routeToCampus`, pure helpers `roundCoord`, `shouldUseSnap`, types `SnapResult`/`RouteResult`.
- `lib/geo/osrm.test.ts` (**new**) — unit tests for the above.
- `lib/geo/geocode.ts` (**modify**) — add `reverseGeocode`.
- `lib/geo/geocode.test.ts` (**new**) — unit tests for `reverseGeocode`.
- `app/api/admin/track-all/directions/route.ts` (**new**) — enrichment endpoint (auth + cache).
- `components/live-tracking-map.tsx` (**modify**) — Task 4 basemap; Tasks 5–6 selection + enrichment.

---

## Task 1: OSRM client (`lib/geo/osrm.ts`)

**Files:**
- Create: `lib/geo/osrm.ts`
- Test: `lib/geo/osrm.test.ts`

**Interfaces:**
- Produces:
  - `interface SnapResult { lat: number; lng: number; snapDistanceM: number }`
  - `interface RouteResult { geometry: [number, number][]; distanceKm: number; durationMin: number; origin: SnapResult }`
  - `roundCoord(n: number, dp?: number): number`
  - `shouldUseSnap(snapDistanceM: number, guardM?: number): boolean`
  - `snapToRoad(lat: number, lng: number, fetchImpl?): Promise<SnapResult | null>`
  - `routeToCampus(lat: number, lng: number, campus: { lat: number; lng: number }, fetchImpl?): Promise<RouteResult | null>`

- [ ] **Step 1: Write the failing test**

Create `lib/geo/osrm.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { snapToRoad, routeToCampus, roundCoord, shouldUseSnap } from './osrm';

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

describe('roundCoord', () => {
  it('rounds to 4 dp by default (~11 m)', () => {
    expect(roundCoord(11.4444567)).toBe(11.4445);
    expect(roundCoord(77.730258)).toBe(77.7303);
  });
});

describe('shouldUseSnap', () => {
  it('accepts snaps within the 60 m guard', () => {
    expect(shouldUseSnap(0)).toBe(true);
    expect(shouldUseSnap(60)).toBe(true);
  });
  it('rejects far snaps and non-finite distances', () => {
    expect(shouldUseSnap(61)).toBe(false);
    expect(shouldUseSnap(Number.NaN)).toBe(false);
  });
});

describe('snapToRoad', () => {
  it('returns the snapped point with its distance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      code: 'Ok', waypoints: [{ location: [77.7303, 11.4445], distance: 12.5 }],
    }));
    const r = await snapToRoad(11.4444, 77.7302, fetchImpl);
    expect(r).toEqual({ lat: 11.4445, lng: 77.7303, snapDistanceM: 12.5 });
  });
  it('returns null on a non-Ok OSRM code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ code: 'NoSegment', waypoints: [] }));
    expect(await snapToRoad(0, 0, fetchImpl)).toBeNull();
  });
  it('returns null on a thrown fetch', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await snapToRoad(0, 0, fetchImpl)).toBeNull();
  });
});

describe('routeToCampus', () => {
  const campus = { lat: 11.4444567, lng: 77.730258 };
  it('parses geometry to [lat,lng], km, minutes and snapped origin', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      code: 'Ok',
      routes: [{ geometry: { coordinates: [[77.70, 11.40], [77.72, 11.42]] }, distance: 5000, duration: 600 }],
      waypoints: [{ location: [77.7009, 11.4009], distance: 8 }],
    }));
    const r = await routeToCampus(11.40, 77.70, campus, fetchImpl);
    expect(r?.geometry).toEqual([[11.40, 77.70], [11.42, 77.72]]);
    expect(r?.distanceKm).toBeCloseTo(5, 6);
    expect(r?.durationMin).toBe(10);
    expect(r?.origin).toEqual({ lat: 11.4009, lng: 77.7009, snapDistanceM: 8 });
  });
  it('returns null when OSRM finds no route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ code: 'NoRoute', routes: [] }));
    expect(await routeToCampus(0, 0, campus, fetchImpl)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/geo/osrm.test.ts`
Expected: FAIL — `Failed to resolve import "./osrm"` / module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/geo/osrm.ts`:

```ts
/**
 * OSRM road-routing client for the admin Track-All map.
 *
 * Default host is the free public demo server; override with OSRM_BASE_URL to
 * self-host or use a commercial provider. Every call FAILS SOFT (returns null)
 * so the map degrades to the raw GPS dot when routing is unavailable.
 */

export interface SnapResult {
  lat: number;
  lng: number;
  /** Metres between the raw input point and the snapped-to-road point. */
  snapDistanceM: number;
}

export interface RouteResult {
  /** Road-following path as [lat, lng] pairs, ready for L.polyline. */
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
  /** OSRM's snapped origin waypoint — reuse it to snap the bus marker. */
  origin: SnapResult;
}

type FetchLike = typeof fetch;

const base = (): string => process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';

/** Round a coordinate to `dp` decimals (4 dp ≈ 11 m) — used for cache keys. */
export function roundCoord(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Trust an OSRM snap only when it is close enough to the raw fix. */
export function shouldUseSnap(snapDistanceM: number, guardM = 60): boolean {
  return Number.isFinite(snapDistanceM) && snapDistanceM <= guardM;
}

/** Nearest point on the driving network, or null on any failure. */
export async function snapToRoad(
  lat: number,
  lng: number,
  fetchImpl: FetchLike = fetch,
): Promise<SnapResult | null> {
  try {
    const url = `${base()}/nearest/v1/driving/${lng},${lat}?number=1`;
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      waypoints?: Array<{ location?: [number, number]; distance?: number }>;
    };
    const wp = json.waypoints?.[0];
    if (json.code !== 'Ok' || !wp?.location) return null;
    const [wLng, wLat] = wp.location;
    if (!Number.isFinite(wLat) || !Number.isFinite(wLng)) return null;
    return { lat: wLat, lng: wLng, snapDistanceM: wp.distance ?? 0 };
  } catch {
    return null;
  }
}

/** Road route from (lat,lng) → campus, or null on any failure. */
export async function routeToCampus(
  lat: number,
  lng: number,
  campus: { lat: number; lng: number },
  fetchImpl: FetchLike = fetch,
): Promise<RouteResult | null> {
  try {
    const coords = `${lng},${lat};${campus.lng},${campus.lat}`;
    const url = `${base()}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{ geometry?: { coordinates?: [number, number][] }; distance?: number; duration?: number }>;
      waypoints?: Array<{ location?: [number, number]; distance?: number }>;
    };
    const route = json.routes?.[0];
    const wp = json.waypoints?.[0];
    if (json.code !== 'Ok' || !route?.geometry?.coordinates || !wp?.location) return null;
    const geometry = route.geometry.coordinates.map(
      ([lo, la]) => [la, lo] as [number, number],
    );
    const [wLng, wLat] = wp.location;
    return {
      geometry,
      distanceKm: (route.distance ?? 0) / 1000,
      durationMin: Math.round((route.duration ?? 0) / 60),
      origin: { lat: wLat, lng: wLng, snapDistanceM: wp.distance ?? 0 },
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/geo/osrm.test.ts`
Expected: PASS — 4 files' worth of `describe` blocks, all green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "lib/geo/osrm" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 6: Commit**

```bash
git add lib/geo/osrm.ts lib/geo/osrm.test.ts
git commit -m "$(printf 'feat(track-all): OSRM road snap + route-to-campus client\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: Reverse geocoding (`lib/geo/geocode.ts`)

**Files:**
- Modify: `lib/geo/geocode.ts` (append new function + helpers; do not change existing exports)
- Test: `lib/geo/geocode.test.ts` (new)

**Interfaces:**
- Consumes: existing module constants `PROVIDER`, `GOOGLE_KEY`, `withRegion` (already in the file).
- Produces: `reverseGeocode(lat: number, lng: number, fetchImpl?): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

Create `lib/geo/geocode.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { reverseGeocode } from './geocode';

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

describe('reverseGeocode (nominatim default)', () => {
  it('summarises road + city + state from address parts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      display_name: 'NH-544, Komarapalayam, Namakkal, Tamil Nadu, India',
      address: { road: 'NH-544', city: 'Komarapalayam', state: 'Tamil Nadu' },
    }));
    const r = await reverseGeocode(11.44, 77.73, fetchImpl);
    expect(r).toBe('NH-544, Komarapalayam, Tamil Nadu');
  });

  it('falls back to display_name when no address parts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ display_name: 'Somewhere, India', address: {} }));
    expect(await reverseGeocode(0, 0, fetchImpl)).toBe('Somewhere, India');
  });

  it('sends a descriptive User-Agent (Nominatim policy)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ display_name: 'X', address: {} }));
    await reverseGeocode(11.44, 77.73, fetchImpl);
    const [, opts] = fetchImpl.mock.calls[0];
    expect((opts.headers as Record<string, string>)['User-Agent']).toMatch(/JKKN-TMS/);
  });

  it('returns null on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(await reverseGeocode(0, 0, fetchImpl)).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await reverseGeocode(0, 0, fetchImpl)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/geo/geocode.test.ts`
Expected: FAIL — `reverseGeocode` is not exported.

- [ ] **Step 3: Add the implementation**

Append to `lib/geo/geocode.ts` (after the existing `geocodeAddress` function). Note the file already defines `PROVIDER`, `GOOGLE_KEY`:

```ts
type FetchLike = typeof fetch;

/** Build a short human label from Nominatim's structured address, else display_name. */
function summariseAddress(json: { display_name?: string; address?: Record<string, string> }): string | null {
  const a = json.address ?? {};
  const parts = [
    a.road || a.neighbourhood || a.suburb || a.hamlet,
    a.village || a.town || a.city || a.county,
    a.state_district || a.state,
  ].filter((p): p is string => !!p);
  const label = parts.join(', ');
  return label || json.display_name || null;
}

async function reverseNominatim(lat: number, lng: number, fetchImpl: FetchLike): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=16&addressdetails=1`;
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'JKKN-TMS/1.0 (transport route optimization)', 'Accept-Language': 'en' },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { display_name?: string; address?: Record<string, string> };
  return summariseAddress(json);
}

async function reverseGoogle(lat: number, lng: number, fetchImpl: FetchLike): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: Array<{ formatted_address?: string }> };
  return json.results?.[0]?.formatted_address ?? null;
}

/** Reverse-geocode a coordinate to a short address label, or null on failure. */
export async function reverseGeocode(
  lat: number,
  lng: number,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  try {
    if (PROVIDER === 'google' && GOOGLE_KEY) return await reverseGoogle(lat, lng, fetchImpl);
    return await reverseNominatim(lat, lng, fetchImpl);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/geo/geocode.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "lib/geo/geocode" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 6: Commit**

```bash
git add lib/geo/geocode.ts lib/geo/geocode.test.ts
git commit -m "$(printf 'feat(track-all): reverseGeocode helper for bus address labels\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Enrichment API route (`/api/admin/track-all/directions`)

**Files:**
- Create: `app/api/admin/track-all/directions/route.ts`

**Interfaces:**
- Consumes: `snapToRoad`, `routeToCampus`, `roundCoord`, `SnapResult`, `RouteResult` (Task 1); `reverseGeocode` (Task 2); `CAMPUS` (`lib/gps/campus.ts`); `withAuth`, `AuthContext` (`lib/api/with-auth`).
- Produces: `GET /api/admin/track-all/directions?lat=&lng=&route=0|1&address=0|1` →
  `{ success: true, snapped: {lat,lng,snapDistanceM} | null, route: {geometry:[lat,lng][], distanceKm, durationMin} | null, address: string | null }`
  or `{ error }` with 400 (bad coords) / 403 (no permission).

- [ ] **Step 1: Write the route**

Create `app/api/admin/track-all/directions/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { CAMPUS } from '@/lib/gps/campus';
import {
  snapToRoad,
  routeToCampus,
  roundCoord,
  type SnapResult,
  type RouteResult,
} from '@/lib/geo/osrm';
import { reverseGeocode } from '@/lib/geo/geocode';

/**
 * On-demand geo-enrichment for the admin Track-All map: road-snapped position,
 * a road-following route to campus, and a reverse-geocoded address for one bus.
 * OSRM/Nominatim are hit only here, cached + fail-soft, so the map degrades to
 * the raw GPS dot when they are unavailable. Auth: tms.tracking.view.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface CacheEntry<T> { value: T; expires: number }
const snapCache = new Map<string, CacheEntry<SnapResult | null>>();
const routeCache = new Map<string, CacheEntry<RouteResult | null>>();
const addrCache = new Map<string, CacheEntry<string | null>>();
const SNAP_TTL = 60_000;
const ROUTE_TTL = 60_000;
const ADDR_TTL = 600_000;

async function cachedGet<T>(
  store: Map<string, CacheEntry<T>>,
  key: string,
  ttl: number,
  produce: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = await produce();
  store.set(key, { value, expires: now + ttl });
  return value;
}

async function handler(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, 'tms.tracking.view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required numbers' }, { status: 400 });
  }
  const wantRoute = sp.get('route') === '1';
  const wantAddress = sp.get('address') === '1';
  const key = `${roundCoord(lat)},${roundCoord(lng)}`;

  // For the selected bus (route requested), the route response already carries a
  // snapped origin, so we skip the standalone /nearest call to save an OSRM hit.
  const [snapOnly, route, address] = await Promise.all([
    wantRoute
      ? Promise.resolve<SnapResult | null>(null)
      : cachedGet(snapCache, `s:${key}`, SNAP_TTL, () => snapToRoad(lat, lng)),
    wantRoute
      ? cachedGet(routeCache, `r:${key}`, ROUTE_TTL, () => routeToCampus(lat, lng, CAMPUS))
      : Promise.resolve<RouteResult | null>(null),
    wantAddress
      ? cachedGet(addrCache, `a:${key}`, ADDR_TTL, () => reverseGeocode(lat, lng))
      : Promise.resolve<string | null>(null),
  ]);

  const snapped = route?.origin ?? snapOnly;

  return NextResponse.json({
    success: true,
    snapped,
    route: route
      ? { geometry: route.geometry, distanceKm: route.distanceKm, durationMin: route.durationMin }
      : null,
    address: address ?? null,
  });
}

export const GET = withAuth((request, auth) => handler(request, auth));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "track-all/directions" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 3: Probe the route on the dev server**

Start the dev server if not running: `npm run dev` (separate terminal).
Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/admin/track-all/directions?lat=11.44&lng=77.73"`
Expected: `307` or `401` (proxy redirects/blocks the unauthenticated request) — this confirms the route exists and is auth-gated, not 404. (A full 200 needs an authenticated admin session in the browser.)

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/track-all/directions/route.ts
git commit -m "$(printf 'feat(track-all): withAuth directions endpoint (snap + route + address)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: Basemap upgrade (`live-tracking-map.tsx`)

**Files:**
- Modify: `components/live-tracking-map.tsx` (the map-init `useEffect`, around lines 142–145)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (visual change only).

- [ ] **Step 1: Replace the single OSM tile layer with Street + Satellite + a layer control**

In `components/live-tracking-map.tsx`, inside the init `useEffect`, replace:

```ts
    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
```

with:

```ts
    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, 10);
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "live-tracking-map" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 3: Manual visual verification (user, authenticated browser)**

Open `/track-all`. Expected: a crisper street basemap; a layers control (top-right) toggling **Street** ↔ **Satellite**; markers/campus pin unchanged. (Agent Chrome is unauthenticated — the user performs this check.)

- [ ] **Step 4: Commit**

```bash
git add components/live-tracking-map.tsx
git commit -m "$(printf 'feat(track-all): Voyager street + Esri satellite basemap toggle\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: Road-snapped markers for fresh buses (`live-tracking-map.tsx`)

**Files:**
- Modify: `components/live-tracking-map.tsx`

**Interfaces:**
- Consumes: `shouldUseSnap` (Task 1); `haversineMeters`, `LatLng` (`@/lib/gps/interpolate`); the `/api/admin/track-all/directions` endpoint (Task 3).
- Produces (module-internal): `fetchEnrichment(lat, lng, opts)`; per-bus `enrichRef` cache `Map<string, { at: LatLng; snapped: LatLng | null }>`.

**Design note:** the existing effect glides each marker to the raw `target`. We add an async enrichment pass that, when OSRM returns a trustworthy snap, retargets that bus's glide to the snapped point. We only call the endpoint when a bus first appears or has moved > 150 m since its last enrichment, keeping OSRM usage tiny.

- [ ] **Step 1: Add the enrichment fetch helper + selected-bus type imports**

At the top of `components/live-tracking-map.tsx`, extend the interpolate import (it currently imports `interpolateLatLng, shouldSnap, type LatLng`) and add the OSRM guard + distance helper:

```ts
import { interpolateLatLng, shouldSnap, haversineMeters, type LatLng } from '@/lib/gps/interpolate';
import { shouldUseSnap } from '@/lib/geo/osrm';
```

Then add this module-level type + helper above the component (near `MarkerState`):

```ts
interface Enrichment {
  snapped: LatLng | null;
  route: { geometry: [number, number][]; distanceKm: number; durationMin: number } | null;
  address: string | null;
}

// Distance (m) a bus must move before we re-query enrichment for it.
const REENRICH_M = 150;

async function fetchEnrichment(
  lat: number,
  lng: number,
  opts: { route: boolean; address: boolean },
): Promise<Enrichment | null> {
  try {
    const qs = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      route: opts.route ? '1' : '0',
      address: opts.address ? '1' : '0',
    });
    const res = await fetch(`/api/admin/track-all/directions?${qs.toString()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success) return null;
    const snapped: LatLng | null =
      json.snapped && shouldUseSnap(json.snapped.snapDistanceM)
        ? { lat: json.snapped.lat, lng: json.snapped.lng }
        : null;
    return { snapped, route: json.route ?? null, address: json.address ?? null };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add the per-bus enrichment cache ref**

Inside the component, next to the other refs (after `hasFitRef`):

```ts
  const enrichRef = useRef<Map<string, { at: LatLng; snapped: LatLng | null }>>(new Map());
```

- [ ] **Step 3: Snap fresh buses inside the data-diff effect**

In the `useEffect([driverLocations])`, after the existing loop that adds/updates markers (right before the removal loop `for (const [id, st] of markersRef.current)`), insert an enrichment pass. It reads `gps_status` off each driver to decide "fresh":

```ts
    // Snap pass — runs AFTER the main loop above (which retargets every marker to
    // the RAW fix each poll). For each fresh bus we (1) re-apply its cached snapped
    // point so the raw retarget doesn't undo it, and (2) (re)fetch a snap when the
    // bus is new or has moved > REENRICH_M. The selected bus's snap is owned by the
    // selection effect (Task 6), which writes the same enrichRef cache.
    for (const d of withLoc) {
      const fresh = d.gps_status === 'online' || d.gps_status === 'recent';
      if (!fresh) continue;
      const here: LatLng = { lat: d.current_latitude, lng: d.current_longitude };
      const prev = enrichRef.current.get(d.id);

      // (1) Keep the marker on its cached snapped point.
      if (prev?.snapped) {
        const st = markersRef.current.get(d.id);
        if (st) st.to = prev.snapped;
      }

      // (2) Non-selected buses: refetch a snap only when new or moved far.
      if (selectedIdRef.current === d.id) continue;
      const movedFar = !prev || haversineMeters(prev.at, here) >= REENRICH_M;
      if (!movedFar) continue;
      enrichRef.current.set(d.id, { at: here, snapped: prev?.snapped ?? null });
      void fetchEnrichment(here.lat, here.lng, { route: false, address: false }).then((e) => {
        if (!e) return;
        enrichRef.current.set(d.id, { at: here, snapped: e.snapped });
        const st = markersRef.current.get(d.id);
        if (st && e.snapped) {
          st.from = { ...st.anim };
          st.to = e.snapped;
          st.start = performance.now();
        }
      });
    }
```

Add the `selectedIdRef` ref near the others (it is also used in Task 6):

```ts
  const selectedIdRef = useRef<string | null>(null);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "live-tracking-map" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 5: Manual verification (user, authenticated browser, with a bus broadcasting)**

Open `/track-all` with at least one bus live (online/recent). Expected: that bus's marker sits on the nearest road; if OSRM is unreachable, the marker stays at the raw fix (no error). The blue accuracy circle stays on the raw GPS point.

- [ ] **Step 6: Commit**

```bash
git add components/live-tracking-map.tsx
git commit -m "$(printf 'feat(track-all): road-snap fresh bus markers via OSRM (guarded)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: Selected-bus route line, address & banner (`live-tracking-map.tsx`)

**Files:**
- Modify: `components/live-tracking-map.tsx`

**Interfaces:**
- Consumes: `fetchEnrichment`, `enrichRef`, `selectedIdRef` (Task 5); `CAMPUS` is not needed client-side (route geometry comes from the endpoint).
- Produces: click-to-select behaviour; a route polyline; a selected-bus info banner.

- [ ] **Step 1: Add React state + refs for selection and the route line**

Add `useState` to the React import at the top:

```ts
import React, { useEffect, useRef, useState } from 'react';
```

Inside the component, add:

```ts
  const [selected, setSelected] = useState<{
    id: string; name: string; route: string | null; address: string | null;
    distanceKm: number | null; durationMin: number | null;
  } | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
```

- [ ] **Step 2: Add a select handler and clear helper**

Add these inside the component (above the `return`):

```ts
  const clearRouteLine = () => {
    routeLineRef.current?.remove();
    routeLineRef.current = null;
  };

  const selectBus = (d: DriverLocation) => {
    selectedIdRef.current = d.id;
    setSelected({
      id: d.id,
      name: d.name,
      route: d.route_name ? `${d.route_number ?? ''} · ${d.route_name}`.trim() : null,
      address: null,
      distanceKm: null,
      durationMin: null,
    });
    void fetchEnrichment(d.current_latitude, d.current_longitude, { route: true, address: true }).then((e) => {
      if (!e || selectedIdRef.current !== d.id) return;
      const map = mapInstanceRef.current;
      if (map && e.route) {
        clearRouteLine();
        routeLineRef.current = L.polyline(e.route.geometry, {
          color: '#2563eb', weight: 5, opacity: 0.85,
        }).addTo(map);
      }
      if (e.snapped) {
        // Cache the snap so Task 5's snap pass keeps this bus on-road each poll.
        enrichRef.current.set(d.id, {
          at: { lat: d.current_latitude, lng: d.current_longitude },
          snapped: e.snapped,
        });
        const st = markersRef.current.get(d.id);
        if (st) { st.from = { ...st.anim }; st.to = e.snapped; st.start = performance.now(); }
      }
      setSelected((prev) => (prev && prev.id === d.id
        ? { ...prev, address: e.address, distanceKm: e.route?.distanceKm ?? null, durationMin: e.route?.durationMin ?? null }
        : prev));
    });
  };

  const clearSelection = () => {
    selectedIdRef.current = null;
    clearRouteLine();
    setSelected(null);
  };
```

- [ ] **Step 3: Wire the click handler on markers**

In the `useEffect([driverLocations])`, where a **new** marker is created (the `else` branch: `const marker = L.marker(...).addTo(map);`), attach a click handler. Change:

```ts
        const marker = L.marker([target.lat, target.lng], { icon }).addTo(map);
        marker.bindPopup(popup);
```

to:

```ts
        const marker = L.marker([target.lat, target.lng], { icon }).addTo(map);
        marker.bindPopup(popup);
        marker.on('click', () => selectBus(d));
```

Because `d` is captured per-iteration, also refresh the handler for **existing** markers so it always points at the latest `d`. In the `if (existing) {` branch, after `existing.marker.setIcon(icon);`, add:

```ts
        existing.marker.off('click');
        existing.marker.on('click', () => selectBus(d));
```

- [ ] **Step 4: Render the selected-bus banner**

In the component's `return`, add the banner inside the outer wrapper `div` (after the `Recenter` button):

```tsx
      {selected && (
        <div
          style={{
            position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
            background: 'white', border: '1px solid #E5E7EB', borderRadius: 10,
            padding: '10px 12px', maxWidth: 320, boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
            <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{selected.name}</div>
            <button
              type="button" onClick={clearSelection} aria-label="Clear selection"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6B7280', fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>
          {selected.route && <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{selected.route}</div>}
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
            📍 {selected.address ?? 'Locating…'}
          </div>
          {(selected.distanceKm != null) && (
            <div style={{ fontSize: 12, color: '#2563eb', marginTop: 4 }}>
              🚌 {selected.distanceKm.toFixed(1)} km to campus
              {selected.durationMin != null ? ` · ~${selected.durationMin} min` : ''}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 5: Clean up the route line on unmount**

In the init `useEffect`'s cleanup `return () => { ... }`, add before `map.remove();`:

```ts
      routeLineRef.current?.remove();
      routeLineRef.current = null;
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "live-tracking-map" ; echo "clean if no lines"`
Expected: no lines.

- [ ] **Step 7: Manual verification (user, authenticated browser, with a bus broadcasting)**

Open `/track-all`, click a live bus. Expected: a blue road-following line from the bus to campus; a bottom-left banner showing the bus name, route, address (after ~1 s), and "X.X km to campus · ~N min"; the × clears the line + banner. If OSRM/Nominatim are down, the marker/dot still shows and the banner reads "Locating…" without breaking the map.

- [ ] **Step 8: Commit**

```bash
git add components/live-tracking-map.tsx
git commit -m "$(printf 'feat(track-all): click-to-route line + address banner for selected bus\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Final verification

- [ ] **Full unit suite:** `npx vitest run lib/geo/` → all green.
- [ ] **Typecheck touched files:** `npx tsc --noEmit 2>&1 | grep -E "lib/geo/(osrm|geocode)|track-all/directions|live-tracking-map" ; echo "clean if no lines"` → no lines.
- [ ] **User smoke test** (authenticated browser, a phone broadcasting): basemap toggle, snapped markers, click → route line + banner with address + distance/ETA, × clears. Confirm the map still renders when OSRM/Nominatim are unreachable (raw dots, no route line).

## Notes / risks (from the spec)

- Public OSRM demo + Nominatim are fine at this volume (on-demand + cached, small live fleet); set `OSRM_BASE_URL` to self-host if the fleet grows.
- Assigned multi-stop route drawing is **out of scope** (0/24 routes, 14/479 stops have coordinates).
- Serverless cache is per-instance — acceptable at this scale.
