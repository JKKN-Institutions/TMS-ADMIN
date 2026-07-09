# Live Tracking — Map Context & Exact Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a campus destination pin, heading arrow, GPS-accuracy circle, distance/ETA-to-campus, and opt-in "distance from you" to the live-tracking maps across all four portals, using only trusted live-GPS + campus data.

**Architecture:** A pure, unit-tested `lib/gps` module (campus constant + bearing/ETA helpers, reusing the existing `haversineMeters`) feeds light enhancements into the two existing Leaflet map components. A shared `BusContextStrip` presentational component renders the distance/ETA/from-you readout across the three rider/driver pages; a page-level `useViewerLocation` hook owns the opt-in device-location request. No map rewrite.

**Tech Stack:** Next.js 16, React 19, TypeScript, Leaflet 1.9 (+ @types/leaflet), Tailwind v4, vitest 4 (node env — no DOM test lib), Supabase service-role reads.

## Global Constraints

- **Test runner:** `npm test` = `vitest run`; tests are co-located `*.test.ts`, imported as `import { describe, it, expect } from 'vitest'`. Only **pure logic** gets vitest (no jsdom/react-testing-library installed). Components/pages/APIs are verified by `npm run type-check` (tsc) + route probes + manual browser checks.
- **ESLint is broken in this repo** (circular config) — never rely on `npm run lint`; verify types with `npm run type-check`.
- **Reuse, do not re-implement:** `haversineMeters(from,to)` and `type LatLng = { lat:number; lng:number }` already exist in `lib/gps/interpolate.ts`. Reuse both.
- **Speed unit:** `tms_vehicle.gps_speed` and `DriverFix.speed` hold `GeolocationCoordinates.speed` in **metres/second**. Convert to km/h with `* 3.6` for any display or ETA.
- **Campus constant:** `CAMPUS = { lat: 11.4444567, lng: 77.730258, label: 'JKKN Campus' }` — the single source of truth (replaces the hardcoded `DEFAULT_CENTER` in the admin map). Product owner to confirm exact gate location later (one-line change).
- **Maps must stay `next/dynamic` with `{ ssr: false }`** — Leaflet touches `window`.
- **Git:** commit only the files each task names (explicit `git add <paths>`, never `-A`). Branch: `feat/live-tracking-map-context`.
- **Forward-compat:** the shared map accepts an optional `stops` prop (pins + dashed polyline) that no page passes yet — for the deferred stop-coordinates phase.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/gps/campus.ts` | `CAMPUS` constant (destination) | 1 |
| `lib/gps/distance.ts` | `haversineKm`, `bearingDeg`, `angleDelta`, `isApproaching`, `etaMinutes` (pure) | 1 |
| `lib/gps/distance.test.ts` | vitest coverage of the above | 1 |
| `app/api/student/location/route.ts` | expose `heading` + `accuracyM` | 2 |
| `app/api/boarding/location/route.ts` | expose `heading` + `accuracyM` | 2 |
| `app/api/driver/location/route.ts` | expose `heading` + `accuracyM` in GET payload | 2 |
| `app/api/admin/track-all/drivers/route.ts` | expose `heading` in result rows | 2 |
| `lib/hooks/use-viewer-location.ts` | opt-in device-geolocation hook | 3 |
| `components/live/bus-context-strip.tsx` | shared distance/ETA/from-you readout (pure presentational) | 4 |
| `components/live-position-map.tsx` | single-marker map: campus/heading/accuracy/viewer/stops | 5 |
| `app/student/live-track/page.tsx` | wire strip + map props | 6 |
| `app/boarding/live-track/page.tsx` | wire strip + map props | 6 |
| `app/driver/location/page.tsx` | campus pin + accuracy circle on own-fix map | 7 |
| `components/live-tracking-map.tsx` | admin multi-marker: campus pin, per-bus accuracy circle + heading pointer, popup distance | 8 |

---

### Task 1: Geo module (campus constant + distance/bearing/ETA helpers)

**Files:**
- Create: `lib/gps/campus.ts`
- Create: `lib/gps/distance.ts`
- Test: `lib/gps/distance.test.ts`

**Interfaces:**
- Consumes: `haversineMeters`, `LatLng` from `lib/gps/interpolate.ts`.
- Produces:
  - `CAMPUS: LatLng & { label: string }`
  - `haversineKm(a: LatLng, b: LatLng): number`
  - `bearingDeg(from: LatLng, to: LatLng): number` — 0–360, clockwise from north
  - `angleDelta(a: number, b: number): number` — smallest angle in [0,180]
  - `isApproaching(headingDeg: number | null, bearingToTargetDeg: number): boolean`
  - `etaMinutes(distanceKm: number, speedKmh: number | null, roadFactor?: number): number | null`

- [ ] **Step 1: Write the failing test**

Create `lib/gps/distance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { haversineKm, bearingDeg, angleDelta, isApproaching, etaMinutes } from './distance';
import { CAMPUS } from './campus';

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(CAMPUS, CAMPUS)).toBeCloseTo(0, 6);
  });
  it('is ~111 km for one degree of latitude', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(110);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(112);
  });
});

describe('bearingDeg', () => {
  it('points ~north (0°) for a due-north target', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 1);
  });
  it('points ~east (90°) for a due-east target', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 1);
  });
  it('points ~south (180°) for a due-south target', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(180, 1);
  });
});

describe('angleDelta', () => {
  it('wraps around 360 (350 vs 10 = 20)', () => {
    expect(angleDelta(350, 10)).toBeCloseTo(20, 6);
  });
  it('is symmetric and <= 180', () => {
    expect(angleDelta(10, 200)).toBeLessThanOrEqual(180);
  });
});

describe('isApproaching', () => {
  it('true when heading is within 90° of the bearing to target', () => {
    expect(isApproaching(0, 45)).toBe(true);
    expect(isApproaching(0, 90)).toBe(true); // boundary inclusive
  });
  it('false when heading points away (>90°)', () => {
    expect(isApproaching(0, 180)).toBe(false);
    expect(isApproaching(0, 91)).toBe(false);
  });
  it('false when heading is unknown', () => {
    expect(isApproaching(null, 45)).toBe(false);
  });
});

describe('etaMinutes', () => {
  it('is null when idle/too slow', () => {
    expect(etaMinutes(10, 0)).toBeNull();
    expect(etaMinutes(10, null)).toBeNull();
  });
  it('applies the road factor (10km @ 30km/h ≈ 26 min)', () => {
    expect(etaMinutes(10, 30)).toBe(26);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/gps/distance.test.ts`
Expected: FAIL — cannot resolve `./distance` / `./campus`.

- [ ] **Step 3: Implement `campus.ts`**

Create `lib/gps/campus.ts`:

```ts
import type { LatLng } from '@/lib/gps/interpolate';

/** The one coordinate we trust: JKKN campus, the shared destination for every route.
 *  Single source of truth (replaces the hardcoded DEFAULT_CENTER in the admin map). */
export const CAMPUS: LatLng & { label: string } = {
  lat: 11.4444567,
  lng: 77.730258,
  label: 'JKKN Campus',
};
```

- [ ] **Step 4: Implement `distance.ts`**

Create `lib/gps/distance.ts`:

```ts
import { haversineMeters, type LatLng } from '@/lib/gps/interpolate';

export type { LatLng };

/** Great-circle distance in kilometres (thin wrapper over the metres helper). */
export function haversineKm(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) / 1000;
}

/** Initial bearing from → to, in degrees clockwise from north, range [0,360). */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest absolute angle between two bearings, in [0,180]. */
export function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** True when `headingDeg` points within ±90° of the bearing to a target. */
export function isApproaching(headingDeg: number | null, bearingToTargetDeg: number): boolean {
  if (headingDeg == null || Number.isNaN(headingDeg)) return false;
  return angleDelta(headingDeg, bearingToTargetDeg) <= 90;
}

/** Below this speed (km/h) the bus is treated as idle and no ETA is estimated. */
const MIN_SPEED_KMH = 3;

/**
 * Deliberately rough ETA in whole minutes, or null when idle/unknown speed.
 * Straight-line distance × roadFactor ÷ speed. Always surfaced to users as "approx"
 * — it does not follow roads and trusts an instantaneous GPS speed.
 */
export function etaMinutes(
  distanceKm: number,
  speedKmh: number | null,
  roadFactor = 1.3,
): number | null {
  if (speedKmh == null || speedKmh < MIN_SPEED_KMH) return null;
  return Math.round(((distanceKm * roadFactor) / speedKmh) * 60);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/gps/distance.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no new errors referencing `lib/gps/campus.ts` or `lib/gps/distance.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/gps/campus.ts lib/gps/distance.ts lib/gps/distance.test.ts
git commit -m "feat(gps): campus constant + distance/bearing/ETA helpers"
```

---

### Task 2: Expose heading + accuracy in the read APIs

**Files:**
- Modify: `app/api/student/location/route.ts`
- Modify: `app/api/boarding/location/route.ts`
- Modify: `app/api/driver/location/route.ts`
- Modify: `app/api/admin/track-all/drivers/route.ts`

**Interfaces:**
- Produces (student/boarding `vehicle` object, driver `routes[].vehicle` object): adds `heading: number | null`, `accuracyM: number | null`.
- Produces (admin result rows): adds `heading: number | null` (accuracy already present as `location_accuracy`).

- [ ] **Step 1: Student API — select the columns**

In `app/api/student/location/route.ts`, extend the vehicle select (currently ends `...gps_speed, last_gps_update, live_tracking_enabled`):

```ts
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, gps_heading, gps_accuracy, last_gps_update, live_tracking_enabled'
        )
```

- [ ] **Step 2: Student API — widen the payload type + fields**

Add `heading` and `accuracyM` to the `vehicle` type annotation and the built object:

```ts
    let vehicle: {
      registrationNumber: string | null;
      model: string | null;
      latitude: number | null;
      longitude: number | null;
      speed: number | null;
      heading: number | null;
      accuracyM: number | null;
      lastUpdate: string | null;
      liveTrackingEnabled: boolean;
      hasFix: boolean;
      status: 'online' | 'recent' | 'offline';
      minutesAgo: number | null;
    } | null = null;
```

and in the `vehicle = { ... }` assignment add, next to `speed: v.gps_speed,`:

```ts
          heading: v.gps_heading,
          accuracyM: v.gps_accuracy,
```

- [ ] **Step 3: Boarding API — same two edits**

Apply the identical `.select(...)` change (Step 1) and the identical type + field additions (Step 2) to `app/api/boarding/location/route.ts` (the vehicle block is byte-identical to student's).

- [ ] **Step 4: Driver API (GET) — same shape**

In `app/api/driver/location/route.ts`, extend the `VehicleRow` type and its select, then the returned object.

`VehicleRow` type — add:
```ts
      gps_heading: number | null;
      gps_accuracy: number | null;
```
Select — change to:
```ts
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, gps_heading, gps_accuracy, last_gps_update, live_tracking_enabled'
        )
```
Returned `vehicle` object — add next to `speed: v.gps_speed,`:
```ts
              heading: v.gps_heading,
              accuracyM: v.gps_accuracy,
```

- [ ] **Step 5: Admin track-all API — expose heading**

In `app/api/admin/track-all/drivers/route.ts`, the `VehRow` already selects `gps_heading`/`gps_accuracy`. In the `result` row object (which already has `location_accuracy: veh?.gps_accuracy ?? null`), add:

```ts
        heading: veh?.gps_heading ?? null,
```

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no new errors in the four route files. (Pages still compile — they ignore the new optional fields until Task 6/7.)

- [ ] **Step 7: (Optional) route probes if a dev server is running**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/student/location`
Expected: `401` or `307` (unauthenticated) — proves the route still builds/serves.

- [ ] **Step 8: Commit**

```bash
git add app/api/student/location/route.ts app/api/boarding/location/route.ts app/api/driver/location/route.ts app/api/admin/track-all/drivers/route.ts
git commit -m "feat(api): expose gps heading + accuracy on live-location reads"
```

---

### Task 3: `useViewerLocation` hook (opt-in device geolocation)

**Files:**
- Create: `lib/hooks/use-viewer-location.ts`

**Interfaces:**
- Consumes: `LatLng` from `lib/gps/interpolate.ts`; `geoErrorMessage`, `GEO_PERMISSION_DENIED` from `lib/driver/geo.ts` (reuse the already-tested messages).
- Produces:
  - `type ViewerLocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported' | 'error'`
  - `useViewerLocation(): { viewer: LatLng | null; status: ViewerLocationStatus; message: string | null; request: () => void }`

- [ ] **Step 1: Implement the hook**

Create `lib/hooks/use-viewer-location.ts`:

```ts
'use client';

import { useCallback, useState } from 'react';
import type { LatLng } from '@/lib/gps/interpolate';
import { GEO_PERMISSION_DENIED, geoErrorMessage } from '@/lib/driver/geo';

export type ViewerLocationStatus =
  | 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported' | 'error';

export interface ViewerLocationState {
  viewer: LatLng | null;
  status: ViewerLocationStatus;
  message: string | null;
  request: () => void;
}

/**
 * One-shot "where am I" for the rider live-track pages. NEVER auto-runs — the page
 * calls `request()` from a button tap so the browser permission prompt is expected,
 * not a surprise. Reuses the driver geolocation error copy (already unit-tested).
 */
export function useViewerLocation(): ViewerLocationState {
  const [viewer, setViewer] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<ViewerLocationStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      setMessage('Your browser does not support location.');
      return;
    }
    setStatus('loading');
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setViewer({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
        setMessage(null);
      },
      (err) => {
        const denied = err.code === GEO_PERMISSION_DENIED;
        setStatus(denied ? 'denied' : 'error');
        setMessage(
          denied
            ? geoErrorMessage(GEO_PERMISSION_DENIED)
            : "Couldn't get your location. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  return { viewer, status, message, request };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors in `lib/hooks/use-viewer-location.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-viewer-location.ts
git commit -m "feat(gps): opt-in useViewerLocation hook for distance-from-you"
```

---

### Task 4: `BusContextStrip` shared readout component

**Files:**
- Create: `components/live/bus-context-strip.tsx`

**Interfaces:**
- Consumes: `CAMPUS`; `haversineKm`, `bearingDeg`, `isApproaching`, `etaMinutes`, `LatLng` from `lib/gps/distance.ts`; `ViewerLocationStatus` from `lib/hooks/use-viewer-location.ts`.
- Produces: `BusContextStrip(props)` where props =
  `{ position: LatLng | null; heading: number | null; speedKmh: number | null; accuracyM: number | null; viewer?: LatLng | null; viewerStatus?: ViewerLocationStatus; viewerMessage?: string | null; onLocateMe?: () => void }`.
  Pure presentational — the page owns the viewer state and passes it down. When `onLocateMe` is omitted, the distance-from-you row is hidden (driver/admin).

- [ ] **Step 1: Implement the component**

Create `components/live/bus-context-strip.tsx`:

```tsx
'use client';

import type { ComponentType } from 'react';
import { School, Navigation2, Clock, Crosshair, Gauge } from 'lucide-react';
import { CAMPUS } from '@/lib/gps/campus';
import { haversineKm, bearingDeg, isApproaching, etaMinutes, type LatLng } from '@/lib/gps/distance';
import type { ViewerLocationStatus } from '@/lib/hooks/use-viewer-location';

interface BusContextStripProps {
  position: LatLng | null;
  heading: number | null;
  speedKmh: number | null;
  accuracyM: number | null;
  viewer?: LatLng | null;
  viewerStatus?: ViewerLocationStatus;
  viewerMessage?: string | null;
  onLocateMe?: () => void;
}

function Chip({
  icon: Icon, label, value,
}: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate font-semibold text-gray-900 tabular-nums dark:text-white">{value}</p>
    </div>
  );
}

/** Distance in a human unit: metres under 1 km, else one-decimal km. */
function fmtKm(n: number): string {
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
}

export function BusContextStrip({
  position, heading, speedKmh, accuracyM,
  viewer, viewerStatus, viewerMessage, onLocateMe,
}: BusContextStripProps) {
  if (!position) return null;
  const distKm = haversineKm(position, CAMPUS);
  const approaching = isApproaching(heading, bearingDeg(position, CAMPUS));
  const eta = approaching ? etaMinutes(distKm, speedKmh) : null;
  const fromMe = viewer ? haversineKm(position, viewer) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Chip icon={School} label="To campus" value={fmtKm(distKm)} />
        <Chip
          icon={Clock}
          label="ETA (approx)"
          value={eta != null ? `~${eta} min` : approaching ? '—' : 'heading away'}
        />
        <Chip icon={Gauge} label="Speed" value={speedKmh != null ? `${Math.round(speedKmh)} km/h` : '—'} />
        <Chip icon={Navigation2} label="GPS accuracy" value={accuracyM != null ? `±${Math.round(accuracyM)} m` : '—'} />
      </div>

      {onLocateMe && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onLocateMe}
            disabled={viewerStatus === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <Crosshair className="h-4 w-4" />
            {viewerStatus === 'loading' ? 'Locating…' : fromMe != null ? 'Update my location' : 'Show distance from me'}
          </button>
          {fromMe != null && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Bus is <span className="tabular-nums">{fmtKm(fromMe)}</span> from you
            </span>
          )}
          {viewerMessage && <span className="text-sm text-amber-600 dark:text-amber-400">{viewerMessage}</span>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors in `components/live/bus-context-strip.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/live/bus-context-strip.tsx
git commit -m "feat(live): BusContextStrip distance/ETA/from-you readout"
```

---

### Task 5: Enhance the shared single-marker map

**Files:**
- Modify: `components/live-position-map.tsx` (full replacement below)

**Interfaces:**
- Consumes: `interpolateLatLng`, `shouldSnap`, `LatLng` from `lib/gps/interpolate.ts`.
- Produces: `LivePositionMap` now accepts optional `heading?`, `accuracyM?`, `destination?: { lat; lng; label? }`, `viewer?: LatLng | null`, `stops?: StopPoint[]`; exports `interface StopPoint { name: string; lat: number; lng: number }`. All new props optional — existing callers unaffected.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `components/live-position-map.tsx` with:

```tsx
'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { interpolateLatLng, shouldSnap, type LatLng } from '@/lib/gps/interpolate';

// Fix Leaflet's default marker icon paths (same CDN icons the admin map uses).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export interface StopPoint {
  name: string;
  lat: number;
  lng: number;
}

interface LivePositionMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  /** Zoom level; 15 ≈ street level. */
  zoom?: number;
  /** Compass heading (deg clockwise from north) — rotates the bus arrow. */
  heading?: number | null;
  /** GPS accuracy in metres — drawn as a translucent circle around the bus. */
  accuracyM?: number | null;
  /** Fixed destination (campus) marker. */
  destination?: { lat: number; lng: number; label?: string } | null;
  /** The viewer's own location ("you are here"). */
  viewer?: LatLng | null;
  /** Optional route stops (future phase — pins + dashed connecting line). */
  stops?: StopPoint[];
}

// Glide slightly under the 5s reader poll so the marker settles just before the next fix.
const GLIDE_MS = 4500;

// Bus marker: SVG arrow-in-circle we rotate to the heading; plain dot when unknown.
function busIcon(heading: number | null | undefined): L.DivIcon {
  const rot = heading == null || Number.isNaN(heading) ? null : heading;
  const glyph = rot == null
    ? `<circle cx="14" cy="14" r="6" fill="#fff"/>`
    : `<path d="M14 5 L20 21 L14 17 L8 21 Z" fill="#fff" transform="rotate(${rot} 14 14)"/>`;
  return L.divIcon({
    className: 'bus-marker',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><svg width="28" height="28" viewBox="0 0 28 28">${glyph}</svg></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function campusIcon(): L.DivIcon {
  return L.divIcon({
    className: 'campus-marker',
    html: `<div style="width:26px;height:26px;border-radius:6px;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;">🎓</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function viewerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'viewer-marker',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.25);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** Single-marker live map. Reused by the driver self-view and the student/boarding
 *  where's-my-bus pages. The bus GLIDES to each new fix; a campus pin, heading arrow,
 *  accuracy circle, "you" marker and (future) route stops layer on top. Always load
 *  via next/dynamic with { ssr: false }. */
const LivePositionMap: React.FC<LivePositionMapProps> = ({
  latitude, longitude, label, zoom = 15,
  heading, accuracyM, destination, viewer, stops,
}) => {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const campusRef = useRef<L.Marker | null>(null);
  const viewerRef = useRef<L.Marker | null>(null);
  const stopsRef = useRef<L.LayerGroup | null>(null);
  const hasFitRef = useRef(false);

  const animPosRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const fromRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const toRef = useRef<LatLng>({ lat: latitude, lng: longitude });
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Initialise once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current).setView([latitude, longitude], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    const marker = L.marker([latitude, longitude], { icon: busIcon(heading) }).addTo(map);
    if (label) marker.bindPopup(label);
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bus glide + icon + accuracy circle.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const target: LatLng = { lat: latitude, lng: longitude };
    marker.setIcon(busIcon(heading));
    if (label) marker.bindPopup(label);

    if (accuracyM != null && accuracyM > 0) {
      if (!accuracyRef.current) {
        accuracyRef.current = L.circle(target, {
          radius: accuracyM, color: '#16a34a', weight: 1, fillColor: '#16a34a', fillOpacity: 0.12,
        }).addTo(map);
      } else {
        accuracyRef.current.setLatLng(target);
        accuracyRef.current.setRadius(accuracyM);
      }
    } else if (accuracyRef.current) {
      accuracyRef.current.remove();
      accuracyRef.current = null;
    }

    // First fix or an implausible jump → place instantly.
    if (shouldSnap(animPosRef.current, target)) {
      animPosRef.current = target;
      fromRef.current = target;
      toRef.current = target;
      marker.setLatLng([target.lat, target.lng]);
      map.panTo([target.lat, target.lng], { animate: true });
      return;
    }

    fromRef.current = { ...animPosRef.current };
    toRef.current = target;
    startRef.current = performance.now();
    map.panTo([target.lat, target.lng], { animate: true });
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const step = () => {
      const t = Math.min(1, (performance.now() - startRef.current) / GLIDE_MS);
      const pos = interpolateLatLng(fromRef.current, toRef.current, t);
      animPosRef.current = pos;
      markerRef.current?.setLatLng([pos.lat, pos.lng]);
      accuracyRef.current?.setLatLng([pos.lat, pos.lng]);
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [latitude, longitude, label, heading, accuracyM]);

  // Campus destination marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (destination) {
      const pos: [number, number] = [destination.lat, destination.lng];
      if (!campusRef.current) {
        campusRef.current = L.marker(pos, { icon: campusIcon() }).addTo(map);
        campusRef.current.bindPopup(destination.label ?? 'Campus');
      } else {
        campusRef.current.setLatLng(pos);
      }
    } else if (campusRef.current) {
      campusRef.current.remove();
      campusRef.current = null;
    }
  }, [destination]);

  // Viewer ("you are here") marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (viewer) {
      const pos: [number, number] = [viewer.lat, viewer.lng];
      if (!viewerRef.current) {
        viewerRef.current = L.marker(pos, { icon: viewerIcon() }).addTo(map);
        viewerRef.current.bindPopup('You are here');
      } else {
        viewerRef.current.setLatLng(pos);
      }
    } else if (viewerRef.current) {
      viewerRef.current.remove();
      viewerRef.current = null;
    }
  }, [viewer]);

  // Optional route stops (future phase): pins + dashed connecting polyline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (stopsRef.current) { stopsRef.current.remove(); stopsRef.current = null; }
    if (stops && stops.length > 0) {
      const group = L.layerGroup();
      const line: [number, number][] = [];
      for (const s of stops) {
        line.push([s.lat, s.lng]);
        L.circleMarker([s.lat, s.lng], {
          radius: 5, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.9, weight: 2,
        }).bindPopup(s.name).addTo(group);
      }
      if (line.length > 1) {
        L.polyline(line, { color: '#7c3aed', weight: 3, opacity: 0.5, dashArray: '6 6' }).addTo(group);
      }
      group.addTo(map);
      stopsRef.current = group;
    }
  }, [stops]);

  // Frame bus + destination (+ viewer) into view ONCE; then leave the user's pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasFitRef.current) return;
    const pts: [number, number][] = [[latitude, longitude]];
    if (destination) pts.push([destination.lat, destination.lng]);
    if (viewer) pts.push([viewer.lat, viewer.lng]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2));
      hasFitRef.current = true;
    }
  }, [latitude, longitude, destination, viewer]);

  return <div ref={elRef} style={{ width: '100%', height: '100%', minHeight: '320px' }} />;
};

export default LivePositionMap;
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors in `components/live-position-map.tsx`. Existing callers (student/boarding/driver) still compile — every new prop is optional.

- [ ] **Step 3: Commit**

```bash
git add components/live-position-map.tsx
git commit -m "feat(live): campus pin, heading arrow, accuracy circle, viewer + stops on single-marker map"
```

---

### Task 6: Wire the student + boarding pages

**Files:**
- Modify: `app/student/live-track/page.tsx`
- Modify: `app/boarding/live-track/page.tsx`

**Interfaces:**
- Consumes: `LivePositionMap` (new props), `BusContextStrip`, `useViewerLocation`, `CAMPUS`.
- The API `vehicle` object now carries `heading` + `accuracyM` (Task 2).

- [ ] **Step 1: Student — widen the Vehicle interface**

In `app/student/live-track/page.tsx`, add to `interface Vehicle` (after `speed: number | null;`):

```ts
  heading: number | null;
  accuracyM: number | null;
```

- [ ] **Step 2: Student — imports + hook**

Add imports near the top:

```ts
import { BusContextStrip } from '@/components/live/bus-context-strip';
import { useViewerLocation } from '@/lib/hooks/use-viewer-location';
import { CAMPUS } from '@/lib/gps/campus';
```

Inside `StudentLiveTrackPage`, right after the `useQuery({...})` call, add:

```ts
  const { viewer, status: viewerStatus, message: viewerMessage, request: onLocateMe } = useViewerLocation();
```

- [ ] **Step 3: Student — pass props to the map + swap the stat grid for the strip**

Replace this block:

```tsx
              <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <LivePositionMap
                  latitude={v.latitude as number}
                  longitude={v.longitude as number}
                  label={`Bus ${v.registrationNumber ?? ''}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat icon={Navigation} label="Coordinates" value={`${v.latitude}, ${v.longitude}`} />
                <Stat icon={Gauge} label="Speed" value={v.speed != null ? `${v.speed} km/h` : '—'} />
                <Stat icon={Clock} label="Last update" value={formatUpdated(v.lastUpdate)} />
              </div>
```

with:

```tsx
              <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <LivePositionMap
                  latitude={v.latitude as number}
                  longitude={v.longitude as number}
                  label={`Bus ${v.registrationNumber ?? ''}`}
                  heading={v.heading}
                  accuracyM={v.accuracyM}
                  destination={CAMPUS}
                  viewer={viewer}
                />
              </div>

              <BusContextStrip
                position={{ lat: v.latitude as number, lng: v.longitude as number }}
                heading={v.heading}
                speedKmh={v.speed != null ? v.speed * 3.6 : null}
                accuracyM={v.accuracyM}
                viewer={viewer}
                viewerStatus={viewerStatus}
                viewerMessage={viewerMessage}
                onLocateMe={onLocateMe}
              />

              <p className="text-xs text-gray-500 dark:text-gray-400">Last update: {formatUpdated(v.lastUpdate)}</p>
```

> Note: `v.speed * 3.6` converts the stored m/s GPS speed to km/h (see Global Constraints). The old grid mislabelled raw m/s as "km/h".

- [ ] **Step 4: Student — delete the now-dead code**

The removed stat grid was the only user of the local `Stat` component and the `Navigation`, `Gauge`, `Clock` icons. `tsconfig` has no `noUnusedLocals` and ESLint is broken, so these will NOT error — but leave no dead code. Do both:
1. Delete the entire local `function Stat(...) { ... }` definition.
2. Remove `Navigation`, `Gauge`, `Clock` from the `lucide-react` import (keep `Bus, MapPin, AlertTriangle, Route as RouteIcon`). Keep `formatUpdated` — the new "Last update" line still uses it.

- [ ] **Step 5: Boarding — apply the identical five edits**

Repeat Steps 1–4 in `app/boarding/live-track/page.tsx`. The `Vehicle` interface, the map block, and the stat grid are byte-identical to the student page; the only structural difference is the component name `BoardingLiveTrackPage` and the query key — leave those. Use the same replacement blocks from Steps 1–3 verbatim.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no errors. If tsc reports unused `Stat`/`Navigation`/`Gauge`, remove them.

- [ ] **Step 7: Commit**

```bash
git add app/student/live-track/page.tsx app/boarding/live-track/page.tsx
git commit -m "feat(live): campus context strip + map context on student & boarding track pages"
```

---

### Task 7: Driver own-fix map — campus pin + accuracy circle

**Files:**
- Modify: `app/driver/location/page.tsx`

**Interfaces:**
- Consumes: `CAMPUS`; `LivePositionMap` new props. `DriverFix` has `lat/lng/accuracy/speed` (no heading), so heading is passed as `null` (upright bus). Riders-only strip is NOT added here.

- [ ] **Step 1: Import CAMPUS**

In `app/driver/location/page.tsx`, add:

```ts
import { CAMPUS } from '@/lib/gps/campus';
```

- [ ] **Step 2: Pass destination + accuracy to the own-fix map**

Replace:

```tsx
              {fix && (
                <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                  <LivePositionMap latitude={fix.lat} longitude={fix.lng} label="You are here" />
                </div>
              )}
```

with:

```tsx
              {fix && (
                <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                  <LivePositionMap
                    latitude={fix.lat}
                    longitude={fix.lng}
                    label="You are here"
                    accuracyM={fix.accuracy}
                    destination={CAMPUS}
                  />
                </div>
              )}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors in `app/driver/location/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/driver/location/page.tsx
git commit -m "feat(live): campus pin + accuracy circle on driver own-fix map"
```

---

### Task 8: Admin Track-All map — campus pin, accuracy circles, heading, popup distance

**Files:**
- Modify: `components/live-tracking-map.tsx`

**Interfaces:**
- Consumes: `CAMPUS`; `haversineKm` from `lib/gps/distance.ts`; the admin API now returns `heading` per row (Task 2).
- Produces: `DriverLocation` interface gains `heading?: number | null`.

- [ ] **Step 1: Imports + interface field**

At the top of `components/live-tracking-map.tsx`, add imports:

```ts
import { CAMPUS } from '@/lib/gps/campus';
import { haversineKm } from '@/lib/gps/distance';
```

Add to `interface DriverLocation` (after `time_since_update?: number | null;`):

```ts
  heading?: number | null;
```

- [ ] **Step 2: Add heading to the marker icon**

Replace `createCustomIcon` with a version that overlays a rotated pointer (route number stays upright):

```ts
function createCustomIcon(
  status: string, isActive: boolean, routeNumber: string | null, heading: number | null | undefined,
): L.DivIcon {
  const color = isActive ? STATUS_COLORS[status] || STATUS_COLORS.inactive : STATUS_COLORS.inactive;
  const displayText = routeNumber || '?';
  const pointer = heading == null || Number.isNaN(heading)
    ? ''
    : `<div style="position:absolute;inset:0;transform:rotate(${heading}deg);">
         <div style="position:absolute;top:-6px;left:50%;margin-left:-4px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid ${color};"></div>
       </div>`;
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position:relative;width:30px;height:30px;">
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

- [ ] **Step 3: Add distance-to-campus to the popup**

In `buildPopup`, add a distance line. Right before the closing coordinates block (`<div style="margin-top: 8px; ...`), insert:

```ts
        <div style="margin-bottom: 6px;"><strong>To campus:</strong> ${
          driver.current_latitude != null && driver.current_longitude != null
            ? `${haversineKm({ lat: driver.current_latitude, lng: driver.current_longitude }, CAMPUS).toFixed(1)} km`
            : '—'
        }</div>
```

- [ ] **Step 4: Track an accuracy circle per driver**

Extend `MarkerState`:

```ts
interface MarkerState {
  marker: L.Marker;
  circle: L.Circle | null;
  anim: LatLng;
  from: LatLng;
  to: LatLng;
  start: number;
}
```

In the init effect, add the campus marker once after the tile layer:

```ts
    L.marker([CAMPUS.lat, CAMPUS.lng], {
      icon: L.divIcon({
        className: 'campus-marker',
        html: `<div style="width:26px;height:26px;border-radius:6px;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;">🎓</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      }),
    }).addTo(map).bindPopup(CAMPUS.label);
```

In the diff effect, update the icon call to pass heading and manage the circle. Replace the `const icon = createCustomIcon(...)` line with:

```ts
      const icon = createCustomIcon(d.gps_status || 'offline', d.location_sharing_enabled, d.route_number, d.heading);
```

In the `if (existing) { ... }` branch, after `existing.marker.setIcon(icon);` add circle upkeep:

```ts
        if (d.location_accuracy != null && d.location_accuracy > 0) {
          if (!existing.circle) {
            existing.circle = L.circle(target, { radius: d.location_accuracy, color: '#3B82F6', weight: 1, fillColor: '#3B82F6', fillOpacity: 0.1 }).addTo(map);
          } else {
            existing.circle.setLatLng(target);
            existing.circle.setRadius(d.location_accuracy);
          }
        } else if (existing.circle) {
          existing.circle.remove();
          existing.circle = null;
        }
```

In the `else { ... }` (new marker) branch, set `circle` when creating the `MarkerState`:

```ts
        const circle = d.location_accuracy != null && d.location_accuracy > 0
          ? L.circle([target.lat, target.lng], { radius: d.location_accuracy, color: '#3B82F6', weight: 1, fillColor: '#3B82F6', fillOpacity: 0.1 }).addTo(map)
          : null;
        markersRef.current.set(d.id, {
          marker, circle, anim: target, from: target, to: target, start: performance.now(),
        });
```

In the removal loop (`if (!seen.has(id))`), also remove the circle:

```ts
      if (!seen.has(id)) {
        st.marker.remove();
        st.circle?.remove();
        markersRef.current.delete(id);
      }
```

In the shared `stepAll` glide loop, keep the circle under the marker:

```ts
      for (const st of markersRef.current.values()) {
        const t = Math.min(1, (now - st.start) / GLIDE_MS);
        const pos = interpolateLatLng(st.from, st.to, t);
        st.anim = pos;
        st.marker.setLatLng([pos.lat, pos.lng]);
        st.circle?.setLatLng([pos.lat, pos.lng]);
      }
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no new errors in `components/live-tracking-map.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/live-tracking-map.tsx
git commit -m "feat(live): campus pin, per-bus accuracy circle + heading pointer, popup distance on admin map"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `npm test`
Expected: all suites pass, including the new `lib/gps/distance.test.ts`.

- [ ] **Step 2: Type-check whole project**

Run: `npm run type-check`
Expected: no errors introduced by this branch (compare against pre-branch baseline — any pre-existing errors are unrelated).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; the four map/track pages compile (the maps are `ssr:false` dynamic imports).

- [ ] **Step 4: Manual smoke checklist (product owner, authenticated browser)**

The agent's Chrome is unauthenticated (proxy gates all routes), so the product owner verifies live:

- Student `/student/live-track`: campus 🎓 pin visible; bus arrow rotates with heading; green accuracy circle; "To campus" + "ETA (approx)" chips; "Show distance from me" prompts for location then shows "Bus is ~X km from you".
- Boarding `/boarding/live-track`: same as student, scoped to the assigned route.
- Driver `/driver/location`: campus pin + accuracy circle on the "You are here" map while on duty.
- Admin `/track-all`: campus pin; each bus shows a heading pointer + blue accuracy circle; popup shows "To campus: X km".
- Evening / idle bus: ETA chip reads "heading away" or "—", never a misleading time.

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -- <only files you changed>
git commit -m "chore(live): verification cleanup"
```

---

## Notes / deferred

- **Stop coordinates** remain deferred (479 stops, 14 wrong). The map's `stops` prop + `StopPoint` type are ready; a future phase populates `tms_route_stop.latitude/longitude` (admin map-picker or verified geocode) and passes `stops` from the page.
- **Speed unit** is assumed m/s (driver-app `GeolocationCoordinates.speed`). If a Mercyda GPS provider later writes km/h into `gps_speed`, the ETA/speed conversion needs a per-provider branch.
- **Campus constant** location to be confirmed by the product owner.
