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
