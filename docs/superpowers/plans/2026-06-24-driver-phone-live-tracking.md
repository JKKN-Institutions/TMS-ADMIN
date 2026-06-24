# Driver-Phone Live Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a driver broadcast their phone's GPS from the driver portal, and show that live position on the admin Track-All map, the driver's own page, and a new student "where's my bus" page.

**Architecture:** One ingest, three readers. The driver's phone streams `watchPosition` fixes to `POST /api/driver/location`, which writes the cached fix onto the assigned route's `tms_vehicle` row (+ a `gps_location_history` ping). The vehicle row is the shared join point, so the existing driver page, the repointed admin map, and the new student page all read the same `tms_` plane. Foreground capture only; consumers poll.

**Tech Stack:** Next.js 15 (App Router, route handlers), Supabase (service-role writes, `user_has_permission` RPC), React Query, Leaflet + OpenStreetMap, TypeScript, Tailwind.

## Global Constraints

- **Storage plane = `tms_`.** Write `tms_vehicle.current_latitude/current_longitude/gps_speed/gps_heading/gps_accuracy/last_gps_update`, set `live_tracking_enabled=true`, `gps_provider='driver_app'`; append to `gps_location_history`. The legacy `drivers`/`routes`/`vehicles` tables **were dropped — never query them.**
- **Write permission:** `TMS_PERMISSIONS.TRACKING_SHARE` (`'tms.tracking.share'`), already defined at `lib/constants/tms-permissions.ts:40`. Driver self-reads use `DRIVER_SELF_VIEW`; student reads use `PASSENGER_SELF_VIEW`.
- **Driver identity:** `getDriverForUser(auth)` → `DriverRow { id, staff_id, assigned_route_id, ... }` (`lib/driver/identity.ts`). Routes: `getDriverRoutes(staffId, assignedRouteId, svc?)` → `DriverRoute[]` with `id`, `label`, `vehicleId` (`lib/driver/routes.ts`).
- **Student identity:** `getLearnerRowForUser(auth)` → `LearnerRow { transport_route_id, transport_stop_id, ... }` (`lib/student/identity.ts`).
- **Auth wrapper:** `withAuth((request, auth) => ...)` (`lib/api/with-auth.ts`); `AuthContext { userId, email, userRole, isSuperAdmin, supabase }`. The `requirePerm` helper is **defined locally inside each route file** (copy-pasted), running on `auth.supabase`.
- **Service-role client:** `createServiceRoleClient()` from `@/lib/supabase/server` (bypasses RLS).
- **Freshness thresholds:** online ≤ 2 min, recent ≤ 5 min, else offline (shared helper, Task 1).
- **Response shape:** success → `{ success: true, data: ... }` (admin Track-All keeps its legacy `{ success, drivers, total, ... }` shape); failure → `{ error: '...' }` + status.
- **Audit:** call `logActivity(auth, request, entry)` (`lib/activity/log.ts`) only on the on-duty / off-duty **transitions** (never per ping — pings fire every ~12 s).
- **Verification (no unit-test runner; ESLint is broken project-wide):** this project has no Jest/Vitest, and `npm run lint` crashes (circular config). Per project convention, verify each task with **`npx tsc --noEmit`** (check the touched files have no new errors), **route probes** with `curl` against `npm run dev` on `http://localhost:3000` (an unauthenticated agent gets `401`/`307` — that proves the route exists and is gated), and **Supabase SQL** checks for DB writes. A true end-to-end test requires a driver login on a phone (HTTPS) and is confirmed by the user. This is a deliberate, project-aligned deviation from TDD.
- **Migrations:** write the file under `supabase/migrations/`, apply with the Supabase MCP `apply_migration`, then commit the file.
- **Commits:** one per task; end the message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Stage only the files the task touched (the working tree has unrelated in-progress driver work — never `git add -A`).

---

### Task 0: Schema & permission migration

**Files:**
- Create: `supabase/migrations/20260624090000_driver_phone_live_tracking.sql`

**Interfaces:**
- Produces: columns `tms_driver.active_route_id uuid`, `tms_driver.location_sharing_started_at timestamptz`, `gps_location_history.source text`; the `driver` role gains permission `tms.tracking.share`. Consumed by every later task.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260624090000_driver_phone_live_tracking.sql`:

```sql
-- Driver-phone live tracking: duty-session state on tms_driver, a source marker on the
-- ping log, and the share permission for the driver role.
-- Spec: docs/superpowers/specs/2026-06-24-driver-phone-live-tracking-design.md

-- 1. Duty-session state. active_route_id follows the loose-ref convention used by
--    tms_route.driver_id / tms_driver.assigned_route_id (plain uuid, no FK).
alter table public.tms_driver
  add column if not exists active_route_id uuid,
  add column if not exists location_sharing_started_at timestamptz;

-- 2. Distinguish a phone fix from a hardware/Mercyda device fix on the ping log.
alter table public.gps_location_history
  add column if not exists source text;

-- 3. Grant the (already-defined-but-unapplied) share permission to the driver role.
--    Permissions live in custom_roles.permissions JSONB keyed by role_key; merging the
--    single 'driver' row grants every profiles.role='driver' user (user_has_permission
--    falls back to profiles.role = role_key). Additive + idempotent.
update public.custom_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
      'tms.tracking.share', true
    ),
    updated_at = now()
where role_key = 'driver';
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP tool `apply_migration` with name `driver_phone_live_tracking` and the SQL above (same project the app uses, `kvizhngldtiuufknvehv`).

- [ ] **Step 3: Verify columns + permission landed**

Run this with the Supabase MCP `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
     where table_name='tms_driver' and column_name in ('active_route_id','location_sharing_started_at')) as driver_cols,   -- expect 2
  (select count(*) from information_schema.columns
     where table_name='gps_location_history' and column_name='source') as history_source_col,                              -- expect 1
  (select (permissions ? 'tms.tracking.share') from public.custom_roles where role_key='driver') as driver_has_share;      -- expect true
```
Expected: `driver_cols=2`, `history_source_col=1`, `driver_has_share=true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260624090000_driver_phone_live_tracking.sql
git commit -m "feat(tracking): add driver duty-session columns + grant tms.tracking.share

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Shared GPS freshness helper

**Files:**
- Create: `lib/gps/freshness.ts`

**Interfaces:**
- Produces: `gpsFreshness(lastUpdate: string | null | undefined): { status: 'online'|'recent'|'offline'; minutes: number | null }`. Consumed by Tasks 5 (admin) and 6 (student).

- [ ] **Step 1: Write the helper**

Create `lib/gps/freshness.ts`:

```ts
export type GpsStatus = 'online' | 'recent' | 'offline';

export interface GpsFreshness {
  status: GpsStatus;
  /** Whole minutes since the fix, or null when there is no usable timestamp. */
  minutes: number | null;
}

/**
 * Shared online/recent/offline classification so every live-tracking reader
 * (admin Track-All, driver self, student where's-my-bus) agrees on thresholds:
 * online ≤ 2 min, recent ≤ 5 min, else offline.
 */
export function gpsFreshness(lastUpdate: string | null | undefined): GpsFreshness {
  if (!lastUpdate) return { status: 'offline', minutes: null };
  const t = new Date(lastUpdate).getTime();
  if (Number.isNaN(t)) return { status: 'offline', minutes: null };
  const minutes = Math.floor((Date.now() - t) / 60000);
  if (minutes <= 2) return { status: 'online', minutes };
  if (minutes <= 5) return { status: 'recent', minutes };
  return { status: 'offline', minutes };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `lib/gps/freshness.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/gps/freshness.ts
git commit -m "feat(tracking): add shared gpsFreshness helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Ingest API — POST + DELETE on /api/driver/location

**Files:**
- Modify (full rewrite): `app/api/driver/location/route.ts`

**Interfaces:**
- Consumes: `getDriverForUser`, `getDriverRoutes`, `createServiceRoleClient`, `logActivity`, `TMS_PERMISSIONS.TRACKING_SHARE`.
- Produces: `POST /api/driver/location` body `{ routeId: string, latitude: number, longitude: number, speed?, heading?, accuracy? }` → `{ success: true, data: { accepted: true } }`; `DELETE /api/driver/location` → `{ success: true }`. The existing `GET` is preserved unchanged. Consumed by Task 4 (driver page).

- [ ] **Step 1: Rewrite the route file (keep GET, add POST + DELETE)**

Replace the entire contents of `app/api/driver/location/route.ts` with:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** GET /api/driver/location — last-known GPS fix of the vehicle on each of the driver's
 *  route(s). Read-only "where's my bus"; vehicles with no live fix return null coords. */
async function getLocation(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id);
    const vehicleIds = [...new Set(routes.map((r) => r.vehicleId).filter(Boolean))] as string[];

    type VehicleRow = {
      id: string;
      registration_number: string | null;
      model: string | null;
      current_latitude: number | null;
      current_longitude: number | null;
      gps_speed: number | null;
      last_gps_update: string | null;
      live_tracking_enabled: boolean | null;
    };
    const vmap = new Map<string, VehicleRow>();
    if (vehicleIds.length > 0) {
      const svc = createServiceRoleClient();
      const vres = await svc
        .from('tms_vehicle')
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, last_gps_update, live_tracking_enabled'
        )
        .in('id', vehicleIds);
      for (const v of (vres.data ?? []) as VehicleRow[]) vmap.set(v.id, v);
    }

    const data = routes.map((r) => {
      const v = r.vehicleId ? vmap.get(r.vehicleId) : undefined;
      const hasFix = !!v && v.current_latitude != null && v.current_longitude != null;
      return {
        id: r.id,
        label: r.label,
        vehicle: v
          ? {
              registrationNumber: v.registration_number,
              model: v.model,
              latitude: v.current_latitude,
              longitude: v.current_longitude,
              speed: v.gps_speed,
              lastUpdate: v.last_gps_update,
              liveTrackingEnabled: !!v.live_tracking_enabled,
              hasFix,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, data: { routes: data } });
  } catch (e) {
    console.error('driver/location GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface PingBody {
  routeId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  speed?: unknown;
  heading?: unknown;
  accuracy?: unknown;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** POST /api/driver/location — the driver's phone broadcasts a GPS fix for the route it
 *  is actively driving. Updates the vehicle's cached fix + appends a ping row. */
async function postLocation(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_SHARE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as PingBody | null;
    const routeId = typeof body?.routeId === 'string' ? body.routeId : null;
    const latitude = num(body?.latitude);
    const longitude = num(body?.longitude);
    if (!routeId || latitude === null || longitude === null) {
      return NextResponse.json({ error: 'routeId, latitude, longitude are required' }, { status: 400 });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 });
    }
    const speed = num(body?.speed);
    const heading = num(body?.heading);
    const accuracy = num(body?.accuracy);

    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const svc = createServiceRoleClient();
    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const route = routes.find((r) => r.id === routeId);
    if (!route) {
      return NextResponse.json({ error: 'Route not assigned to this driver' }, { status: 403 });
    }
    if (!route.vehicleId) {
      return NextResponse.json({ error: 'No vehicle assigned to this route' }, { status: 422 });
    }

    const nowIso = new Date().toISOString();

    await svc
      .from('tms_vehicle')
      .update({
        current_latitude: latitude,
        current_longitude: longitude,
        gps_speed: speed,
        gps_heading: heading,
        gps_accuracy: accuracy,
        last_gps_update: nowIso,
        live_tracking_enabled: true,
        gps_provider: 'driver_app',
      })
      .eq('id', route.vehicleId);

    await svc.from('gps_location_history').insert({
      vehicle_id: route.vehicleId,
      latitude,
      longitude,
      speed,
      heading,
      accuracy,
      source: 'driver_app',
      timestamp: nowIso,
    });

    await svc
      .from('tms_driver')
      .update({ location_sharing_enabled: true, active_route_id: routeId })
      .eq('id', drv.id);

    // Stamp session start + audit ONLY on the on-duty transition (started_at was null),
    // so the every-12s pings don't spam the activity log.
    const { data: started } = await svc
      .from('tms_driver')
      .update({ location_sharing_started_at: nowIso })
      .eq('id', drv.id)
      .is('location_sharing_started_at', null)
      .select('id');

    if (started && started.length > 0) {
      await logActivity(auth, request, {
        module: 'drivers',
        action: 'activate',
        entityType: 'tms_driver',
        entityId: drv.id,
        entityLabel: route.label,
        description: `Driver started live location sharing on route ${route.label}`,
        metadata: { routeId, vehicleId: route.vehicleId },
      });
    }

    return NextResponse.json({ success: true, data: { accepted: true } });
  } catch (e) {
    console.error('driver/location POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/driver/location — driver goes off duty; stop broadcasting and mark the
 *  driver's route vehicles not-live (the last fix remains but ages out of "online"). */
async function stopLocation(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_SHARE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const drv = await getDriverForUser(auth);
    if (!drv) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }
    const svc = createServiceRoleClient();

    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const vehicleIds = [...new Set(routes.map((r) => r.vehicleId).filter(Boolean))] as string[];
    if (vehicleIds.length > 0) {
      await svc.from('tms_vehicle').update({ live_tracking_enabled: false }).in('id', vehicleIds);
    }

    await svc
      .from('tms_driver')
      .update({ location_sharing_enabled: false, active_route_id: null, location_sharing_started_at: null })
      .eq('id', drv.id);

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'deactivate',
      entityType: 'tms_driver',
      entityId: drv.id,
      description: 'Driver stopped live location sharing',
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('driver/location DELETE error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getLocation(request, auth));
export const POST = withAuth((request, auth) => postLocation(request, auth));
export const DELETE = withAuth((request, auth) => stopLocation(request, auth));
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/api/driver/location/route.ts`.

- [ ] **Step 3: Probe the route is gated (dev server running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/driver/location -H "Content-Type: application/json" -d '{}'`
Expected: `401` (unauthenticated — proves the POST handler exists and `withAuth` gates it). A `405` would mean the export is missing; a `404` means a path typo.

- [ ] **Step 4: Commit**

```bash
git add app/api/driver/location/route.ts
git commit -m "feat(tracking): ingest driver-phone GPS via POST/DELETE /api/driver/location

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Shared single-marker Leaflet map component

**Files:**
- Create: `components/live-position-map.tsx`

**Interfaces:**
- Produces: default export `LivePositionMap` — props `{ latitude: number; longitude: number; label?: string; zoom?: number }`. Must be loaded via `next/dynamic` with `{ ssr: false }`. Consumed by Tasks 4 (driver) and 7 (student).

- [ ] **Step 1: Write the component**

Create `components/live-position-map.tsx` (mirrors the Leaflet setup in `components/live-tracking-map.tsx` but renders a single, movable marker):

```tsx
'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default marker icon paths (same CDN icons the admin map uses).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LivePositionMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  /** Zoom level; 15 ≈ street level. */
  zoom?: number;
}

/** Minimal single-marker live map. Reused by the driver self-view and the student
 *  where's-my-bus page. Always load via next/dynamic with { ssr: false }. */
const LivePositionMap: React.FC<LivePositionMapProps> = ({ latitude, longitude, label, zoom = 15 }) => {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialise once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current).setView([latitude, longitude], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    const marker = L.marker([latitude, longitude]).addTo(map);
    if (label) marker.bindPopup(label);
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Initialise with the first coords only; updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move marker + recentre when coords change.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([latitude, longitude]);
    if (label) markerRef.current.bindPopup(label);
    mapRef.current.panTo([latitude, longitude]);
  }, [latitude, longitude, label]);

  return <div ref={elRef} style={{ width: '100%', height: '100%', minHeight: '320px' }} />;
};

export default LivePositionMap;
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `components/live-position-map.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/live-position-map.tsx
git commit -m "feat(tracking): add reusable single-marker LivePositionMap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Driver capture UI — "Go On Duty" broadcasting

**Files:**
- Modify (full rewrite): `app/driver/location/page.tsx`

**Interfaces:**
- Consumes: `GET /api/driver/location` (route list + where's-my-bus), `POST`/`DELETE /api/driver/location` (Task 2), `LivePositionMap` (Task 3), `Spinner`/`NoticeCard`/`PageHeader` from `@/components/driver/ui`.
- Produces: the driver-facing broadcasting screen. No exports other than the default page.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `app/driver/location/page.tsx` with:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  MapPin, Navigation, AlertTriangle, Gauge, Clock, Bus, Radio, Crosshair,
} from 'lucide-react';
import { Spinner, NoticeCard, PageHeader } from '@/components/driver/ui';
import { cn } from '@/lib/utils';

const LivePositionMap = dynamic(() => import('@/components/live-position-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

interface VehicleLocation {
  registrationNumber: string | null;
  model: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  lastUpdate: string | null;
  liveTrackingEnabled: boolean;
  hasFix: boolean;
}
interface RouteLocation {
  id: string;
  label: string;
  vehicle: VehicleLocation | null;
}
type Resp = { data?: { routes: RouteLocation[] }; notFound?: boolean };

async function fetchLocation(): Promise<Resp> {
  const res = await fetch('/api/driver/location', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load location');
  return { data: (await res.json()).data as { routes: RouteLocation[] } };
}

function formatUpdated(ts: string | null): string {
  if (!ts) return 'never';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

const SEND_INTERVAL_MS = 12000;

// Loose WakeLock typing (not in older TS DOM libs).
type WakeLock = { release: () => Promise<void> } | null;

function LiveStat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
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

export default function DriverLocationPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-location'],
    queryFn: fetchLocation,
    refetchInterval: 15000,
  });
  const routes = data?.data?.routes ?? [];

  const [onDuty, setOnDuty] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number | null; speed: number | null } | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestFixRef = useRef<GeolocationPosition | null>(null);
  const wakeLockRef = useRef<WakeLock>(null);
  const selectedRouteRef = useRef<string | null>(null);

  // Default the active route to the first one once routes load.
  useEffect(() => {
    if (!selectedRouteId && routes.length > 0) setSelectedRouteId(routes[0].id);
  }, [routes, selectedRouteId]);
  useEffect(() => {
    selectedRouteRef.current = selectedRouteId;
  }, [selectedRouteId]);

  const sendPing = useCallback(async () => {
    const pos = latestFixRef.current;
    const routeId = selectedRouteRef.current;
    if (!pos || !routeId) return;
    try {
      const res = await fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          routeId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
        }),
      });
      if (res.ok) setLastSentAt(Date.now());
    } catch {
      /* transient network error — the next tick retries */
    }
  }, []);

  const stopSharing = useCallback(async (notifyServer: boolean) => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null;
    }
    latestFixRef.current = null;
    setOnDuty(false);
    setFix(null);
    setLastSentAt(null);
    if (notifyServer) {
      try {
        await fetch('/api/driver/location', { method: 'DELETE', credentials: 'same-origin', keepalive: true });
      } catch {
        /* ignore */
      }
    }
  }, []);

  const startSharing = useCallback(async () => {
    setGeoError(null);
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError('Geolocation is not available on this device or browser.');
      return;
    }
    if (!selectedRouteRef.current) {
      setGeoError('Select the route you are driving first.');
      return;
    }

    // Best-effort screen wake lock (silently ignored where unsupported).
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
      wakeLockRef.current = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      /* unsupported or denied — fine, capture still works while visible */
    }

    const onPos = (pos: GeolocationPosition) => {
      latestFixRef.current = pos;
      setFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
      });
    };
    const onErr = (err: GeolocationPositionError) => {
      setGeoError(
        err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Enable it for this site in your browser settings, then try again.'
          : 'Could not read your location. Make sure GPS/location is turned on.'
      );
      void stopSharing(false);
    };

    const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 };
    // Immediate fix (prompts permission) + send right away, then stream.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPos(pos);
        void sendPing();
      },
      onErr,
      opts
    );
    watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, opts);
    intervalRef.current = setInterval(() => {
      void sendPing();
    }, SEND_INTERVAL_MS);
    setOnDuty(true);
  }, [sendPing, stopSharing]);

  // Stop + notify server if the page unmounts while on duty.
  useEffect(() => {
    return () => {
      void stopSharing(true);
    };
  }, [stopSharing]);

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load live location"
        body="Something went wrong loading your routes. Please refresh or try again shortly."
      />
    );
  }
  if (data?.notFound) {
    return (
      <NoticeCard
        tone="amber"
        icon={AlertTriangle}
        title="Driver profile not found"
        body="We couldn't find a driver record linked to your account. Please contact the transport office."
      />
    );
  }
  if (routes.length === 0) {
    return (
      <NoticeCard
        tone="amber"
        icon={MapPin}
        title="No routes assigned"
        body="You have no routes assigned yet, so there's nothing to broadcast."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Location"
        subtitle="Share your phone's GPS while driving so admins and students can track the bus."
      />

      {/* Broadcast control */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <Radio className={cn('h-5 w-5', onDuty ? 'text-green-600 dark:text-green-400' : 'text-gray-400')} />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Broadcast my location</h2>
        </div>

        <div className="space-y-4 px-6 py-5">
          {routes.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Route you are driving</span>
              <select
                value={selectedRouteId ?? ''}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                disabled={onDuty}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {geoError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{geoError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => (onDuty ? void stopSharing(true) : void startSharing())}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 sm:w-auto',
              onDuty ? 'bg-gradient-to-br from-red-600 to-rose-600' : 'bg-gradient-to-br from-green-600 to-emerald-600'
            )}
          >
            <Crosshair className="h-4 w-4" />
            {onDuty ? 'Go Off Duty (stop sharing)' : 'Go On Duty (share my location)'}
          </button>

          {onDuty && (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 ring-1 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                </span>
                Sharing live
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <LiveStat
                  icon={Navigation}
                  label="Position"
                  value={fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : 'acquiring…'}
                />
                <LiveStat icon={Gauge} label="Accuracy" value={fix?.accuracy != null ? `±${Math.round(fix.accuracy)} m` : '—'} />
                <LiveStat
                  icon={Clock}
                  label="Last sent"
                  value={lastSentAt ? `${Math.max(0, Math.round((Date.now() - lastSentAt) / 1000))}s ago` : '—'}
                />
              </div>

              {fix && (
                <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                  <LivePositionMap latitude={fix.lat} longitude={fix.lng} label="You are here" />
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Keep this page open with the screen on while driving. Sharing pauses if you switch apps or the screen
            locks — that's a limitation of web browsers.
          </p>
        </div>
      </section>

      {/* Where's my bus — last-known vehicle fix per route */}
      {routes.map((r) => {
        const v = r.vehicle;
        return (
          <section
            key={r.id}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{r.label}</h2>
              </div>
              {v && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Bus className="h-3.5 w-3.5" />
                  {v.registrationNumber ?? '—'}
                </span>
              )}
            </div>

            <div className="px-6 py-5">
              {!v ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No vehicle assigned to this route.</p>
              ) : v.hasFix ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <LiveStat icon={Navigation} label="Coordinates" value={`${v.latitude}, ${v.longitude}`} />
                  <LiveStat icon={Gauge} label="Speed" value={v.speed != null ? `${v.speed} km/h` : '—'} />
                  <LiveStat icon={Clock} label="Last update" value={formatUpdated(v.lastUpdate)} />
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 p-5 dark:border-gray-700">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">No live location yet</p>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      This vehicle isn&apos;t broadcasting GPS{' '}
                      {v.liveTrackingEnabled ? '(tracking is on, awaiting a fix).' : '(tracking is off).'} Last update:{' '}
                      {formatUpdated(v.lastUpdate)}.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/driver/location/page.tsx`. (If TS complains about `wakeLock`, confirm the `nav.wakeLock?.request` cast is intact.)

- [ ] **Step 3: Verify the page compiles in dev**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/driver/location`
Expected: `307` (redirect to login when unauthenticated) or `200` — **not** `500`. A `500` means a build/import error; check the dev-server console.

- [ ] **Step 4: Commit**

```bash
git add app/driver/location/page.tsx
git commit -m "feat(tracking): driver On-Duty GPS broadcasting UI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Repoint the admin Track-All API onto the tms_ plane

**Files:**
- Modify (full rewrite): `app/api/admin/track-all/drivers/route.ts`

**Interfaces:**
- Consumes: `gpsFreshness` (Task 1). Reads `tms_route`, `tms_driver`, `staff`, `tms_vehicle`.
- Produces: `GET /api/admin/track-all/drivers` → unchanged JSON shape `{ success, drivers: DriverLocation[], total, active_tracking, online_drivers, last_updated }`. The Leaflet map (`components/live-tracking-map.tsx`) and page (`app/(admin)/track-all/page.tsx`) are **NOT** modified — they already consume this shape.

- [ ] **Step 1: Rewrite the route file**

Replace the entire contents of `app/api/admin/track-all/drivers/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gpsFreshness } from '@/lib/gps/freshness';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
};
type StaffRow = { id: string; first_name: string | null; last_name: string | null };
type VehRow = {
  id: string;
  registration_number: string | null;
  model: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  gps_speed: number | null;
  gps_heading: number | null;
  gps_accuracy: number | null;
  last_gps_update: string | null;
  live_tracking_enabled: boolean | null;
};

const NONE = '00000000-0000-0000-0000-000000000000';

/** GET /api/admin/track-all/drivers — live positions for the admin Track-All map, read
 *  from the tms_ plane (the legacy drivers/routes/vehicles tables were dropped). Emits
 *  the same DriverLocation[] shape the Leaflet map + page already consume. */
export async function GET() {
  try {
    const { data: routesData, error: routesErr } = await supabase
      .from('tms_route')
      .select('id, route_number, route_name, vehicle_id, driver_id')
      .not('driver_id', 'is', null);
    if (routesErr) throw routesErr;
    const routes = (routesData ?? []) as RouteRow[];

    const staffIds = [...new Set(routes.map((r) => r.driver_id).filter(Boolean))] as string[];
    const vehicleIds = [...new Set(routes.map((r) => r.vehicle_id).filter(Boolean))] as string[];

    const [driversRes, staffRes, vehRes] = await Promise.all([
      supabase
        .from('tms_driver')
        .select('id, staff_id, location_sharing_enabled, active_route_id')
        .in('staff_id', staffIds.length ? staffIds : [NONE]),
      supabase.from('staff').select('id, first_name, last_name').in('id', staffIds.length ? staffIds : [NONE]),
      supabase
        .from('tms_vehicle')
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, gps_heading, gps_accuracy, last_gps_update, live_tracking_enabled'
        )
        .in('id', vehicleIds.length ? vehicleIds : [NONE]),
    ]);

    const drivers = (driversRes.data ?? []) as DriverRow[];
    const staffById = new Map((((staffRes.data ?? []) as StaffRow[])).map((s) => [s.id, s]));
    const vehById = new Map((((vehRes.data ?? []) as VehRow[])).map((v) => [v.id, v]));

    const routesByStaff = new Map<string, RouteRow[]>();
    for (const r of routes) {
      if (!r.driver_id) continue;
      const arr = routesByStaff.get(r.driver_id) ?? [];
      arr.push(r);
      routesByStaff.set(r.driver_id, arr);
    }

    const result = drivers.map((d) => {
      const drvRoutes = d.staff_id ? routesByStaff.get(d.staff_id) ?? [] : [];
      const route = drvRoutes.find((r) => r.id === d.active_route_id) ?? drvRoutes[0] ?? null;
      const veh = route?.vehicle_id ? vehById.get(route.vehicle_id) : undefined;
      const s = d.staff_id ? staffById.get(d.staff_id) : undefined;
      const name = s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '—' : '—';

      const lat = veh?.current_latitude ?? null;
      const lng = veh?.current_longitude ?? null;
      const fresh = gpsFreshness(veh?.last_gps_update ?? null);
      const hasFix = lat != null && lng != null;

      return {
        id: d.id,
        name,
        current_latitude: lat,
        current_longitude: lng,
        location_accuracy: veh?.gps_accuracy ?? null,
        location_timestamp: veh?.last_gps_update ?? null,
        last_location_update: veh?.last_gps_update ?? null,
        location_sharing_enabled: !!d.location_sharing_enabled,
        location_tracking_status: d.location_sharing_enabled ? 'active' : 'inactive',
        route_id: route?.id ?? null,
        route_number: route?.route_number ?? null,
        route_name: route?.route_name ?? null,
        vehicle_id: veh?.id ?? null,
        registration_number: veh?.registration_number ?? null,
        gps_status: fresh.status,
        time_since_update: fresh.minutes,
        location_status: hasFix ? 'vehicle_gps' : 'no_location',
        status_message: hasFix ? 'Live position from driver app' : 'No location data available',
      };
    });

    return NextResponse.json({
      success: true,
      drivers: result,
      total: result.length,
      active_tracking: result.filter((d) => d.location_sharing_enabled).length,
      online_drivers: result.filter((d) => d.gps_status === 'online').length,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in track all drivers API:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/api/admin/track-all/drivers/route.ts`.

- [ ] **Step 3: Verify it no longer queries dropped tables**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/track-all/drivers`
Expected: `307`/`401` (proxy gates admin routes when unauthenticated) — **not** `500`. The old version would have thrown on the missing `drivers` table.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/track-all/drivers/route.ts
git commit -m "fix(tracking): repoint Track-All map off dropped legacy tables to tms_ plane

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Student "where's my bus" API

**Files:**
- Create: `app/api/student/location/route.ts`

**Interfaces:**
- Consumes: `getLearnerRowForUser`, `createServiceRoleClient`, `gpsFreshness` (Task 1), `TMS_PERMISSIONS.PASSENGER_SELF_VIEW`.
- Produces: `GET /api/student/location` → `{ success: true, data: { route: { id, label } | null, vehicle: Vehicle | null } }` where `Vehicle = { registrationNumber, model, latitude, longitude, speed, lastUpdate, liveTrackingEnabled, hasFix, status, minutesAgo }`. Consumed by Task 7.

- [ ] **Step 1: Write the route file**

Create `app/api/student/location/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { gpsFreshness } from '@/lib/gps/freshness';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** GET /api/student/location — last-known position of the vehicle on the learner's
 *  allocated route. Read-only "where's my bus". */
async function getStudentLocation(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.PASSENGER_SELF_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const learner = await getLearnerRowForUser(auth);
    if (!learner) {
      return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });
    }
    if (!learner.transport_route_id) {
      return NextResponse.json({ success: true, data: { route: null, vehicle: null } });
    }

    const svc = createServiceRoleClient();
    const { data: route } = await svc
      .from('tms_route')
      .select('id, route_number, route_name, vehicle_id')
      .eq('id', learner.transport_route_id)
      .maybeSingle();
    if (!route) {
      return NextResponse.json({ success: true, data: { route: null, vehicle: null } });
    }

    let vehicle: {
      registrationNumber: string | null;
      model: string | null;
      latitude: number | null;
      longitude: number | null;
      speed: number | null;
      lastUpdate: string | null;
      liveTrackingEnabled: boolean;
      hasFix: boolean;
      status: 'online' | 'recent' | 'offline';
      minutesAgo: number | null;
    } | null = null;

    if (route.vehicle_id) {
      const { data: v } = await svc
        .from('tms_vehicle')
        .select(
          'id, registration_number, model, current_latitude, current_longitude, gps_speed, last_gps_update, live_tracking_enabled'
        )
        .eq('id', route.vehicle_id)
        .maybeSingle();
      if (v) {
        const fresh = gpsFreshness(v.last_gps_update);
        vehicle = {
          registrationNumber: v.registration_number,
          model: v.model,
          latitude: v.current_latitude,
          longitude: v.current_longitude,
          speed: v.gps_speed,
          lastUpdate: v.last_gps_update,
          liveTrackingEnabled: !!v.live_tracking_enabled,
          hasFix: v.current_latitude != null && v.current_longitude != null,
          status: fresh.status,
          minutesAgo: fresh.minutes,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, label: `${route.route_number ?? '?'} · ${route.route_name ?? ''}`.trim() },
        vehicle,
      },
    });
  } catch (e) {
    console.error('student/location error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getStudentLocation(request, auth));
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/api/student/location/route.ts`. (If `learner.transport_route_id` errors, confirm `LearnerRow` in `lib/passengers/types.ts` exposes it — per spec it does.)

- [ ] **Step 3: Probe the route is gated**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/student/location`
Expected: `401`/`307` (gated). Not `404`/`500`.

- [ ] **Step 4: Commit**

```bash
git add app/api/student/location/route.ts
git commit -m "feat(tracking): student where's-my-bus API (GET /api/student/location)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Student "where's my bus" page + nav

**Files:**
- Create: `app/student/live-track/page.tsx`
- Modify: `lib/student/navigation.ts` (drop `comingSoon` on the existing "Live Track" item)

**Interfaces:**
- Consumes: `GET /api/student/location` (Task 6), `LivePositionMap` (Task 3).
- Produces: the `/student/live-track` page. Self-contained (inline spinner + local `NoticeCard`), mirroring `app/student/routes/page.tsx`.

- [ ] **Step 1: Write the page**

Create `app/student/live-track/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { Bus, MapPin, AlertTriangle, Gauge, Clock, Navigation, Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const LivePositionMap = dynamic(() => import('@/components/live-position-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
      <span className="text-sm text-gray-500">Loading map…</span>
    </div>
  ),
});

interface Vehicle {
  registrationNumber: string | null;
  model: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  lastUpdate: string | null;
  liveTrackingEnabled: boolean;
  hasFix: boolean;
  status: 'online' | 'recent' | 'offline';
  minutesAgo: number | null;
}
interface RouteInfo {
  id: string;
  label: string;
}
type Resp = { data?: { route: RouteInfo | null; vehicle: Vehicle | null }; notFound?: boolean };

async function fetchBus(): Promise<Resp> {
  const res = await fetch('/api/student/location', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error('Failed to load location');
  return { data: (await res.json()).data as { route: RouteInfo | null; vehicle: Vehicle | null } };
}

function formatUpdated(ts: string | null): string {
  if (!ts) return 'never';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function NoticeCard({
  tone,
  icon: Icon,
  title,
  body,
}: {
  tone: 'amber' | 'red';
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  const tones = {
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{body}</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
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

export default function StudentLiveTrackPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-live-track'],
    queryFn: fetchBus,
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
      </div>
    );
  }
  if (error) {
    return (
      <NoticeCard
        tone="red"
        icon={AlertTriangle}
        title="Couldn't load your bus"
        body="Something went wrong. Please refresh or try again shortly."
      />
    );
  }
  if (data?.notFound) {
    return (
      <NoticeCard
        tone="amber"
        icon={AlertTriangle}
        title="No transport profile"
        body="We couldn't find a transport profile linked to your account. Contact the transport office."
      />
    );
  }

  const route = data?.data?.route ?? null;
  const v = data?.data?.vehicle ?? null;

  if (!route) {
    return (
      <NoticeCard
        tone="amber"
        icon={RouteIcon}
        title="No route allocated yet"
        body="You don't have a transport route allocated, so there's no bus to track."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Track my bus</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          Live position of the bus on your route ({route.label}).
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{route.label}</h2>
          </div>
          {v && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <Bus className="h-3.5 w-3.5" />
              {v.registrationNumber ?? '—'}
            </span>
          )}
        </div>

        <div className="px-6 py-5">
          {v && v.hasFix && v.status !== 'offline' ? (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 ring-1 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/50">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                </span>
                {v.status === 'online' ? 'Live now' : `Updated ${v.minutesAgo ?? '?'} min ago`}
              </div>

              <div className="h-80 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <LivePositionMap latitude={v.latitude as number} longitude={v.longitude as number} label={`Bus ${v.registrationNumber ?? ''}`} />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat icon={Navigation} label="Coordinates" value={`${v.latitude}, ${v.longitude}`} />
                <Stat icon={Gauge} label="Speed" value={v.speed != null ? `${v.speed} km/h` : '—'} />
                <Stat icon={Clock} label="Last update" value={formatUpdated(v.lastUpdate)} />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 p-5 dark:border-gray-700">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Bus isn&apos;t sharing its location right now</p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Your driver hasn&apos;t started sharing, or the last update is too old. This page refreshes
                  automatically. {v ? `Last update: ${formatUpdated(v.lastUpdate)}.` : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Flip the nav item live**

In `lib/student/navigation.ts`, find the "Live Track" entry and remove `comingSoon: true`:

```ts
// Before:
{ name: 'Live Track', href: '/student/live-track', icon: MapPin, comingSoon: true },
// After:
{ name: 'Live Track', href: '/student/live-track', icon: MapPin },
```

- [ ] **Step 3: Verify both files type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/student/live-track/page.tsx` or `lib/student/navigation.ts`.

- [ ] **Step 4: Verify the page renders (not 500)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/student/live-track`
Expected: `307`/`200` — not `500`.

- [ ] **Step 5: Commit**

```bash
git add app/student/live-track/page.tsx lib/student/navigation.ts
git commit -m "feat(tracking): student where's-my-bus page + enable Live Track nav

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## End-to-end verification (after all tasks, with the user)

These need a real driver login on a phone over HTTPS (the agent's browser is unauthenticated):

1. **Driver shares:** Driver logs in on a phone → `/driver/location` → (pick route if >1) → "Go On Duty" → grant location permission. The "Sharing live" pill appears, the self-map shows their dot, "Last sent" ticks ~every 12 s.
2. **DB write check** (`execute_sql`):
   ```sql
   select id, current_latitude, current_longitude, last_gps_update, live_tracking_enabled, gps_provider
   from tms_vehicle where gps_provider = 'driver_app' order by last_gps_update desc limit 5;
   select count(*) from gps_location_history where source = 'driver_app';   -- grows while sharing
   select id, location_sharing_enabled, active_route_id, location_sharing_started_at
   from tms_driver where location_sharing_enabled = true;
   ```
3. **Admin sees it:** Open `/track-all` in an admin session → the driver appears as a colored marker on their vehicle's position; status `online`; table row populated.
4. **Student sees it:** A learner allocated to that route opens `/student/live-track` → "Live now" + map with the bus.
5. **Off duty:** Driver taps "Go Off Duty" → `tms_driver.location_sharing_enabled=false`, `active_route_id=null`; within 5 min the admin marker drops to `offline`/disappears under the default filter; the student page shows the "not sharing" empty state.

## Self-Review (completed during planning)

- **Spec coverage:** Phase 0 → Task 0; freshness cross-cutting → Task 1; Phase 1 ingest → Task 2; Phase 2 capture → Tasks 3+4; Phase 3 admin repoint → Task 5; Phase 4 student → Tasks 6+7. All spec sections mapped.
- **Placeholders:** none — every step has full code or an exact command + expected output.
- **Type consistency:** `gpsFreshness` returns `{ status, minutes }` and is consumed identically in Tasks 5/6; `LivePositionMap` props `{ latitude, longitude, label?, zoom? }` match both call sites; `getDriverRoutes(staffId, assignedRouteId, svc)` 3-arg form matches `lib/driver/routes.ts`; the admin JSON keys match `DriverLocation` in `components/live-tracking-map.tsx`.
