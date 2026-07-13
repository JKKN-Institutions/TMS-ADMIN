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
